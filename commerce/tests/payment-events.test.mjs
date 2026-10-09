// Payment events after the payment (PR 3-5): PayPal refunds, reversals and denials (M5-10), disputes from both providers
// with the hold, the deadline, the reminder and the outcome (M5-12), the daily payment check (M5-13), and a PayPal capture
// our system missed (M5-06). Airwallex and PayPal are small in-memory fakes; nothing reaches the network.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import worker from "../worker/index.js";
import { resetAirwallexTokenCache } from "../worker/airwallex.js";
import { resetPaypalTokenCache } from "../worker/paypal.js";
import { remindDisputes } from "../worker/disputes.js";
import { reconcilePayments, scheduledPaymentChecks } from "../worker/reconcile.js";
import { createD1, sqliteAvailable } from "./helpers/d1.mjs";

globalThis.fetch = async (url) => { throw new Error(`unexpected real network call: ${url}`); };
const skip = (await sqliteAvailable()) ? false : "node:sqlite unavailable";

const WEBHOOK_SECRET = "whsec_unit_test";
const MAIL_URL = "https://mail.example/send";
const OWNER = "owner@apgo.example";
const TOKEN = "test-admin-token-0123456789";
const bearer = { Authorization: `Bearer ${TOKEN}` };
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const iso = (ms) => new Date(ms).toISOString();

