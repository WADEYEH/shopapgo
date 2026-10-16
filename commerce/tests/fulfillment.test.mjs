// Fulfilment checks (PR 3-6): the read-back after each submission (M6-16), out of stock at Amazon with the delay notice,
// daily resend, day-3 reminder and Cancel and refund (M6-06), no tracking after 2 working days (M6-08), the Hold test
// order (M6-15), and a dispute holding the order back (M6-02). Amazon (tests/helpers/fake-amazon-mcf.mjs), Airwallex and
// PayPal are in-memory fakes; nothing reaches the network.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import worker from "../worker/index.js";
import { resetAirwallexTokenCache } from "../worker/airwallex.js";
import { resetPaypalTokenCache } from "../worker/paypal.js";
import { compareAmazonCopy, submitDueOrders, syncMcfOrder } from "../worker/mcf.js";
import { addWorkingDays, scheduledFulfillmentChecks } from "../worker/fulfillment-checks.js";
import { fakeOutbound } from "../worker/fake-amazon.js";
import { HOLD_TEST_CANCEL } from "../worker/mcf-hold-test.js";
import { normalizeMcfOrder } from "../worker/amazon-mcf.js";
import { createD1, sqliteAvailable } from "./helpers/d1.mjs";
import { FAKE_AMAZON_ENV, FAKE_BASE_URL, createFakeAmazon } from "./helpers/fake-amazon-mcf.mjs";

globalThis.fetch = async (url) => { throw new Error(`unexpected real network call: ${url}`); };
const skip = (await sqliteAvailable()) ? false : "node:sqlite unavailable";

const WEBHOOK_SECRET = "whsec_unit_test";
const MAIL_URL = "https://mail.example/send";
const OWNER = "owner@apgo.example";
const TOKEN = "test-admin-token-0123456789";
const LOGIN = { email: "owner@apgo.example", password: "owner-password-123" };
const bearer = { Authorization: `Bearer ${TOKEN}` };
const ownerLogin = { Authorization: `Basic ${Buffer.from(`${LOGIN.email}:${LOGIN.password}`).toString("base64")}` };
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const iso = (ms) => new Date(ms).toISOString();

