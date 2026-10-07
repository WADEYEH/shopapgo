// Meta Conversions API: hashing/normalisation, event payloads and ids, attribution capture, the once-only claim,
// retries, the cron re-send, and "off unless META_DATASET_ID is set". Everything runs against fakes (a fake Airwallex and
// tests/helpers/fake-meta-capi.mjs); any other network call fails the test. Nothing reaches Meta or Airwallex.
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../worker/index.js";
import { resetAirwallexTokenCache } from "../worker/airwallex.js";
import { cleanSourceUrl, readAttribution } from "../worker/meta-attribution.js";
import {
  META_GRAPH_VERSION,
  buildEvent,
  buildUserData,
  metaConfig,
  metaEventId,
  normalizeCity,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeState,
  normalizeZip,
  retryDelayMs,
  retryMetaEvents,
  sendMetaEvent,
  sha256Hex,
} from "../worker/meta-capi.js";
import { createD1, sqliteAvailable } from "./helpers/d1.mjs";
import { FAKE_DATASET_ID, FAKE_META_ENV, FAKE_META_TOKEN, createFakeMeta } from "./helpers/fake-meta-capi.mjs";

globalThis.fetch = async (url) => { throw new Error(`unexpected real network call: ${url}`); };

const hasSqlite = await sqliteAvailable();
const skip = hasSqlite ? false : "node:sqlite needs Node 22.5+";

const WEBHOOK_SECRET = "whsec_unit_test";
const ORIGIN = "https://store.example";
const sha = (text) => createHash("sha256").update(text).digest("hex");

const baseEnv = (db, extra = {}) => ({
  DB: db,
  AIRWALLEX_CLIENT_ID: "cid",
  AIRWALLEX_API_KEY: "key",
  AIRWALLEX_WEBHOOK_SECRET: WEBHOOK_SECRET,
  AIRWALLEX_ENV: "demo",
  AIRWALLEX_RETRY_DELAY_MS: "0",
  ADMIN_TOKEN: "test-admin-token-0123456789",
  ASSETS: { fetch: async () => new Response("<h1>page</h1>") },
  ...extra,
});
const prodEnv = (db, extra = {}) => baseEnv(db, { ...FAKE_META_ENV, ...extra });

