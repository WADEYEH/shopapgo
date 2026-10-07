// Amazon MCF through the internal outbound endpoints of the amazon-spapi-mcp Worker: client behaviour (bearer auth,
// retries, error classes) and the order flow (auto-submit off by default, idempotent submit, failure + retry button,
// status sync back into "shipped"). Everything runs against the fake endpoints in tests/helpers/fake-amazon-mcf.mjs; any
// other network call fails the test. Nothing reaches Amazon or the real MCP Worker.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import worker from "../worker/index.js";
import { resetAirwallexTokenCache } from "../worker/airwallex.js";
import {
  McfError,
  cancelFulfillmentOrder,
  createFulfillmentOrder,
  getFulfillmentOrder,
  getFulfillmentPreview,
  getPackageTracking,
  listFulfillmentOrders,
  mcfConfig,
  mcfReadiness,
  normalizePreview,
  shipmentFromMcfOrder,
} from "../worker/amazon-mcf.js";
import { scheduledMcfSync } from "../worker/mcf.js";
import { createD1, sqliteAvailable } from "./helpers/d1.mjs";
import { FAKE_AMAZON_ENV, FAKE_BASE_URL, FAKE_OUTBOUND_TOKEN, createFakeAmazon } from "./helpers/fake-amazon-mcf.mjs";

globalThis.fetch = async (url) => { throw new Error(`unexpected real network call: ${url}`); };

const hasSqlite = await sqliteAvailable();
const skip = hasSqlite ? false : "node:sqlite needs Node 22.5+";

const ADMIN_TOKEN = "test-admin-token-0123456789";
const WEBHOOK_SECRET = "whsec_unit_test";
const ORIGIN = "https://store.example";
const MAIL_URL = "https://mail.example/send";
const bearer = { Authorization: `Bearer ${ADMIN_TOKEN}` };

const baseEnv = (db, extra = {}) => ({
  DB: db,
  AIRWALLEX_CLIENT_ID: "cid",
  AIRWALLEX_API_KEY: "key",
  AIRWALLEX_WEBHOOK_SECRET: WEBHOOK_SECRET,
  AIRWALLEX_ENV: "demo",
  AIRWALLEX_RETRY_DELAY_MS: "0",
  ADMIN_TOKEN,
  RESEND_API_KEY: "rk_test_key",
  CUSTOMER_EMAIL_FROM: "APGO <orders@shop.example>",
  ORDER_NOTIFY_EMAIL_API_URL: MAIL_URL,
  ASSETS: { fetch: async () => new Response("<h1>admin page</h1>") },
  ...extra,
});
const mcfEnv = (db, extra = {}) => baseEnv(db, { ...FAKE_AMAZON_ENV, ...extra });