const env0 = (db, extra = {}) => ({
  DB: db,
  AIRWALLEX_CLIENT_ID: "cid", AIRWALLEX_API_KEY: "key", AIRWALLEX_WEBHOOK_SECRET: WEBHOOK_SECRET, AIRWALLEX_ENV: "demo", AIRWALLEX_RETRY_DELAY_MS: "0",
  PAYPAL_CLIENT_ID: "paypal_cid", PAYPAL_CLIENT_SECRET: "paypal_secret", PAYPAL_ENV: "sandbox", PAYPAL_RETRY_DELAY_MS: "0",
  ADMIN_TOKEN: TOKEN, ADMIN_OWNER_EMAIL: OWNER, ADMIN_LOGIN_EMAIL: LOGIN.email, ADMIN_LOGIN_PASSWORD: LOGIN.password,
  RESEND_API_KEY: "rk_test_key", CUSTOMER_EMAIL_FROM: "APGO <orders@shop.example>", ORDER_NOTIFY_EMAIL_API_URL: MAIL_URL,
  ASSETS: { fetch: async () => new Response("ok") },
  ...FAKE_AMAZON_ENV,
  ...extra,
});

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Airwallex intents and refunds, PayPal orders/captures/refunds, Amazon (the shared fake) and the email API.
function createWorld(amazonOptions = {}) {
  const amazon = createFakeAmazon(amazonOptions);
  const intents = new Map();
  const paypal = new Map();
  const calls = { mails: [], refunds: [], paypalRefunds: [], refundFailures: 0 };
  let n = 0;
  const shipping = { name: { full_name: "Ada Lee" }, address: { address_line_1: "100 Example Ave", address_line_2: "Apt 4", admin_area_2: "Austin", admin_area_1: "TX", postal_code: "78701", country_code: "US" } };
  const paypalView = (id) => {
    const row = paypal.get(id);
    return {
      id, status: row.status,
      purchase_units: [{ custom_id: row.storeOrderId, amount: { currency_code: "USD", value: row.value }, shipping,
        payments: row.status === "COMPLETED" ? { captures: [{ id: `CAP-${id}`, status: "COMPLETED", amount: { currency_code: "USD", value: row.value } }] } : undefined }],
    };
  };
  async function handler(href, init) {
    const method = init.method ?? "GET";
    if (href === MAIL_URL) { calls.mails.push(JSON.parse(init.body)); return json(200, { id: crypto.randomUUID() }); }
    if (href.startsWith(FAKE_BASE_URL)) return amazon.fetch(href, init);
    if (href.endsWith("/authentication/login")) return json(201, { token: "tok", expires_at: new Date(Date.now() + 1_800_000).toISOString().replace(/\.\d+Z$/, "+0000") });
    if (href.endsWith("/payment_intents/create")) {
      const body = JSON.parse(init.body);
      n += 1;
      const intent = { id: `int_${n}`, client_secret: `cs_${n}`, status: "REQUIRES_PAYMENT_METHOD", amount: body.amount, currency: body.currency, merchant_order_id: body.merchant_order_id };
      intents.set(intent.id, intent);
      return json(201, intent);
    }
    const intentGet = href.match(/\/payment_intents\/([^/?]+)$/);
    if (intentGet && method === "GET") return json(200, intents.get(intentGet[1]));
    if (href.endsWith("/refunds/create")) {
      const body = JSON.parse(init.body);
      calls.refunds.push(body);
      if (calls.refundFailures > 0) { calls.refundFailures -= 1; return json(400, { code: "refund_failed", message: "Refund rejected by the test" }); }
      const at = new Date().toISOString();
      return json(201, { id: `rfd_${body.request_id}`, request_id: body.request_id, payment_intent_id: body.payment_intent_id, amount: body.amount, currency: "USD", status: "RECEIVED", created_at: at, updated_at: at });
    }
    if (href.endsWith("/v1/oauth2/token")) return json(200, { access_token: "pp_tok", expires_in: 32400 });
    if (href.endsWith("/v2/checkout/orders") && method === "POST") {
      const body = JSON.parse(init.body);
      const id = `PP${paypal.size + 1}`;
      paypal.set(id, { status: "CREATED", storeOrderId: body.purchase_units[0].custom_id, value: body.purchase_units[0].amount.value });
      return json(201, paypalView(id));
    }
    const capture = href.match(/\/v2\/checkout\/orders\/([^/]+)\/capture$/);
    if (capture) { paypal.get(capture[1]).status = "COMPLETED"; return json(201, paypalView(capture[1])); }
    const paypalGet = href.match(/\/v2\/checkout\/orders\/([^/?]+)$/);
    if (paypalGet) return json(200, paypalView(paypalGet[1]));
    const paypalRefund = href.match(/\/v2\/payments\/captures\/([^/]+)\/refund$/);
    if (paypalRefund) {
      calls.paypalRefunds.push({ captureId: paypalRefund[1], requestId: init.headers["PayPal-Request-Id"], body: JSON.parse(init.body) });
      return json(201, { id: `PPREF-${calls.paypalRefunds.length}`, status: "COMPLETED" });
    }
    throw new Error(`unexpected network call: ${method} ${href}`);
  }
  return { amazon, intents, paypal, calls, handler };
}

async function withWorld(options, run) {
  const world = createWorld(options);
  const original = globalThis.fetch;
  globalThis.fetch = (url, init = {}) => world.handler(String(url), init);
  resetAirwallexTokenCache();
  resetPaypalTokenCache();
  try {
    return await run(world);
  } finally {
    globalThis.fetch = original;
  }
}

