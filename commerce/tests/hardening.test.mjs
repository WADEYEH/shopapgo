// PR 3-11: every package and its tracking (F6, F9; M6-05, M8-05), GA4 refund events (K3, M10-03), dispute evidence
// (M5-12, D57) and the Worker's own settings check (J6, M12-03, D59). The database is the real migrations in memory;
// Amazon, the payment providers, GA4 and the email API are local fakes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../worker/index.js";
import { resetAirwallexTokenCache } from "../worker/airwallex.js";
import { submitOrderToMcf, syncMcfOrder } from "../worker/mcf.js";
import { getOrder } from "../worker/orders.js";
import { recordRefund } from "../worker/refunds.js";
import { scheduledPackageTracking } from "../worker/package-tracking.js";
import { digestSections } from "../worker/team-digest.js";
import { ga4Body, gaClientIdFrom, scheduledGa4Events } from "../worker/ga4.js";
import { CONFIG_MANIFEST, configProblems, scheduledConfigCheck } from "../worker/config-check.js";
import { createD1, sqliteAvailable } from "./helpers/d1.mjs";
import { FAKE_AMAZON_ENV, FAKE_BASE_URL, createFakeAmazon } from "./helpers/fake-amazon-mcf.mjs";

globalThis.fetch = async (url) => { throw new Error(`unexpected real network call: ${url}`); };
const skip = (await sqliteAvailable()) ? false : "node:sqlite unavailable";

const MAIL_URL = "https://mail.example/send";
const OWNER = "owner@apgo.example";
const LOGIN = { email: OWNER, password: "owner-password-123" };
const ownerLogin = { Authorization: `Basic ${Buffer.from(`${LOGIN.email}:${LOGIN.password}`).toString("base64")}` };
const DAY = 24 * 60 * 60_000;
const iso = (ms) => new Date(ms).toISOString();

const env0 = (db, extra = {}) => ({
  DB: db,
  AIRWALLEX_CLIENT_ID: "cid", AIRWALLEX_API_KEY: "key", AIRWALLEX_ENV: "demo", AIRWALLEX_RETRY_DELAY_MS: "0",
  ADMIN_TOKEN: "test-admin-token-0123456789", ADMIN_OWNER_EMAIL: OWNER, ADMIN_LOGIN_EMAIL: LOGIN.email, ADMIN_LOGIN_PASSWORD: LOGIN.password,
  RESEND_API_KEY: "rk_test_key", CUSTOMER_EMAIL_FROM: "APGO <orders@shop.example>", ORDER_NOTIFY_EMAIL_API_URL: MAIL_URL,
  ASSETS: { fetch: async () => new Response("ok") },
  ...FAKE_AMAZON_ENV,
  MCF_SYNC_CRON: "true",
  ...extra,
});
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function createWorld() {
  const amazon = createFakeAmazon();
  const calls = { mails: [], ga4: [] };
  async function handler(href, init = {}) {
    if (href === MAIL_URL) { calls.mails.push(JSON.parse(init.body)); return json(200, { id: crypto.randomUUID() }); }
    if (href.startsWith(FAKE_BASE_URL)) return amazon.fetch(href, init);
    if (href.startsWith("https://www.google-analytics.com/mp/collect")) { calls.ga4.push({ url: href, body: JSON.parse(init.body) }); return new Response(null, { status: 204 }); }
    if (href.endsWith("/authentication/login")) return json(201, { token: "tok", expires_at: new Date(Date.now() + 1_800_000).toISOString().replace(/\.\d+Z$/, "+0000") });
    throw new Error(`unexpected network call: ${init.method ?? "GET"} ${href}`);
  }
  return { amazon, calls, handler };
}
async function withWorld(run) {
  const world = createWorld();
  const original = globalThis.fetch;
  globalThis.fetch = (url, init = {}) => world.handler(String(url), init);
  resetAirwallexTokenCache();
  try {
    return await run(world);
  } finally {
    globalThis.fetch = original;
  }
}
const call = async (env, path, init = {}) => worker.fetch(new Request(`https://www.shopapgo.com${path}`, init), env, { waitUntil() {} });
const row = (db, sql, ...args) => { const r = db.raw.prepare(sql).get(...args); return r ? { ...r } : null; };
const rows = (db, sql, ...args) => db.raw.prepare(sql).all(...args).map((r) => ({ ...r }));