const ctxStub = () => ({ waitUntil(promise) { (this.pending ||= []).push(promise); }, async settled() { await Promise.all(this.pending ?? []); } });
const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const call = (env, path, init = {}, ctx = ctxStub()) => worker.fetch(new Request(`${ORIGIN}${path}`, init), env, ctx);
const post = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const adminPost = (body = {}, headers = {}) => ({ method: "POST", headers: { ...bearer, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

// Routes fetch: Airwallex (when given), Amazon (the fake) and the mocked email API; records the emails.
async function withWorld({ amazon = createFakeAmazon(), airwallex = true } = {}, run) {
  const original = globalThis.fetch;
  const mails = [];
  const others = [];
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href === MAIL_URL) { mails.push(JSON.parse(init.body)); return Response.json({ id: crypto.randomUUID() }); }
    if (href.startsWith(FAKE_BASE_URL)) return amazon.fetch(href, init);
    if (airwallex && href.includes("/api/v1/")) {
      if (href.endsWith("/authentication/login")) return jsonResponse(201, { token: "tok", expires_at: new Date(Date.now() + 1_800_000).toISOString().replace(/\.\d+Z$/, "+0000") });
      if (href.endsWith("/payment_intents/create")) {
        const payload = JSON.parse(init.body);
        return jsonResponse(201, { id: "int_123", client_secret: "cs", currency: payload.currency, amount: payload.amount, merchant_order_id: payload.merchant_order_id, status: "REQUIRES_PAYMENT_METHOD" });
      }
    }
    others.push(href);
    throw new Error(`unexpected real network call: ${href}`);
  };
  try {
    return await run({ amazon, mails, others });
  } finally {
    globalThis.fetch = original;
  }
}

const checkoutBody = (method = "express") => ({
  items: [{ sku: "d204", qty: 1 }, { sku: "d215", qty: 2 }],
  contact: { email: "ada@example.com", marketingOptIn: false },
  shipping: { firstName: "Ada", lastName: "Lee", street: "100 Example Ave", street2: "Apt 4", city: "Austin", state: "TX", zip: "78701" },
  method,
});

function signedWebhook(orderId, total = 128.97) {
  const body = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, name: "payment_intent.succeeded", data: { object: { id: "int_123", merchant_order_id: orderId, status: "SUCCEEDED", currency: "USD", amount: total } } });
  const timestamp = String(Date.now());
  return { method: "POST", headers: { "x-timestamp": timestamp, "x-signature": createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}${body}`).digest("hex") }, body };
}

// Creates an order through the real checkout endpoint and (optionally) pays it through the real webhook path.
async function placeOrder(env, { pay = true, method = "express" } = {}) {
  resetAirwallexTokenCache();
  const session = await (await call(env, "/api/checkout/session", post(checkoutBody(method)))).json();
  if (pay) await payOrder(env, session.orderId, method === "express" ? 128.97 : 119.97);
  return session.orderId;
}
async function payOrder(env, orderId, total = 128.97) {
  const ctx = ctxStub();
  const response = await call(env, "/api/webhooks/airwallex", signedWebhook(orderId, total), ctx);
  assert.equal(response.status, 200);
  await ctx.settled();
}
const adminOrder = async (env, orderId) => (await call(env, `/admin/api/orders/${orderId}`, { headers: bearer })).json();
const mcfRow = (db, orderId) => { const row = db.raw.prepare("SELECT * FROM order_mcf WHERE order_id = ?").get(orderId); return row ? { ...row } : null; };
const orderStatus = (db, orderId) => db.raw.prepare("SELECT status FROM orders WHERE id = ?").get(orderId).status;
const emailRows = (db, orderId) => db.raw.prepare("SELECT kind, status FROM order_emails WHERE order_id = ? ORDER BY kind").all(orderId).map((r) => ({ ...r }));

// ---------- configuration and defaults ----------

test("mcf config: off by default, SKU map empty by default, credentials checked by name, bad JSON refused", () => {
  const off = mcfReadiness({});
  assert.equal(off.mode, "off");
  assert.equal(off.ok, false);
  assert.deepEqual(mcfConfig({}).skuMap, {});

  const missing = mcfReadiness({ MCF_AUTO_SUBMIT: "true", MCF_SKU_MAP_JSON: '{"D204":"A"}', AMAZON_OUTBOUND_BASE_URL: FAKE_BASE_URL });
  assert.equal(missing.mode, "not_configured");
  assert.match(missing.reason, /missing OUTBOUND_INTERNAL_TOKEN/);
  assert.ok(!missing.reason.includes(FAKE_BASE_URL), "never prints values");
  assert.match(mcfReadiness({ ...FAKE_AMAZON_ENV, AMAZON_OUTBOUND_BASE_URL: "http://amazon-mcp.insecure.example" }).reason, /https/, "the bearer token never goes over http");
  assert.match(mcfReadiness({ ...FAKE_AMAZON_ENV, AMAZON_OUTBOUND_BASE_URL: "", OUTBOUND_INTERNAL_TOKEN: "" }).reason, /AMAZON_OUTBOUND_BASE_URL, OUTBOUND_INTERNAL_TOKEN/);
  assert.equal(mcfConfig(FAKE_AMAZON_ENV).notifyAmazonEmail, false, "Amazon email notices are off by default");

  const noMap = mcfReadiness({ ...FAKE_AMAZON_ENV, MCF_SKU_MAP_JSON: "" });
  assert.match(noMap.reason, /MCF_SKU_MAP_JSON is empty/);
  assert.match(mcfReadiness({ ...FAKE_AMAZON_ENV, MCF_SKU_MAP_JSON: "{oops" }).reason, /MCF_SKU_MAP_JSON/);
  assert.match(mcfReadiness({ ...FAKE_AMAZON_ENV, MCF_SKU_MAP_JSON: '{"D204":42}' }).reason, /invalid entry/);
  assert.match(mcfReadiness({ ...FAKE_AMAZON_ENV, MCF_SHIPPING_MAP_JSON: '{"standard":"OVERNIGHT"}' }).reason, /MCF_SHIPPING_MAP_JSON/);

  const order = { lines_json: JSON.stringify([{ sku: "D204" }, { sku: "D215" }]), shipping_method: "standard" };
  const partial = mcfReadiness({ ...FAKE_AMAZON_ENV, MCF_SKU_MAP_JSON: '{"D204":"A"}' }, order);
  assert.match(partial.reason, /SKU not mapped: D215/);
  assert.equal(mcfReadiness(FAKE_AMAZON_ENV, order).ok, true);
  assert.match(mcfReadiness(FAKE_AMAZON_ENV, { ...order, shipping_method: "overnight" }).reason, /no MCF service tier/);
});

test("default (MCF_AUTO_SUBMIT unset): payment succeeds, Amazon is never called, nothing is stored, admin says MCF is off", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db, { ...FAKE_AMAZON_ENV, MCF_AUTO_SUBMIT: "" }); // credentials and map present, switch off
  await withWorld({}, async ({ amazon, others }) => {
    const orderId = await placeOrder(env);
    assert.equal(orderStatus(db, orderId), "paid");
    assert.equal(amazon.calls.length, 0);
    assert.deepEqual(others, []);
    assert.equal(mcfRow(db, orderId), null);
    const view = await adminOrder(env, orderId);
    assert.equal(view.mcf.mode, "off");
    assert.equal(view.mcf.record, null);
    assert.equal(view.mcf.canSubmit, false);
    assert.match(view.mcf.reason, /MCF_AUTO_SUBMIT/);
    // the retry endpoint cannot be used to bypass the switch
    const forced = await (await call(env, `/admin/api/orders/${orderId}/mcf/submit`, adminPost())).json();
    assert.equal(forced.result.outcome, "skipped");
    assert.equal(amazon.calls.length, 0);
  });
});

test("enabled but the outbound connection is missing: skipped without any network call, reason names the variables, order stays paid", { skip }, async () => {
  const db = await createD1();
  const env = mcfEnv(db, { OUTBOUND_INTERNAL_TOKEN: "" });
  await withWorld({}, async ({ amazon }) => {
    const orderId = await placeOrder(env);
    assert.equal(orderStatus(db, orderId), "paid");
    assert.equal(amazon.calls.length, 0);
    assert.equal(mcfRow(db, orderId), null);
    const view = await adminOrder(env, orderId);
    assert.equal(view.mcf.mode, "not_configured");
    assert.match(view.mcf.reason, /missing OUTBOUND_INTERNAL_TOKEN/);
    assert.equal(view.mcf.canSubmit, false);
    assert.ok(!JSON.stringify(view).includes(FAKE_OUTBOUND_TOKEN), "the token never appears in admin JSON");
  });
});

test("enabled with an empty or partial SKU map: nothing is sent", { skip }, async () => {
  for (const map of ["", "{}", '{"D204":"AMZ-SKU-D204"}']) {
    const db = await createD1();
    const env = mcfEnv(db, { MCF_SKU_MAP_JSON: map });
    await withWorld({}, async ({ amazon }) => {
      const orderId = await placeOrder(env);
      assert.equal(amazon.calls.length, 0, `map ${JSON.stringify(map)}`);
      assert.equal(mcfRow(db, orderId), null);
      assert.equal((await adminOrder(env, orderId)).mcf.mode, "not_configured");
    });
  }
});

// ---------- submit ----------

test("paid order is submitted once to MCF with our order id, mapped SKUs, the right ship speed, the address and no Amazon email", { skip }, async () => {
  for (const [method, tier] of [["express", "EXPEDITED"], ["standard", "STANDARD"]]) {
    const db = await createD1();
    const env = mcfEnv(db);
    await withWorld({}, async ({ amazon }) => {
      const orderId = await placeOrder(env, { method });
      assert.equal(amazon.count("create"), 1);
      const create = amazon.calls.find((c) => c.op === "create");
      assert.equal(create.path, "/internal/outbound/orders");
      assert.equal(create.headers.authorization, `Bearer ${FAKE_OUTBOUND_TOKEN}`);
      assert.equal(create.body.seller_fulfillment_order_id, orderId, "SellerFulfillmentOrderId is our order id");
      assert.ok(orderId.length <= 40);
      assert.equal(create.body.displayable_order_id, orderId);
      assert.equal(create.body.shipping_speed_category, tier === "EXPEDITED" ? "Expedited" : "Standard");
      assert.equal(create.body.fulfillment_action, "Ship");
      assert.match(create.body.displayable_order_date, /^\d{4}-\d\d-\d\dT/);
      assert.deepEqual(create.body.items.map((l) => [l.sellerSku, l.quantity, l.sellerFulfillmentOrderItemId]).sort(), [["AMZ-SKU-D204", 1, "L1"], ["AMZ-SKU-D215", 2, "L2"]]);
      assert.deepEqual(create.body.destination_address, { name: "Ada Lee", addressLine1: "100 Example Ave", addressLine2: "Apt 4", city: "Austin", stateOrRegion: "TX", postalCode: "78701", countryCode: "US" });
      assert.equal(create.body.notification_emails, undefined, "Amazon sends no email of its own by default");
      assert.ok(!JSON.stringify(create.body).includes("ada@example.com"), "the shopper's email is not sent by default");

      const row = mcfRow(db, orderId);
      assert.equal(row.status, "submitted");
      assert.equal(row.seller_order_id, orderId);
      assert.equal(row.service_tier, tier);
      assert.equal(row.mcf_status, "RECEIVED");
      const audit = db.raw.prepare("SELECT action, actor FROM order_audit WHERE order_id = ?").all(orderId).map((r) => ({ ...r }));
      assert.deepEqual(audit, [{ action: "mcf.submitted", actor: "mcf-auto" }]);
      const view = await adminOrder(env, orderId);
      assert.equal(view.mcf.record.status, "submitted");
      assert.equal(view.mcf.canSync, true);
      assert.equal(view.mcf.canSubmit, false, "no retry button once sent");
      assert.equal(view.fulfillmentStatus, "unfulfilled", "shipping is only recorded when Amazon reports it shipped");
    });
  }
});

test("MCF_NOTIFY_AMAZON_EMAIL=true passes the shopper's email (and a phone, when the order has one) to Amazon", { skip }, async () => {
  const db = await createD1();
  const env = mcfEnv(db, { MCF_NOTIFY_AMAZON_EMAIL: "true" });
  await withWorld({}, async ({ amazon }) => {
    const orderId = await placeOrder(env);
    db.raw.prepare("UPDATE orders SET shipping_json = json_set(shipping_json, '$.phone', '+1 512 555 0100') WHERE id = ?").run(orderId);
    assert.deepEqual(amazon.calls.find((c) => c.op === "create").body.notification_emails, ["ada@example.com"]);
    // a retry of another order with a phone in its address carries it
    const second = await placeOrder({ ...env, MCF_AUTO_SUBMIT: "" });
    db.raw.prepare("UPDATE orders SET shipping_json = json_set(shipping_json, '$.phone', '+1 512 555 0100') WHERE id = ?").run(second);
    const sent = await (await call(env, `/admin/api/orders/${second}/mcf/submit`, adminPost())).json();
    assert.equal(sent.result.outcome, "submitted");
    assert.equal(amazon.calls.filter((c) => c.op === "create").at(-1).body.destination_address.phone, "+1 512 555 0100");
  });
});

test("idempotency: webhook redelivery, repeated clicks and racing submits never create a second Amazon order", { skip }, async () => {
  const db = await createD1();
  const env = mcfEnv(db);
  await withWorld({}, async ({ amazon }) => {
    const orderId = await placeOrder(env);
    await payOrder(env, orderId); // redelivered webhook
    assert.equal(amazon.count("create"), 1);
    const again = await (await call(env, `/admin/api/orders/${orderId}/mcf/submit`, adminPost())).json();
    assert.equal(again.result.outcome, "duplicate");
    const race = await Promise.all([1, 2, 3].map(() => call(env, `/admin/api/orders/${orderId}/mcf/submit`, adminPost()).then((r) => r.json())));
    assert.ok(race.every((r) => r.result.outcome === "duplicate"));
    assert.equal(amazon.count("create"), 1);
    assert.equal(amazon.orders.size, 1);
  });

  // Two brand new submits racing for an order that has no row yet: exactly one wins the claim.
  const db2 = await createD1();
  const env2 = mcfEnv(db2, { MCF_AUTO_SUBMIT: "" });
  await withWorld({}, async ({ amazon }) => {
    const orderId = await placeOrder(env2);
    const on = mcfEnv(db2);
    const results = await Promise.all([1, 2, 3, 4].map(() => call(on, `/admin/api/orders/${orderId}/mcf/submit`, adminPost()).then((r) => r.json())));
    assert.equal(results.filter((r) => r.result.outcome === "submitted").length, 1);
    assert.equal(amazon.count("create"), 1);
  });
});

test("failure (Amazon rejects the order): payment stays paid, error is stored and shown, the retry button resubmits with the same id", { skip }, async () => {
  const db = await createD1();
  const env = mcfEnv(db);
  const amazon = createFakeAmazon({ failCreate: [{ status: 400, spapiStatus: 400, error: "Validation failed for the request.", details: "destinationAddress.postalCode is invalid" }] });
  await withWorld({ amazon }, async () => {
    const orderId = await placeOrder(env);
    assert.equal(orderStatus(db, orderId), "paid", "an MCF failure never undoes the payment");
    const row = mcfRow(db, orderId);
    assert.equal(row.status, "failed");
    assert.equal(row.error_kind, "invalid");
    assert.match(row.error_message, /postalCode is invalid/);
    assert.equal(amazon.count("create"), 1, "a 400 is not retried");
    assert.equal(amazon.orders.size, 0);

    const view = await adminOrder(env, orderId);
    assert.equal(view.mcf.record.status, "failed");
    assert.match(view.mcf.record.errorMessage, /postalCode/);
    assert.equal(view.mcf.canSubmit, true, "retry button available");
    assert.equal(view.mcf.canSync, false);
    assert.ok(!JSON.stringify(view).includes(FAKE_OUTBOUND_TOKEN));

    const retry = await (await call(env, `/admin/api/orders/${orderId}/mcf/submit`, adminPost())).json();
    assert.equal(retry.result.outcome, "submitted");
    assert.equal(retry.order.mcf.record.status, "submitted");
    assert.equal(retry.order.mcf.record.errorMessage, null);
    assert.equal(amazon.orders.size, 1);
    assert.ok(amazon.orders.has(orderId), "same SellerFulfillmentOrderId as the first attempt");
    assert.equal(amazon.count("create"), 2);
    const after = await (await call(env, `/admin/api/orders/${orderId}/mcf/submit`, adminPost())).json();
    assert.equal(after.result.outcome, "duplicate");
    const audit = db.raw.prepare("SELECT action FROM order_audit WHERE order_id = ? ORDER BY id").all(orderId).map((r) => r.action);
    assert.deepEqual(audit, ["mcf.failed", "mcf.submitted"]);
  });
});

test("network errors on create are retried with the same SellerFulfillmentOrderId only", { skip }, async () => {
  const db = await createD1();
  const env = mcfEnv(db);
  const amazon = createFakeAmazon({ networkErrors: { create: 2 } });
  await withWorld({ amazon }, async () => {
    const orderId = await placeOrder(env);
    assert.equal(amazon.count("create"), 3, "two network failures, then success");
    assert.deepEqual([...new Set(amazon.calls.filter((c) => c.op === "create").map((c) => c.body.seller_fulfillment_order_id))], [orderId]);
    assert.equal(amazon.orders.size, 1);
    assert.equal(mcfRow(db, orderId).status, "submitted");
  });
});

test("a lost reply (Amazon stored the order, we never heard back) is reconciled with getOrder instead of failing or duplicating", { skip }, async () => {
  const db = await createD1();
  const env = mcfEnv(db);
  const amazon = createFakeAmazon({ dropReply: { create: 1 } });
  await withWorld({ amazon }, async () => {
    const orderId = await placeOrder(env);
    assert.equal(amazon.orders.size, 1);
    assert.equal(amazon.count("create"), 2, "the retry with the same id is answered alreadyExists, not a second order");
    const row = mcfRow(db, orderId);
    assert.equal(row.status, "submitted");
    assert.match(row.note, /Found at Amazon/);
    assert.equal(amazon.calls.filter((c) => c.op === "create").every((c) => c.body.seller_fulfillment_order_id === orderId), true);
  });
});

test("persistent network failure ends as a recorded, retryable failure (not a crash, payment untouched)", { skip }, async () => {
  const db = await createD1();
  const env = mcfEnv(db);
  const amazon = createFakeAmazon({ networkErrors: { create: 99, get: 99 } });
  await withWorld({ amazon }, async () => {
    const orderId = await placeOrder(env);
    assert.equal(orderStatus(db, orderId), "paid");
    const row = mcfRow(db, orderId);
    assert.equal(row.status, "failed");
    assert.equal(row.error_kind, "transient");
    assert.equal(amazon.count("create"), 3);
    assert.equal((await adminOrder(env, orderId)).mcf.canSubmit, true);
  });
});

test("auth problems (wrong bearer token, MCP secret unset, missing Fulfillment role) are recorded by class and never leak the token", { skip }, async () => {
  const cases = [
    [createFakeAmazon({ token: "another-token" }), "auth", /OUTBOUND_INTERNAL_TOKEN/],
    [createFakeAmazon({ unconfigured: true }), "config", /not configured/],
    [createFakeAmazon({ failCreate: [{ status: 403, spapiStatus: 403, error: "Access denied" }] }), "auth", /Amazon Fulfillment/],
  ];
  for (const [amazon, kind, message] of cases) {
    const db = await createD1();
    await withWorld({ amazon }, async () => {
      const orderId = await placeOrder(mcfEnv(db));
      const row = mcfRow(db, orderId);
      assert.equal(row.status, "failed");
      assert.equal(row.error_kind, kind);
      assert.match(row.error_message, message);
      assert.ok(!JSON.stringify(row).includes(FAKE_OUTBOUND_TOKEN));
      assert.equal(orderStatus(db, orderId), "paid");
    });
  }
});

test("a create answered alreadyExists (an earlier request landed) adopts the existing Amazon order instead of failing or duplicating", { skip }, async () => {
  const db = await createD1();
  const env = mcfEnv(db, { MCF_AUTO_SUBMIT: "" });
  await withWorld({}, async ({ amazon }) => {
    const orderId = await placeOrder(env);
    // the order already exists at Amazon (created earlier, e.g. by a request whose answer was lost), our D1 has no row yet
    await fetch(`${FAKE_BASE_URL}/internal/outbound/orders`, { method: "POST", headers: { authorization: `Bearer ${FAKE_OUTBOUND_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify({ seller_fulfillment_order_id: orderId, displayable_order_id: orderId, shipping_speed_category: "Expedited", destination_address: { name: "A", addressLine1: "1", city: "Austin", stateOrRegion: "TX", postalCode: "78701", countryCode: "US" }, items: [{ sellerSku: "AMZ-SKU-D204", sellerFulfillmentOrderItemId: "L1", quantity: 1 }] }) });
    amazon.setStatus(orderId, "PROCESSING");
    const sent = await (await call(mcfEnv(db), `/admin/api/orders/${orderId}/mcf/submit`, adminPost())).json();
    assert.equal(sent.result.outcome, "submitted");
    assert.equal(amazon.orders.size, 1);
    assert.equal(sent.order.mcf.record.mcfStatus, "PROCESSING");
    assert.match(sent.order.mcf.record.note, /Found at Amazon/);
  });
});

