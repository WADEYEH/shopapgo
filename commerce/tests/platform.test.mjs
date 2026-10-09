// Platform base (phase 3, PR 3-1): the staging fake Amazon (worker/fake-amazon.js), per-address rate limits on the
// costly endpoints (worker/rate-limit.js), the recorded cron run with GET /api/health and the dead-man ping
// (worker/cron.js), and the wrangler settings behind them. No test reaches the network: Amazon, Healthchecks and
// everything else fail the test unless a stub answers.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../worker/index.js";
import { resetAirwallexTokenCache } from "../worker/airwallex.js";
import { McfError, connectionProblem, createFulfillmentOrder, getFulfillmentOrder, getPackageTracking, listFulfillmentOrders, mcfConfig, mcfReadiness } from "../worker/amazon-mcf.js";
import { FAKE_BLOCKED_MESSAGE, FAKE_SKU_MAP, fakeMode, fakeProgress, fakeTrackingNumber } from "../worker/fake-amazon.js";
import { cancelMcfOrder, checkMcfConnection, syncMcfOrder } from "../worker/mcf.js";
import { RATE_LIMITED_ROUTES, RATE_LIMIT_MESSAGE, rateLimited } from "../worker/rate-limit.js";
import { CRON_JOBS, TICK, cronHealth, runScheduled } from "../worker/cron.js";
import { PRODUCTS } from "../worker/catalog.js";
import { createD1, sqliteAvailable } from "./helpers/d1.mjs";

globalThis.fetch = async (url) => { throw new Error(`unexpected real network call: ${url}`); };

const skip = (await sqliteAvailable()) ? false : "node:sqlite unavailable";
const toml = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");

const ADMIN_TOKEN = "test-admin-token-0123456789";
const WEBHOOK_SECRET = "whsec_unit_test";
const ORIGIN = "https://staging.example";
const MAIL_URL = "https://mail.example/send";
const BASIC = { Authorization: `Basic ${Buffer.from("tester:staging-pass").toString("base64")}` };
const MINUTE = 60_000;

// The staging Worker as wrangler.toml configures it: the fake on, auto-submit and sync on, and NO Amazon connection.
const stagingEnv = (db, extra = {}) => ({
  DB: db,
  SITE_ENV: "staging",
  STAGING_BASIC_AUTH_USER: "tester",
  STAGING_BASIC_AUTH_PASSWORD: "staging-pass",
  AIRWALLEX_CLIENT_ID: "cid",
  AIRWALLEX_API_KEY: "key",
  AIRWALLEX_WEBHOOK_SECRET: WEBHOOK_SECRET,
  AIRWALLEX_ENV: "demo",
  AIRWALLEX_RETRY_DELAY_MS: "0",
  ADMIN_TOKEN,
  RESEND_API_KEY: "rk_test_key",
  CUSTOMER_EMAIL_FROM: "APGO <orders@shop.example>",
  ORDER_NOTIFY_EMAIL_API_URL: MAIL_URL,
  CUSTOMER_EMAIL_TEST_RECIPIENTS: "ada@example.com", // staging only emails allowlisted testers
  MCF_FAKE: "true",
  MCF_AUTO_SUBMIT: "true",
  MCF_SYNC_CRON: "true",
  ASSETS: { fetch: async () => new Response("<h1>page</h1>") },
  ...extra,
});