const LINE = { id: "d204", sku: "D204", name: "APGO Atomic Colored Glaze", size: "300 mL · 10.1 fl oz", qty: 2, unitCents: 5999, lineCents: 11998 };
function insertOrder(db, id, { paidAt = iso(Date.now() - DAY), email = "ada@example.com", shipping = {} } = {}) {
  const shippingJson = JSON.stringify({ firstName: "Ada", lastName: "Lee", street: "100 Example Ave", street2: "", city: "Austin", state: "TX", zip: "78701", phone: "+15125550148", ...shipping });
  db.raw.prepare(`INSERT INTO orders (id, status, email, shipping_json, shipping_method, lines_json, currency, subtotal_cents, shipping_cents, tax_cents, total_cents, payment_intent_id, created_at, updated_at, paid_at)
    VALUES (?, 'paid', ?, ?, 'standard', ?, 'USD', 11998, 799, 0, 12797, ?, ?, ?, ?)`).run(id, email, shippingJson, JSON.stringify([LINE]), `int_${id}`, paidAt, paidAt, paidAt);
  return id;
}
async function shipTwoPackages(env, world, id) {
  assert.equal((await submitOrderToMcf(env, await getOrder(env.DB, id))).outcome, "submitted");
  world.amazon.ship(id, { packages: [
    { packageNumber: 501, carrierCode: "UPS", trackingNumber: "1ZFIRST" },
    { packageNumber: 502, carrierCode: "USPS", trackingNumber: "9400SECOND" },
  ] });
  const synced = await syncMcfOrder(env, id, { actor: "mcf-cron" });
  assert.equal(synced.shipped, true);
}

// ---------- F6, M6-05, M8-05: every package ----------

test("M6-05, M8-05: an order Amazon ships in two boxes keeps both tracking numbers and the shipment email lists both", { skip }, async () => {
  await withWorld(async (world) => {
    const db = await createD1();
    const env = env0(db);
    const id = insertOrder(db, "APGO-US-PKGS00000001");
    await shipTwoPackages(env, world, id);
    assert.deepEqual(rows(db, "SELECT tracking_number, carrier, package_id FROM order_packages ORDER BY tracking_number"),
      [{ tracking_number: "1ZFIRST", carrier: "UPS", package_id: "501" }, { tracking_number: "9400SECOND", carrier: "USPS", package_id: "502" }]);
    const mail = world.calls.mails.find((m) => /has shipped/.test(m.subject));
    assert.ok(mail, "the shipment email went out");
    assert.match(mail.text, /shipped in 2 packages/);
    assert.match(mail.text, /Package 1: UPS 1ZFIRST/);
    assert.match(mail.text, /Package 2: USPS 9400SECOND/);
    assert.match(mail.html, /<strong>1ZFIRST<\/strong>/);
    assert.equal(world.calls.mails.filter((m) => /has shipped/.test(m.subject)).length, 1, "one email for the order");
    const view = await (await call(env, `/admin/api/orders/${id}`, { headers: ownerLogin })).json();
    assert.deepEqual(view.fulfillment.packages.map((p) => p.trackingNumber), ["1ZFIRST", "9400SECOND"]);
  });
});

// ---------- F9: returned to the sender ----------