test("submit/sync endpoints: ADMIN_TOKEN, POST only, JSON only, same-origin, paid orders only", { skip }, async () => {
  const db = await createD1();
  const env = mcfEnv(db);
  await withWorld({}, async ({ amazon }) => {
    const orderId = await placeOrder(env);
    const pending = await placeOrder(env, { pay: false });
    const paths = [`/admin/api/orders/${orderId}/mcf/submit`, `/admin/api/orders/${orderId}/mcf/sync`, "/admin/api/mcf/sync"];
    for (const path of paths) {
      assert.equal((await call(env, path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 401, `${path} needs auth`);
      assert.equal((await call(env, path, { method: "GET", headers: bearer })).status, 405);
      assert.equal((await call(env, path, { method: "POST", headers: { ...bearer, "Content-Type": "text/plain" }, body: "{}" })).status, 403, "no form-encoded CSRF");
      assert.equal((await call(env, path, adminPost({}, { Origin: "https://evil.example" }))).status, 403);
      assert.equal((await call(env, path, adminPost({}, { "Sec-Fetch-Site": "cross-site" }))).status, 403);
      assert.equal((await call(env, path, { method: "POST", headers: { ...bearer, "Content-Type": "application/json" }, body: "nope" })).status, 400);
    }
    assert.equal((await call({ ...env, ADMIN_TOKEN: "" }, paths[0], adminPost())).status, 503);
    assert.equal((await call(env, "/admin/api/orders/APGO-US-NOPE/mcf/submit", adminPost())).status, 404);
    assert.equal((await call(env, "/admin/api/orders/APGO-US-0000000000AA/mcf/submit", adminPost())).status, 404);
    const unpaid = await call(env, `/admin/api/orders/${pending}/mcf/submit`, adminPost());
    assert.equal(unpaid.status, 409);
    assert.equal(amazon.count("create"), 1, "only the paid order was sent");
  });
});

test("GET /admin/api/mcf/check is read-only: lists and previews, never creates or cancels, needs ADMIN_TOKEN", { skip }, async () => {
  const db = await createD1();
  const env = mcfEnv(db, { MCF_AUTO_SUBMIT: "" });
  await withWorld({}, async ({ amazon }) => {
    assert.equal((await call(env, "/admin/api/mcf/check")).status, 401);
    const check = await (await call(env, "/admin/api/mcf/check", { headers: bearer })).json();
    assert.equal(check.ok, true);
    assert.equal(check.autoSubmit, false);
    assert.equal(check.list.ok, true);
    assert.deepEqual({ sku: check.preview.sku, fulfillable: check.preview.fulfillable, feeCents: check.preview.feeCents }, { sku: "D204", fulfillable: true, feeCents: 891 });
    assert.deepEqual(check.previews.map((preview) => preview.sku), ["D204", "D215"]);
    assert.deepEqual(amazon.calls.map((c) => c.op).sort(), ["list", "preview", "preview"]);
    assert.deepEqual(amazon.calls.filter((c) => c.op === "preview").map((c) => c.body.items[0].sellerSku), ["AMZ-SKU-D204", "AMZ-SKU-D215"]);
    assert.ok(!JSON.stringify(check).includes(FAKE_OUTBOUND_TOKEN));
  });
  const missing = await (await call(mcfEnv(db, { OUTBOUND_INTERNAL_TOKEN: "" }), "/admin/api/mcf/check", { headers: bearer })).json();
  assert.deepEqual({ ok: missing.ok, step: missing.step }, { ok: false, step: "config" });
  await withWorld({}, async ({ amazon }) => {
    const missingSku = await (await call(mcfEnv(db, { MCF_SKU_MAP_JSON: JSON.stringify({ D204: "AMZ-SKU-D204" }) }), "/admin/api/mcf/check", { headers: bearer })).json();
    assert.equal(missingSku.ok, false);
    assert.match(missingSku.error, /D215/);
    assert.deepEqual(amazon.calls.map((c) => c.op), ["list"], "incomplete mapping cannot produce a successful preview check");
  });
  await withWorld({ amazon: createFakeAmazon({ token: "other" }) }, async () => {
    const denied = await (await call(env, "/admin/api/mcf/check", { headers: bearer })).json();
    assert.deepEqual({ ok: denied.ok, step: denied.step, kind: denied.kind }, { ok: false, step: "list", kind: "auth" });
  });
});

// ---------- sync ----------

test("sync: when Amazon reports shipped with carrier + tracking, the order is marked shipped and the customer is emailed exactly once", { skip }, async () => {
  const db = await createD1();
  const env = mcfEnv(db);
  await withWorld({}, async ({ amazon, mails }) => {
    const orderId = await placeOrder(env);
    mails.length = 0; // drop the order confirmation

    // Still processing at Amazon: nothing changes.
    const early = await (await call(env, `/admin/api/orders/${orderId}/mcf/sync`, adminPost())).json();
    assert.equal(early.result.outcome, "synced");
    assert.equal(early.result.shipped, false);
    assert.equal(early.order.fulfillmentStatus, "unfulfilled");
    assert.equal(mails.length, 0);

    amazon.ship(orderId, { carrierCode: "AMZL", trackingNumber: "TBA123456789000" });
    const synced = await (await call(env, `/admin/api/orders/${orderId}/mcf/sync`, adminPost())).json();
    assert.equal(synced.result.shipped, true);
    assert.equal(synced.result.email, "sent");
    assert.equal(synced.order.fulfillmentStatus, "shipped");
    assert.equal(synced.order.fulfillment.carrier, "Amazon Logistics");
    assert.equal(synced.order.fulfillment.trackingNumber, "TBA123456789000");
    assert.equal(synced.order.fulfillment.trackingUrl, null, "Amazon gives no link here; none is invented");
    assert.equal(synced.order.fulfillment.shippedBy, "mcf");
    assert.equal(synced.order.mcf.record.status, "shipped");
    assert.equal(synced.order.mcf.canSync, false);
    assert.equal(mails.length, 1);
    assert.match(mails[0].subject, /has shipped/);
    assert.ok(mails[0].text.includes("TBA123456789000") && mails[0].text.includes("Amazon Logistics"));
    assert.deepEqual(emailRows(db, orderId), [{ kind: "confirmation", status: "sent" }, { kind: "shipment", status: "sent" }]);
    assert.ok(synced.order.audit.some((a) => a.action === "order.shipped" && a.actor === "mcf"));

    // Idempotent: a second sync (manual or all) sends nothing and changes nothing.
    const again = await (await call(env, `/admin/api/orders/${orderId}/mcf/sync`, adminPost())).json();
    assert.equal(again.result.outcome, "skipped");
    const all = await (await call(env, "/admin/api/mcf/sync", adminPost())).json();
    assert.deepEqual(all.summary, { checked: 0, shipped: 0, failed: 0, skipped: 0 });
    assert.equal(mails.length, 1);
    assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_fulfillments WHERE order_id = ?").get(orderId).n, 1);
  });
});

test("sync: shipped by hand first -> no second shipment record and no second email", { skip }, async () => {
  const db = await createD1();
  const env = mcfEnv(db);
  await withWorld({}, async ({ amazon, mails }) => {
    const orderId = await placeOrder(env);
    const manual = await call(env, `/admin/api/orders/${orderId}/ship`, adminPost({ carrier: "UPS", trackingNumber: "1Z999AA10123456784" }));
    assert.equal(manual.status, 200);
    mails.length = 0;
    amazon.ship(orderId);
    const synced = await (await call(env, `/admin/api/orders/${orderId}/mcf/sync`, adminPost())).json();
    assert.equal(synced.result.shipped, false);
    assert.equal(mails.length, 0);
    const fulfillment = db.raw.prepare("SELECT carrier FROM order_fulfillments WHERE order_id = ?").all(orderId);
    assert.deepEqual(fulfillment.map((r) => r.carrier), ["UPS"], "the manual record is kept");
    assert.equal(mcfRow(db, orderId).status, "shipped");
  });
});

test("sync: two syncs racing ship and email once", { skip }, async () => {
  const db = await createD1();
  const env = mcfEnv(db);
  await withWorld({}, async ({ amazon, mails }) => {
    const orderId = await placeOrder(env);
    mails.length = 0;
    amazon.ship(orderId, { trackingNumber: "TBA000111222333" });
    const results = await Promise.all([1, 2, 3].map(() => call(env, `/admin/api/orders/${orderId}/mcf/sync`, adminPost()).then((r) => r.json())));
    assert.equal(results.filter((r) => r.result.shipped).length, 1);
    assert.equal(mails.length, 1);
    assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_fulfillments").get().n, 1);
  });
});

test("sync: COMPLETE without tracking waits; several packages are joined (COMPLETE_PARTIALLED counts as shipped); real carriers get proper names", { skip }, async () => {
  const db = await createD1();
  const env = mcfEnv(db);
  await withWorld({}, async ({ amazon, mails }) => {
    const orderId = await placeOrder(env);
    mails.length = 0;
    amazon.ship(orderId, { packages: [{ packageNumber: 0, carrierCode: "UPS" }] });
    const waiting = await (await call(env, `/admin/api/orders/${orderId}/mcf/sync`, adminPost())).json();
    assert.equal(waiting.result.shipped, false);
    assert.match(waiting.order.mcf.record.note, /waiting for a tracking number/);
    assert.equal(mails.length, 0);

    amazon.ship(orderId, { status: "COMPLETE_PARTIALLED", packages: [
      { packageNumber: 11, carrierCode: "UPS", trackingNumber: "1Z999AA10123456784" },
      { packageNumber: 12, carrierCode: "UPS", trackingNumber: "1Z999AA10123456785" },
    ] });
    const done = await (await call(env, `/admin/api/orders/${orderId}/mcf/sync`, adminPost())).json();
    assert.equal(done.order.fulfillment.carrier, "UPS");
    assert.equal(done.order.fulfillment.trackingNumber, "1Z999AA10123456784, 1Z999AA10123456785");
    assert.equal(done.order.fulfillment.trackingUrl, null, "no link guessed for several parcels");
  });
});

test("sync: a number that only the tracking endpoint knows (getOrder lists none) is fetched per package and then shipped once", { skip }, async () => {
  const db = await createD1();
  const env = mcfEnv(db);
  await withWorld({}, async ({ amazon, mails }) => {
    const orderId = await placeOrder(env);
    mails.length = 0;
    amazon.ship(orderId, { carrierCode: "UPS", trackingNumber: "1Z999AA10123456999", lateTracking: true });
    const synced = await (await call(env, `/admin/api/orders/${orderId}/mcf/sync`, adminPost())).json();
    assert.equal(synced.result.shipped, true);
    assert.equal(amazon.count("tracking"), 1);
    assert.equal(amazon.calls.find((c) => c.op === "tracking").path, "/internal/outbound/tracking/4242");
    assert.equal(synced.order.fulfillment.trackingNumber, "1Z999AA10123456999");
    assert.equal(mails.length, 1);
  });
});

test("sync: Amazon closes the order (UNFULFILLABLE) -> recorded as rejected; retry uses a fresh id suffix", { skip }, async () => {
  const db = await createD1();
  const env = mcfEnv(db);
  await withWorld({}, async ({ amazon }) => {
    const orderId = await placeOrder(env);
    amazon.setStatus(orderId, "UNFULFILLABLE");
    const closed = await (await call(env, `/admin/api/orders/${orderId}/mcf/sync`, adminPost())).json();
    assert.equal(closed.order.mcf.record.status, "rejected");
    assert.match(closed.order.mcf.record.errorMessage, /UNFULFILLABLE/);
    assert.equal(closed.order.mcf.canSubmit, true);
    assert.equal(closed.order.fulfillmentStatus, "unfulfilled");

    const retry = await (await call(env, `/admin/api/orders/${orderId}/mcf/submit`, adminPost())).json();
    assert.equal(retry.result.outcome, "submitted");
    assert.equal(retry.order.mcf.record.sellerOrderId, `${orderId}-R2`);
    assert.deepEqual([...amazon.orders.keys()], [orderId, `${orderId}-R2`]);
  });
});

test("sync failure (Amazon unreachable) keeps the order waiting and records a note; sync-all reports it", { skip }, async () => {
  const db = await createD1();
  const env = mcfEnv(db);
  const amazon = createFakeAmazon();
  await withWorld({ amazon }, async () => {
    const orderId = await placeOrder(env);
    amazon.ship(orderId);
    const original = globalThis.fetch;
    globalThis.fetch = async (url, init) => { if (String(url).includes("/orders/")) throw new TypeError("fetch failed"); return original(url, init); };
    const all = await (await call(env, "/admin/api/mcf/sync", adminPost())).json();
    globalThis.fetch = original;
    assert.deepEqual(all.summary, { checked: 1, shipped: 0, failed: 1, skipped: 0 });
    const row = mcfRow(db, orderId);
    assert.equal(row.status, "submitted");
    assert.match(row.note, /Last sync failed/);
    const retried = await (await call(env, "/admin/api/mcf/sync", adminPost())).json();
    assert.equal(retried.summary.shipped, 1);
  });
});

test("cron: does nothing unless MCF_SYNC_CRON=true; then syncs waiting orders", { skip }, async () => {
  const db = await createD1();
  const env = mcfEnv(db);
  await withWorld({}, async ({ amazon }) => {
    const orderId = await placeOrder(env);
    amazon.ship(orderId);
    const before = amazon.count("get");
    assert.deepEqual(await scheduledMcfSync(env), { ran: false });
    assert.equal(amazon.count("get"), before);
    assert.equal(mcfRow(db, orderId).status, "submitted");

    const ctx = ctxStub();
    await worker.scheduled({}, { ...env, MCF_SYNC_CRON: "true" }, ctx);
    await ctx.settled();
    assert.equal(mcfRow(db, orderId).status, "shipped");
    assert.equal(emailRows(db, orderId).filter((r) => r.kind === "shipment").length, 1);
  });
});

test("a database without the order_mcf table yet still serves the admin order (migration order is forgiving)", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  await withWorld({}, async () => {
    const orderId = await placeOrder(env);
    db.raw.exec("DROP TABLE order_mcf");
    const view = await adminOrder(env, orderId);
    assert.equal(view.mcf.mode, "off");
    assert.equal(view.id, orderId);
  });
});

// ---------- client ----------

const ADDRESS = { name: "A B", addressLine1: "1 Main", city: "Seattle", stateOrRegion: "WA", postalCode: "98109" };
const ITEMS = [{ sku: "AMZ-SKU-D215", qty: 1 }];
const withFetch = async (handler, run) => {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await run(); } finally { globalThis.fetch = original; }
};