const ctxStub = () => ({ waitUntil(promise) { (this.pending ||= []).push(promise); }, async settled() { await Promise.all(this.pending ?? []); } });
const call = (env, path, init = {}, ctx = ctxStub()) => worker.fetch(new Request(`${ORIGIN}${path}`, init), env, ctx);
const post = (body, headers = {}) => ({ method: "POST", headers: { "Content-Type": "application/json", ...BASIC, ...headers }, body: JSON.stringify(body) });
const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Airwallex and the mail API are stubbed; anything else (Amazon above all) fails the test.
async function withWorld(run, { extra } = {}) {
  const original = globalThis.fetch;
  const mails = [];
  const others = [];
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href === MAIL_URL) { mails.push(JSON.parse(init.body)); return Response.json({ id: crypto.randomUUID() }); }
    if (href.includes("/api/v1/")) {
      if (href.endsWith("/authentication/login")) return jsonResponse(201, { token: "tok", expires_at: new Date(Date.now() + 1_800_000).toISOString().replace(/\.\d+Z$/, "+0000") });
      if (href.endsWith("/payment_intents/create")) {
        const payload = JSON.parse(init.body);
        return jsonResponse(201, { id: "int_123", client_secret: "cs", currency: payload.currency, amount: payload.amount, merchant_order_id: payload.merchant_order_id, status: "REQUIRES_PAYMENT_METHOD" });
      }
    }
    if (extra) {
      const answer = await extra(href, init);
      if (answer) return answer;
    }
    others.push(href);
    throw new Error(`unexpected real network call: ${href}`);
  };
  try {
    return await run({ mails, others });
  } finally {
    globalThis.fetch = original;
  }
}

const checkoutBody = (lastName = "Lee") => ({
  items: [{ sku: "d204", qty: 1 }, { sku: "d215", qty: 2 }],
  contact: { email: "ada@example.com", phone: "(512) 555-0134", marketingOptIn: false },
  shipping: { firstName: "Ada", lastName, street: "100 Example Ave", street2: "Apt 4", city: "Austin", state: "TX", zip: "78701" },
  method: "standard",
});