test("F9: the daily tracking watch keeps the carrier's status; a package going back to the sender tells the team once", { skip }, async () => {
  await withWorld(async (world) => {
    const db = await createD1();
    const env = env0(db);
    const id = insertOrder(db, "APGO-US-PKGS00000002");
    await shipTwoPackages(env, world, id);
    const alerts = () => world.calls.mails.filter((m) => /going back to the sender/.test(m.subject));
    world.amazon.setPackageStatus(501, "DELIVERED", [{ eventCode: "EVENT_301", eventDate: "2026-10-04T18:00:00Z", eventAddress: { city: "Austin", state: "TX" } }]);
    world.amazon.setPackageStatus(502, "RETURNED");
    const first = await scheduledPackageTracking(env);
    assert.deepEqual(first, { ran: true, checked: 2, returned: 1, failed: 0 });
    const delivered = row(db, "SELECT status, delivered_at, events_json FROM order_packages WHERE tracking_number = '1ZFIRST'");
    assert.equal(delivered.status, "DELIVERED");
    assert.ok(delivered.delivered_at);
    assert.deepEqual(JSON.parse(delivered.events_json), [{ status: "EVENT_301", at: "2026-10-04T18:00:00Z", city: "Austin", state: "TX" }]);
    assert.equal(alerts().length, 1);
    assert.match(alerts()[0].text, /USPS reports package 9400SECOND/);
    assert.ok(row(db, "SELECT 1 AS x FROM order_audit WHERE order_id = ? AND action = 'mcf.package_returned'", id));
    assert.match((await digestSections(env)).find((s) => /back to the sender/.test(s.title)).detail, /APGO-US-PKGS00000002 \(USPS 9400SECOND, RETURNED\)/);
    const dashboard = await (await call(env, "/admin/api/dashboard", { headers: ownerLogin })).json();
    assert.ok(dashboard.attention.items.some((item) => item.kind === "returned" && item.orderId === id));

    // Checked once a day, delivered and returned packages never again; the team is told once.
    assert.deepEqual(await scheduledPackageTracking(env), { ran: true, checked: 0, returned: 0, failed: 0 });
    db.raw.prepare("UPDATE order_packages SET checked_at = ?").run(iso(Date.now() - 2 * DAY));
    assert.equal((await scheduledPackageTracking(env)).checked, 0, "final statuses are not watched");
    assert.equal(alerts().length, 1);
    // Off without the sync switch.
    assert.deepEqual(await scheduledPackageTracking(env0(db, { MCF_SYNC_CRON: "false" })), { ran: false });
  });
});

// ---------- K3, M10-03: GA4 refund events ----------

test("M10-03: the GA client id is kept at checkout; an accepted refund is queued once and sent to GA4 in production only", { skip }, async () => {
  await withWorld(async (world) => {
    assert.equal(gaClientIdFrom("theme=dark; _ga=GA1.1.1234567890.1700000000; _gid=x"), "1234567890.1700000000");
    assert.equal(gaClientIdFrom("_ga=bad"), null);
    const db = await createD1();
    const id = insertOrder(db, "APGO-US-GA4000000001");
    db.raw.prepare("INSERT INTO order_analytics (order_id, ga_client_id, created_at) VALUES (?, '1234567890.1700000000', ?)").run(id, iso(Date.now()));
    const order = await getOrder(db, id);
    const at = iso(Date.now());
    const refund = (status, updatedAt) => recordRefund(db, order, { id: "rfd_ga", provider: "airwallex", ref: order.payment_intent_id, amountCents: 2500, currency: "USD", status, failureCode: "", createdAt: at, updatedAt });
    await refund("RECEIVED", at);
    assert.equal(row(db, "SELECT COUNT(*) AS n FROM order_ga_events").n, 0, "not before the provider accepts it");
    await refund("ACCEPTED", iso(Date.now() + 1000));
    await refund("SETTLED", iso(Date.now() + 2000));
    const queued = rows(db, "SELECT kind, status, payload_json FROM order_ga_events");
    assert.deepEqual(queued.map((r) => [r.kind, r.status]), [["refund:rfd_ga", "pending"]]);

    // Staging (and anywhere without the secret) never sends.
    const staging = env0(db, { SITE_ENV: "staging", GA4_MEASUREMENT_ID: "G-YM10YMKE30", GA4_API_SECRET: "secret-value" });
    assert.equal((await scheduledGa4Events(staging)).ran, false);
    assert.equal((await scheduledGa4Events(env0(db, { GA4_MEASUREMENT_ID: "G-YM10YMKE30" }))).ran, false);
    assert.equal(world.calls.ga4.length, 0);

    const production = env0(db, { GA4_MEASUREMENT_ID: "G-YM10YMKE30", GA4_API_SECRET: "secret-value" });
    assert.deepEqual(await scheduledGa4Events(production), { ran: true, sent: 1, retry: 0, failed: 0 });
    assert.equal(world.calls.ga4.length, 1);
    const sent = world.calls.ga4[0];
    assert.match(sent.url, /measurement_id=G-YM10YMKE30&api_secret=secret-value$/);
    assert.deepEqual(sent.body, { client_id: "1234567890.1700000000", non_personalized_ads: true,
      events: [{ name: "refund", params: { currency: "USD", value: 25, transaction_id: id, refund_id: "rfd_ga" } }] });
    assert.equal(row(db, "SELECT status FROM order_ga_events").status, "sent");
    assert.deepEqual(await scheduledGa4Events(production), { ran: true, sent: 0, retry: 0, failed: 0 }, "sent once");

    // Without a GA client id a stable stand-in is used; rows that waited 7 days are given up.
    assert.equal(ga4Body({ order_id: "APGO-US-0123456789AB", payload_json: JSON.stringify({ currency: "USD", amountCents: 100, refundId: "r" }) }, null).client_id, "apgo.0123456789");
    db.raw.prepare(`INSERT INTO order_ga_events (order_id, kind, payload_json, status, created_at, updated_at) VALUES (?, 'refund:old', '{}', 'pending', ?, ?)`).run(id, iso(Date.now() - 8 * DAY), iso(Date.now() - 8 * DAY));
    await scheduledGa4Events(staging);
    assert.equal(row(db, "SELECT status FROM order_ga_events WHERE kind = 'refund:old'").status, "skipped");
  });
});