const ctxStub = () => ({ waitUntil(promise) { (this.pending ||= []).push(promise); }, async settled() { await Promise.all(this.pending ?? []); } });
const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const call = (env, path, init = {}, ctx = ctxStub()) => worker.fetch(new Request(`${ORIGIN}${path}`, init), env, ctx);
const post = (body, headers = {}) => ({ method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

// Routes fetch: Airwallex (recorded) + Meta (the fake). Anything else fails the test.
async function withWorld({ meta = createFakeMeta() } = {}, run) {
  const original = globalThis.fetch;
  const intents = [];
  const unexpected = [];
  const logs = [];
  const spies = {};
  for (const level of ["log", "error", "warn", "info"]) {
    spies[level] = console[level];
    console[level] = (...args) => { logs.push({ level, text: args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ") }); };
  }
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.startsWith("https://graph.facebook.com/")) return meta.fetch(href, init);
    if (href.endsWith("/authentication/login")) return jsonResponse(201, { token: "tok", expires_at: new Date(Date.now() + 1_800_000).toISOString().replace(/\.\d+Z$/, "+0000") });
    if (href.endsWith("/payment_intents/create")) {
      const payload = JSON.parse(init.body);
      intents.push(payload);
      return jsonResponse(201, { id: "int_123", client_secret: "cs", currency: payload.currency, amount: payload.amount, merchant_order_id: payload.merchant_order_id, status: "REQUIRES_PAYMENT_METHOD" });
    }
    unexpected.push(href);
    throw new Error(`unexpected real network call: ${href}`);
  };
  try {
    return await run({ meta, intents, unexpected, logs });
  } finally {
    globalThis.fetch = original;
    for (const [level, fn] of Object.entries(spies)) console[level] = fn;
  }
}

const checkoutBody = (extra = {}) => ({
  items: [{ sku: "d204", qty: 1 }, { sku: "d215", qty: 2 }],
  contact: { email: "Ada.Lee@Example.com ", phone: "(512) 555-0134", marketingOptIn: false },
  shipping: { firstName: "Ada", lastName: "O'Lee", street: "100 Example Ave", street2: "Apt 4", city: "Austin", state: "TX", zip: "78701" },
  method: "standard",
  ...extra,
});

const FBP = "fb.1.1759600000000.1234567890";
const FBC = "fb.1.1759600000001.AbCdEfGhIjKlMnOpQrStUvWxYz";
const SOURCE_URL = "https://store.shopapgo.com/v3?utm_source=facebook&fbclid=AbCdEf";

async function startCheckout(env, body = checkoutBody(), headers = {}) {
  resetAirwallexTokenCache();
  const ctx = ctxStub();
  const response = await call(env, "/api/checkout/session", post(body, headers), ctx);
  await ctx.settled();
  assert.equal(response.status, 200);
  return (await response.json()).orderId;
}

function signedWebhook(orderId, total = 127.96, { secret = WEBHOOK_SECRET } = {}) {
  const body = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, name: "payment_intent.succeeded", data: { object: { id: "int_123", merchant_order_id: orderId, status: "SUCCEEDED", currency: "USD", amount: total } } });
  const timestamp = String(Date.now());
  return { method: "POST", headers: { "x-timestamp": timestamp, "x-signature": createHmac("sha256", secret).update(`${timestamp}${body}`).digest("hex") }, body };
}
async function payViaWebhook(env, orderId, options) {
  const ctx = ctxStub();
  const response = await call(env, "/api/webhooks/airwallex", signedWebhook(orderId, undefined, options), ctx);
  await ctx.settled();
  return response;
}

const eventRows = (db, orderId) => db.raw.prepare("SELECT * FROM order_meta_events WHERE order_id = ? ORDER BY event_name").all(orderId).map((r) => ({ ...r }));
const attributionRow = (db, orderId) => { const r = db.raw.prepare("SELECT * FROM order_attribution WHERE order_id = ?").get(orderId); return r ? { ...r } : null; };
const orderRow = (db, orderId) => ({ ...db.raw.prepare("SELECT * FROM orders WHERE id = ?").get(orderId) });
const purchases = (meta) => meta.events().filter((e) => e.event_name === "Purchase");

// ---------- configuration ----------

test("config: the whole feature needs META_DATASET_ID; the token and test code are optional/validated", () => {
  assert.equal(metaConfig({}).enabled, false);
  assert.equal(metaConfig({ META_DATASET_ID: "" }).enabled, false);
  assert.equal(metaConfig({ META_DATASET_ID: "abc" }).enabled, false);
  assert.equal(metaConfig({ META_CAPI_ACCESS_TOKEN: "x", META_TEST_EVENT_CODE: "TEST1" }).enabled, false, "token alone does not turn it on");
  const noToken = metaConfig({ META_DATASET_ID: FAKE_DATASET_ID });
  assert.deepEqual({ enabled: noToken.enabled, ready: noToken.ready }, { enabled: true, ready: false });
  const full = metaConfig({ ...FAKE_META_ENV, META_TEST_EVENT_CODE: "TEST27938" });
  assert.deepEqual({ ready: full.ready, code: full.testEventCode }, { ready: true, code: "TEST27938" });
  assert.equal(metaConfig({ ...FAKE_META_ENV, META_TEST_EVENT_CODE: "bad code!<>" }).testEventCode, "", "a malformed code is dropped");
  assert.match(META_GRAPH_VERSION, /^v\d{2}\.0$/);
  assert.equal(metaEventId("InitiateCheckout", "APGO-US-ABC"), "ic_APGO-US-ABC");
  assert.equal(metaEventId("Purchase", "APGO-US-ABC"), "purchase_APGO-US-ABC");
});

// ---------- hashing and normalisation ----------

test("hashing: Meta's documented examples, per-field normalisation, unhashed technical fields", async () => {
  // Vectors from Meta's "customer information parameters" page.
  assert.equal(await sha256Hex(normalizeEmail("  John_Smith@gmail.com ")), "62a14e44f765419d10fea99367361a727c12365e2520f32218d505ed9aa0f62f");
  assert.equal(await sha256Hex(normalizePhone("(650)555-1212")), "e323ec626319ca94ee8bff2e4c87cf613be6ea19919ed1364124e16807ab3176");
  assert.equal(await sha256Hex("us"), "79adb2a2fce5c6ba215fe5f27f532d4e7edbac4b6a5e09e1ef3a08084a904621");
  assert.equal(await sha256Hex(normalizeName("Mary")), "6915771be1c5aa0c886870b6951b03d7eafc121fea0e80a5ea83beb7c449f4ec");
  assert.equal(await sha256Hex(normalizeName("Valéry")), "08e1996b5dd49e62a4b4c010d44e4345592a863bb9f8e3976219bac29417149c");

  assert.equal(normalizeEmail(" Ada.Lee@Example.COM "), "ada.lee@example.com");
  assert.equal(normalizePhone("+1 (650) 555-1212"), "16505551212");
  assert.equal(normalizePhone("650.555.1212"), "16505551212", "the US country code 1 is added");
  assert.equal(normalizePhone("1-650-555-1212"), "16505551212");
  assert.equal(normalizePhone("0016505551212"), "16505551212", "leading zeros dropped");
  assert.equal(normalizePhone("12345"), "", "too short to be a phone number");
  assert.equal(normalizePhone(undefined), "");
  assert.equal(normalizeName(" O'Lee-Smith "), "oleesmith");
  assert.equal(normalizeCity("New York."), "newyork");
  assert.equal(normalizeCity("St. Paul"), "stpaul");
  assert.equal(normalizeState(" TX "), "tx");
  assert.equal(normalizeState("Texas"), "", "only the two-letter code is accepted");
  assert.equal(normalizeZip("78701-1234"), "78701");
  assert.equal(normalizeZip(" 78701 "), "78701");
  assert.equal(normalizeZip("abc"), "");

  const attribution = { fbp: FBP, fbc: FBC, clientIp: "203.0.113.9", clientUserAgent: "Mozilla/5.0 Test" };
  const user = await buildUserData({
    email: "Ada.Lee@Example.com ",
    shipping: { firstName: "Ada", lastName: "O'Lee", city: "Austin", state: "TX", zip: "78701-0001" },
    attribution,
  });
  assert.deepEqual(user.em, [sha("ada.lee@example.com")]);
  assert.deepEqual(user.fn, [sha("ada")]);
  assert.deepEqual(user.ln, [sha("olee")]);
  assert.deepEqual(user.ct, [sha("austin")]);
  assert.deepEqual(user.st, [sha("tx")]);
  assert.deepEqual(user.zp, [sha("78701")]);
  assert.deepEqual(user.country, [sha("us")], "country is always us");
  assert.equal(user.ph, undefined, "no phone collected -> no ph");
  assert.equal(user.client_ip_address, "203.0.113.9");
  assert.equal(user.client_user_agent, "Mozilla/5.0 Test");
  assert.equal(user.fbc, FBC);
  assert.equal(user.fbp, FBP);
  assert.ok(Object.entries(user).filter(([k]) => ["em", "fn", "ln", "zp", "ct", "st", "country"].includes(k)).every(([, v]) => /^[0-9a-f]{64}$/.test(v[0])), "hashed fields are SHA-256 hex");

  const withPhone = await buildUserData({ email: "a@b.co", shipping: { phone: "(650) 555-1212" } });
  assert.deepEqual(withPhone.ph, [sha("16505551212")]);
  const bare = await buildUserData({ email: "a@b.co", shipping: {} });
  assert.deepEqual(Object.keys(bare).sort(), ["country", "em"], "fields without a value are omitted, not sent empty");
});

test("event payload: website event, value from D1 cents, USD, contents, order_id, optional source url and test code", async () => {
  const order = { id: "APGO-US-0123456789AB", email: "ada@example.com", total_cents: 5999, currency: "USD",
    shipping_json: JSON.stringify({ firstName: "Ada", lastName: "Lee", city: "Austin", state: "TX", zip: "78701" }),
    lines_json: JSON.stringify([{ sku: "D204", qty: 1, unitCents: 5999, lineCents: 5999 }]) };
  const event = await buildEvent({ order, eventName: "Purchase", eventId: "purchase_APGO-US-0123456789AB", eventTime: 1759600000, attribution: { sourceUrl: SOURCE_URL } });
  assert.deepEqual(
    { name: event.event_name, id: event.event_id, time: event.event_time, source: event.action_source, url: event.event_source_url },
    { name: "Purchase", id: "purchase_APGO-US-0123456789AB", time: 1759600000, source: "website", url: SOURCE_URL },
  );
  assert.deepEqual(event.custom_data, {
    value: 59.99, currency: "USD", content_type: "product", content_ids: ["D204"],
    contents: [{ id: "D204", quantity: 1, item_price: 59.99 }], order_id: "APGO-US-0123456789AB",
  });
  const noUrl = await buildEvent({ order, eventName: "InitiateCheckout", eventId: "ic_x", eventTime: 1, attribution: null });
  assert.equal("event_source_url" in noUrl, false);
  assert.ok(noUrl.user_data.em);
});

// ---------- attribution parsing ----------

test("attribution: formats are validated, lengths capped, cookies and headers read, fbc built from fbclid", () => {
  const headers = { "cf-connecting-ip": "203.0.113.9", "user-agent": "Mozilla/5.0 (X11) Test", cookie: `foo=bar; _fbp=${FBP}; _fbc=${FBC}` };
  const request = new Request("https://store.example/api/checkout/session", { method: "POST", headers });

  const full = readAttribution({ attribution: { fbp: FBP, fbc: FBC, fbclid: "AbCdEf", sourceUrl: SOURCE_URL } }, request);
  assert.deepEqual({ fbp: full.fbp, fbc: full.fbc, fbclid: full.fbclid, url: full.sourceUrl, ip: full.clientIp, ua: full.clientUserAgent }, { fbp: FBP, fbc: FBC, fbclid: "AbCdEf", url: SOURCE_URL, ip: "203.0.113.9", ua: "Mozilla/5.0 (X11) Test" });

  const cookieOnly = readAttribution({}, request);
  assert.deepEqual({ fbp: cookieOnly.fbp, fbc: cookieOnly.fbc }, { fbp: FBP, fbc: FBC }, "the _fbp/_fbc cookies are used when the body has none");

  const bare = new Request("https://store.example/x", { method: "POST" });
  const built = readAttribution({ attribution: { fbclid: "IwAR0_abc-123" } }, bare, { now: 1759600123456 });
  assert.equal(built.fbc, "fb.1.1759600123456.IwAR0_abc-123", "fbclid without fbc -> fb.1.<ms>.<fbclid>");
  assert.equal(built.fbp, "");

  // missing / wrong-typed attribution never throws
  for (const body of [undefined, null, {}, { attribution: null }, { attribution: "x" }, { attribution: [1] }, { attribution: { fbp: 5, fbc: {}, fbclid: [], sourceUrl: 7 } }]) {
    const out = readAttribution(body, bare, { fallbackUrl: "https://store.example/checkout.html?order=A" });
    assert.deepEqual({ fbp: out.fbp, fbc: out.fbc, fbclid: out.fbclid, ip: out.clientIp, ua: out.clientUserAgent }, { fbp: "", fbc: "", fbclid: "", ip: "", ua: "" });
    assert.equal(out.sourceUrl, "https://store.example/checkout.html?order=A", "falls back to the checkout url");
  }

  // hostile / oversized values are dropped, not stored
  const hostile = readAttribution({ attribution: { fbp: "fb.1.1.1'; DROP TABLE orders;--", fbc: `fb.1.1759600000001.${"A".repeat(400)}`, fbclid: "has space", sourceUrl: "javascript:alert(1)" } },
    new Request("https://store.example/x", { method: "POST", headers: { "cf-connecting-ip": "not an ip", "user-agent": `Agent\u0001\t${"U".repeat(900)}` } }));
  assert.deepEqual({ fbp: hostile.fbp, fbc: hostile.fbc, fbclid: hostile.fbclid, url: hostile.sourceUrl, ip: hostile.clientIp }, { fbp: "", fbc: "", fbclid: "", url: "", ip: "" });
  assert.ok(hostile.clientUserAgent.length <= 400 && !/[\u0000-\u001f]/.test(hostile.clientUserAgent));

  assert.equal(cleanSourceUrl("https://user:pw@store.example/"), "", "no credentials in the url");
  assert.equal(cleanSourceUrl("https://store.example/a#frag"), "https://store.example/a", "fragment removed");
  assert.ok(cleanSourceUrl(`https://store.example/a?q=${"x".repeat(900)}`).length <= 500);
  assert.equal(cleanSourceUrl(`https://store.example/${"p".repeat(700)}`), "", "even without a query it is too long -> dropped");
  assert.equal(cleanSourceUrl("ftp://store.example/"), "");
});

// ---------- the full flow ----------

test("flow: InitiateCheckout at intent creation and Purchase once at paid, with matching ids, value and attribution", { skip }, async () => {
  const db = await createD1();
  const env = prodEnv(db);
  await withWorld({}, async ({ meta, intents }) => {
    const orderId = await startCheckout(env, checkoutBody({ attribution: { fbp: FBP, fbc: FBC, fbclid: "AbCdEf", sourceUrl: SOURCE_URL } }),
      { "CF-Connecting-IP": "203.0.113.9", "User-Agent": "Mozilla/5.0 Test Browser" });

    // Airwallex metadata carries the attribution and never loses source / order_id
    assert.deepEqual(intents[0].metadata, { fbc: FBC, fbp: FBP, event_source_url: SOURCE_URL, source: "apgo-us-store", order_id: orderId });
    assert.equal(intents[0].request_id, orderId);
    assert.equal(intents[0].amount, 127.96, "Airwallex gets dollars");

    // InitiateCheckout
    assert.equal(meta.calls.length, 1);
    const ic = meta.calls[0];
    assert.equal(ic.url, `https://graph.facebook.com/${META_GRAPH_VERSION}/${FAKE_DATASET_ID}/events`);
    assert.equal(ic.method, "POST");
    assert.equal(ic.headers.authorization, `Bearer ${FAKE_META_TOKEN}`);
    assert.equal(ic.headers["content-type"], "application/json");
    assert.ok(!ic.rawBody.includes(FAKE_META_TOKEN) && !ic.url.includes(FAKE_META_TOKEN), "the token is only in the Authorization header");
    assert.equal("test_event_code" in ic.body, false);
    const icEvent = ic.body.data[0];
    assert.deepEqual({ name: icEvent.event_name, id: icEvent.event_id, src: icEvent.action_source, url: icEvent.event_source_url }, { name: "InitiateCheckout", id: `ic_${orderId}`, src: "website", url: SOURCE_URL });
    assert.equal(icEvent.event_time, Math.floor(Date.parse(orderRow(db, orderId).created_at) / 1000));
    assert.equal(icEvent.custom_data.value, 127.96);
    assert.deepEqual(icEvent.user_data.em, [sha("ada.lee@example.com")]);
    assert.deepEqual({ ip: icEvent.user_data.client_ip_address, ua: icEvent.user_data.client_user_agent, fbc: icEvent.user_data.fbc, fbp: icEvent.user_data.fbp }, { ip: "203.0.113.9", ua: "Mozilla/5.0 Test Browser", fbc: FBC, fbp: FBP });
    assert.deepEqual(attributionRow(db, orderId), { order_id: orderId, fbp: FBP, fbc: FBC, fbclid: "AbCdEf", source_url: SOURCE_URL, client_ip: "203.0.113.9", client_user_agent: "Mozilla/5.0 Test Browser", created_at: attributionRow(db, orderId).created_at });

    // Purchase through the webhook
    assert.equal((await payViaWebhook(env, orderId)).status, 200);
    assert.equal(purchases(meta).length, 1);
    const publicView = await (await call(env, `/api/orders/${orderId}`)).json();
    assert.deepEqual(publicView.lines.map((l) => [l.sku, l.qty, l.unitCents, l.lineCents]), [["D204", 1, 5999, 5999], ["D215", 2, 2999, 5998]], "public order lines expose unitCents");
    const purchase = purchases(meta)[0];
    const paidAt = orderRow(db, orderId).paid_at;
    assert.equal(purchase.event_id, `purchase_${orderId}`);
    assert.equal(purchase.event_time, Math.floor(Date.parse(paidAt) / 1000), "event_time = paid_at");
    assert.equal(purchase.event_source_url, SOURCE_URL);
    assert.deepEqual(purchase.custom_data, {
      value: 127.96, currency: "USD", content_type: "product", content_ids: ["D204", "D215"],
      contents: [{ id: "D204", quantity: 1, item_price: 59.99 }, { id: "D215", quantity: 2, item_price: 29.99 }], order_id: orderId,
    });
    assert.equal(purchase.custom_data.value, orderRow(db, orderId).total_cents / 100, "value = D1 total_cents / 100");

    assert.deepEqual(eventRows(db, orderId).map((r) => [r.event_name, r.event_id, r.status, r.attempts, r.error]),
      [["InitiateCheckout", `ic_${orderId}`, "sent", 1, ""], ["Purchase", `purchase_${orderId}`, "sent", 1, ""]]);

    // Redelivered webhook, the confirmation-page poll and a new webhook event: nothing is sent again.
    await payViaWebhook(env, orderId);
    const ctx = ctxStub();
    await call(env, `/api/orders/${orderId}`, {}, ctx);
    await ctx.settled();
    assert.equal(purchases(meta).length, 1);
    assert.equal(meta.calls.length, 2);
  });
});

test("flow: the confirmation-page poll (Retrieve path) sends Purchase too, and exactly once under concurrency", { skip }, async () => {
  const db = await createD1();
  const env = prodEnv(db);
  const meta = createFakeMeta();
  await withWorld({ meta }, async () => {
    const orderId = await startCheckout(env);
    const original = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      if (/payment_intents\/int_123$/.test(String(url))) return jsonResponse(200, { id: "int_123", status: "SUCCEEDED", currency: "USD", amount: 127.96, merchant_order_id: orderId });
      return original(url, init);
    };
    const ctx = ctxStub();
    const all = await Promise.all([
      call(env, `/api/orders/${orderId}`, {}, ctx),
      call(env, `/api/orders/${orderId}`, {}, ctx),
      call(env, "/api/webhooks/airwallex", signedWebhook(orderId), ctx),
      call(env, "/api/webhooks/airwallex", signedWebhook(orderId), ctx),
    ]);
    await ctx.settled();
    globalThis.fetch = original;
    assert.ok(all.every((r) => r.status === 200));
    assert.equal(orderRow(db, orderId).status, "paid");
    assert.equal(purchases(meta).length, 1, "one Purchase however many paths settle the order");
    assert.equal(eventRows(db, orderId).filter((r) => r.event_name === "Purchase").length, 1);
  });
});