function signedWebhook(orderId, total) {
  const body = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, name: "payment_intent.succeeded", data: { object: { id: "int_123", merchant_order_id: orderId, status: "SUCCEEDED", currency: "USD", amount: total } } });
  const timestamp = String(Date.now());
  return { method: "POST", headers: { "x-timestamp": timestamp, "x-signature": createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}${body}`).digest("hex") }, body };
}

// Checkout and payment through the real endpoints; payment auto-submits the order to MCF (here: the fake).
async function placePaidOrder(env, lastName) {
  resetAirwallexTokenCache();
  const response = await call(env, "/api/checkout/session", post(checkoutBody(lastName)));
  assert.equal(response.status, 200, await response.clone().text());
  const session = await response.json();
  const ctx = ctxStub();
  assert.equal((await call(env, "/api/webhooks/airwallex", signedWebhook(session.orderId, 127.96), ctx)).status, 200);
  await ctx.settled();
  return session.orderId;
}

const row = (db, sql, ...args) => { const found = db.raw.prepare(sql).get(...args); return found ? { ...found } : null; };

// ---------- the staging fake Amazon ----------

test("fake Amazon: on only with SITE_ENV=staging; MCF_FAKE anywhere else blocks all sending", () => {
  assert.equal(fakeMode({}), null);
  assert.equal(fakeMode({ MCF_FAKE: "false", SITE_ENV: "staging" }), null);
  assert.equal(fakeMode({ MCF_FAKE: "true", SITE_ENV: "staging" }), "on");
  assert.equal(fakeMode({ MCF_FAKE: "TRUE", SITE_ENV: "staging" }), "on");
  assert.equal(fakeMode({ MCF_FAKE: "true" }), "blocked");
  assert.equal(fakeMode({ MCF_FAKE: "true", SITE_ENV: "production" }), "blocked");

  // On: no connection settings needed, and every store SKU maps to a made-up seller SKU.
  const on = mcfReadiness({ MCF_FAKE: "true", SITE_ENV: "staging", MCF_AUTO_SUBMIT: "true" });
  assert.equal(on.mode, "ready");
  assert.equal(on.config.connectionOk, true);
  assert.deepEqual(on.config.skuMap, FAKE_SKU_MAP);
  for (const product of Object.values(PRODUCTS)) assert.match(FAKE_SKU_MAP[product.sku.toUpperCase()], /^FAKE-/);
  // A real map, when staging has one, is used as is (it still only reaches the fake).
  assert.deepEqual(mcfConfig({ MCF_FAKE: "true", SITE_ENV: "staging", MCF_SKU_MAP_JSON: '{"D204":"REAL-1"}' }).skuMap, { D204: "REAL-1" });

  // Blocked: even with a full real connection configured, nothing is ready and the reason says why.
  const blockedEnv = { MCF_FAKE: "true", MCF_AUTO_SUBMIT: "true", AMAZON_OUTBOUND_BASE_URL: "https://amazon-mcp.test.example", OUTBOUND_INTERNAL_TOKEN: "t".repeat(30), MCF_SKU_MAP_JSON: '{"D204":"A","D215":"B"}' };
  const blocked = mcfReadiness(blockedEnv);
  assert.equal(blocked.mode, "not_configured");
  assert.equal(blocked.config.connectionOk, false);
  assert.equal(connectionProblem(blocked.config), FAKE_BLOCKED_MESSAGE);
});

test("fake Amazon blocked outside staging: an outbound call throws before any network request", async () => {
  await withWorld(async ({ others }) => {
    const env = { MCF_FAKE: "true", AMAZON_OUTBOUND_BASE_URL: "https://amazon-mcp.test.example", OUTBOUND_INTERNAL_TOKEN: "t".repeat(30) };
    await assert.rejects(getFulfillmentOrder(env, "APGO-US-01D000000001"), (error) => error instanceof McfError && error.kind === "config" && error.code === "fake_outside_staging");
    assert.deepEqual(others, []);
  });
});

test("fake Amazon: an order moves RECEIVED -> PROCESSING (2 min) -> COMPLETE (FAKE_MCF_SHIP_MINUTES, default 10); STOCKOUT turns UNFULFILLABLE", () => {
  const at = Date.parse("2026-10-09T00:00:00.000Z");
  const ship = { seller_order_id: "APGO-US-1", scenario: "ship", status: "RECEIVED", received_at: new Date(at).toISOString(), updated_at: new Date(at).toISOString() };
  assert.equal(fakeProgress(ship, at + MINUTE).status, "RECEIVED");
  assert.equal(fakeProgress(ship, at + 2 * MINUTE).status, "PROCESSING");
  assert.equal(fakeProgress(ship, at + 9 * MINUTE).status, "PROCESSING");
  const done = fakeProgress(ship, at + 10 * MINUTE);
  assert.deepEqual(done, { status: "COMPLETE", updatedAt: new Date(at + 10 * MINUTE).toISOString(), shipped: true });
  assert.equal(fakeProgress(ship, at + 3 * MINUTE, { FAKE_MCF_SHIP_MINUTES: "3" }).status, "COMPLETE");
  assert.equal(fakeProgress(ship, at, { FAKE_MCF_SHIP_MINUTES: "0" }).status, "COMPLETE");

  const stockout = { ...ship, scenario: "stockout" };
  assert.equal(fakeProgress(stockout, at + MINUTE).status, "RECEIVED");
  assert.equal(fakeProgress(stockout, at + 2 * MINUTE).status, "UNFULFILLABLE");
  assert.equal(fakeProgress({ ...ship, status: "CANCELLED" }, at + 60 * MINUTE).status, "CANCELLED");
  assert.match(fakeTrackingNumber("APGO-US-1"), /^TBA9\d{11}$/);
  assert.equal(fakeTrackingNumber("APGO-US-1"), fakeTrackingNumber("APGO-US-1"));
});

test("staging order: payment sends it to the fake, the sync marks it shipped with tracking and emails once; Amazon is never called", { skip }, async () => {
  const db = await createD1();
  const env = stagingEnv(db, { FAKE_MCF_SHIP_MINUTES: "0" });
  await withWorld(async ({ mails, others }) => {
    const orderId = await placePaidOrder(env);
    const mcf = row(db, "SELECT * FROM order_mcf WHERE order_id = ?", orderId);
    assert.equal(mcf.status, "submitted");
    const fake = row(db, "SELECT * FROM staging_fake_mcf_orders WHERE seller_order_id = ?", orderId);
    assert.equal(fake.scenario, "ship");
    const sent = JSON.parse(fake.request_json);
    assert.deepEqual(sent.items.map((item) => item.sellerSku).sort(), ["FAKE-D204", "FAKE-D215"]);
    assert.equal(sent.fulfillment_action, "Ship");

    // The staging cron (MCF_SYNC_CRON=true) picks it up.
    const ctx = ctxStub();
    await worker.scheduled({}, env, ctx);
    await ctx.settled();
    const shipped = row(db, "SELECT * FROM order_mcf WHERE order_id = ?", orderId);
    assert.equal(shipped.status, "shipped");
    assert.equal(shipped.carrier, "Amazon Logistics");
    assert.equal(shipped.tracking_number, fakeTrackingNumber(orderId));
    assert.equal(row(db, "SELECT tracking_number FROM order_fulfillments WHERE order_id = ?", orderId).tracking_number, fakeTrackingNumber(orderId));
    const shipmentMails = () => mails.filter((mail) => JSON.stringify(mail).includes(fakeTrackingNumber(orderId)));
    assert.equal(shipmentMails().length, 1);

    // A second sync changes nothing and sends nothing.
    await syncMcfOrder(env, orderId);
    assert.equal(shipmentMails().length, 1);
    assert.deepEqual(others, [], "no call left the Worker except Airwallex and mail stubs");
  });
});

test("staging order to a STOCKOUT name: the fake reports UNFULFILLABLE and the order is flagged rejected, not shipped", { skip }, async () => {
  const db = await createD1();
  const env = stagingEnv(db, { FAKE_MCF_SHIP_MINUTES: "0" });
  await withWorld(async ({ others }) => {
    const orderId = await placePaidOrder(env, "STOCKOUT");
    assert.equal(row(db, "SELECT scenario FROM staging_fake_mcf_orders WHERE seller_order_id = ?", orderId).scenario, "stockout");
    const result = await syncMcfOrder(env, orderId);
    assert.equal(result.outcome, "synced");
    const mcf = row(db, "SELECT * FROM order_mcf WHERE order_id = ?", orderId);
    assert.equal(mcf.status, "rejected");
    assert.equal(mcf.mcf_status, "UNFULFILLABLE");
    assert.equal(row(db, "SELECT 1 AS x FROM order_fulfillments WHERE order_id = ?", orderId), null);
    assert.equal(row(db, "SELECT status FROM staging_fake_mcf_orders WHERE seller_order_id = ?", orderId).status, "UNFULFILLABLE");
    assert.deepEqual(others, []);
  });
});

test("fake Amazon: duplicate create is refused as alreadyExists, cancel works before shipping only, list / tracking / connection check answer", { skip }, async () => {
  const db = await createD1();
  const env = stagingEnv(db); // default: ships after 10 minutes
  await withWorld(async ({ others }) => {
    const orderId = await placePaidOrder(env);
    // The same id sent again (a retry after a lost reply) is never a second order, as at Amazon.
    const again = await createFulfillmentOrder(env, { orderId, address: { name: "Ada Lee", addressLine1: "100 Example Ave", city: "Austin", stateOrRegion: "TX", postalCode: "78701" }, items: [{ sku: "FAKE-D204", qty: 1 }], tier: "STANDARD" });
    assert.deepEqual([again.created, again.alreadyExists, again.status], [false, true, "RECEIVED"]);
    assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM staging_fake_mcf_orders").get().n, 1);
    const fetched = await getFulfillmentOrder(env, orderId);
    assert.equal(fetched.status, "RECEIVED");
    assert.equal(await getFulfillmentOrder(env, "APGO-US-UNKNOWN"), null);

    const listed = await listFulfillmentOrders(env);
    assert.deepEqual(listed.orders.map((order) => order.orderId), [orderId]);
    assert.equal(listed.complete, true);

    const check = await checkMcfConnection(env);
    assert.equal(check.ok, true);
    assert.ok(check.previews.every((preview) => preview.fulfillable));

    assert.equal((await cancelMcfOrder(env, orderId)).outcome, "requested");
    assert.equal((await getFulfillmentOrder(env, orderId)).status, "CANCELLED");

    // A shipped order cannot be cancelled; its package tracking answers with the same number.
    const db2 = await createD1();
    const env2 = stagingEnv(db2, { FAKE_MCF_SHIP_MINUTES: "0" });
    const shippedId = await placePaidOrder(env2);
    const shipped = await getFulfillmentOrder(env2, shippedId);
    assert.equal(shipped.status, "COMPLETE");
    const pkg = shipped.shipments[0].packages[0];
    assert.deepEqual(await getPackageTracking(env2, pkg.packageId), { carrierCode: "AMZL", trackingNumber: fakeTrackingNumber(shippedId), trackingUrl: "" });
    assert.equal((await cancelMcfOrder(env2, shippedId)).outcome, "failed");
    assert.deepEqual(others, []);
  });
});

// ---------- rate limits ----------

const limiter = (success = false, calls = []) => ({ async limit(options) { calls.push(options); return { success }; } });
const request = (path, method = "POST", ip = "203.0.113.7") => new Request(`https://www.example${path}`, { method, headers: { "CF-Connecting-IP": ip } });

test("rate limit: payment start, address check and quote are limited per address and endpoint; 429 with Retry-After", async () => {
  assert.deepEqual([...RATE_LIMITED_ROUTES.keys()].sort(), ["/api/cart/quote", "/api/checkout/address", "/api/checkout/paypal/order", "/api/checkout/session"]);
  const calls = [];
  const env = { CHECKOUT_LIMITER: limiter(false, calls), ADDRESS_LIMITER: limiter(true), QUOTE_LIMITER: limiter(true) };

  const limited = await rateLimited(request("/api/checkout/session"), env);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "60");
  assert.deepEqual(await limited.json(), { error: { code: "rate_limited", message: RATE_LIMIT_MESSAGE } });
  assert.deepEqual(calls, [{ key: "/api/checkout/session:203.0.113.7" }]);
  assert.equal((await rateLimited(request("/api/checkout/paypal/order"), env)).status, 429, "PayPal shares the checkout limit");
  assert.equal(calls.at(-1).key, "/api/checkout/paypal/order:203.0.113.7", "but counts on its own key");

  assert.equal(await rateLimited(request("/api/checkout/address"), env), null);
  assert.equal(await rateLimited(request("/api/cart/quote"), env), null);
  assert.equal(await rateLimited(request("/api/checkout/session", "GET"), env), null, "only POST is limited");
  assert.equal(await rateLimited(request("/api/orders/APGO-US-1", "POST"), env), null, "other endpoints are not");
});

