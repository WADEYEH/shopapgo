// Order core (PR 3-3, M4): stages and the transition table, the cooling-off queue, confirm / cancel / change address in
// the back office, refunds that hold or cancel an order, and team alerts. Acceptance M4-02, M4-05 to M4-13, M4-15.
// Orders go through the real checkout and webhook; Airwallex, Amazon (tests/helpers/fake-amazon-mcf.mjs) and the
// email API are stubbed. Nothing reaches the network.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import worker from "../worker/index.js";
import { resetAirwallexTokenCache } from "../worker/airwallex.js";
import { TRANSITIONS, coolingOff, orderStage, transitionFor } from "../worker/order-core.js";
import { submitDueOrders } from "../worker/mcf.js";
import { markShipped } from "../worker/fulfillment.js";
import { createD1, sqliteAvailable } from "./helpers/d1.mjs";
import { FAKE_AMAZON_ENV, FAKE_BASE_URL, createFakeAmazon } from "./helpers/fake-amazon-mcf.mjs";

globalThis.fetch = async (url) => { throw new Error(`unexpected real network call: ${url}`); };
const skip = (await sqliteAvailable()) ? false : "node:sqlite unavailable";

const WEBHOOK_SECRET = "whsec_unit_test";
const MAIL_URL = "https://mail.example/send";
const ORIGIN = "https://shop.example";
const OWNER = "owner@apgo.example";
const STAFF = "staff@apgo.example";
const TOTAL = 127.96;
const HOUR = 60 * 60_000;
const staffLogin = { Authorization: `Basic ${Buffer.from(`${STAFF}:staff-password-1`).toString("base64")}` };

const baseEnv = (db, extra = {}) => ({
  DB: db,
  AIRWALLEX_CLIENT_ID: "cid",
  AIRWALLEX_API_KEY: "key",
  AIRWALLEX_WEBHOOK_SECRET: WEBHOOK_SECRET,
  AIRWALLEX_ENV: "demo",
  AIRWALLEX_RETRY_DELAY_MS: "0",
  ADMIN_LOGIN_EMAIL: STAFF,
  ADMIN_LOGIN_PASSWORD: "staff-password-1",
  ADMIN_OWNER_EMAIL: OWNER,
  RESEND_API_KEY: "rk_test_key",
  CUSTOMER_EMAIL_FROM: "APGO <orders@shop.example>",
  ORDER_NOTIFY_EMAIL_API_URL: MAIL_URL,
  ASSETS: { fetch: async () => new Response("<h1>page</h1>") },
  ...FAKE_AMAZON_ENV,
  ORDER_COOLING_OFF_MINUTES: "60",
  ...extra,
});

const ctxStub = () => ({ waitUntil(promise) { (this.pending ||= []).push(promise); }, async settled() { await Promise.all(this.pending ?? []); } });
const call = async (env, path, init = {}) => {
  const ctx = ctxStub();
  const response = await worker.fetch(new Request(`${ORIGIN}${path}`, init), env, ctx);
  await ctx.settled();
  return response;
};
const post = (body, headers = {}) => ({ method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Airwallex (login, payment intent, refund lookups), Amazon (the fake) and the email API.
async function withWorld(run, { amazon = createFakeAmazon(), refunds = new Map() } = {}) {
  const original = globalThis.fetch;
  const mails = [];
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href === MAIL_URL) { mails.push(JSON.parse(init.body)); return Response.json({ id: crypto.randomUUID() }); }
    if (href.startsWith(FAKE_BASE_URL)) return amazon.fetch(href, init);
    if (href.endsWith("/authentication/login")) return jsonResponse(201, { token: "tok", expires_at: new Date(Date.now() + 1_800_000).toISOString().replace(/\.\d+Z$/, "+0000") });
    if (href.endsWith("/payment_intents/create")) {
      const payload = JSON.parse(init.body);
      return jsonResponse(201, { id: "int_123", client_secret: "cs", currency: payload.currency, amount: payload.amount, merchant_order_id: payload.merchant_order_id, status: "REQUIRES_PAYMENT_METHOD" });
    }
    const refund = href.match(/\/api\/v1\/pa\/refunds\/([^/?]+)$/);
    if (refund && refunds.has(refund[1])) return jsonResponse(200, refunds.get(refund[1]));
    throw new Error(`unexpected real network call: ${href}`);
  };
  resetAirwallexTokenCache();
  try {
    return await run({ amazon, mails, refunds, alerts: () => mails.filter((m) => m.to.includes(OWNER) && !/^Back office:/.test(m.subject)) });
  } finally {
    globalThis.fetch = original;
  }
}