test("webhook signature: a bad signature is still 400 and sends nothing; a good one is 200", { skip }, async () => {
  const db = await createD1();
  const env = prodEnv(db);
  await withWorld({}, async ({ meta }) => {
    const orderId = await startCheckout(env);
    const before = meta.calls.length;
    const bad = await payViaWebhook(env, orderId, { secret: "whsec_wrong" });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error.code ?? "invalid_signature", "invalid_signature");
    assert.equal(orderRow(db, orderId).status, "pending");
    assert.equal(meta.calls.length, before, "no CAPI call for an unsigned webhook");
    assert.equal((await payViaWebhook(env, orderId)).status, 200);
    assert.equal(purchases(meta).length, 1);
  });
});

test("off by default: no META_DATASET_ID means no CAPI call, no Meta tables written, unchanged Airwallex metadata (staging)", { skip }, async () => {
  for (const extra of [{}, { META_CAPI_ACCESS_TOKEN: FAKE_META_TOKEN }, { META_DATASET_ID: "" , META_CAPI_ACCESS_TOKEN: FAKE_META_TOKEN }]) {
    const db = await createD1();
    const env = baseEnv(db, extra);
    await withWorld({}, async ({ meta, intents }) => {
      const orderId = await startCheckout(env, checkoutBody({ attribution: { fbp: FBP, fbc: FBC, sourceUrl: SOURCE_URL } }), { Cookie: `_fbp=${FBP}` });
      assert.deepEqual(intents[0].metadata, { source: "apgo-us-store", order_id: orderId }, "metadata exactly as before");
      assert.equal((await payViaWebhook(env, orderId)).status, 200);
      assert.equal(orderRow(db, orderId).status, "paid");
      assert.equal(meta.calls.length, 0);
      assert.equal(eventRows(db, orderId).length, 0);
      assert.equal(attributionRow(db, orderId), null);
      assert.deepEqual(await retryMetaEvents(env), { ran: false, checked: 0, sent: 0, failed: 0, skipped: 0, swept: 0 });
    });
  }
});