test("rate limit: fails open when the binding is missing or broken (a limiter outage never blocks a shopper)", async () => {
  assert.equal(await rateLimited(request("/api/checkout/session"), {}), null);
  const broken = { CHECKOUT_LIMITER: { async limit() { throw new Error("binding down"); } } };
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(await rateLimited(request("/api/checkout/session"), broken), null);
  } finally {
    console.error = original;
  }
});

test("rate limit: the Worker answers 429 before creating an order; other routes are untouched", { skip }, async () => {
  const db = await createD1();
  const env = stagingEnv(db, { SITE_ENV: "", CHECKOUT_LIMITER: limiter(false), QUOTE_LIMITER: limiter(false) });
  await withWorld(async () => {
    const response = await call(env, "/api/checkout/session", post(checkoutBody()));
    assert.equal(response.status, 429);
    assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 0);
    assert.equal((await call(env, "/api/cart/quote", post({ items: [{ sku: "d204", qty: 1 }] }))).status, 429);
    assert.equal((await call(env, "/api/store/config")).status, 200);
  });
});

test("wrangler: every environment has the three limiters with its own namespaces", () => {
  const blocks = [...toml.matchAll(/^\[\[((?:env\.(\w+)\.)?)ratelimits\]\]\nname = "(\w+)"\nnamespace_id = "(\d+)"\nsimple = \{ limit = (\d+), period = (\d+) \}/gm)]
    .map((match) => ({ env: match[2] ?? "local", name: match[3], id: match[4], limit: Number(match[5]), period: Number(match[6]) }));
  const names = [...new Set(RATE_LIMITED_ROUTES.values())].sort();
  for (const env of ["local", "staging", "production"]) {
    assert.deepEqual(blocks.filter((block) => block.env === env).map((block) => block.name).sort(), names, env);
  }
  assert.equal(new Set(blocks.map((block) => block.id)).size, blocks.length, "namespace ids are unique");
  assert.ok(blocks.every((block) => block.period === 60 && block.limit > 0));
  assert.equal(blocks.length, 9);
});