test("M10-03: checkout keeps the visitor's GA client id from the _ga cookie, also with Global Privacy Control", { skip }, async () => {
  await withWorld(async () => {
    const db = await createD1();
    const env = env0(db);
    const { saveGaClient } = await import("../worker/ga4.js");
    const request = new Request("https://www.shopapgo.com/api/checkout/session", { headers: { Cookie: "_ga=GA1.1.555.666", "Sec-GPC": "1" } });
    assert.equal(await saveGaClient(db, "APGO-US-GA4000000002", request), true);
    assert.equal(row(db, "SELECT ga_client_id FROM order_analytics").ga_client_id, "555.666");
    assert.equal(await saveGaClient(db, "APGO-US-GA4000000003", new Request("https://x/", { headers: {} })), false);
  });
});

// ---------- M5-12, D57: dispute evidence ----------

test("M5-12: the evidence page has the order, payment, every package, emails and messages, never internal notes, and is logged", { skip }, async () => {
  await withWorld(async (world) => {
    const db = await createD1();
    const env = env0(db);
    const id = insertOrder(db, "APGO-US-EVDN00000001", { shipping: { firstName: "<b>Ada</b>" } });
    await shipTwoPackages(env, world, id);
    db.raw.prepare("UPDATE order_packages SET status = 'DELIVERED', delivered_at = '2026-10-04T18:00:00.000Z' WHERE tracking_number = '1ZFIRST'").run();
    db.raw.prepare("INSERT INTO order_notes (order_id, author, body, created_at) VALUES (?, ?, 'SECRET INTERNAL NOTE', ?)").run(id, OWNER, iso(Date.now()));
    db.raw.prepare("INSERT INTO contact_messages (id, created_at, name, email, message, ip_hash, email_status) VALUES ('CM-E', ?, 'Ada', 'ADA@example.com', 'Package arrived, thanks', 'h', 'sent')").run(iso(Date.now()));
    db.raw.prepare(`INSERT INTO order_disputes (provider, dispute_id, order_id, status, reason, amount_cents, currency, provider_updated_at, created_at, updated_at)
      VALUES ('airwallex', 'dsp_9', ?, 'open', 'product_not_received', 12797, 'USD', ?, ?, ?)`).run(id, iso(Date.now()), iso(Date.now()), iso(Date.now()));

    const response = await call(env, `/admin/api/orders/${id}/evidence`, { headers: ownerLogin });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type"), /^text\/html/);
    assert.match(response.headers.get("Content-Disposition"), new RegExp(`attachment; filename="apgo-evidence-${id}.html"`));
    const html = await response.text();
    for (const text of [id, "1 of 2 packages delivered", "$127.97", "int_APGO-US-EVDN00000001", "1ZFIRST", "9400SECOND", "DELIVERED", "Shipping confirmation with tracking", "Package arrived, thanks", "https://www.shopapgo.com/returns", "product_not_received"]) {
      assert.ok(html.includes(text), `evidence has ${text}`);
    }
    assert.ok(html.includes("&lt;b&gt;Ada&lt;/b&gt;"), "data is escaped");
    assert.ok(!html.includes("SECRET INTERNAL NOTE"), "no internal notes");
    assert.ok(!html.includes(OWNER), "no staff names");
    assert.ok(row(db, "SELECT 1 AS x FROM order_audit WHERE order_id = ? AND action = 'order.evidence_exported'", id));
    db.raw.prepare("UPDATE orders SET paid_at = NULL WHERE id = ?").run(id);
    assert.equal((await call(env, `/admin/api/orders/${id}/evidence`, { headers: ownerLogin })).status, 404);
  });
});