test("dataset set but token missing: checkout and webhook work, nothing is sent, nothing is claimed", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db, { META_DATASET_ID: FAKE_DATASET_ID });
  await withWorld({}, async ({ meta, logs }) => {
    const orderId = await startCheckout(env);
    assert.equal((await payViaWebhook(env, orderId)).status, 200);
    assert.equal(orderRow(db, orderId).status, "paid");
    assert.equal(meta.calls.length, 0);
    assert.equal(eventRows(db, orderId).length, 0, "no claim, so a later token can still send via the sweep");
    assert.ok(logs.some((l) => l.text.includes("meta_capi_skipped") && l.text.includes("META_CAPI_ACCESS_TOKEN")));
  });
});

test("no attribution at all (older front end, curl): checkout works and events still go out", { skip }, async () => {
  const db = await createD1();
  const env = prodEnv(db);
  await withWorld({}, async ({ meta, intents }) => {
    const orderId = await startCheckout(env, checkoutBody()); // no attribution key, no cookie
    assert.deepEqual(intents[0].metadata.event_source_url, `${ORIGIN}/checkout.html?order=${orderId}`, "falls back to the checkout url");
    assert.ok(!("fbc" in intents[0].metadata) && !("fbp" in intents[0].metadata));
    const row = attributionRow(db, orderId);
    assert.deepEqual({ fbp: row.fbp, fbc: row.fbc, fbclid: row.fbclid, ip: row.client_ip, ua: row.client_user_agent }, { fbp: "", fbc: "", fbclid: "", ip: "", ua: "" });
    const user = meta.events()[0].user_data;
    assert.ok(user.em && !("fbc" in user) && !("fbp" in user) && !("client_ip_address" in user));
    // garbage attribution is ignored, not an error
    for (const attribution of ["nope", 5, [], { fbp: 1, sourceUrl: { x: 1 } }]) {
      const id = await startCheckout(env, checkoutBody({ attribution }));
      assert.match(id, /^APGO-US-/);
    }
  });
});