// ---------- cron run, health, ping ----------

test("cron: every job runs even when one fails; the run is recorded; the ping says /fail", { skip }, async () => {
  const db = await createD1();
  const pings = [];
  const ran = [];
  const jobs = {
    first: async () => { ran.push("first"); },
    broken: async () => { ran.push("broken"); throw new Error("boom"); },
    last: async () => { ran.push("last"); },
  };
  const env = { DB: db, HEALTHCHECK_PING_URL: "https://hc-ping.example/uuid-1" };
  const original = console.error;
  console.error = () => {};
  await withWorld(async () => {
    const result = await runScheduled(env, { jobs });
    assert.deepEqual(result.jobs, { first: "ok", broken: "boom", last: "ok" });
  }, { extra: (href) => { pings.push(href); return new Response("OK"); } }).finally(() => { console.error = original; });
  assert.deepEqual(ran.sort(), ["broken", "first", "last"]);
  assert.deepEqual(pings, ["https://hc-ping.example/uuid-1/fail"]);
  const tick = row(db, "SELECT * FROM cron_runs WHERE job = ?", TICK);
  assert.equal(tick.runs, 1);
  assert.equal(tick.last_error, "a job failed");
  assert.equal(tick.last_ok_at, null);
  assert.ok(tick.last_finished_at);
  assert.equal(row(db, "SELECT last_error FROM cron_runs WHERE job = 'broken'").last_error, "boom");
  assert.equal(row(db, "SELECT last_error FROM cron_runs WHERE job = 'first'").last_error, null);

  // Next run all fine: the error clears and the ping is the plain URL.
  await withWorld(async () => {
    await runScheduled(env, { jobs: { first: jobs.first } });
  }, { extra: (href) => { pings.push(href); return new Response("OK"); } });
  assert.equal(pings.at(-1), "https://hc-ping.example/uuid-1");
  const again = row(db, "SELECT * FROM cron_runs WHERE job = ?", TICK);
  assert.equal(again.runs, 2);
  assert.equal(again.last_error, null);
  assert.ok(again.last_ok_at);
});