function signed(event) {
  const body = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, ...event });
  const timestamp = String(Date.now());
  return { method: "POST", headers: { "x-timestamp": timestamp, "x-signature": createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}${body}`).digest("hex") }, body };
}
const paymentEvent = (orderId, amount = TOTAL) => signed({ name: "payment_intent.succeeded", data: { object: { id: "int_123", merchant_order_id: orderId, status: "SUCCEEDED", currency: "USD", amount } } });

async function placeOrder(env, { amount = TOTAL, pay = true } = {}) {
  resetAirwallexTokenCache();
  const session = await (await call(env, "/api/checkout/session", post({
    items: [{ sku: "d204", qty: 1 }, { sku: "d215", qty: 2 }],
    contact: { email: "ada@example.com", phone: "(512) 555-0134", marketingOptIn: false },
    shipping: { firstName: "Ada", lastName: "Lee", street: "100 Example Ave", street2: "Apt 4", city: "Austin", state: "TX", zip: "78701" },
    method: "standard",
  }))).json();
  if (pay) assert.equal((await call(env, "/api/webhooks/airwallex", paymentEvent(session.orderId, amount))).status, 200);
  return session.orderId;
}

// A refund the Airwallex stub answers for, delivered as a signed webhook.
async function refund(env, refunds, { id = "rfd_1", amount, status = "ACCEPTED" }) {
  const at = new Date().toISOString();
  refunds.set(id, { id, payment_intent_id: "int_123", amount, currency: "USD", status, created_at: at, updated_at: at });
  assert.equal((await call(env, "/api/webhooks/airwallex", signed({ name: "refund.accepted", data: { object: { id, payment_intent_id: "int_123" } } }))).status, 200);
}

const action = async (env, orderId, name, body) => {
  const response = await call(env, `/admin/api/orders/${orderId}/${name}`, post(body, staffLogin));
  return { status: response.status, body: await response.json() };
};
const view = async (env, orderId) => (await call(env, `/admin/api/orders/${orderId}`, { headers: staffLogin })).json();
const row = (db, sql, ...args) => { const found = db.raw.prepare(sql).get(...args); return found ? { ...found } : null; };
const rows = (db, sql, ...args) => db.raw.prepare(sql).all(...args).map((r) => ({ ...r }));
const audit = (db, orderId) => rows(db, "SELECT action, actor, detail_json FROM order_audit WHERE order_id = ? ORDER BY id", orderId).map((r) => ({ ...r, detail: JSON.parse(r.detail_json) }));

// ---------- the rules themselves ----------

test("stages come from the status and the MCF / shipment records; the transition table matches M4 §3.3", () => {
  const paid = { status: "paid", paid_at: "2026-10-09T00:00:00.000Z" };
  assert.equal(orderStage({ status: "pending" }), "checkout");
  assert.equal(orderStage({ status: "review" }), "review");
  assert.equal(orderStage(paid), "paid");
  assert.equal(orderStage(paid, { mcf: { status: "failed" } }), "paid", "a failed send is not with Amazon");
  assert.equal(orderStage(paid, { mcf: { status: "submitted" } }), "fulfilling");
  assert.equal(orderStage(paid, { mcf: { status: "submitted" }, fulfillment: { status: "shipped" } }), "shipped");
  assert.equal(orderStage({ status: "cancelled" }, { mcf: { status: "submitted" } }), "cancelled");
  assert.deepEqual(TRANSITIONS.map((t) => `${t.id} ${t.from}>${t.to}`), ["T1 checkout>paid", "T2 checkout>review", "T5 review>paid", "T6 review>cancelled", "T7 paid>fulfilling", "T8 paid>cancelled", "T9 fulfilling>shipped", "T10 fulfilling>cancelled"]);
  assert.equal(transitionFor("shipped", "cancelled"), null);
  assert.equal(transitionFor("cancelled", "paid"), null);

  const at = Date.parse(paid.paid_at);
  assert.deepEqual(coolingOff({}, paid, at + 59 * 60_000), { endsAt: "2026-10-09T01:00:00.000Z", active: true });
  assert.equal(coolingOff({}, paid, at + HOUR).active, false);
  assert.equal(coolingOff({ ORDER_COOLING_OFF_MINUTES: "10" }, paid, at + 11 * 60_000).active, false);
  assert.equal(coolingOff({}, { status: "review" }).endsAt, null);
});

// ---------- cooling-off (M4 §3.6) ----------

test("cooling-off: a paid order is queued and goes to Amazon only after an hour; nothing at payment", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  await withWorld(async ({ amazon }) => {
    const orderId = await placeOrder(env);
    assert.equal(amazon.count("create"), 0, "never sent at payment any more");
    const queued = row(db, "SELECT due_at FROM mcf_submission_queue WHERE order_id = ?", orderId);
    const paidAt = Date.parse(row(db, "SELECT paid_at FROM orders WHERE id = ?", orderId).paid_at);
    assert.equal(Date.parse(queued.due_at), paidAt + HOUR);

    const detail = await view(env, orderId);
    assert.equal(detail.core.stage, "paid");
    assert.equal(detail.core.coolingOff.active, true);
    assert.deepEqual(detail.core.actions, { confirm: false, cancel: true, changeAddress: true });
    assert.equal(detail.mcf.canSubmit, false, "the back-office button waits too");
    assert.equal(detail.mcf.coolingOffEndsAt, queued.due_at);
    const early = await call(env, `/admin/api/orders/${orderId}/mcf/submit`, post({}, staffLogin));
    assert.match((await early.json()).result.reason, /cooling-off period ends/);

    assert.deepEqual(await submitDueOrders(env, { nowMs: paidAt + 30 * 60_000 }), { checked: 0, submitted: 0, failed: 0, held: 0, dropped: 0 });
    assert.equal(amazon.count("create"), 0);
    const due = await submitDueOrders(env, { nowMs: paidAt + HOUR + 60_000 });
    assert.equal(due.submitted, 1);
    assert.equal(amazon.count("create"), 1);
    assert.equal(row(db, "SELECT status FROM order_mcf WHERE order_id = ?", orderId).status, "submitted");
    assert.equal(row(db, "SELECT COUNT(*) AS n FROM mcf_submission_queue").n, 0);
    assert.equal((await view(env, orderId)).core.stage, "fulfilling");
    // The cron runs it too, and a second run does nothing more.
    await submitDueOrders(env, { nowMs: paidAt + 2 * HOUR });
    assert.equal(amazon.count("create"), 1);
  });
});

test("cooling-off queue: only orders paid while sending was on; turned off meanwhile = left for a person, team told", { skip }, async () => {
  const db = await createD1();
  await withWorld(async ({ amazon, alerts }) => {
    const off = await placeOrder(baseEnv(db, { MCF_AUTO_SUBMIT: "" }));
    assert.equal(row(db, "SELECT COUNT(*) AS n FROM mcf_submission_queue").n, 0, "paid while sending was off: never sent automatically");

    const db2 = await createD1();
    const env2 = baseEnv(db2);
    const orderId = await placeOrder(env2);
    const result = await submitDueOrders(baseEnv(db2, { MCF_AUTO_SUBMIT: "" }), { nowMs: Date.now() + 2 * HOUR });
    assert.equal(result.dropped, 1);
    assert.equal(amazon.count("create"), 0);
    assert.equal(alerts().length, 1);
    assert.match(alerts()[0].subject, new RegExp(`Order ${orderId} was not sent to Amazon`));
    assert.ok(off);
  });
});

// ---------- review (T2, T5, T6) ----------

test("M4-02: a payment that does not match waits for review, is never queued for Amazon, and the team is told once", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  await withWorld(async ({ amazon, alerts }) => {
    const orderId = await placeOrder(env, { amount: 1.0 });
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", orderId).status, "review");
    assert.equal(row(db, "SELECT COUNT(*) AS n FROM mcf_submission_queue").n, 0);
    await call(env, "/api/webhooks/airwallex", paymentEvent(orderId, 1.0)); // delivered again
    assert.equal(alerts().length, 1);
    assert.match(alerts()[0].subject, /needs review/);
    assert.match(alerts()[0].text, new RegExp(`Order: ${orderId}`));
    const detail = await view(env, orderId);
    assert.equal(detail.core.stage, "review");
    assert.deepEqual(detail.core.holds.map((h) => h.code), ["review"]);
    assert.deepEqual(detail.core.actions, { confirm: true, cancel: true, changeAddress: false });
    assert.equal(amazon.count("create"), 0);
  });
});

test("T5: confirming a review order needs a reason, then runs what a matching payment runs, once", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db, { ORDER_COOLING_OFF_MINUTES: "0" });
  await withWorld(async ({ amazon, mails }) => {
    const orderId = await placeOrder(env, { amount: 1.0 });
    const noReason = await action(env, orderId, "confirm", { reason: "  " });
    assert.equal(noReason.status, 400);
    assert.equal(noReason.body.error.code, "reason_required");
    const confirmed = await action(env, orderId, "confirm", { reason: "Customer paid the difference by bank transfer" });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.order.status, "paid");
    assert.ok(confirmed.body.order.paidAt);
    const entry = audit(db, orderId).find((a) => a.action === "order.confirmed");
    assert.equal(entry.actor, STAFF);
    assert.deepEqual(entry.detail, { transition: "T5", reason: "Customer paid the difference by bank transfer" });
    // Confirmation email and, with no cooling-off, Amazon right away.
    assert.equal(mails.filter((m) => m.to.includes("ada@example.com") && /order/i.test(m.subject)).length, 1);
    assert.equal(amazon.count("create"), 1);
    // Confirming again is refused and logged (M4-11).
    const again = await action(env, orderId, "confirm", { reason: "again" });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, "not_allowed");
    assert.equal(amazon.count("create"), 1);
  });
});

// ---------- cancel (T6, T8, T10) ----------

test("M4-05: cancelled in the cooling-off period = cancelled with its reason, never sent to Amazon, refund prompted", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  await withWorld(async ({ amazon }) => {
    const orderId = await placeOrder(env);
    assert.equal((await action(env, orderId, "cancel", { reason: "nope" })).body.error.code, "invalid_reason");
    assert.equal((await action(env, orderId, "cancel", { reason: "other" })).body.error.code, "note_required");
    const cancelled = await action(env, orderId, "cancel", { reason: "customer_request", note: "Emailed 10 minutes after paying" });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.order.status, "cancelled");
    assert.deepEqual(cancelled.body.result.payment, { provider: "airwallex", paidCents: 12796, refundedCents: 0, refundStatus: "none" });
    assert.deepEqual(cancelled.body.order.core.cancellation, { fromStage: "paid", reason: "customer_request", note: "Emailed 10 minutes after paying", by: STAFF, at: cancelled.body.order.core.cancellation.at, amazonCancel: null });
    assert.deepEqual(cancelled.body.order.core.actions, { confirm: false, cancel: false, changeAddress: false });
    assert.equal(row(db, "SELECT COUNT(*) AS n FROM mcf_submission_queue").n, 0);
    await submitDueOrders(env, { nowMs: Date.now() + 2 * HOUR });
    assert.equal(amazon.count("create"), 0);
    assert.equal(audit(db, orderId).at(-1).detail.transition, "T8");
    assert.equal((await action(env, orderId, "cancel", { reason: "customer_request" })).body.error.code, "already_cancelled");
  });
});

test("M4-06: with Amazon already, the order is cancelled only when Amazon cancels; a refusal keeps it and tells the team", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db, { ORDER_COOLING_OFF_MINUTES: "0" });
  await withWorld(async ({ amazon, alerts }) => {
    const orderId = await placeOrder(env);
    assert.equal((await view(env, orderId)).core.stage, "fulfilling");
    amazon.setStatus(orderId, "COMPLETE"); // too late for Amazon to stop it
    const refused = await action(env, orderId, "cancel", { reason: "customer_request" });
    assert.equal(refused.status, 502);
    assert.equal(refused.body.error.code, "amazon_cancel_failed");
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", orderId).status, "paid");
    assert.equal(audit(db, orderId).at(-1).action, "order.cancel_failed");
    assert.equal(alerts().length, 1);
    assert.match(alerts()[0].subject, /Amazon could not cancel/);

    const db2 = await createD1();
    const env2 = baseEnv(db2, { ORDER_COOLING_OFF_MINUTES: "0" });
    const second = await placeOrder(env2);
    const ok = await action(env2, second, "cancel", { reason: "out_of_stock" });
    assert.equal(ok.status, 200);
    assert.equal(amazon.count("cancel"), 2);
    assert.equal(ok.body.order.core.cancellation.amazonCancel, "requested");
    assert.equal(audit(db2, second).at(-1).detail.transition, "T10");
  });
});

test("M4-07 / M4-11: a shipped order cannot be cancelled; the refusal is logged and the team told once", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db, { MCF_AUTO_SUBMIT: "" });
  await withWorld(async ({ alerts }) => {
    const orderId = await placeOrder(env);
    await markShipped(db, orderId, { carrier: "UPS", trackingNumber: "1Z999AA10123456784", trackingUrl: null }, { actor: STAFF });
    for (let i = 0; i < 2; i += 1) {
      const refused = await action(env, orderId, "cancel", { reason: "customer_request" });
      assert.equal(refused.status, 409);
      assert.equal(refused.body.error.code, "not_allowed");
      assert.match(refused.body.error.message, /Handle it as a return/);
    }
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", orderId).status, "paid");
    assert.deepEqual(audit(db, orderId).filter((a) => a.action === "order.transition_refused").map((a) => [a.actor, a.detail.from, a.detail.to]), [[STAFF, "shipped", "cancelled"], [STAFF, "shipped", "cancelled"]]);
    assert.equal(alerts().length, 1);
    assert.deepEqual((await view(env, orderId)).core.actions, { confirm: false, cancel: false, changeAddress: false });
  });
});

// ---------- refunds (M4 §3.4) ----------

test("M4-08: a full refund before shipping cancels the order by itself; it never goes to Amazon; the refund email still goes", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  await withWorld(async ({ amazon, refunds, mails }) => {
    const orderId = await placeOrder(env);
    await refund(env, refunds, { amount: TOTAL });
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", orderId).status, "cancelled");
    assert.deepEqual(row(db, "SELECT reason_code, actor, from_stage FROM order_cancellations WHERE order_id = ?", orderId), { reason_code: "full_refund", actor: "system", from_stage: "paid" });
    await submitDueOrders(env, { nowMs: Date.now() + 2 * HOUR });
    assert.equal(amazon.count("create"), 0);
    assert.equal(mails.filter((m) => m.to.includes("ada@example.com") && /refund/i.test(m.subject)).length, 1, "the customer still hears about the refund");
  });
});

test("M4-08 with Amazon: a full refund asks Amazon to cancel, then cancels the order", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db, { ORDER_COOLING_OFF_MINUTES: "0" });
  await withWorld(async ({ amazon, refunds }) => {
    const orderId = await placeOrder(env);
    await refund(env, refunds, { amount: TOTAL });
    assert.equal(amazon.count("cancel"), 1);
    assert.deepEqual(row(db, "SELECT reason_code, from_stage, amazon_cancel FROM order_cancellations WHERE order_id = ?", orderId), { reason_code: "full_refund", from_stage: "fulfilling", amazon_cancel: "requested" });
  });
});

test("M4-09: a partial refund before shipping holds the order (never sent) and tells the team once", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  await withWorld(async ({ amazon, refunds, alerts }) => {
    const orderId = await placeOrder(env);
    await refund(env, refunds, { id: "rfd_1", amount: 10 });
    await refund(env, refunds, { id: "rfd_2", amount: 5 });
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", orderId).status, "paid");
    assert.deepEqual((await view(env, orderId)).core.holds.map((h) => h.code), ["refund"]);
    const result = await submitDueOrders(env, { nowMs: Date.now() + 2 * HOUR });
    assert.equal(result.held, 1);
    assert.equal(amazon.count("create"), 0);
    assert.equal(alerts().filter((m) => /put shipping on hold/.test(m.subject)).length, 1);
  });
});

test("M4-13: a refund that arrives before the payment still ends with the right state", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  await withWorld(async ({ amazon, refunds }) => {
    const orderId = await placeOrder(env, { pay: false });
    await refund(env, refunds, { amount: TOTAL }); // out of order: the refund event first
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", orderId).status, "pending");
    await call(env, "/api/webhooks/airwallex", paymentEvent(orderId));
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", orderId).status, "cancelled");
    await submitDueOrders(env, { nowMs: Date.now() + 2 * HOUR });
    assert.equal(amazon.count("create"), 0);
  });
});

// ---------- address (M4 §3.7) ----------

const NEW_ADDRESS = { firstName: "Ada", lastName: "Lee", street: "200 Example Ave", street2: "Unit 9", city: "Austin", state: "TX", zip: "78702" };

test("M4-10: the address can change in the cooling-off period (checked again, before and after logged), not after", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  await withWorld(async ({ amazon }) => {
    const orderId = await placeOrder(env);
    assert.equal((await action(env, orderId, "address", { shipping: NEW_ADDRESS })).body.error.code, "reason_required");
    const poBox = await action(env, orderId, "address", { shipping: { ...NEW_ADDRESS, street: "PO Box 12" }, reason: "typo" });
    assert.equal(poBox.status, 400);
    assert.equal(poBox.body.error.field, "street");
    const wrongZip = await action(env, orderId, "address", { shipping: { ...NEW_ADDRESS, zip: "10001" }, reason: "typo" });
    assert.equal(wrongZip.body.error.field, "zip");

    const changed = await action(env, orderId, "address", { shipping: NEW_ADDRESS, reason: "Customer emailed the new unit" });
    assert.equal(changed.status, 200);
    const shipping = changed.body.order.shipping;
    assert.equal(shipping.street, "200 Example Ave");
    assert.equal(shipping.phone, "+15125550134", "the phone stays");
    assert.equal(shipping.addressCheck.status, "unverified", "checked again (no Google key here)");
    const entry = audit(db, orderId).find((a) => a.action === "order.address_changed");
    assert.equal(entry.actor, STAFF);
    assert.equal(entry.detail.before.street, "100 Example Ave");
    assert.equal(entry.detail.after.street, "200 Example Ave");
    assert.equal(entry.detail.reason, "Customer emailed the new unit");

    // Amazon gets the new address once the cooling-off period is over; after that the address is locked.
    await submitDueOrders(env, { nowMs: Date.now() + 2 * HOUR });
    assert.equal(amazon.orders.get(orderId).request.destination_address.addressLine1, "200 Example Ave");
    const late = await action(env, orderId, "address", { shipping: NEW_ADDRESS, reason: "again" });
    assert.equal(late.status, 409);
    assert.equal(late.body.error.code, "address_locked");
  });
});

test("M4-15: the amount paid never changes: not with a new address, not with new prices; a state with other tax is refused", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db, { PRICING_JSON: JSON.stringify({ tax: { stateRatesBps: { CA: 725 } } }) });
  await withWorld(async () => {
    const orderId = await placeOrder(env);
    const before = row(db, "SELECT subtotal_cents, shipping_cents, tax_cents, total_cents FROM orders WHERE id = ?", orderId);
    const toCalifornia = await action(env, orderId, "address", { shipping: { ...NEW_ADDRESS, city: "San Francisco", state: "CA", zip: "94105" }, reason: "moved" });
    assert.equal(toCalifornia.status, 409);
    assert.equal(toCalifornia.body.error.code, "state_changes_tax");
    const toArizona = await action(env, orderId, "address", { shipping: { ...NEW_ADDRESS, city: "Phoenix", state: "AZ", zip: "85001" }, reason: "moved" });
    assert.equal(toArizona.status, 200, "same tax (none) in Arizona");
    const pricier = baseEnv(db, { PRICING_JSON: JSON.stringify({ products: { d204: { priceCents: 9999 } } }) });
    assert.equal((await view(pricier, orderId)).totalCents, before.total_cents);
    assert.deepEqual(row(db, "SELECT subtotal_cents, shipping_cents, tax_cents, total_cents FROM orders WHERE id = ?", orderId), before);
  });
});

test("order actions: POST with JSON only, same origin, a signed-in person; unknown orders are 404", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  await withWorld(async () => {
    const orderId = await placeOrder(env);
    assert.equal((await call(env, `/admin/api/orders/${orderId}/cancel`, { headers: staffLogin })).status, 405);
    assert.equal((await call(env, `/admin/api/orders/${orderId}/cancel`, { method: "POST", headers: { ...staffLogin, "Content-Type": "text/plain" }, body: "{}" })).status, 403);
    assert.equal((await call(env, `/admin/api/orders/${orderId}/cancel`, post({ reason: "customer_request" }, { ...staffLogin, Origin: "https://evil.example" }))).status, 403);
    assert.equal((await call(env, `/admin/api/orders/${orderId}/cancel`, post({ reason: "customer_request" }))).status, 401);
    assert.equal((await call(env, "/admin/api/orders/APGO-US-NOTANORDER00/cancel", post({ reason: "customer_request" }, staffLogin))).status, 404);
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", orderId).status, "paid");
  });
});