test("attribution hostile values are dropped before they reach D1, Airwallex or Meta; the fbclid builds fbc", { skip }, async () => {
  const db = await createD1();
  const env = prodEnv(db);
  await withWorld({}, async ({ meta, intents }) => {
    const orderId = await startCheckout(env, checkoutBody({ attribution: { fbp: "x'); DROP TABLE orders;--", fbclid: "Iw-AR_0abc", sourceUrl: `https://store.shopapgo.com/${"a".repeat(600)}` } }));
    const row = attributionRow(db, orderId);
    assert.equal(row.fbp, "");
    assert.match(row.fbc, /^fb\.1\.\d{13}\.Iw-AR_0abc$/);
    assert.equal(row.source_url, `${ORIGIN}/checkout.html?order=${orderId}`, "an over-long url is dropped, the fallback is used");
    assert.equal(orderRow(db, orderId).status, "pending", "orders table untouched");
    assert.equal(intents[0].metadata.fbc, row.fbc);
    assert.ok(Object.entries(intents[0].metadata).every(([k, v]) => k.length <= 50 && String(v).length <= 500));
    assert.equal(meta.events()[0].user_data.fbc, row.fbc);
    assert.ok(!JSON.stringify(intents[0].metadata).includes("ada"), "no PII in Airwallex metadata");
  });
});