test("cron: no ping without an https HEALTHCHECK_PING_URL; a failing ping or missing table never stops the jobs", { skip }, async () => {
  const original = console.error;
  console.error = () => {};
  try {
    await withWorld(async ({ others }) => {
      const db = await createD1();
      const ran = [];
      const job = { only: async () => { ran.push(1); } };
      await runScheduled({ DB: db }, { jobs: job });
      await runScheduled({ DB: db, HEALTHCHECK_PING_URL: "http://insecure.example/x" }, { jobs: job });
      await runScheduled({ DB: db, HEALTHCHECK_PING_URL: "not a url" }, { jobs: job });
      assert.deepEqual(others, [], "no ping sent");
      await runScheduled({ DB: db, HEALTHCHECK_PING_URL: "https://down.example/x" }, { jobs: job });
      assert.deepEqual(others, ["https://down.example/x"], "the ping was tried and its failure swallowed");
      // A database that has not run migration 0002: bookkeeping fails quietly, the job still runs.
      const bare = { prepare() { throw new Error("no such table: cron_runs"); } };
      await runScheduled({ DB: bare }, { jobs: job });
      assert.equal(ran.length, 5);
    });
  } finally {
    console.error = original;
  }
  assert.deepEqual(Object.keys(CRON_JOBS).sort(), ["email_retry", "mcf_sync", "meta_retry"]);
});