const env0 = (db, extra = {}) => ({
  DB: db,
  AIRWALLEX_CLIENT_ID: "cid", AIRWALLEX_API_KEY: "key", AIRWALLEX_WEBHOOK_SECRET: WEBHOOK_SECRET, AIRWALLEX_ENV: "demo", AIRWALLEX_RETRY_DELAY_MS: "0",
  PAYPAL_CLIENT_ID: "paypal_cid", PAYPAL_CLIENT_SECRET: "paypal_secret", PAYPAL_ENV: "sandbox", PAYPAL_RETRY_DELAY_MS: "0", PAYPAL_WEBHOOK_ID: "WH-1",
  ADMIN_TOKEN: TOKEN, ADMIN_OWNER_EMAIL: OWNER,
  RESEND_API_KEY: "rk_test_key", CUSTOMER_EMAIL_FROM: "APGO <orders@shop.example>", ORDER_NOTIFY_EMAIL_API_URL: MAIL_URL,
  ASSETS: { fetch: async () => new Response("ok") },
  ...extra,
});

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Airwallex: intents and disputes. PayPal: orders, captures (CAP-<order>), refunds and disputes; webhooks always verify.
function createProviders() {
  const intents = new Map();
  const byRequest = new Map();
  const paypal = new Map();
  const disputes = new Map(); // Airwallex dispute id -> object
  const paypalRefunds = new Map();
  const paypalDisputes = new Map();
  const calls = { creates: [], refunds: [], paypalCreates: 0, captures: [], mails: [], down: false };
  let n = 0;
  const shipping = { name: { full_name: "Ada Lee" }, address: { address_line_1: "100 Example Ave", admin_area_2: "Austin", admin_area_1: "TX", postal_code: "78701", country_code: "US" } };
  const paypalView = (id) => {
    const row = paypal.get(id);
    return {
      id, status: row.status,
      purchase_units: [{ custom_id: row.storeOrderId, amount: { currency_code: "USD", value: row.value }, shipping,
        payments: row.status === "COMPLETED" ? { captures: [{ id: `CAP-${id}`, status: "COMPLETED", amount: { currency_code: "USD", value: row.value } }] } : undefined }],
    };
  };
  const captureView = (captureId) => {
    const id = captureId.replace(/^CAP-/, "");
    const row = paypal.get(id);
    if (!row || row.status !== "COMPLETED") return null;
    return {
      id: captureId, status: row.captureStatus ?? "COMPLETED", amount: { currency_code: "USD", value: row.value }, custom_id: row.customId ?? row.storeOrderId,
      supplementary_data: { related_ids: { order_id: id } }, create_time: row.capturedAt, update_time: row.captureUpdatedAt ?? row.capturedAt,
    };
  };
  async function handler(href, init) {
    const method = init.method ?? "GET";
    if (href === MAIL_URL) { calls.mails.push(JSON.parse(init.body)); return json(200, { id: crypto.randomUUID() }); }
    // "down": the provider's objects cannot be read (sign-in and webhook verification still work).
    if (calls.down && !/(\/authentication\/login|\/v1\/oauth2\/token|\/verify-webhook-signature)$/.test(href)) return json(503, { code: "unavailable" });
    if (href.endsWith("/authentication/login")) return json(201, { token: "tok", expires_at: new Date(Date.now() + 1_800_000).toISOString().replace(/\.\d+Z$/, "+0000") });
    if (href.endsWith("/payment_intents/create")) {
      const body = JSON.parse(init.body);
      calls.creates.push(body);
      if (byRequest.has(body.request_id)) return json(201, intents.get(byRequest.get(body.request_id)));
      n += 1;
      const intent = { id: `int_${n}`, client_secret: `cs_${n}`, status: "REQUIRES_PAYMENT_METHOD", amount: body.amount, currency: body.currency, merchant_order_id: body.merchant_order_id };
      intents.set(intent.id, intent);
      byRequest.set(body.request_id, intent.id);
      return json(201, intent);
    }
    const cancel = href.match(/\/payment_intents\/([^/]+)\/cancel$/);
    if (cancel) {
      const intent = intents.get(cancel[1]);
      if (intent.status === "SUCCEEDED") return json(400, { code: "invalid_status_for_operation", message: "succeeded" });
      intent.status = "CANCELLED";
      return json(200, intent);
    }
    const intentGet = href.match(/\/payment_intents\/([^/?]+)$/);
    if (intentGet && method === "GET") return intents.has(intentGet[1]) ? json(200, intents.get(intentGet[1])) : json(404, { code: "not_found" });
    const disputeGet = href.match(/\/api\/v1\/pa\/payment_disputes\/([^/?]+)$/);
    if (disputeGet) return disputes.has(disputeGet[1]) ? json(200, disputes.get(disputeGet[1])) : json(404, { code: "not_found" });
    if (href.endsWith("/refunds/create")) { calls.refunds.push(JSON.parse(init.body)); return json(201, { id: `rfd_${calls.refunds.length}`, status: "RECEIVED" }); }

    if (href.endsWith("/v1/oauth2/token")) return json(200, { access_token: "pp_tok", expires_in: 32400 });
    if (href.endsWith("/v1/notifications/verify-webhook-signature")) return json(200, { verification_status: "SUCCESS" });
    if (href.endsWith("/v2/checkout/orders") && method === "POST") {
      const body = JSON.parse(init.body);
      calls.paypalCreates += 1;
      const id = `PP${calls.paypalCreates}`;
      paypal.set(id, { status: "CREATED", storeOrderId: body.purchase_units[0].custom_id, value: body.purchase_units[0].amount.value });
      return json(201, paypalView(id));
    }
    const capture = href.match(/\/v2\/checkout\/orders\/([^/]+)\/capture$/);
    if (capture) {
      calls.captures.push(capture[1]);
      Object.assign(paypal.get(capture[1]), { status: "COMPLETED", capturedAt: new Date().toISOString() });
      return json(201, paypalView(capture[1]));
    }
    const paypalGet = href.match(/\/v2\/checkout\/orders\/([^/?]+)$/);
    if (paypalGet) return paypal.has(paypalGet[1]) ? json(200, paypalView(paypalGet[1])) : json(404, { name: "RESOURCE_NOT_FOUND" });
    const captureGet = href.match(/\/v2\/payments\/captures\/([^/?]+)$/);
    if (captureGet) {
      const view = captureView(decodeURIComponent(captureGet[1]));
      return view ? json(200, view) : json(404, { name: "RESOURCE_NOT_FOUND" });
    }
    const refundGet = href.match(/\/v2\/payments\/refunds\/([^/?]+)$/);
    if (refundGet) return paypalRefunds.has(refundGet[1]) ? json(200, paypalRefunds.get(refundGet[1])) : json(404, { name: "RESOURCE_NOT_FOUND" });
    const paypalDisputeGet = href.match(/\/v1\/customer\/disputes\/([^/?]+)$/);
    if (paypalDisputeGet) return paypalDisputes.has(paypalDisputeGet[1]) ? json(200, paypalDisputes.get(paypalDisputeGet[1])) : json(404, { name: "RESOURCE_NOT_FOUND" });
    throw new Error(`unexpected network call: ${method} ${href}`);
  }
  return {
    intents, paypal, disputes, paypalRefunds, paypalDisputes, calls, handler,
    succeed: (id) => { intents.get(id).status = "SUCCEEDED"; },
    // A PayPal refund object as GET /v2/payments/refunds/{id} returns it.
    paypalRefund(id, captureId, { value, status = "COMPLETED", at = new Date().toISOString() }) {
      paypalRefunds.set(id, {
        id, status, amount: { currency_code: "USD", value }, create_time: at, update_time: at,
        links: [{ rel: "self", href: `https://api-m.sandbox.paypal.com/v2/payments/refunds/${id}` }, { rel: "up", href: `https://api-m.sandbox.paypal.com/v2/payments/captures/${captureId}` }],
      });
    },
  };
}