test("client: preview returns fee and arrival window for the asked speed; list follows nextToken through empty pages; tracking lookup", async () => {
  const env = { ...FAKE_AMAZON_ENV };
  const amazon = createFakeAmazon({ listPages: 2 });
  await withFetch(amazon.fetch, async () => {
    const preview = await getFulfillmentPreview(env, { address: ADDRESS, items: ITEMS, tier: "STANDARD" });
    const call1 = amazon.calls.find((c) => c.op === "preview");
    assert.equal(call1.path, "/internal/outbound/preview");
    assert.deepEqual(call1.body.shipping_speed_categories, ["Standard"]);
    assert.deepEqual(call1.body.items, [{ sellerSku: "AMZ-SKU-D215", sellerFulfillmentOrderItemId: "L1", quantity: 1 }]);
    assert.equal(preview.fulfillable, true);
    assert.equal(preview.offer.feeCents, 891);
    assert.equal(preview.offer.deliveryEnd, "2026-10-04T06:59:59Z");
    assert.equal((await getFulfillmentPreview(env, { address: ADDRESS, items: ITEMS, tier: "EXPEDITED" })).offer.feeCents, 1222);

    await createFulfillmentOrder(env, { orderId: "LIST1", address: ADDRESS, items: ITEMS, tier: "STANDARD" });
    const listed = await listFulfillmentOrders(env, { queryStartDate: "2026-10-01T00:00:00Z" });
    assert.equal(amazon.count("list"), 3, "two empty pages with a nextToken, then the real one");
    assert.equal(amazon.calls.filter((c) => c.op === "list")[0].query.query_start_date, "2026-10-01T00:00:00Z");
    assert.equal(amazon.calls.filter((c) => c.op === "list")[1].query.next_token, "page-1");
    assert.deepEqual(listed.orders.map((o) => [o.orderId, o.status]), [["LIST1", "RECEIVED"]]);
    assert.equal(listed.complete, true);

    amazon.ship("LIST1", { carrierCode: "UPS", trackingNumber: "1Z1", lateTracking: true });
    assert.deepEqual(await getPackageTracking(env, 4242), { carrierCode: "UPS", trackingNumber: "1Z1", trackingUrl: "" });
    assert.equal(await getPackageTracking(env, 999), null);
    assert.equal(await getPackageTracking(env, "12; DROP"), null, "only numeric package numbers reach the URL");
  });
});