test("health: 503 until the cron has run, 200 after, 503 again once the last run is older than 30 minutes", { skip }, async () => {
  const db = await createD1();
  const env = { DB: db };
  const start = Date.parse("2026-10-09T00:00:00.000Z");
  assert.deepEqual(await cronHealth(env), { ok: false, cron: { lastRunAt: null, stale: true } });
  await runScheduled(env, { jobs: {}, now: () => new Date(start) });
  assert.equal((await cronHealth(env, { now: () => new Date(start + 29 * MINUTE) })).ok, true);
  assert.deepEqual(await cronHealth(env, { now: () => new Date(start + 31 * MINUTE) }), { ok: false, cron: { lastRunAt: new Date(start).toISOString(), stale: true } });
  assert.equal((await cronHealth({ ...env, CRON_STALE_MINUTES: "60" }, { now: () => new Date(start + 31 * MINUTE) })).ok, true);
  assert.equal((await cronHealth({ DB: { prepare() { throw new Error("down"); } } })).ok, false);
});

test("GET /api/health through the Worker: no auth needed in production, JSON only, no error text", { skip }, async () => {
  const db = await createD1();
  const env = { DB: db, ASSETS: { fetch: async () => new Response("page") } };
  const before = await call(env, "/api/health");
  assert.equal(before.status, 503);
  assert.equal(before.headers.get("Cache-Control"), "no-store");
  await runScheduled(env, { jobs: { broken: async () => { throw new Error("secret detail"); } } }).catch(() => {});
  const after = await call(env, "/api/health");
  assert.equal(after.status, 200, "a run that finished counts, even with a failed job (the ping reports that)");
  const text = await after.text();
  assert.ok(!text.includes("secret detail"));
  assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ["cron", "ok"]);
});