// ---------- failures, retries, cron ----------

test("retries: network error, 429 and 5xx are retried in the same request with the same event; 400 is not", { skip }, async () => {
  const db = await createD1();
  const env = prodEnv(db);
  const meta = createFakeMeta({ script: [{ network: true }, { status: 429 }, { status: 200 }] });
  await withWorld({ meta }, async () => {
    const orderId = await startCheckout(env);
    assert.equal(meta.calls.length, 3);
    assert.equal(new Set(meta.calls.map((c) => c.rawBody)).size, 1, "identical body on every try");
    const row = eventRows(db, orderId)[0];
    assert.deepEqual({ status: row.status, attempts: row.attempts, error: row.error }, { status: "sent", attempts: 3, error: "" });
  });

  const db2 = await createD1();
  const meta2 = createFakeMeta({ script: [{ status: 400 }] });
  await withWorld({ meta: meta2 }, async () => {
    const orderId = await startCheckout(prodEnv(db2));
    assert.equal(meta2.calls.length, 1, "a 400 is not retried inline");
    const row = eventRows(db2, orderId)[0];
    assert.equal(row.status, "failed");
    assert.match(row.error, /^http_400 type=OAuthException code=100 subcode=33 trace=FBERR1$/);
    assert.ok(!row.error.includes("ada") && !row.error.includes("PII") && !row.error.includes(FAKE_META_TOKEN), "error holds codes only: no Meta free text, no PII, no token");
  });

  const db3 = await createD1();
  const meta3 = createFakeMeta({ script: [{ status: 500 }, { status: 502 }, { status: 503 }] });
  await withWorld({ meta: meta3 }, async () => {
    const orderId = await startCheckout(prodEnv(db3));
    assert.equal(meta3.calls.length, 3, "at most 3 tries");
    const row = eventRows(db3, orderId)[0];
    assert.deepEqual({ status: row.status, attempts: row.attempts, error: row.error }, { status: "failed", attempts: 3, error: row.error });
    assert.match(row.error, /^http_503/);
  });

  const db4 = await createD1();
  const meta4 = createFakeMeta({ script: [{ status: 200, body: { events_received: 0, messages: [] } }] });
  await withWorld({ meta: meta4 }, async () => {
    const orderId = await startCheckout(prodEnv(db4));
    assert.equal(eventRows(db4, orderId)[0].error, "events_received_0");
    assert.equal(eventRows(db4, orderId)[0].status, "failed");
  });
});

test("timeouts are retried and recorded without crashing; a Meta outage never changes checkout, payment or the webhook answer", { skip }, async () => {
  const db = await createD1();
  const env = prodEnv(db, { META_CAPI_TIMEOUT_MS: "20" });
  const meta = createFakeMeta({ script: [{ network: true }, { network: true }, { network: true }, { network: true }, { network: true }, { network: true }] });
  await withWorld({ meta }, async () => {
    const orderId = await startCheckout(env);
    assert.equal((await payViaWebhook(env, orderId)).status, 200);
    assert.equal(orderRow(db, orderId).status, "paid");
    assert.deepEqual(eventRows(db, orderId).map((r) => [r.event_name, r.status, r.attempts, r.error]), [["InitiateCheckout", "failed", 3, "network_error"], ["Purchase", "failed", 3, "network_error"]]);
  });
});

test("cron: failed events are re-sent with the original event_id and event_time, honour the back-off, and are protected from double sends", { skip }, async () => {
  const db = await createD1();
  const env = prodEnv(db);
  const meta = createFakeMeta({ script: [{ status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }] });
  await withWorld({ meta }, async () => {
    const orderId = await startCheckout(env);
    await payViaWebhook(env, orderId);
    const failed = eventRows(db, orderId);
    assert.deepEqual(failed.map((r) => r.status), ["failed", "failed"]);
    const originalCalls = meta.calls.length; // 6
    const firstPurchase = JSON.parse(meta.calls.at(-1).rawBody).data[0];

    // too early: the back-off has not elapsed
    const tooEarly = await retryMetaEvents(env, { now: Date.now() + 60_000 });
    assert.equal(tooEarly.checked, 0);
    assert.equal(meta.calls.length, originalCalls);

    // after the back-off both events go out once, with the same ids and times
    const later = Date.now() + retryDelayMs(3) + 60_000;
    const [a, b] = await Promise.all([retryMetaEvents(env, { now: later }), retryMetaEvents(env, { now: later })]);
    assert.equal(a.sent + b.sent, 2, "two parallel crons together send each event exactly once");
    assert.equal(meta.calls.length, originalCalls + 2);
    const resent = meta.events().slice(-2);
    assert.deepEqual(resent.map((e) => e.event_id).sort(), [`ic_${orderId}`, `purchase_${orderId}`]);
    const resentPurchase = resent.find((e) => e.event_name === "Purchase");
    assert.equal(resentPurchase.event_time, firstPurchase.event_time);
    assert.deepEqual(resentPurchase.custom_data, firstPurchase.custom_data);
    assert.deepEqual(eventRows(db, orderId).map((r) => [r.status, r.error, r.attempts]), [["sent", "", 4], ["sent", "", 4]]);

    // sent events are never touched again
    assert.equal((await retryMetaEvents(env, { now: later + 10 * 3_600_000 })).checked, 0);
    assert.equal(meta.calls.length, originalCalls + 2);
  });
});