test("client: bearer auth on every call, 401 / 503 / 400+issues are classified, https only, nothing sent without a connection", async () => {
  const env = { ...FAKE_AMAZON_ENV };
  await withFetch(createFakeAmazon({ token: "x" }).fetch, async () => {
    await assert.rejects(getFulfillmentOrder(env, "A1"), (e) => e.kind === "auth" && e.status === 401 && !e.retryable && !e.message.includes(FAKE_OUTBOUND_TOKEN));
  });
  await withFetch(createFakeAmazon({ unconfigured: true }).fetch, async () => {
    await assert.rejects(getFulfillmentOrder(env, "A1"), (e) => e.kind === "config" && e.status === 503);
  });
  await withFetch(createFakeAmazon().fetch, async () => {
    // validation failure from the endpoint itself: 400 with issues
    await assert.rejects(getFulfillmentPreview(env, { address: { ...ADDRESS, name: "" }, items: ITEMS, tier: "STANDARD" }), (e) => e.kind === "invalid" && /address: Required/.test(e.details) && !e.retryable);
  });
  let touched = 0;
  await withFetch(async () => { touched += 1; throw new Error("must not be called"); }, async () => {
    await assert.rejects(getFulfillmentOrder({ ...env, OUTBOUND_INTERNAL_TOKEN: "" }, "A1"), (e) => e.kind === "config");
    await assert.rejects(getFulfillmentOrder({ ...env, AMAZON_OUTBOUND_BASE_URL: "http://plain.example" }, "A1"), (e) => e.kind === "config");
    await assert.rejects(createFulfillmentOrder(env, { orderId: "x".repeat(41), address: ADDRESS, items: ITEMS, tier: "STANDARD" }), (e) => e.kind === "config");
    await assert.rejects(createFulfillmentOrder(env, { orderId: "bad id!", address: ADDRESS, items: ITEMS, tier: "STANDARD" }), (e) => e.kind === "config");
    await assert.rejects(createFulfillmentOrder(env, { orderId: "OK1", address: ADDRESS, items: ITEMS, tier: "OVERNIGHT" }), (e) => e.kind === "config");
    await assert.rejects(createFulfillmentOrder(env, { orderId: "OK1", address: ADDRESS, items: [], tier: "STANDARD" }), (e) => e.kind === "config");
  });
  assert.equal(touched, 0);
});