test("wrangler: production cron every 5 minutes, staging every 2; Workers Issues on in every environment", () => {
  assert.match(toml, /^\[env\.production\.triggers\]\ncrons = \["\*\/5 \* \* \* \*"\]/m);
  assert.match(toml, /^\[env\.staging\.triggers\]\ncrons = \["\*\/2 \* \* \* \*"\]/m);
  for (const header of ["[observability.issues]", "[env.staging.observability.issues]", "[env.production.observability.issues]"]) {
    assert.match(toml, new RegExp(`^${header.replace(/[[\].]/g, "\\$&")}\\nenabled = true`, "m"), header);
  }
  assert.ok(!/HEALTHCHECK_PING_URL\s*=/.test(toml.replace(/^\s*#.*$/gm, "")), "the ping URL is a secret");
});

// ---------- deploys ----------

test("deploy workflow: staging after CI on main; production only by hand, from main, switched on, confirmed and approved", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8");
  const job = (name) => {
    const start = workflow.indexOf(`\n  ${name}:\n`);
    assert.notEqual(start, -1, name);
    const end = workflow.slice(start + 1).search(/\n {2}[a-z][\w-]*:\n/);
    return end === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + end);
  };
  assert.match(workflow, /workflow_run:\n\s+workflows: \[CI\]\n\s+types: \[completed\]\n\s+branches: \[main\]/);
  const staging = job("staging");
  for (const guard of ["github.event.workflow_run.conclusion == 'success'", "github.event.workflow_run.event == 'push'", "github.event.workflow_run.head_branch == 'main'", "needs.credentials.outputs.ready == 'true'"]) {
    assert.ok(staging.includes(guard), `staging: ${guard}`);
  }
  assert.match(staging, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/, "deploys the commit CI tested");

  const production = job("production");
  for (const guard of ["github.event_name == 'workflow_dispatch'", "inputs.target == 'production'", "inputs.confirm == 'deploy production'", "github.ref == 'refs/heads/main'", "vars.PRODUCTION_DEPLOY_ENABLED == 'true'", "needs.credentials.outputs.ready == 'true'"]) {
    assert.ok(production.includes(guard), `production: ${guard}`);
  }
  assert.ok(!production.includes("workflow_run"), "production never follows CI automatically");
  assert.match(production, /^ {4}environment: production$/m, "a reviewer approves the production environment");
  const order = ["npm run test:static", "build-site.mjs --production", "d1 time-travel info DB --env production", "d1 migrations apply DB --env production --remote", "wrangler deploy --env production"].map((step) => production.indexOf(step));
  assert.ok(order.every((index) => index > 0), "every production step is there");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "tests, build, restore point, migrations, deploy: in that order");

  // Every deploy names its environment (a bare `wrangler deploy` would publish the local-dev config).
  for (const line of workflow.split("\n").filter((text) => /wrangler (deploy|d1 migrations apply)/.test(text))) {
    assert.match(line, /--env (staging|production)\b/, line.trim());
  }
  assert.ok(!/echo .*secrets\./.test(workflow), "secrets are never printed");
});

test("production site build: refused unless the analytics values are given, and valid when analytics is on", async () => {
  const { PRODUCTION_SITE_ENV, TEST_SITE_ENV, productionEnvProblems } = await import("../scripts/build-site.mjs");
  assert.deepEqual(PRODUCTION_SITE_ENV, { NEXT_PUBLIC_APGO_US_SINGLE_SITE: "true" });
  assert.equal(TEST_SITE_ENV.NEXT_PUBLIC_APGO_US_ANALYTICS_READY, "false");
  assert.equal(productionEnvProblems({}).length, 3);
  const off = { NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "false", NEXT_PUBLIC_APGO_US_GTM_ID: "", NEXT_PUBLIC_APGO_US_META_PIXEL_ID: "" };
  assert.deepEqual(productionEnvProblems(off), []);
  assert.deepEqual(productionEnvProblems({ ...off, NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "yes" }), ['NEXT_PUBLIC_APGO_US_ANALYTICS_READY must be "true" or "false"']);
  assert.equal(productionEnvProblems({ ...off, NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "true" }).length, 2, "on, but neither id would load");
  assert.deepEqual(productionEnvProblems({ NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "true", NEXT_PUBLIC_APGO_US_GTM_ID: "GTM-AB12CD3", NEXT_PUBLIC_APGO_US_META_PIXEL_ID: "2606879866471418" }), []);

  // The build's patterns are the site's own (lib/us/config.js), so the check and the site never disagree.
  const site = await readFile(new URL("../../lib/us/config.js", import.meta.url), "utf8");
  const script = await readFile(new URL("../scripts/build-site.mjs", import.meta.url), "utf8");
  for (const [siteName, scriptName] of [["GTM_ID_RE", "GTM_ID"], ["META_PIXEL_ID_RE", "META_PIXEL_ID"]]) {
    const pattern = (text, name) => text.match(new RegExp(`const ${name} = (/.+/);`))?.[1];
    assert.ok(pattern(site, siteName));
    assert.equal(pattern(script, scriptName), pattern(site, siteName), siteName);
  }
});