test("cron: gives up after the attempt cap, skips events older than 6 days, takes over abandoned 'sending' rows, and needs the token", { skip }, async () => {
  const db = await createD1();
  const env = prodEnv(db);
  await withWorld({}, async ({ meta }) => {
    const orderId = await startCheckout(env);
    const stamp = new Date().toISOString();
    db.raw.prepare("UPDATE order_meta_events SET status = 'failed', attempts = 24, error = 'http_500' WHERE order_id = ?").run(orderId);
    meta.calls.length = 0;
    assert.equal((await retryMetaEvents(env, { now: Date.now() + 7 * 86_400_000 / 7 })).checked, 0, "attempt cap reached");

    db.raw.prepare("UPDATE order_meta_events SET attempts = 3 WHERE order_id = ?").run(orderId);
    assert.equal((await retryMetaEvents(env, { now: Date.now() + 7 * 86_400_000 })).checked, 0, "older than 6 days: Meta would reject it");

    db.raw.prepare("UPDATE order_meta_events SET status = 'sending', updated_at = ? WHERE order_id = ?").run(stamp, orderId);
    assert.equal((await retryMetaEvents(env, { now: Date.now() + 60_000 })).checked, 0, "a recent 'sending' row is someone else's work");
    const result = await retryMetaEvents(env, { now: Date.now() + 15 * 60_000 });
    assert.equal(result.sent, 1, "a 'sending' row abandoned for > 10 min is taken over");
    assert.equal(meta.calls.length, 1);

    assert.equal((await retryMetaEvents({ ...env, META_CAPI_ACCESS_TOKEN: "" })).ran, false);
  });
});

test("cron sweep: a paid order that never got a Purchase row (Worker cut off) is sent once", { skip }, async () => {
  const db = await createD1();
  const quiet = baseEnv(db); // Meta off while the order is paid, as if the work was lost
  await withWorld({}, async ({ meta }) => {
    const orderId = await startCheckout(quiet);
    await payViaWebhook(quiet, orderId);
    assert.equal(meta.calls.length, 0);
    const env = prodEnv(db);
    const paidAt = Date.parse(orderRow(db, orderId).paid_at);
    assert.equal((await retryMetaEvents(env, { now: paidAt + 60_000 })).swept, 0, "a just-paid order is left to its own request");
    const result = await retryMetaEvents(env, { now: paidAt + 10 * 60_000 });
    assert.equal(result.swept, 1);
    assert.equal(purchases(meta).length, 1);
    assert.equal(purchases(meta)[0].event_time, Math.floor(paidAt / 1000));
    await retryMetaEvents(env, { now: paidAt + 20 * 60_000 });
    assert.equal(purchases(meta).length, 1, "swept once only");
    assert.equal((await retryMetaEvents(env, { now: paidAt + 8 * 86_400_000 })).swept, 0, "orders older than 6 days are not swept");
  });
});

test("scheduled(): one handler runs the Meta re-send and still the MCF sync (merged, not replaced); staging does nothing", { skip }, async () => {
  const db = await createD1();
  const env = prodEnv(db);
  const meta = createFakeMeta({ script: [{ status: 500 }, { status: 500 }, { status: 500 }] });
  await withWorld({ meta }, async () => {
    const orderId = await startCheckout(env);
    assert.equal(eventRows(db, orderId)[0].status, "failed");
    db.raw.prepare("UPDATE order_meta_events SET updated_at = '2020-01-01T00:00:00.000Z', event_time = ? WHERE order_id = ?").run(Math.floor(Date.now() / 1000), orderId);
    const ctx = ctxStub();
    await worker.scheduled({}, env, ctx);
    await ctx.settled();
    assert.equal(eventRows(db, orderId)[0].status, "sent");
  });

  // staging / local: no dataset id -> the handler must not even touch the database
  const stagingEnv = baseEnv({ prepare() { throw new Error("database must not be touched"); } });
  const ctx = ctxStub();
  await worker.scheduled({}, stagingEnv, ctx);
  await ctx.settled();
});

// ---------- test_event_code, logs, secrets ----------

test("test_event_code is sent only when META_TEST_EVENT_CODE is set (and valid)", { skip }, async () => {
  const db = await createD1();
  await withWorld({}, async ({ meta }) => {
    await startCheckout(prodEnv(db, { META_TEST_EVENT_CODE: "TEST27938" }));
    assert.equal(meta.calls[0].body.test_event_code, "TEST27938");
    await startCheckout(prodEnv(db, { META_TEST_EVENT_CODE: "" }));
    assert.equal("test_event_code" in meta.calls[1].body, false);
    await startCheckout(prodEnv(db));
    assert.equal("test_event_code" in meta.calls[2].body, false);
  });
});