test("client: retry rules (429/5xx retried with the same body, 4xx not, 404 -> null, timeout ambiguous); create is idempotent by id", async () => {
  const env = { ...FAKE_AMAZON_ENV };
  const amazon = createFakeAmazon();
  // 429 then 5xx then success on a read
  let hits = 0;
  await withFetch(async (url, init) => {
    if (String(url).includes("/orders/X1")) { hits += 1; if (hits === 1) return jsonResponse(429, { error: "slow down", spapiStatus: 429 }); if (hits === 2) return jsonResponse(502, { error: "bad gateway" }); return jsonResponse(200, { payload: { fulfillmentOrder: { sellerFulfillmentOrderId: "X1", fulfillmentOrderStatus: "PROCESSING" } } }); }
    return amazon.fetch(url, init);
  }, async () => {
    assert.equal((await getFulfillmentOrder(env, "X1")).status, "PROCESSING");
    assert.equal(hits, 3);
  });

  // a 400 from Amazon is final, explains itself and is not retried
  let posts = 0;
  await withFetch(async (url, init) => { if (init.method === "POST") { posts += 1; return jsonResponse(502, { error: "Amazon rejected", spapiStatus: 400, details: "items[0].quantity must be greater than 0" }); } return amazon.fetch(url, init); }, async () => {
    await assert.rejects(createFulfillmentOrder(env, { orderId: "APGO-US-AAAAAAAAAAAA", address: ADDRESS, items: [{ sku: "S", qty: 0 }], tier: "STANDARD" }), (e) => e.kind === "invalid" && !e.retryable && /must be greater than 0/.test(e.message));
    assert.equal(posts, 1);
  });

  // create: network error twice, the SAME body every time, then success; the repeat after success is alreadyExists
  const flaky = createFakeAmazon({ networkErrors: { create: 2 } });
  await withFetch(flaky.fetch, async () => {
    const created = await createFulfillmentOrder(env, { orderId: "CR1", address: ADDRESS, items: ITEMS, tier: "STANDARD" });
    assert.equal(created.created, true);
    const bodies = flaky.calls.filter((c) => c.op === "create").map((c) => JSON.stringify(c.body));
    assert.equal(bodies.length, 3);
    assert.equal(new Set(bodies).size, 1, "identical payload on every retry");
    const again = await createFulfillmentOrder(env, { orderId: "CR1", address: ADDRESS, items: ITEMS, tier: "STANDARD" });
    assert.deepEqual({ created: again.created, alreadyExists: again.alreadyExists, status: again.status }, { created: false, alreadyExists: true, status: "RECEIVED" });
    assert.equal(flaky.orders.size, 1);
  });

  // 404 -> null; persistent 500 -> transient, ambiguous, three tries
  hits = 0;
  await withFetch(async (url) => { hits += 1; return jsonResponse(String(url).includes("GONE") ? 404 : 500, { error: "x", spapiStatus: String(url).includes("GONE") ? 404 : 500 }); }, async () => {
    assert.equal(await getFulfillmentOrder(env, "GONE"), null);
    assert.equal(hits, 1);
    hits = 0;
    await assert.rejects(getFulfillmentOrder(env, "BOOM"), (e) => e.kind === "transient" && e.ambiguous && e.status === 500);
    assert.equal(hits, 3);
  });

  // timeout is classified as transient/ambiguous
  await withFetch((url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))), async () => {
    await assert.rejects(getFulfillmentOrder({ ...env, MCF_TIMEOUT_MS: "20" }, "SLOW"), (e) => e.kind === "transient" && e.code === "timeout" && e.ambiguous);
  });

  // cancel: only while Amazon has not started
  const cancelable = createFakeAmazon();
  await withFetch(cancelable.fetch, async () => {
    await createFulfillmentOrder(env, { orderId: "CAN1", address: ADDRESS, items: ITEMS, tier: "STANDARD" });
    assert.deepEqual(await cancelFulfillmentOrder(env, "CAN1"), { requested: true });
    assert.equal(cancelable.calls.find((c) => c.op === "cancel").method, "POST");
    assert.equal(cancelable.calls.find((c) => c.op === "cancel").body, undefined, "cancel has no body");
    assert.equal((await getFulfillmentOrder(env, "CAN1")).status, "CANCELLED");
    await assert.rejects(cancelFulfillmentOrder(env, "CAN1"), (e) => e.kind === "invalid");
    await assert.rejects(cancelFulfillmentOrder(env, "NOPE"), (e) => e.kind === "not_found");
  });
});