const ctxStub = () => ({ waitUntil(promise) { (this.pending ||= []).push(promise); }, async settled() { await Promise.all(this.pending ?? []); } });
const call = async (env, path, init = {}) => {
  const ctx = ctxStub();
  const response = await worker.fetch(new Request(`https://www.shopapgo.com${path}`, init), env, ctx);
  await ctx.settled();
  return response;
};
const post = (body, headers = {}) => ({ method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const adminPost = (env, path, body = {}, auth = bearer) => call(env, path, post(body, { ...auth, Origin: "https://www.shopapgo.com" }));
const adminGet = async (env, path) => (await call(env, path, { headers: bearer })).json();
const cart = (name = "Ada") => ({
  items: [{ sku: "d204", qty: 1 }],
  contact: { email: "ada@example.com", phone: "(512) 555-0134", marketingOptIn: false },
  shipping: { firstName: name, lastName: "Lee", street: "100 Example Ave", street2: "Apt 4", city: "Austin", state: "TX", zip: "78701" },
  method: "standard",
});
const rows = (db, sql, ...args) => db.raw.prepare(sql).all(...args).map((r) => ({ ...r }));
const row = (db, sql, ...args) => rows(db, sql, ...args)[0] ?? null;
const alerts = (calls, pattern) => calls.mails.filter((m) => m.to.includes(OWNER) && pattern.test(m.subject));
const customerMails = (calls, pattern) => calls.mails.filter((m) => m.to.includes("ada@example.com") && pattern.test(m.subject));

// A card order, paid through the real webhook; with no cooling-off it goes to Amazon at once.
async function paidByCard(env, world, { before } = {}) {
  const started = await (await call(env, "/api/checkout/session", post(cart()))).json();
  before?.(started.orderId);
  const intent = world.intents.get(started.intent.id);
  intent.status = "SUCCEEDED";
  const body = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, name: "payment_intent.succeeded", data: { object: intent } });
  const timestamp = String(Date.now());
  const response = await call(env, "/api/webhooks/airwallex", { method: "POST", headers: { "x-timestamp": timestamp, "x-signature": createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}${body}`).digest("hex") }, body });
  assert.equal(response.status, 200);
  return { orderId: started.orderId, totalCents: started.quote.totalCents };
}

async function paidByPaypal(env) {
  const created = await (await call(env, "/api/checkout/paypal/order", post(cart()))).json();
  const captured = await (await call(env, "/api/checkout/paypal/capture", post({ paypalOrderId: created.paypal.id }))).json();
  assert.equal(captured.status, "paid");
  return { orderId: created.orderId, paypalOrderId: created.paypal.id, totalCents: created.quote.totalCents };
}

const mcf = (db, orderId) => row(db, "SELECT * FROM order_mcf WHERE order_id = ?", orderId);

// ---------- M6-16: read back after sending ----------

test("compareAmazonCopy: same items and address agree (case, spaces, ZIP+4); any difference is named", () => {
  const input = { address: { name: "Ada Lee", addressLine1: "100 Example Ave", addressLine2: "Apt 4", city: "Austin", stateOrRegion: "TX", postalCode: "78701" }, items: [{ sku: "A", qty: 2 }] };
  const copy = { address: { name: "ADA  LEE", addressLine1: "100 example ave", addressLine2: "Apt 4", city: "Austin", stateOrRegion: "TX", postalCode: "78701-1234" }, items: [{ sku: "A", qty: 1 }, { sku: "A", qty: 1 }] };
  assert.deepEqual(compareAmazonCopy(input, copy), []);
  assert.deepEqual(compareAmazonCopy(input, { ...copy, items: [{ sku: "A", qty: 3 }] }), ["A: sent 2, Amazon has 3"]);
  assert.match(compareAmazonCopy(input, { ...copy, address: { ...copy.address, city: "Dallas" } })[0], /^city: sent "Austin", Amazon has "Dallas"$/);
  assert.equal(compareAmazonCopy(input, { address: null, items: [] }), null, "nothing to compare");
});

test("M6-16: each order is read back after sending; a matching copy is recorded as checked", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withWorld({}, async (world) => {
    const { orderId } = await paidByCard(env, world);
    assert.deepEqual([mcf(db, orderId).status, mcf(db, orderId).check_status], ["submitted", "ok"]);
    const view = await adminGet(env, `/admin/api/orders/${orderId}`);
    assert.equal(view.mcf.record.check.status, "ok");
    assert.equal(view.mcf.canCancelAtAmazon, true);
    assert.equal(world.amazon.calls.find((c) => c.op === "create").body.fulfillment_action, "Ship");
  });
});

test("M6-16: a copy that differs is reported to the team; Cancel at Amazon stops it and Retry send makes a new one", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withWorld({}, async (world) => {
    const { orderId } = await paidByCard(env, world, {
      before: (id) => world.amazon.editCopy(id, (view) => { view.payload.fulfillmentOrderItems[0].quantity += 1; view.payload.fulfillmentOrder.destinationAddress.city = "Dallas"; return view; }),
    });
    assert.equal(mcf(db, orderId).check_status, "mismatch");
    assert.match(mcf(db, orderId).check_detail, /AMZ-SKU-D204: sent 1, Amazon has 2; city: sent "Austin", Amazon has "Dallas"/);
    const alert = alerts(world.calls, /Amazon's copy does not match/);
    assert.equal(alert.length, 1);
    assert.match(alert[0].text, /Cancel at Amazon/);
    assert.ok(rows(db, "SELECT action FROM order_audit WHERE order_id = ?", orderId).some((a) => a.action === "mcf.mismatch"));

    const cancelled = await adminPost(env, `/admin/api/orders/${orderId}/mcf/cancel`);
    assert.equal(cancelled.status, 200);
    const body = await cancelled.json();
    assert.equal(body.result.outcome, "requested");
    assert.deepEqual([mcf(db, orderId).status, mcf(db, orderId).mcf_status], ["rejected", "CANCELLED"]);
    assert.equal(alerts(world.calls, /Amazon closed the shipment/).length, 0, "no alarm for a cancellation we asked for");
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", orderId).status, "paid", "the order itself stays paid");

    const resent = await (await adminPost(env, `/admin/api/orders/${orderId}/mcf/submit`)).json();
    assert.equal(resent.result.outcome, "submitted");
    assert.deepEqual([mcf(db, orderId).seller_order_id, mcf(db, orderId).check_status], [`${orderId}-R2`, "ok"]);
  });
});

test("M6-16: a copy that cannot be read right away is checked at the next sync", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withWorld({ networkErrors: { get: 3 } }, async (world) => {
    const { orderId } = await paidByCard(env, world);
    assert.equal(mcf(db, orderId).check_status, "unreadable");
    await syncMcfOrder(env, orderId);
    assert.equal(mcf(db, orderId).check_status, "ok");
  });
});

// ---------- M6-06: out of stock at Amazon ----------

test("M6-06: out of stock at Amazon: team told, customer gets one delay notice, sent again daily, ships once restocked", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withWorld({}, async (world) => {
    const { orderId } = await paidByCard(env, world);
    world.amazon.setStatus(orderId, "UNFULFILLABLE");
    await syncMcfOrder(env, orderId);
    const record = mcf(db, orderId);
    assert.deepEqual([record.status, record.mcf_status], ["rejected", "UNFULFILLABLE"]);
    assert.ok(record.stockout_at);
    assert.equal(alerts(world.calls, /out of stock at Amazon/).length, 1);
    const delay = customerMails(world.calls, /is delayed/);
    assert.equal(delay.length, 1);
    assert.match(delay[0].text, /within 3 days, we'll cancel the order and refund you in full/);
    const view = await adminGet(env, `/admin/api/orders/${orderId}`);
    assert.deepEqual([view.mcf.stockout.days, view.mcf.stockout.canCancelAndRefund], [0, true]);
    assert.ok(view.emails.some((e) => e.kind === "delay:stockout"));

    const t0 = Date.parse(record.updated_at);
    assert.deepEqual(await scheduledFulfillmentChecks(env, { nowMs: t0 + HOUR }), { retried: 0, sent: 0, reminded: 0, noTracking: 0 }, "not yet a day");
    const next = await scheduledFulfillmentChecks(env, { nowMs: t0 + DAY + HOUR });
    assert.deepEqual([next.retried, next.sent], [1, 1]);
    assert.equal(mcf(db, orderId).seller_order_id, `${orderId}-R2`);

    // Back in stock: the new attempt ships; still one delay notice, one stock-out alert.
    world.amazon.ship(`${orderId}-R2`, { trackingNumber: "TBA555000111222" });
    await syncMcfOrder(env, orderId);
    assert.equal(mcf(db, orderId).status, "shipped");
    assert.equal(customerMails(world.calls, /has shipped/).length, 1);
    assert.equal(customerMails(world.calls, /is delayed/).length, 1);
    assert.equal(alerts(world.calls, /out of stock at Amazon/).length, 1);
    assert.equal((await scheduledFulfillmentChecks(env, { nowMs: t0 + 4 * DAY })).reminded, 0, "shipped: no day-3 reminder");
  });
});

test("M6-06: still out of stock after 3 days: the team is reminded once to decide", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withWorld({}, async (world) => {
    const { orderId } = await paidByCard(env, world);
    world.amazon.setStatus(orderId, "UNFULFILLABLE");
    await syncMcfOrder(env, orderId);
    const t0 = Date.parse(mcf(db, orderId).stockout_at);
    assert.equal((await scheduledFulfillmentChecks(env, { nowMs: t0 + 2 * DAY })).reminded, 0);
    // Each day's new attempt is also closed as out of stock.
    world.amazon.setStatus(`${orderId}-R2`, "UNFULFILLABLE");
    await syncMcfOrder(env, orderId);
    db.raw.prepare("UPDATE order_mcf SET updated_at = ? WHERE order_id = ?").run(iso(t0 + 2 * DAY), orderId);
    assert.equal((await scheduledFulfillmentChecks(env, { nowMs: t0 + 3 * DAY + HOUR })).reminded, 1);
    assert.equal((await scheduledFulfillmentChecks(env, { nowMs: t0 + 3 * DAY + 2 * HOUR })).reminded, 0, "once");
    const reminder = alerts(world.calls, /still out of stock after 3 days/);
    assert.equal(reminder.length, 1);
    assert.match(reminder[0].text, /Cancel and refund/);
    assert.equal(customerMails(world.calls, /is delayed/).length, 1, "the customer is not emailed again");
  });
});

test("M6-06: Cancel and refund (card): cancelled as out of stock, refunded in full once, recorded; pressing again does not refund twice", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withWorld({}, async (world) => {
    const other = await paidByCard(env, world);
    const refused = await adminPost(env, `/admin/api/orders/${other.orderId}/cancel-refund`, { note: "test" });
    assert.equal(refused.status, 409);
    assert.equal((await refused.json()).error.code, "not_out_of_stock");

    const { orderId, totalCents } = await paidByCard(env, world);
    world.amazon.setStatus(orderId, "UNFULFILLABLE");
    await syncMcfOrder(env, orderId);
    const response = await adminPost(env, `/admin/api/orders/${orderId}/cancel-refund`, { note: "customer asked to cancel" });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual([body.result.changed, body.result.refund.refund], [true, "requested"]);
    assert.equal(body.order.status, "cancelled");
    assert.equal(row(db, "SELECT reason_code FROM order_cancellations WHERE order_id = ?", orderId).reason_code, "out_of_stock");
    assert.deepEqual(world.calls.refunds.map((r) => [r.request_id, r.amount, r.payment_intent_id]), [[`cancel-${orderId}`, totalCents / 100, body.order.paymentIntentId]]);
    assert.deepEqual(rows(db, "SELECT id, provider, amount_cents, status FROM order_refunds WHERE order_id = ?", orderId), [{ id: `rfd_cancel-${orderId}`, provider: "airwallex", amount_cents: totalCents, status: "RECEIVED" }]);
    assert.equal(body.order.refundRequest.status, "requested");

    const again = await (await adminPost(env, `/admin/api/orders/${orderId}/cancel-refund`)).json();
    assert.equal(again.result.refund.refund, "already_requested");
    assert.equal(world.calls.refunds.length, 1, "never refunded twice");
  });
});

test("M6-06: Cancel and refund when the refund fails: the order stays cancelled, the team is told, the button retries with the same request", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withWorld({}, async (world) => {
    const { orderId } = await paidByCard(env, world);
    world.amazon.setStatus(orderId, "UNFULFILLABLE");
    await syncMcfOrder(env, orderId);
    world.calls.refundFailures = 1;
    const failed = await (await adminPost(env, `/admin/api/orders/${orderId}/cancel-refund`)).json();
    assert.equal(failed.result.refund.refund, "failed");
    assert.equal(failed.order.status, "cancelled");
    assert.equal(failed.order.refundRequest.status, "failed");
    assert.equal(alerts(world.calls, /the refund did not go through/).length, 1);
    const retried = await (await adminPost(env, `/admin/api/orders/${orderId}/cancel-refund`)).json();
    assert.deepEqual([retried.result.changed, retried.result.refund.refund], [false, "requested"]);
    assert.deepEqual(world.calls.refunds.map((r) => r.request_id), [`cancel-${orderId}`, `cancel-${orderId}`]);
  });
});

test("M6-06: Cancel and refund (PayPal): the capture is refunded in full and the customer gets the refund notice", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withWorld({}, async (world) => {
    const { orderId, paypalOrderId, totalCents } = await paidByPaypal(env);
    world.amazon.setStatus(orderId, "UNFULFILLABLE");
    await syncMcfOrder(env, orderId);
    const body = await (await adminPost(env, `/admin/api/orders/${orderId}/cancel-refund`)).json();
    assert.equal(body.result.refund.refund, "requested");
    assert.deepEqual(world.calls.paypalRefunds.map((r) => [r.captureId, r.requestId, r.body.amount ?? null]), [[`CAP-${paypalOrderId}`, `cancel-${orderId}`, null]]);
    assert.deepEqual(rows(db, "SELECT provider, amount_cents, status FROM order_refunds WHERE order_id = ?", orderId), [{ provider: "paypal", amount_cents: totalCents, status: "SETTLED" }]);
    assert.equal(customerMails(world.calls, /full refund was accepted/).length, 1);
  });
});

// ---------- M6-08: no tracking after 2 working days ----------

test("M6-08: with Amazon for 2 working days without tracking: the team is told once (weekends do not count)", { skip }, async () => {
  assert.equal(new Date(addWorkingDays(Date.parse("2026-10-09T10:00:00Z"), 2)).toISOString(), "2026-10-13T10:00:00.000Z", "Friday + 2 working days = Tuesday");
  const db = await createD1();
  const env = env0(db);
  await withWorld({}, async (world) => {
    const { orderId } = await paidByCard(env, world);
    db.raw.prepare("UPDATE order_mcf SET submitted_at = ? WHERE order_id = ?").run("2026-10-09T10:00:00.000Z", orderId);
    assert.equal((await scheduledFulfillmentChecks(env, { nowMs: Date.parse("2026-10-12T11:00:00Z") })).noTracking, 0, "Monday: one working day");
    assert.equal((await scheduledFulfillmentChecks(env, { nowMs: Date.parse("2026-10-13T11:00:00Z") })).noTracking, 1, "Tuesday");
    assert.equal((await scheduledFulfillmentChecks(env, { nowMs: Date.parse("2026-10-13T12:00:00Z") })).noTracking, 0, "once");
    assert.equal(alerts(world.calls, /2 working days without shipping/).length, 1);
    assert.equal(customerMails(world.calls, /delay/i).length, 0, "the customer is not told");
  });
});

// ---------- M6-15: the Hold test order ----------

HOLD_TEST_CANCEL.firstWaitMs = 0;
HOLD_TEST_CANCEL.retryWaitMs = 0;

test("M6-15: an owner creates a Hold test order: Amazon accepts it on hold, the copy matches, it is cancelled", { skip }, async () => {
  const db = await createD1();
  const env = env0(db, { MCF_AUTO_SUBMIT: "false" });
  await withWorld({}, async (world) => {
    const denied = await adminPost(env, "/admin/api/mcf/hold-test");
    assert.equal(denied.status, 403, "the script token is not an owner");
    const response = await adminPost(env, "/admin/api/mcf/hold-test", {}, ownerLogin);
    assert.equal(response.status, 200);
    const { result, tests } = await response.json();
    assert.equal(result.outcome, "passed");
    assert.deepEqual(result.steps.map((s) => [s.step, s.ok]), [["create", true], ["check", true], ["cancel", true]]);
    const created = world.amazon.calls.find((c) => c.op === "create").body;
    assert.match(created.seller_fulfillment_order_id, /^HOLDTEST-\d{14}$/);
    assert.deepEqual([created.fulfillment_action, created.items.map((i) => [i.sellerSku, i.quantity])], ["Hold", [["AMZ-SKU-D204", 1]]]);
    assert.equal(world.amazon.orders.get(created.seller_fulfillment_order_id).status, "CANCELLED");
    assert.equal(tests[0].id, result.id);
    assert.deepEqual((await adminGet(env, "/admin/api/mcf/hold-tests")).tests.map((t) => t.outcome), ["passed"]);
    assert.equal(row(db, "SELECT COUNT(*) AS n FROM orders").n, 0, "no store order is involved");
  });
});

test("M6-15: a connection that drops the hold flag, or a cancel Amazon refuses, fails the test loudly", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withWorld({ ignoreHold: true }, async (world) => {
    const { result } = await (await adminPost(env, "/admin/api/mcf/hold-test", {}, ownerLogin)).json();
    assert.equal(result.outcome, "failed");
    assert.match(result.steps.find((s) => s.step === "check").detail, /not on hold/);
    assert.equal(result.steps.find((s) => s.step === "cancel").ok, true, "cancelled anyway");
    assert.equal(world.amazon.count("cancel"), 1);
  });
  await withWorld({ failCancel: 1 }, async (world) => {
    const { result } = await (await adminPost(env, "/admin/api/mcf/hold-test", {}, ownerLogin)).json();
    assert.equal(result.outcome, "failed");
    assert.equal(result.steps.find((s) => s.step === "cancel").ok, false);
    assert.equal(alerts(world.calls, /is still open at Amazon/).length, 1);
    assert.equal(world.amazon.count("cancel"), 1, "a refusal that is not \"busy\" is not tried again");
  });
  // 10/16 cutover: Amazon answered "System is busy" to a cancel sent right after the create. It is tried again.
  await withWorld({ busyCancel: 2 }, async (world) => {
    const { result } = await (await adminPost(env, "/admin/api/mcf/hold-test", {}, ownerLogin)).json();
    assert.equal(result.outcome, "passed");
    assert.equal(world.amazon.count("cancel"), 3);
  });
  await withWorld({ busyCancel: 3 }, async (world) => {
    const { result } = await (await adminPost(env, "/admin/api/mcf/hold-test", {}, ownerLogin)).json();
    assert.equal(result.outcome, "failed", "three tries at most");
    assert.equal(world.amazon.count("cancel"), 3);
    assert.match(result.steps.find((s) => s.step === "cancel").detail, /System is busy/);
  });
  const unconfigured = env0(db, { AMAZON_OUTBOUND_BASE_URL: "", OUTBOUND_INTERNAL_TOKEN: "" });
  await withWorld({}, async (world) => {
    const { result } = await (await adminPost(unconfigured, "/admin/api/mcf/hold-test", {}, ownerLogin)).json();
    assert.deepEqual([result.outcome, result.steps[0].step], ["failed", "config"]);
    assert.equal(world.amazon.calls.length, 0);
  });
});

test("staging fake Amazon: a Hold order never ships; a MISMATCH name changes Amazon's copy", { skip }, async () => {
  const db = await createD1();
  const env = { DB: db, MCF_FAKE: "true", SITE_ENV: "staging" };
  const request = (id, name, action) => ({
    seller_fulfillment_order_id: id, displayable_order_id: id, shipping_speed_category: "Standard", fulfillment_action: action,
    destination_address: { name, addressLine1: "1 Main St", city: "Austin", stateOrRegion: "TX", postalCode: "78701", countryCode: "US" },
    items: [{ sellerSku: "FAKE-D204", sellerFulfillmentOrderItemId: "L1", quantity: 1 }],
  });
  const t0 = Date.now();
  await fakeOutbound(env, "POST", "/internal/outbound/orders", { body: request("HOLDTEST-1", "APGO Hold Test", "Hold") }, { now: () => t0 });
  const later = normalizeMcfOrder((await fakeOutbound(env, "GET", "/internal/outbound/orders/HOLDTEST-1", {}, { now: () => t0 + DAY })).body);
  assert.deepEqual([later.status, later.action, later.shipments.length], ["RECEIVED", "Hold", 0]);
  await fakeOutbound(env, "POST", "/internal/outbound/orders", { body: request("APGO-US-MISMATCH1", "Ada MISMATCH", "Ship") }, { now: () => t0 });
  const copy = normalizeMcfOrder((await fakeOutbound(env, "GET", "/internal/outbound/orders/APGO-US-MISMATCH1", {}, { now: () => t0 })).body);
  const input = { address: { name: "Ada MISMATCH", addressLine1: "1 Main St", city: "Austin", stateOrRegion: "TX", postalCode: "78701" }, items: [{ sku: "FAKE-D204", qty: 1 }] };
  assert.deepEqual(compareAmazonCopy(input, copy), ["FAKE-D204: sent 1, Amazon has 2"]);
});

// ---------- M6-02: holds keep an order back ----------

test("M6-02: an order with an open dispute is not sent to Amazon after its cooling-off period", { skip }, async () => {
  const db = await createD1();
  const env = env0(db, { ORDER_COOLING_OFF_MINUTES: "60" });
  await withWorld({}, async (world) => {
    const { orderId } = await paidByCard(env, world);
    assert.equal(mcf(db, orderId), null, "waiting for the cooling-off period");
    const at = iso(Date.now());
    db.raw.prepare(`INSERT INTO order_disputes (provider, dispute_id, order_id, status, amount_cents, currency, due_at, provider_updated_at, created_at, updated_at)
      VALUES ('airwallex', 'dsp_1', ?, 'open', 100, 'USD', ?, ?, ?, ?)`).run(orderId, iso(Date.now() + 7 * DAY), at, at, at);
    const summary = await submitDueOrders(env, { nowMs: Date.now() + 61 * 60_000 });
    assert.deepEqual([summary.submitted, summary.held], [0, 1]);
    assert.equal(world.amazon.count("create"), 0);
  });
});