test("logs: only time, event name/id, HTTP status, events_received and fbtrace_id; no PII, IP, UA or token anywhere", { skip }, async () => {
  const db = await createD1();
  const env = prodEnv(db);
  const meta = createFakeMeta({ script: [{ status: 200 }, { status: 400 }] });
  await withWorld({ meta }, async ({ logs }) => {
    const orderId = await startCheckout(env, checkoutBody({ attribution: { fbp: FBP, fbc: FBC, sourceUrl: SOURCE_URL } }), { "CF-Connecting-IP": "203.0.113.9", "User-Agent": "Mozilla/5.0 Secret Browser" });
    await payViaWebhook(env, orderId);
    const lines = logs.filter((l) => l.text.startsWith("meta_capi"));
    assert.equal(lines.length, 2);
    const ok = JSON.parse(lines[0].text.replace(/^meta_capi\s+/, ""));
    assert.deepEqual(Object.keys(ok).sort(), ["at", "attempts", "event_id", "event_name", "events_received", "fbtrace_id", "http_status", "outcome"]);
    assert.deepEqual({ name: ok.event_name, id: ok.event_id, status: ok.http_status, received: ok.events_received, trace: ok.fbtrace_id, outcome: ok.outcome }, { name: "InitiateCheckout", id: `ic_${orderId}`, status: 200, received: 1, trace: "FBTRACE1", outcome: "sent" });
    assert.ok(!Number.isNaN(Date.parse(ok.at)));
    const bad = JSON.parse(lines[1].text.replace(/^meta_capi\s+/, ""));
    assert.deepEqual({ status: bad.http_status, outcome: bad.outcome, trace: bad.fbtrace_id }, { status: 400, outcome: "failed", trace: "FBERR2" });

    const everything = logs.map((l) => l.text).join("\n");
    for (const secret of [FAKE_META_TOKEN, "ada.lee@example.com", "Ada", "O'Lee", "Austin", "78701", "203.0.113.9", "Secret Browser", FBP, FBC, "100 Example Ave", sha("ada.lee@example.com")]) {
      assert.ok(!everything.includes(secret), `logs must not contain ${secret.slice(0, 12)}…`);
    }
  });
});

test("secrets: no token in code, toml or tests; the example env documents empty names; Meta wiring is production-only", async () => {
  for (const file of ["worker/meta-capi.js", "worker/meta-attribution.js", "worker/index.js", "tests/commerce-meta-capi.test.mjs", "tests/helpers/fake-meta-capi.mjs", "wrangler.toml", "docs/meta-tracking.md"]) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.ok(!/EAA[A-Za-z0-9]{30,}/.test(source.replace(FAKE_META_TOKEN, "")), `${file}: no Meta access token`);
  }
  const example = await readFile(new URL("../.dev.vars.example", import.meta.url), "utf8");
  for (const name of ["META_CAPI_ACCESS_TOKEN", "META_TEST_EVENT_CODE", "META_DATASET_ID"]) assert.match(example, new RegExp(`^${name}=$`, "m"));

  const toml = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  const split = toml.indexOf("[env.production]");
  const beforeProduction = toml.slice(0, split);
  const production = toml.slice(split);
  assert.ok(!/META_DATASET_ID\s*=/.test(beforeProduction.replace(/^\s*#.*$/gm, "")), "staging and the top level have no dataset id");
  assert.match(production, /^\[env\.production\.vars\][^[]*\nMETA_DATASET_ID = "2606879866471418"/m);
  assert.match(production, /^\[env\.production\.triggers\]\s*\ncrons = \["\*\/15 \* \* \* \*"\]/m);
  assert.ok(!/^\s*(META_CAPI_ACCESS_TOKEN|META_TEST_EVENT_CODE)\s*=/m.test(toml), "token and test code are secrets");
  // Staging runs a cron for customer email retries only: the Meta re-send job is a no-op there without META_DATASET_ID.
  const testSiteCrons = [...beforeProduction.matchAll(/^\[([^\]]+)\]\s*\ncrons\s*=/gm)].map((match) => match[1]);
  assert.equal([...beforeProduction.matchAll(/^\s*crons\s*=/gm)].length, testSiteCrons.length, "every cron sits under its [*.triggers] header");
  assert.deepEqual(testSiteCrons.sort(), ["env.staging.triggers"]);
});

test("migrations: the two new tables exist after schema.sql, once, and need no ALTER", async () => {
  const schema = await readFile(new URL("../worker/schema.sql", import.meta.url), "utf8");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS order_attribution/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS order_meta_events[\s\S]*PRIMARY KEY \(order_id, event_name\)/);
  assert.ok(!/ALTER TABLE/i.test(schema));
  if (hasSqlite) {
    const db = await createD1();
    db.raw.exec(schema); // re-running the whole file is harmless
    const tables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
    assert.ok(tables.includes("order_attribution") && tables.includes("order_meta_events"));
  }
});

test("sendMetaEvent directly: duplicate claim, unknown event and missing order are harmless", { skip }, async () => {
  const db = await createD1();
  const env = prodEnv(db);
  await withWorld({}, async ({ meta }) => {
    const orderId = await startCheckout(env);
    const order = orderRow(db, orderId);
    assert.equal((await sendMetaEvent(env, order, "InitiateCheckout")).outcome, "duplicate");
    assert.equal((await sendMetaEvent(env, order, "AddToCart")).outcome, "skipped");
    assert.equal((await sendMetaEvent(env, null, "Purchase")).outcome, "skipped");
    assert.equal(meta.calls.length, 1);
    assert.equal((await sendMetaEvent({ ...env, DB: { prepare() { throw new Error("db down"); } } }, order, "Purchase")).outcome, "error", "a database problem is contained");
  });
});