test("client: tracking extraction, statuses and preview normalisation", async () => {
  assert.equal(shipmentFromMcfOrder({ status: "PROCESSING", shipments: [] }), null);
  assert.equal(shipmentFromMcfOrder({ status: "COMPLETE", shipments: [{ packages: [{ trackingNumber: "", carrierCode: "UPS" }] }] }), null);
  assert.deepEqual(shipmentFromMcfOrder({ status: "COMPLETE_PARTIALLED", shipments: [{ packages: [{ trackingNumber: "T1", carrierCode: "", trackingUrl: "http://insecure" }] }] }), { carrier: "Amazon Logistics", trackingNumber: "T1", trackingUrl: "" });
  assert.equal(normalizePreview({ payload: { fulfillmentPreviews: [{ shippingSpeedCategory: "Standard", isFulfillable: false, unfulfillablePreviewItems: [{ sellerSku: "S", quantity: 1, itemUnfulfillableReasons: ["NoInventory"] }], estimatedFees: [] }] } }, "STANDARD").fulfillable, false);
  assert.equal(normalizePreview({ payload: { fulfillmentPreviews: [] } }, "STANDARD").fulfillable, false);
});

test("hygiene: the MCF modules hold no credentials and the example env documents them empty", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const file of ["worker/amazon-mcf.js", "worker/mcf.js", "tests/helpers/fake-amazon-mcf.mjs"]) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.ok(!/Atza\|[A-Za-z0-9_-]{20,}|amzn1\.oa2-cs\.v1\.[0-9a-f]{20,}/.test(source), `${file}: no real-looking LWA token or client secret`);
  }
  const client = await readFile(new URL("../worker/amazon-mcf.js", import.meta.url), "utf8");
  assert.ok(!/SPAPI_LWA|SPAPI_REFRESH|api\.amazon\.com\/auth|x-amz-access-token/.test(client.replace(/^\/\/.*$/gm, "")), "the Worker holds and uses no Login-with-Amazon credentials");
  const example = await readFile(new URL("../.dev.vars.example", import.meta.url), "utf8");
  for (const name of ["AMAZON_OUTBOUND_BASE_URL", "OUTBOUND_INTERNAL_TOKEN"]) {
    assert.match(example, new RegExp(`^${name}=$`, "m"), `${name} must be empty in the example`);
  }
  assert.ok(!/^SPAPI_/m.test(example), "no SP-API credential names in the example any more");
  assert.ok(!/^MCF_AUTO_SUBMIT=\S/m.test(example), "auto-submit is never on in the example");
  const toml = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.ok(!/MCF_AUTO_SUBMIT\s*=\s*"true"/i.test(toml) && !/MCF_SYNC_CRON\s*=\s*"true"/i.test(toml), "MCF auto-submit and cron sync stay off");
  // Crons exist only for production (Meta CAPI re-send) and staging (customer email retries); MCF sync stays off
  // everywhere through MCF_SYNC_CRON, and local dev has none.
  const cronOwners = [...toml.matchAll(/^\s*crons\s*=/gm)].map((m) => [...toml.slice(0, m.index).matchAll(/^\[([^\]]+)\]/gm)].at(-1)?.[1]);
  assert.deepEqual(cronOwners.sort(), ["env.production.triggers", "env.staging.triggers"]);
  assert.ok(!/OUTBOUND_INTERNAL_TOKEN\s*=\s*"[^"]+"/.test(toml));
});