async function withProviders(run) {
  const providers = createProviders();
  const original = globalThis.fetch;
  globalThis.fetch = (url, init = {}) => providers.handler(String(url), init);
  resetAirwallexTokenCache();
  resetPaypalTokenCache();
  try {
    return await run(providers);
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
const cart = (qty = 1, extra = {}) => ({
  items: [{ sku: "d204", qty }],
  contact: { email: "ada@example.com", phone: "(512) 555-0134", marketingOptIn: false },
  shipping: { firstName: "Ada", lastName: "Lee", street: "100 Example Ave", street2: "Apt 4", city: "Austin", state: "TX", zip: "78701" },
  method: "standard",
  ...extra,
});
const session = async (env, body) => (await call(env, "/api/checkout/session", post(body))).json();
const paypalOrder = async (env, body) => (await call(env, "/api/checkout/paypal/order", post(body))).json();
function airwallexHook(name, object) {
  const body = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, name, data: { object } });
  const timestamp = String(Date.now());
  return { method: "POST", headers: { "x-timestamp": timestamp, "x-signature": createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}${body}`).digest("hex") }, body };
}
const paypalHeaders = {
  "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
  "paypal-transmission-id": "tx-1", "paypal-transmission-sig": "sig", "paypal-transmission-time": new Date().toISOString(),
};
const paypalHook = (eventType, resource) =>
  call(globalThis.__env, "/api/webhooks/paypal", { method: "POST", headers: paypalHeaders, body: JSON.stringify({ id: `WH-${Math.random().toString(36).slice(2)}`, event_type: eventType, resource }) });
const rows = (db, sql, ...args) => db.raw.prepare(sql).all(...args).map((r) => ({ ...r }));
const row = (db, sql, ...args) => rows(db, sql, ...args)[0] ?? null;
const adminGet = async (env, path) => (await call(env, path, { headers: bearer })).json();
const adminPost = (env, path, body = {}) => call(env, path, post(body, { ...bearer, Origin: "https://www.shopapgo.com" }));
const alerts = (calls, pattern) => calls.mails.filter((m) => m.to.includes(OWNER) && pattern.test(m.subject));
const customerMails = (calls, pattern) => calls.mails.filter((m) => m.to.includes("ada@example.com") && pattern.test(m.subject));

async function paidByCard(env, providers, qty = 1) {
  const started = await session(env, cart(qty));
  providers.succeed(started.intent.id);
  assert.equal((await call(env, "/api/webhooks/airwallex", airwallexHook("payment_intent.succeeded", providers.intents.get(started.intent.id)))).status, 200);
  return { orderId: started.orderId, intentId: started.intent.id, totalCents: started.quote.totalCents };
}

async function paidByPaypal(env, qty = 1) {
  const created = await paypalOrder(env, cart(qty));
  const captured = await (await call(env, "/api/checkout/paypal/capture", post({ paypalOrderId: created.paypal.id }))).json();
  assert.equal(captured.status, "paid");
  return { orderId: created.orderId, paypalOrderId: created.paypal.id, captureId: `CAP-${created.paypal.id}`, totalCents: created.quote.totalCents };
}

const dollars = (cents) => (cents / 100).toFixed(2);

// ---------- M5-10: PayPal refunds and reversals ----------

test("M5-10: PayPal partial then full refund: recorded once each, customer told, held then cancelled; refund sync is Airwallex-only", { skip }, async () => {
  const db = await createD1();
  const env = (globalThis.__env = env0(db));
  await withProviders(async (providers) => {
    const paid = await paidByPaypal(env);
    assert.equal(customerMails(providers.calls, /We received your APGO order/).length, 1, "a PayPal order gets its confirmation like a card order");
    providers.paypalRefund("REF1", paid.captureId, { value: "10.00" });
    assert.equal((await paypalHook("PAYMENT.CAPTURE.REFUNDED", { id: "REF1" })).status, 200);
    assert.equal((await paypalHook("PAYMENT.CAPTURE.REFUNDED", { id: "REF1" })).status, 200, "delivered twice");
    assert.deepEqual(rows(db, "SELECT id, provider, payment_intent_id, amount_cents, status FROM order_refunds"), [
      { id: "REF1", provider: "paypal", payment_intent_id: paid.paypalOrderId, amount_cents: 1000, status: "SETTLED" },
    ]);
    assert.equal(customerMails(providers.calls, /partial refund was accepted/).length, 1, "one notice for the partial refund");
    let order = await adminGet(env, `/admin/api/orders/${paid.orderId}`);
    assert.equal(order.status, "paid");
    assert.equal(order.paymentProvider, "paypal");
    assert.ok(order.core.holds.some((hold) => hold.code === "refund"), "a partial refund holds the order");
    assert.equal(alerts(providers.calls, /a refund put shipping on hold/).length, 1);
    assert.deepEqual(order.refunds.records.map((r) => [r.id, r.provider, r.status]), [["REF1", "paypal", "SETTLED"]]);
    assert.equal(order.sandboxRefundChecks, false, "the sandbox refund checks ask Airwallex");

    const sync = await adminPost(env, `/admin/api/orders/${paid.orderId}/refunds/sync`);
    assert.equal(sync.status, 409);
    assert.equal((await sync.json()).error.code, "paypal_order");

    // The rest is refunded: a full refund before shipping cancels the order.
    providers.paypalRefund("REF2", paid.captureId, { value: dollars(paid.totalCents - 1000) });
    assert.equal((await paypalHook("PAYMENT.CAPTURE.REFUNDED", { id: "REF2" })).status, 200);
    order = await adminGet(env, `/admin/api/orders/${paid.orderId}`);
    assert.equal(order.status, "cancelled");
    assert.equal(order.refunds.status, "fully_refunded");
    assert.equal(row(db, "SELECT reason_code FROM order_cancellations WHERE order_id = ?", paid.orderId).reason_code, "full_refund");
    assert.equal(customerMails(providers.calls, /full refund was accepted/).length, 1);
  });
});

test("M5-10: a pending PayPal refund is recorded as pending and becomes refunded when PayPal completes it", { skip }, async () => {
  const db = await createD1();
  const env = (globalThis.__env = env0(db));
  await withProviders(async (providers) => {
    const paid = await paidByPaypal(env);
    const at = Date.now();
    providers.paypalRefund("REF1", paid.captureId, { value: "5.00", status: "PENDING", at: iso(at) });
    await paypalHook("PAYMENT.CAPTURE.REFUNDED", { id: "REF1" });
    assert.equal(row(db, "SELECT status FROM order_refunds WHERE id = 'REF1'").status, "RECEIVED");
    assert.equal(customerMails(providers.calls, /refund was accepted/).length, 0, "no notice before PayPal completes it");
    providers.paypalRefund("REF1", paid.captureId, { value: "5.00", status: "COMPLETED", at: iso(at + 60_000) });
    await paypalHook("PAYMENT.CAPTURE.REFUNDED", { id: "REF1" });
    assert.equal(row(db, "SELECT status FROM order_refunds WHERE id = 'REF1'").status, "SETTLED");
    assert.equal(customerMails(providers.calls, /partial refund was accepted/).length, 1);
  });
});

test("M5-10: a PayPal reversal takes the whole payment back: recorded as a full refund, the order cancelled, the team told", { skip }, async () => {
  const db = await createD1();
  const env = (globalThis.__env = env0(db));
  await withProviders(async (providers) => {
    const paid = await paidByPaypal(env);
    providers.paypal.get(paid.paypalOrderId).captureStatus = "REVERSED";
    // PayPal reports the reversal on the capture itself (no refund object to read).
    assert.equal((await paypalHook("PAYMENT.CAPTURE.REVERSED", { id: paid.captureId })).status, 200);
    assert.deepEqual(rows(db, "SELECT id, provider, amount_cents, status FROM order_refunds"), [
      { id: `rev-${paid.captureId}`, provider: "paypal", amount_cents: paid.totalCents, status: "SETTLED" },
    ]);
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", paid.orderId).status, "cancelled");
    assert.equal(alerts(providers.calls, /PayPal reversed the payment/).length, 1);
    assert.ok(rows(db, "SELECT action FROM order_audit WHERE order_id = ?", paid.orderId).some((a) => a.action === "order.payment_reversed"));
  });
});

test("PayPal: a denied capture on a paid order alerts the team; events for payments that are not ours are ignored", { skip }, async () => {
  const db = await createD1();
  const env = (globalThis.__env = env0(db));
  await withProviders(async (providers) => {
    const paid = await paidByPaypal(env);
    assert.equal((await paypalHook("PAYMENT.CAPTURE.DENIED", { id: paid.captureId })).status, 200);
    assert.equal(alerts(providers.calls, /PayPal denied the payment/).length, 1);

    // Another shop's PayPal order in the same account, a capture that names our order but belongs to another PayPal
    // order, and ids that do not exist: nothing is recorded.
    providers.paypal.set("OTHER", { status: "COMPLETED", storeOrderId: "SOMEONE-ELSE-1", value: "50.00", capturedAt: iso(Date.now()) });
    providers.paypal.set("FORGED", { status: "COMPLETED", storeOrderId: paid.orderId, value: "50.00", capturedAt: iso(Date.now()) });
    providers.paypalRefund("REF-OTHER", "CAP-OTHER", { value: "50.00" });
    providers.paypalRefund("REF-FORGED", "CAP-FORGED", { value: "50.00" });
    for (const [type, resource] of [
      ["PAYMENT.CAPTURE.REFUNDED", { id: "REF-OTHER" }], ["PAYMENT.CAPTURE.REFUNDED", { id: "REF-FORGED" }], ["PAYMENT.CAPTURE.REFUNDED", { id: "REF-MISSING" }],
      ["PAYMENT.CAPTURE.DENIED", { id: "CAP-OTHER" }], ["PAYMENT.CAPTURE.REVERSED", { id: "CAP-MISSING" }], ["CUSTOMER.DISPUTE.CREATED", { dispute_id: "PP-D-MISSING" }],
    ]) {
      const response = await paypalHook(type, resource);
      assert.equal(response.status, 200, type);
    }
    assert.equal(row(db, "SELECT COUNT(*) AS n FROM order_refunds").n, 0);
    assert.equal(row(db, "SELECT COUNT(*) AS n FROM order_disputes").n, 0);
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", paid.orderId).status, "paid");

    // PayPal unreachable: 502, so PayPal sends the event again later.
    providers.paypalRefund("REF9", paid.captureId, { value: "1.00" });
    providers.calls.down = true;
    assert.equal((await paypalHook("PAYMENT.CAPTURE.REFUNDED", { id: "REF9" })).status, 502);
    providers.calls.down = false;
    assert.equal((await paypalHook("PAYMENT.CAPTURE.REFUNDED", { id: "REF9" })).status, 200);
    assert.equal(row(db, "SELECT COUNT(*) AS n FROM order_refunds").n, 1);
  });
});

// ---------- M5-12: disputes ----------

test("M5-12: an Airwallex dispute holds the order with its deadline, reminds 3 days before, and a win releases it", { skip }, async () => {
  const db = await createD1();
  const env = (globalThis.__env = env0(db));
  await withProviders(async (providers) => {
    const paid = await paidByCard(env, providers);
    const other = await paidByCard(env, providers, 2);
    const t0 = Date.now();
    const due = iso(t0 + 7 * DAY);
    providers.disputes.set("dsp_1", {
      id: "dsp_1", payment_intent_id: paid.intentId, merchant_order_id: paid.orderId, amount: paid.totalCents / 100, currency: "USD",
      reason: { type: "FRAUD", description: "Fraudulent transaction" }, status: "REQUIRES_RESPONSE", stage: "CHARGEBACK", due_at: due, created_at: iso(t0), updated_at: iso(t0),
    });
    assert.equal((await call(env, "/api/webhooks/airwallex", airwallexHook("payment_dispute.requires_response", { id: "dsp_1" }))).status, 200);
    assert.equal((await call(env, "/api/webhooks/airwallex", airwallexHook("payment_dispute.requires_response", { id: "dsp_1" }))).status, 200, "again");
    const opened = alerts(providers.calls, /a dispute was opened with Airwallex/);
    assert.equal(opened.length, 1, "told once");
    assert.match(opened[0].text, /Respond before/);
    assert.match(opened[0].text, /Fraudulent transaction/);

    let order = await adminGet(env, `/admin/api/orders/${paid.orderId}`);
    assert.ok(order.core.holds.some((hold) => hold.code === "dispute"), "held");
    assert.deepEqual(order.disputes.map((d) => [d.provider, d.id, d.status, d.amountCents, d.dueAt]), [["airwallex", "dsp_1", "open", paid.totalCents, due]]);
    const ship = await adminPost(env, `/admin/api/orders/${paid.orderId}/ship`, { carrier: "UPS", trackingNumber: "1Z999AA10123456784" });
    assert.equal(ship.status, 409);
    assert.equal((await ship.json()).error.code, "dispute_hold");

    // The Disputes list (I13): only disputed orders, earliest deadline first.
    providers.disputes.set("dsp_2", {
      id: "dsp_2", payment_intent_id: other.intentId, merchant_order_id: other.orderId, amount: 10, currency: "USD", reason: { description: "Not received" },
      status: "NEEDS_RESPONSE", stage: "RFI", due_at: iso(t0 + 2 * DAY), created_at: iso(t0), updated_at: iso(t0),
    });
    await call(env, "/api/webhooks/airwallex", airwallexHook("payment_dispute.requires_response", { id: "dsp_2" }));
    const list = await adminGet(env, "/admin/api/orders?issue=disputes");
    assert.deepEqual(list.orders.map((o) => [o.id, o.disputed]), [[other.orderId, true], [paid.orderId, true]]);
    assert.deepEqual(list.issueCounts, { disputes: 2 });
    assert.equal((await call(env, "/admin/api/orders?issue=bogus", { headers: bearer })).status, 400);

    // Reminders: 3 days before each deadline, once.
    assert.deepEqual(await remindDisputes(env, { nowMs: t0 }), { reminded: 1 }, "only the one due in 2 days");
    assert.deepEqual(await remindDisputes(env, { nowMs: t0 + 5 * DAY }), { reminded: 1 });
    assert.deepEqual(await remindDisputes(env, { nowMs: t0 + 6 * DAY }), { reminded: 0 });
    assert.equal(alerts(providers.calls, /dispute is due soon/).length, 2);

    // Won: the hold is released. A late event carrying an older state does not reopen it.
    Object.assign(providers.disputes.get("dsp_1"), { status: "WON", updated_at: iso(t0 + 10 * DAY) });
    await call(env, "/api/webhooks/airwallex", airwallexHook("payment_dispute.won", { id: "dsp_1" }));
    Object.assign(providers.disputes.get("dsp_1"), { status: "REQUIRES_RESPONSE", updated_at: iso(t0 + HOUR) });
    await call(env, "/api/webhooks/airwallex", airwallexHook("payment_dispute.requires_response", { id: "dsp_1" }));
    order = await adminGet(env, `/admin/api/orders/${paid.orderId}`);
    assert.equal(order.disputes[0].status, "won");
    assert.equal(order.status, "paid");
    assert.ok(!order.core.holds.some((hold) => hold.code === "dispute"), "released");
    assert.equal(alerts(providers.calls, /dispute was won/).length, 1);
    assert.deepEqual((await adminGet(env, "/admin/api/orders?issue=disputes")).orders.map((o) => o.id), [other.orderId]);
  });
});

test("M5-12: a lost PayPal dispute cancels the unshipped order as a refund; a dispute on a shipped order only alerts", { skip }, async () => {
  const db = await createD1();
  const env = (globalThis.__env = env0(db));
  await withProviders(async (providers) => {
    const paid = await paidByPaypal(env);
    const t0 = Date.now();
    const dispute = {
      dispute_id: "PP-D-1", reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", status: "WAITING_FOR_SELLER_RESPONSE",
      dispute_amount: { currency_code: "USD", value: dollars(paid.totalCents) }, seller_response_due_date: iso(t0 + 10 * DAY),
      disputed_transactions: [{ seller_transaction_id: paid.captureId }], dispute_life_cycle_stage: "CHARGEBACK", create_time: iso(t0), update_time: iso(t0),
    };
    providers.paypalDisputes.set("PP-D-1", dispute);
    assert.equal((await paypalHook("CUSTOMER.DISPUTE.CREATED", { dispute_id: "PP-D-1" })).status, 200);
    assert.equal(alerts(providers.calls, /a dispute was opened with PayPal/).length, 1);
    assert.ok((await adminGet(env, `/admin/api/orders/${paid.orderId}`)).core.holds.some((hold) => hold.code === "dispute"));

    // An outcome we do not know keeps the hold.
    Object.assign(dispute, { status: "RESOLVED", dispute_outcome: { outcome_code: "SOMETHING_NEW" }, update_time: iso(t0 + DAY) });
    await paypalHook("CUSTOMER.DISPUTE.UPDATED", { dispute_id: "PP-D-1" });
    assert.equal(row(db, "SELECT status FROM order_disputes").status, "open");

    Object.assign(dispute, { dispute_outcome: { outcome_code: "RESOLVED_BUYER_FAVOUR" }, update_time: iso(t0 + 2 * DAY) });
    await paypalHook("CUSTOMER.DISPUTE.RESOLVED", { dispute_id: "PP-D-1" });
    assert.equal(row(db, "SELECT status FROM order_disputes").status, "lost");
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", paid.orderId).status, "cancelled");
    assert.equal(row(db, "SELECT reason_code FROM order_cancellations WHERE order_id = ?", paid.orderId).reason_code, "chargeback");
    const lost = alerts(providers.calls, /PayPal dispute was lost/);
    assert.equal(lost.length, 1);
    assert.match(lost[0].text, /not shipped yet, so it was cancelled/);

    // Shipped already: the dispute is recorded and the team told; the order stays shipped.
    const shipped = await paidByPaypal(env, 2);
    const ship = await adminPost(env, `/admin/api/orders/${shipped.orderId}/ship`, { carrier: "UPS", trackingNumber: "1Z999AA10123456784" });
    assert.equal(ship.status, 200);
    providers.paypalDisputes.set("PP-D-2", {
      ...dispute, dispute_id: "PP-D-2", status: "RESOLVED", dispute_outcome: { outcome_code: "RESOLVED_BUYER_FAVOUR" },
      disputed_transactions: [{ seller_transaction_id: shipped.captureId }], update_time: iso(t0),
    });
    await paypalHook("CUSTOMER.DISPUTE.RESOLVED", { dispute_id: "PP-D-2" });
    assert.match(alerts(providers.calls, new RegExp(`${shipped.orderId}: the PayPal dispute was lost`))[0].text, /already shipped/);
    assert.notEqual(row(db, "SELECT status FROM orders WHERE id = ?", shipped.orderId).status, "cancelled");
  });
});

test("M5-12: an Airwallex dispute that does not match the order's payment is ignored", { skip }, async () => {
  const db = await createD1();
  const env = (globalThis.__env = env0(db));
  await withProviders(async (providers) => {
    const paid = await paidByCard(env, providers);
    providers.disputes.set("dsp_x", { id: "dsp_x", payment_intent_id: "int_elsewhere", merchant_order_id: paid.orderId, amount: 1, currency: "USD", status: "REQUIRES_RESPONSE", updated_at: iso(Date.now()) });
    providers.disputes.set("dsp_y", { id: "dsp_y", payment_intent_id: paid.intentId, merchant_order_id: "SOMEONE-ELSE-1", amount: 1, currency: "USD", status: "REQUIRES_RESPONSE", updated_at: iso(Date.now()) });
    for (const id of ["dsp_x", "dsp_y"]) assert.equal((await call(env, "/api/webhooks/airwallex", airwallexHook("payment_dispute.requires_response", { id }))).status, 200);
    assert.equal(row(db, "SELECT COUNT(*) AS n FROM order_disputes").n, 0);
  });
});

// ---------- M5-06, M5-13: missed payments and the daily check ----------

test("M5-06: a PayPal capture our system missed is filled in by PayPal's webhook", { skip }, async () => {
  const db = await createD1();
  const env = (globalThis.__env = env0(db));
  await withProviders(async (providers) => {
    const created = await paypalOrder(env, cart(1));
    // Captured at PayPal, but our capture call never came back.
    Object.assign(providers.paypal.get(created.paypal.id), { status: "COMPLETED", capturedAt: iso(Date.now()) });
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", created.orderId).status, "pending");
    const response = await paypalHook("PAYMENT.CAPTURE.COMPLETED", { id: `CAP-${created.paypal.id}`, custom_id: created.orderId, supplementary_data: { related_ids: { order_id: created.paypal.id } } });
    assert.equal(response.status, 200);
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", created.orderId).status, "paid");
    assert.equal(customerMails(providers.calls, /We received your APGO order/).length, 1, "the customer gets the confirmation once");
  });
});

test("M5-13: the daily check makes the order for a payment we missed and reports a paid order the provider does not show as paid", { skip }, async () => {
  const db = await createD1();
  const env = (globalThis.__env = env0(db));
  await withProviders(async (providers) => {
    // Paid at Airwallex and at PayPal, no notification reached us.
    const card = await session(env, cart(1));
    providers.succeed(card.intent.id);
    const pp = await paypalOrder(env, cart(2));
    Object.assign(providers.paypal.get(pp.paypal.id), { status: "COMPLETED", capturedAt: iso(Date.now()) });
    // Marked paid here, but the provider no longer shows it paid.
    const wrong = await paidByCard(env, providers, 3);
    providers.intents.get(wrong.intentId).status = "REQUIRES_PAYMENT_METHOD";
    const unpaid = await session(env, cart(4)); // simply not paid: nothing to report

    const now = Date.now();
    const first = await scheduledPaymentChecks(env, { nowMs: now });
    assert.deepEqual(first.reconcile, { checked: 6, unreachable: 0, findings: 3 }, "3 payment objects, then the 3 paid orders");
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", card.orderId).status, "paid");
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", pp.orderId).status, "paid");
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", wrong.orderId).status, "paid", "reported, never changed automatically");
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", unpaid.orderId).status, "pending");
    const report = alerts(providers.calls, /Daily payment check: 3 things to look at/);
    assert.equal(report.length, 1);
    assert.match(report[0].text, new RegExp(`${card.orderId}: paid at Airwallex but not recorded here`));
    assert.match(report[0].text, new RegExp(`${pp.orderId}: paid at PayPal but not recorded here`));
    assert.match(report[0].text, new RegExp(`${wrong.orderId}: marked paid here, but Airwallex shows REQUIRES_PAYMENT_METHOD`));

    // Once a day: the next run the same day only sends reminders; a day later it checks again.
    assert.equal((await scheduledPaymentChecks(env, { nowMs: now + HOUR })).reconcile, "not_due");
    const next = await scheduledPaymentChecks(env, { nowMs: now + DAY + HOUR });
    assert.equal(typeof next.reconcile, "object");
    assert.equal(row(db, "SELECT value FROM ops_state WHERE key = 'payments.reconciled_at'").value, iso(now + DAY + HOUR));
  });
});

test("M5-13: a provider that does not answer is counted, not reported", { skip }, async () => {
  const db = await createD1();
  const env = (globalThis.__env = env0(db));
  await withProviders(async (providers) => {
    await paidByCard(env, providers);
    await session(env, cart(2));
    providers.calls.down = true;
    assert.deepEqual(await reconcilePayments(env), { checked: 2, unreachable: 2, findings: 0 });
    assert.equal(alerts(providers.calls, /Daily payment check/).length, 0);
  });
});