// ---------- J6, M12-03, D59: the Worker's own settings check ----------

test("M12-03: the manifest is exactly what wrangler.toml sets for staging and production", async () => {
  const toml = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  const vars = {};
  let section = null;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) { section = header[1]; continue; }
    const pair = /^([A-Z0-9_]+)\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(line);
    if (pair && /^env\.\w+\.vars$/.test(section ?? "")) (vars[section.split(".")[1]] ||= {})[pair[1]] = JSON.parse(`"${pair[2]}"`);
  }
  for (const profile of ["staging", "production"]) assert.deepEqual(CONFIG_MANIFEST[profile].vars, vars[profile], profile);
  for (const profile of ["staging", "production"]) assert.match(toml, new RegExp(`\\[env\\.${profile}\\.version_metadata\\]\\s*\\nbinding = "CF_VERSION_METADATA"`));
});

test("M12-03: a changed var, a missing secret or binding is found; the team is told once per version and difference", { skip }, async () => {
  await withWorld(async (world) => {
    const db = await createD1();
    const manifest = CONFIG_MANIFEST.production;
    const live = (extra = {}) => ({
      ...env0(db), ...manifest.vars, ...Object.fromEntries(manifest.secrets.map((name) => [name, "set"])),
      CHECKOUT_LIMITER: {}, ADDRESS_LIMITER: {}, QUOTE_LIMITER: {}, CF_VERSION_METADATA: { id: "v1" }, ...extra,
    });
    assert.deepEqual(configProblems(live(), manifest), []);
    assert.deepEqual(configProblems(live({ AIRWALLEX_ENV: "demo", RESEND_API_KEY: "", QUOTE_LIMITER: undefined }), manifest), [
      { kind: "var", name: "AIRWALLEX_ENV", expected: "prod", actual: "demo" },
      { kind: "secret", name: "RESEND_API_KEY" },
      { kind: "binding", name: "QUOTE_LIMITER" },
    ]);
    assert.deepEqual(await scheduledConfigCheck(live()), { ran: true, problems: 0 });
    assert.deepEqual(await scheduledConfigCheck(live()), { ran: false }, "once a day per version");

    // Someone changes a setting in the dashboard: a new version, checked at once; the team is told.
    const alerts = () => world.calls.mails.filter((m) => /Live settings differ/.test(m.subject));
    assert.deepEqual(await scheduledConfigCheck(live({ AIRWALLEX_ENV: "demo", CF_VERSION_METADATA: { id: "v2" } })), { ran: true, problems: 1 });
    assert.equal(alerts().length, 1);
    assert.match(alerts()[0].text, /AIRWALLEX_ENV: expected "prod", live "demo"/);
    assert.doesNotMatch(alerts()[0].text, /"set"/, "secret values are never in the email");
    assert.deepEqual(await scheduledConfigCheck(live({ AIRWALLEX_ENV: "demo", CF_VERSION_METADATA: { id: "v2" } })), { ran: false });
    assert.equal(alerts().length, 1);
    // Local dev (no CONFIG_PROFILE) is never checked.
    assert.deepEqual(await scheduledConfigCheck({ DB: db }), { ran: false });
  });
});
