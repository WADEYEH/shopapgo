// PR 3-10: refunds from the order page (D51, D55, M9-25), customers (I7, M9-13), privacy requests (E11, D53, D54,
// M9-14, M11-05) and reports and exports (I4, I8, D56, M9-06, M9-15, M9-16). The database is the real migrations in
// memory; Airwallex, PayPal, Amazon and the email API are local fakes, nothing reaches the network.
import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.js";
import { resetAirwallexTokenCache } from "../worker/airwallex.js";
import { resetPaypalTokenCache } from "../worker/paypal.js";
import { submitOrderToMcf } from "../worker/mcf.js";
import { getOrder } from "../worker/orders.js";
import { refundPanel, requestAdminRefund } from "../worker/admin-refunds.js";
import { listCustomers } from "../worker/customers.js";
import { privacyReminders } from "../worker/customer-privacy.js";
import { digestSections } from "../worker/team-digest.js";
import { periodOf, salesReport } from "../worker/reports.js";
import { createD1, sqliteAvailable } from "./helpers/d1.mjs";
import { FAKE_AMAZON_ENV, FAKE_BASE_URL, createFakeAmazon } from "./helpers/fake-amazon-mcf.mjs";

globalThis.fetch = async (url) => { throw new Error(`unexpected real network call: ${url}`); };
const skip = (await sqliteAvailable()) ? false : "node:sqlite unavailable";

const MAIL_URL = "https://mail.example/send";
const OWNER = "owner@apgo.example";
const TOKEN = "test-admin-token-0123456789";
const LOGIN = { email: OWNER, password: "owner-password-123" };
const ownerLogin = { Authorization: `Basic ${Buffer.from(`${LOGIN.email}:${LOGIN.password}`).toString("base64")}` };
const OWNER_ACTOR = { id: OWNER, email: OWNER, role: "owner", via: "password" };
const DAY = 24 * 60 * 60_000;
const iso = (ms) => new Date(ms).toISOString();

const env0 = (db, extra = {}) => ({
  DB: db,
  AIRWALLEX_CLIENT_ID: "cid", AIRWALLEX_API_KEY: "key", AIRWALLEX_ENV: "demo", AIRWALLEX_RETRY_DELAY_MS: "0",
  PAYPAL_CLIENT_ID: "paypal_cid", PAYPAL_CLIENT_SECRET: "paypal_secret", PAYPAL_ENV: "sandbox", PAYPAL_RETRY_DELAY_MS: "0",
  ADMIN_TOKEN: TOKEN, ADMIN_OWNER_EMAIL: OWNER, ADMIN_LOGIN_EMAIL: LOGIN.email, ADMIN_LOGIN_PASSWORD: LOGIN.password,
  RESEND_API_KEY: "rk_test_key", CUSTOMER_EMAIL_FROM: "APGO <orders@shop.example>", ORDER_NOTIFY_EMAIL_API_URL: MAIL_URL,
  ASSETS: { fetch: async () => new Response("ok") },
  ...FAKE_AMAZON_ENV,
  ...extra,
});

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Airwallex refunds, PayPal orders and refunds, Amazon (the shared fake) and the email API.
function createWorld(amazonOptions = {}) {
  const amazon = createFakeAmazon(amazonOptions);
  const calls = { mails: [], refunds: [], paypalRefunds: [], refundFailures: 0 };
  const paypalOrders = new Map();
  async function handler(href, init) {
    if (href === MAIL_URL) { calls.mails.push(JSON.parse(init.body)); return json(200, { id: crypto.randomUUID() }); }
    if (href.startsWith(FAKE_BASE_URL)) return amazon.fetch(href, init);
    if (href.endsWith("/authentication/login")) return json(201, { token: "tok", expires_at: new Date(Date.now() + 1_800_000).toISOString().replace(/\.\d+Z$/, "+0000") });
    if (href.endsWith("/refunds/create")) {
      const body = JSON.parse(init.body);
      calls.refunds.push(body);
      if (calls.refundFailures > 0) { calls.refundFailures -= 1; return json(400, { code: "refund_failed", message: "Refund rejected by the test" }); }
      const at = new Date().toISOString();
      return json(201, { id: `rfd_${body.request_id}`, request_id: body.request_id, payment_intent_id: body.payment_intent_id, amount: body.amount, currency: "USD", status: "RECEIVED", created_at: at, updated_at: at });
    }
    if (href.endsWith("/v1/oauth2/token")) return json(200, { access_token: "pp_tok", expires_in: 32400 });
    const paypalGet = href.match(/\/v2\/checkout\/orders\/([^/?]+)$/);
    if (paypalGet) {
      const order = paypalOrders.get(paypalGet[1]);
      return json(200, { id: paypalGet[1], status: "COMPLETED", purchase_units: [{ custom_id: order.storeOrderId, amount: { currency_code: "USD", value: order.value },
        payments: { captures: [{ id: `CAP-${paypalGet[1]}`, status: "COMPLETED", amount: { currency_code: "USD", value: order.value } }] } }] });
    }
    const paypalRefund = href.match(/\/v2\/payments\/captures\/([^/]+)\/refund$/);
    if (paypalRefund) {
      calls.paypalRefunds.push({ captureId: paypalRefund[1], requestId: init.headers["PayPal-Request-Id"], body: JSON.parse(init.body) });
      return json(201, { id: `PPREF-${calls.paypalRefunds.length}`, status: "COMPLETED" });
    }
    throw new Error(`unexpected network call: ${init.method ?? "GET"} ${href}`);
  }
  return { amazon, calls, paypalOrders, handler };
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
const post = (body, headers = ownerLogin) => ({ method: "POST", headers: { "Content-Type": "application/json", Origin: "https://www.shopapgo.com", ...headers }, body: JSON.stringify(body) });
const get = async (env, path) => (await call(env, path, { headers: ownerLogin })).json();
const rows = (db, sql, ...args) => db.raw.prepare(sql).all(...args).map((r) => ({ ...r }));
const row = (db, sql, ...args) => rows(db, sql, ...args)[0] ?? null;

const LINE = {
  d204: (qty) => ({ id: "d204", sku: "D204", name: "APGO Atomic Colored Glaze", size: "300 mL · 10.1 fl oz", qty, unitCents: 5999, lineCents: 5999 * qty }),
  d215: (qty) => ({ id: "d215", sku: "D215", name: "APGO Atomic Glaze Coating", size: "200 mL · 6.8 fl oz", qty, unitCents: 2999, lineCents: 2999 * qty }),
};
const ADDRESS = { firstName: "Ada", lastName: "Lee", street: "100 Example Ave", street2: "Apt 4", city: "Austin", state: "TX", zip: "78701", phone: "+15125550148" };

// A paid order straight into the database: Airwallex unless provider "paypal"; shipped adds a shipment.
function insertOrder(db, id, { email = "ada@example.com", status = "paid", paidAt = iso(Date.now() - 2 * DAY), lines = [LINE.d204(1)], shipping = {}, provider = "airwallex", shipped = false, tax = 0, ship = 799, marketing = 0, world } = {}) {
  const subtotal = lines.reduce((sum, line) => sum + line.lineCents, 0);
  const total = subtotal + ship + tax;
  const ref = provider === "paypal" ? `PP${id.slice(-6)}` : `int_${id}`;
  db.raw.prepare(`INSERT INTO orders (id, status, email, marketing_opt_in, shipping_json, shipping_method, lines_json, currency, subtotal_cents, shipping_cents, tax_cents, total_cents, payment_intent_id, created_at, updated_at, paid_at)
    VALUES (?, ?, ?, ?, ?, 'standard', ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, status, email, marketing, JSON.stringify({ ...ADDRESS, ...shipping }), JSON.stringify(lines), subtotal, ship, tax, total, ref, paidAt, paidAt, paidAt);
  if (provider === "paypal") {
    db.raw.prepare("INSERT INTO order_payments (order_id, provider, provider_ref, created_at) VALUES (?, 'paypal', ?, ?)").run(id, ref, paidAt);
    world?.paypalOrders.set(ref, { storeOrderId: id, value: (total / 100).toFixed(2) });
  }
  if (shipped) {
    db.raw.prepare(`INSERT INTO order_fulfillments (order_id, fulfillment_status, carrier, tracking_number, shipped_at, shipped_by, created_at, updated_at)
      VALUES (?, 'shipped', 'UPS', '1Z999', ?, 'mcf', ?, ?)`).run(id, paidAt, paidAt, paidAt);
  }
  return { id, total, ref };
}

const refund = (env, id, body) => call(env, `/admin/api/orders/${id}/refund`, post(body));
const customerMails = (world, pattern) => world.calls.mails.filter((m) => m.to.includes("ada@example.com") && pattern.test(m.subject));

// ---------- D51, D55, M9-25: refunds from the order page ----------

test("M9-25: a shipped order is refunded in part, then the rest; pressed twice it refunds once; never more than was paid", { skip }, async () => {
  await withWorld({}, async (world) => {
    const db = await createD1();
    const env = env0(db);
    const order = insertOrder(db, "APGO-US-RFND00000001", { shipped: true });
    const view = await get(env, `/admin/api/orders/${order.id}`);
    assert.equal(view.refund.allowed, true);
    assert.equal(view.refund.refundableCents, order.total);
    assert.equal(view.refund.fullOnly, false, "shipped: a part refund is fine");

    const first = await refund(env, order.id, { key: "panel-0001-aaaa", amountCents: 1000, reason: "damaged", note: "Cap cracked", notify: true });
    assert.equal(first.status, 200);
    const body = await first.json();
    assert.equal(body.result.outcome, "requested");
    assert.equal(world.calls.refunds.length, 1);
    assert.deepEqual({ id: world.calls.refunds[0].request_id, amount: world.calls.refunds[0].amount }, { id: "refund-panel-0001-aaaa", amount: 10 });
    assert.equal(body.order.refunds.records.length, 1, "recorded at once; the provider's events update it later");
    assert.equal(body.order.refund.refundableCents, order.total - 1000);
    assert.equal(body.order.refund.requests[0].status, "requested");
    const audit = row(db, "SELECT actor, detail_json FROM order_audit WHERE order_id = ? AND action = 'order.refund_requested'", order.id);
    assert.equal(audit.actor, OWNER);
    assert.equal(JSON.parse(audit.detail_json).reason, "damaged");

    // The same press again (a double click, a lost reply): nothing new.
    const again = await (await refund(env, order.id, { key: "panel-0001-aaaa", amountCents: 1000, reason: "damaged", note: "Cap cracked" })).json();
    assert.equal(again.result.outcome, "already_requested");
    assert.equal(world.calls.refunds.length, 1);

    // More than is left: refused before the provider is asked.
    const tooMuch = await refund(env, order.id, { key: "panel-0002-bbbb", amountCents: order.total, reason: "returned" });
    assert.equal(tooMuch.status, 409);
    assert.equal((await tooMuch.json()).error.code, "more_than_left");
    const rest = await (await refund(env, order.id, { key: "panel-0003-cccc", amountCents: order.total - 1000, reason: "returned" })).json();
    assert.equal(rest.result.outcome, "requested");
    assert.equal(rest.order.refund.allowed, false);
    assert.equal(rest.order.refund.why, "nothing_left");
    assert.equal(world.calls.refunds.length, 2);
    assert.equal(rest.order.status, "paid", "a shipped order stays shipped; the money is back");
  });
});

test("M9-25: input is checked; members never refund; an open dispute or an unpaid order cannot be refunded", { skip }, async () => {
  await withWorld({}, async (world) => {
    const db = await createD1();
    const env = env0(db);
    const order = insertOrder(db, "APGO-US-RFND00000002", { shipped: true });
    for (const [body, code] of [
      [{ key: "short", amountCents: 100, reason: "damaged" }, "invalid_key"],
      [{ key: "panel-0004-dddd", amountCents: 100, reason: "because" }, "invalid_reason"],
      [{ key: "panel-0004-dddd", amountCents: 100, reason: "other" }, "note_required"],
      [{ key: "panel-0004-dddd", amountCents: 0, reason: "damaged" }, "invalid_amount"],
      [{ key: "panel-0004-dddd", amountCents: 1.5, reason: "damaged" }, "invalid_amount"],
    ]) {
      const response = await refund(env, order.id, body);
      assert.equal((await response.json()).error.code, code, JSON.stringify(body));
    }
    const member = { id: "member@apgo.example", email: "member@apgo.example", role: "member", via: "access" };
    await assert.rejects(requestAdminRefund(env, order.id, { key: "panel-0005-eeee", amountCents: 100, reason: "damaged" }, { actor: member }), { code: "owner_only" });
    const row0 = await getOrder(db, order.id);
    assert.deepEqual(await refundPanel(env, row0, member), { requests: [], reasons: (await refundPanel(env, row0, OWNER_ACTOR)).reasons, allowed: false, why: "owner_only" });

    db.raw.prepare(`INSERT INTO order_disputes (provider, dispute_id, order_id, status, amount_cents, currency, provider_updated_at, created_at, updated_at)
      VALUES ('airwallex', 'dsp_1', ?, 'open', 100, 'USD', ?, ?, ?)`).run(order.id, iso(Date.now()), iso(Date.now()), iso(Date.now()));
    const disputed = await refund(env, order.id, { key: "panel-0006-ffff", amountCents: 100, reason: "damaged" });
    assert.equal((await disputed.json()).error.code, "dispute_open");
    assert.equal(world.calls.refunds.length, 0);
  });
});

test("D55: an order not shipped is refunded only in full; cancel first: cancelled, then refunded; Amazon cannot stop it: nothing refunded", { skip }, async () => {
  await withWorld({ failCancel: 1 }, async (world) => {
    const db = await createD1();
    const env = env0(db);
    const paid = insertOrder(db, "APGO-US-RFND00000003");
    const panel = (await get(env, `/admin/api/orders/${paid.id}`)).refund;
    assert.deepEqual({ fullOnly: panel.fullOnly, canCancelFirst: panel.canCancelFirst }, { fullOnly: true, canCancelFirst: true });
    const part = await refund(env, paid.id, { key: "panel-0007-gggg", amountCents: 500, reason: "customer_request", cancelFirst: true });
    assert.equal((await part.json()).error.code, "full_only");

    const done = await (await refund(env, paid.id, { key: "panel-0008-hhhh", amountCents: paid.total, reason: "customer_request", cancelFirst: true, notify: true })).json();
    assert.equal(done.result.outcome, "requested");
    assert.equal(done.result.cancelled, true);
    assert.equal(done.order.status, "cancelled");
    assert.equal(row(db, "SELECT reason_code FROM order_cancellations WHERE order_id = ?", paid.id).reason_code, "customer_request");
    assert.equal(customerMails(world, /has been cancelled/).length, 1, "the customer is told it is cancelled");

    // With Amazon already, and Amazon refuses to stop it: no refund at all.
    const sent = insertOrder(db, "APGO-US-RFND00000004", { paidAt: iso(Date.now() - DAY) });
    assert.equal((await submitOrderToMcf(env, await getOrder(db, sent.id))).outcome, "submitted");
    assert.equal(row(db, "SELECT fee_cents FROM order_mcf_fees WHERE order_id = ?", sent.id).fee_cents, 891, "Amazon's fee estimate is kept (M9-16)");
    const refused = await (await refund(env, sent.id, { key: "panel-0009-iiii", amountCents: sent.total, reason: "customer_request", cancelFirst: true })).json();
    assert.equal(refused.result.outcome, "not_cancelled");
    assert.match(refused.result.error, /Amazon could not cancel/);
    assert.equal(world.calls.refunds.length, 1, "only the first order was refunded");
    assert.equal(row(db, "SELECT COUNT(*) AS n FROM admin_refunds WHERE order_id = ?", sent.id).n, 0);
    assert.equal(refused.order.status, "paid");
  });
});

test("D55: \"don't email the customer\": no refund notice now or from the provider later", { skip }, async () => {
  await withWorld({}, async (world) => {
    const db = await createD1();
    const env = env0(db);
    const order = insertOrder(db, "APGO-US-RFND00000005", { provider: "paypal", shipped: true, world });
    const quiet = await (await refund(env, order.id, { key: "panel-0010-jjjj", amountCents: 1200, reason: "goodwill", notify: false })).json();
    assert.equal(quiet.result.outcome, "requested");
    assert.equal(world.calls.paypalRefunds.length, 1);
    assert.equal(world.calls.paypalRefunds[0].requestId, "refund-panel-0010-jjjj");
    assert.deepEqual(world.calls.paypalRefunds[0].body.amount, { value: "12.00", currency_code: "USD" });
    assert.doesNotMatch(world.calls.paypalRefunds[0].body.note_to_payer, /goodwill/, "the internal reason never reaches the customer");
    assert.equal(customerMails(world, /refund/i).length, 0);
    const email = row(db, "SELECT status, detail FROM order_emails WHERE order_id = ? AND kind = 'refund:PPREF-1'", order.id);
    assert.equal(email.status, "skipped");
    assert.match(email.detail, /don't email the customer/);

    // A second refund with the notice on: emailed.
    const loud = await (await refund(env, order.id, { key: "panel-0011-kkkk", amountCents: 800, reason: "goodwill", notify: true })).json();
    assert.equal(loud.result.outcome, "requested");
    assert.equal(customerMails(world, /partial refund was accepted/).length, 1);
  });
});

test("M9-25: a refund the provider refuses is shown as failed with the reason; a new press can try again", { skip }, async () => {
  await withWorld({}, async (world) => {
    const db = await createD1();
    const env = env0(db);
    const order = insertOrder(db, "APGO-US-RFND00000006", { shipped: true });
    world.calls.refundFailures = 1;
    const failed = await (await refund(env, order.id, { key: "panel-0012-llll", amountCents: 1000, reason: "damaged" })).json();
    assert.equal(failed.result.outcome, "failed");
    assert.match(failed.result.error, /Refund rejected by the test/);
    assert.equal(failed.order.refund.requests[0].status, "failed");
    assert.equal(failed.order.refund.refundableCents, order.total, "nothing was refunded");
    const same = await (await refund(env, order.id, { key: "panel-0012-llll", amountCents: 1000, reason: "damaged" })).json();
    assert.equal(same.result.outcome, "failed", "the same press is not sent again");
    const retry = await (await refund(env, order.id, { key: "panel-0013-mmmm", amountCents: 1000, reason: "damaged" })).json();
    assert.equal(retry.result.outcome, "requested");
    assert.equal(world.calls.refunds.length, 2);
  });
});

// ---------- I7, M9-13, M9-18: customers ----------

test("M9-13: customers by email: orders, spent after refunds, last order, latest marketing choice; search, sort and the customer page", { skip }, async () => {
  await withWorld({}, async () => {
    const db = await createD1();
    const env = env0(db);
    insertOrder(db, "APGO-US-CSTM00000001", { email: "Ada@Example.com", paidAt: iso(Date.now() - 10 * DAY), shipped: true });
    insertOrder(db, "APGO-US-CSTM00000002", { email: "ada@example.com", paidAt: iso(Date.now() - 3 * DAY), shipping: { street: "9 Other St", phone: "+15125550199" }, marketing: 1, shipped: true });
    insertOrder(db, "APGO-US-CSTM00000003", { email: "bo@example.com", lines: [LINE.d215(3)], shipping: { firstName: "Bo", lastName: "Chen" }, paidAt: iso(Date.now() - DAY) });
    db.raw.prepare(`INSERT INTO order_refunds (id, order_id, payment_intent_id, amount_cents, currency, status, provider_created_at, provider_updated_at, received_at)
      VALUES ('rfd_1', 'APGO-US-CSTM00000001', 'int_APGO-US-CSTM00000001', 2000, 'USD', 'SETTLED', ?, ?, ?)`).run(iso(Date.now()), iso(Date.now()), iso(Date.now()));
    // An unpaid checkout never makes a customer (D36).
    db.raw.prepare(`INSERT INTO orders (id, status, email, shipping_json, shipping_method, lines_json, currency, subtotal_cents, shipping_cents, tax_cents, total_cents, created_at, updated_at)
      VALUES ('APGO-US-CSTM00000004', 'pending', 'cy@example.com', '{}', 'standard', '[]', 'USD', 0, 0, 0, 0, ?, ?)`).run(iso(Date.now()), iso(Date.now()));
    db.raw.prepare("INSERT INTO contact_messages (id, created_at, name, email, message, ip_hash, email_status) VALUES ('CM-1', ?, 'Ada', 'ADA@example.com', 'Where is my order?', 'h', 'sent')").run(iso(Date.now()));

    const list = await get(env, "/admin/api/customers");
    assert.equal(list.total, 2);
    const ada = list.customers.find((c) => c.email.toLowerCase() === "ada@example.com");
    assert.deepEqual({ orders: ada.orders, spent: ada.spentCents, refunded: ada.refundedCents, ref: ada.ref, marketing: ada.marketingOptIn, phone: ada.phone },
      { orders: 2, spent: 2 * (5999 + 799) - 2000, refunded: 2000, ref: "APGO-US-CSTM00000002", marketing: true, phone: "+15125550199" });
    assert.equal(list.customers[0].name, "Bo Chen", "the newest order first");
    assert.deepEqual((await listCustomers(db, { sort: "spent" })).customers.map((c) => c.name), ["Ada Lee", "Bo Chen"]);
    assert.deepEqual((await get(env, "/admin/api/customers?q=chen")).customers.map((c) => c.email), ["bo@example.com"]);
    assert.deepEqual((await get(env, "/admin/api/customers?q=(512)%20555-0199")).customers.map((c) => c.name), ["Ada Lee"]);
    assert.equal((await call(env, "/admin/api/customers?sort=nope", { headers: ownerLogin })).status, 400);

    // Any of the customer's orders opens the same customer; no email in the URL.
    const page = await get(env, "/admin/api/customers/APGO-US-CSTM00000001");
    assert.equal(page.orderList.length, 2);
    assert.equal(page.addresses.length, 2);
    assert.deepEqual(page.messages.map((m) => m.message), ["Where is my order?"]);
    assert.deepEqual(page.privacyRequests, []);
    assert.deepEqual(page.erasure.blockers, []);
    const noted = await (await call(env, "/admin/api/customers/APGO-US-CSTM00000002/notes", post({ body: "VIP: ships to two addresses" }))).json();
    assert.deepEqual(noted.notes.map((n) => [n.author, n.body]), [[OWNER, "VIP: ships to two addresses"]]);
    assert.equal((await get(env, "/admin/api/customers/APGO-US-CSTM00000001")).notes.length, 1);
    assert.equal((await call(env, "/admin/api/customers/APGO-US-CSTM00000004", { headers: ownerLogin })).status, 404, "a checkout is not a customer");
  });
});

// ---------- E11, D53, M9-14, M11-05: privacy requests ----------

test("M11-05: a privacy request has a handler and a date 45 days on; it is on the dashboard and in the daily email until closed", { skip }, async () => {
  await withWorld({}, async () => {
    const db = await createD1();
    const env = env0(db);
    insertOrder(db, "APGO-US-PRVC00000001", { shipped: true });
    const received = new Date(Date.now() - 40 * DAY).toISOString().slice(0, 10);
    const saved = await (await call(env, "/admin/api/customers/APGO-US-PRVC00000001/privacy-requests", post({ kind: "access", receivedAt: received }))).json();
    const request = saved.customer.privacyRequests[0];
    assert.deepEqual({ kind: request.kind, handler: request.handler, status: request.status }, { kind: "access", handler: OWNER, status: "open" });
    assert.equal(Date.parse(request.dueAt) - Date.parse(`${received}T00:00:00Z`), 45 * DAY);
    assert.equal((await call(env, "/admin/api/customers/APGO-US-PRVC00000001/privacy-requests", post({ kind: "sell" }))).status, 400);
    assert.equal((await call(env, "/admin/api/customers/APGO-US-PRVC00000001/privacy-requests", post({ kind: "access", handler: "stranger@example.com" }))).status, 400);

    const reminders = await privacyReminders(db);
    assert.equal(reminders.length, 1);
    assert.equal(reminders[0].urgent, true, "5 days left");
    assert.equal((await get(env, "/admin/api/dashboard")).privacy.length, 1);
    const digest = await digestSections(env);
    assert.match(digest.find((s) => /Privacy requests/.test(s.title)).detail, /see their data, owner@apgo\.example, answer by/);
    assert.ok(row(db, "SELECT 1 AS x FROM admin_audit WHERE action = 'privacy.request_recorded' AND target = 'APGO-US-PRVC00000001'"));

    const closed = await (await call(env, `/admin/api/privacy-requests/${request.id}/close`, post({ outcome: "exported", note: "Sent the file" }))).json();
    assert.equal(closed.request.status, "done");
    assert.equal((await privacyReminders(db)).length, 0);
    assert.equal((await digestSections(env)).some((s) => /Privacy/.test(s.title)), false);
  });
});

test("M9-14: export gives everything kept about the customer as a file, and is logged without the email", { skip }, async () => {
  await withWorld({}, async () => {
    const db = await createD1();
    const env = env0(db);
    insertOrder(db, "APGO-US-PRVC00000002", { shipped: true });
    db.raw.prepare("INSERT INTO order_attribution (order_id, fbp, fbc, client_ip, created_at) VALUES ('APGO-US-PRVC00000002', 'fb.1.1.2', 'fb.1.1.abc', '203.0.113.9', ?)").run(iso(Date.now()));
    db.raw.prepare("INSERT INTO contact_messages (id, created_at, name, email, message, ip_hash, email_status) VALUES ('CM-2', ?, 'Ada', 'ada@example.com', 'Hello', 'h', 'sent')").run(iso(Date.now()));
    const response = await call(env, "/admin/api/customers/APGO-US-PRVC00000002/export", { headers: ownerLogin });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Disposition"), /attachment; filename="apgo-customer-APGO-US-PRVC00000002\.json"/);
    const file = await response.json();
    assert.equal(file.customer.email, "ada@example.com");
    assert.equal(file.orders[0].shipping.street, "100 Example Ave");
    assert.equal(file.orders[0].adData[0].client_ip, "203.0.113.9");
    assert.equal(file.orders[0].shipments[0].tracking_number, "1Z999");
    assert.deepEqual(file.contactMessages.map((m) => m.message), ["Hello"]);
    const logged = row(db, "SELECT actor, target, detail_json FROM admin_audit WHERE action = 'customer.exported'");
    assert.deepEqual({ actor: logged.actor, target: logged.target }, { actor: OWNER, target: "APGO-US-PRVC00000002" });
    assert.doesNotMatch(logged.detail_json, /ada@example/);
  });
});

test("D53: deleting keeps the amounts and removes the person; not while an order is open; the email must be typed", { skip }, async () => {
  await withWorld({}, async () => {
    const db = await createD1();
    const env = env0(db);
    const done = insertOrder(db, "APGO-US-PRVC00000003", { shipped: true, tax: 412 });
    const open = insertOrder(db, "APGO-US-PRVC00000004", { paidAt: iso(Date.now() - DAY) });
    db.raw.prepare("INSERT INTO order_attribution (order_id, fbp, created_at) VALUES (?, 'fb.1.1.2', ?)").run(done.id, iso(Date.now()));
    db.raw.prepare("INSERT INTO order_notes (order_id, author, body, created_at) VALUES (?, ?, 'Ada called from 512-555-0148', ?)").run(done.id, OWNER, iso(Date.now()));
    db.raw.prepare("INSERT INTO order_audit (order_id, action, actor, detail_json, created_at) VALUES (?, 'order.address_changed', ?, ?, ?)")
      .run(done.id, OWNER, JSON.stringify({ reason: "typo", before: { street: "1 Old St" }, after: { street: "100 Example Ave" } }), iso(Date.now()));
    db.raw.prepare("INSERT INTO contact_messages (id, created_at, name, email, message, ip_hash, email_status) VALUES ('CM-3', ?, 'Ada', 'ada@example.com', 'Delete me', 'h', 'sent')").run(iso(Date.now()));
    await call(env, `/admin/api/customers/${done.id}/notes`, post({ body: "Prefers email" }));
    await call(env, `/admin/api/customers/${done.id}/privacy-requests`, post({ kind: "delete" }));

    const blocked = await call(env, `/admin/api/customers/${done.id}/erase`, post({ confirm: "ada@example.com" }));
    assert.equal(blocked.status, 409);
    assert.deepEqual((await blocked.json()).error.blockers, [{ orderId: open.id, code: "open_order" }]);
    db.raw.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(open.id);
    db.raw.prepare("INSERT INTO order_cancellations (order_id, from_stage, reason_code, note, actor, created_at) VALUES (?, 'paid', 'customer_request', 'Ada changed her mind', ?, ?)").run(open.id, OWNER, iso(Date.now()));
    assert.equal((await call(env, `/admin/api/customers/${done.id}/erase`, post({ confirm: "someone@example.com" }))).status, 400);

    const erased = await (await call(env, `/admin/api/customers/${done.id}/erase`, post({ confirm: " ADA@example.com " }))).json();
    assert.deepEqual(erased.result, { erased: true, orders: 2 });
    assert.equal(erased.customer.erased, true);
    const kept = row(db, "SELECT email, marketing_opt_in, shipping_json, total_cents, tax_cents, lines_json FROM orders WHERE id = ?", done.id);
    assert.deepEqual({ email: kept.email, shipping: JSON.parse(kept.shipping_json), total: kept.total_cents, tax: kept.tax_cents },
      { email: "", shipping: { state: "TX", erased: 1 }, total: done.total, tax: 412 });
    assert.equal(JSON.parse(kept.lines_json)[0].sku, "D204", "what was sold stays");
    assert.equal(row(db, "SELECT COUNT(*) AS n FROM order_attribution").n, 0);
    assert.equal(row(db, "SELECT body FROM order_notes WHERE order_id = ?", done.id).body, "[Removed for a privacy request]");
    assert.deepEqual(JSON.parse(row(db, "SELECT detail_json FROM order_audit WHERE action = 'order.address_changed'").detail_json), { reason: "typo" });
    assert.equal(row(db, "SELECT note FROM order_cancellations WHERE order_id = ?", open.id).note, "");
    assert.deepEqual(row(db, "SELECT name, email, message FROM contact_messages WHERE id = 'CM-3'"), { name: "", email: "", message: "[Removed for a privacy request]" });
    assert.equal(row(db, "SELECT COUNT(*) AS n FROM customer_notes").n, 0);
    const request = row(db, "SELECT customer, status, outcome FROM privacy_requests");
    assert.match(request.customer, /^deleted:[0-9a-f]{16}$/);
    assert.deepEqual({ status: request.status, outcome: request.outcome }, { status: "done", outcome: "deleted" });
    const logged = row(db, "SELECT target, detail_json FROM admin_audit WHERE action = 'customer.erased'");
    assert.equal(logged.target, done.id);
    assert.doesNotMatch(JSON.stringify(rows(db, "SELECT * FROM admin_audit")), /ada@example/i, "the activity log never keeps the email");
    // The money still counts; the person is gone from the customer list and the order list.
    assert.equal((await get(env, "/admin/api/customers")).total, 0);
    const listed = (await get(env, "/admin/api/orders")).orders.find((o) => o.id === done.id);
    assert.deepEqual({ name: listed.name, erased: listed.erased, total: listed.totalCents }, { name: "", erased: true, total: done.total });
    assert.equal((await call(env, `/admin/api/customers/${done.id}/export`, { headers: ownerLogin })).status, 409);
  });
});

// ---------- I4, I8, D56, M9-06, M9-15, M9-16: reports and exports ----------

test("M9-15, M9-16: the report adds up per product and payment method, takes refunds on their day, and compares shipping with Amazon's fee", { skip }, async () => {
  await withWorld({}, async (world) => {
    const db = await createD1();
    const env = env0(db);
    const now = Date.now();
    const a = insertOrder(db, "APGO-US-REPT00000001", { lines: [LINE.d204(2)], tax: 1000, paidAt: iso(now - 60_000) });
    const b = insertOrder(db, "APGO-US-REPT00000002", { lines: [LINE.d215(1)], provider: "paypal", world, paidAt: iso(now - 120_000) });
    insertOrder(db, "APGO-US-REPT00000003", { paidAt: iso(now - 400 * DAY) }); // outside every period here
    db.raw.prepare("INSERT INTO order_mcf_fees (order_id, fee_cents, currency, tier, captured_at) VALUES (?, 891, 'USD', 'STANDARD', ?)").run(a.id, iso(now));
    db.raw.prepare(`INSERT INTO order_refunds (id, order_id, payment_intent_id, amount_cents, currency, status, provider_created_at, provider_updated_at, received_at, provider)
      VALUES ('rfd_a', ?, ?, 1500, 'USD', 'ACCEPTED', ?, ?, ?, 'airwallex'), ('rfd_x', ?, ?, 999, 'USD', 'FAILED', ?, ?, ?, 'airwallex')`)
      .run(a.id, a.ref, iso(now), iso(now), iso(now), a.id, a.ref, iso(now), iso(now), iso(now));
    const report = await get(env, "/admin/api/reports/sales?preset=today");
    assert.equal(report.period.timeZone, "Asia/Taipei");
    assert.equal(report.orders, 2);
    assert.equal(report.grossCents, a.total + b.total);
    assert.equal(report.productsCents, 2 * 5999 + 2999);
    assert.equal(report.taxCents, 1000);
    assert.equal(report.shippingCents, 2 * 799);
    assert.deepEqual(report.refunds, { cents: 1500, count: 1, orders: 1 }, "a failed refund never counts");
    assert.equal(report.netCents, a.total + b.total - 1500);
    assert.equal(report.averageCents, Math.round((a.total + b.total) / 2));
    assert.deepEqual(report.products.map((p) => [p.sku, p.units, p.salesCents]), [["D204", 2, 11998], ["D215", 1, 2999]]);
    assert.deepEqual(report.payments.map((p) => [p.provider, p.orders, p.paidCents, p.refundedCents]), [["airwallex", 1, a.total, 1500], ["paypal", 1, b.total, 0]]);
    assert.deepEqual(report.shippingVsAmazon, { orders: 1, withoutEstimate: 1, chargedCents: 799, feeCents: 891, differenceCents: -92 });
    assert.equal(report.days.length, 1);
    assert.equal(report.days[0].paidCents, a.total + b.total);

    // Periods: the team's calendar; a custom range is checked.
    const month = periodOf(env, { preset: "month" });
    assert.equal(month.from.slice(8), "01");
    const last = periodOf(env, { preset: "last_month" });
    assert.ok(last.toMs === month.fromMs && last.from.endsWith("-01"));
    assert.equal((await call(env, "/admin/api/reports/sales?preset=custom&from=2026-10-09&to=2026-10-01", { headers: ownerLogin })).status, 400);
    assert.equal((await call(env, "/admin/api/reports/sales?preset=custom&from=2026-02-30&to=2026-03-01", { headers: ownerLogin })).status, 400);
    const custom = await salesReport(env, periodOf(env, { preset: "custom", from: "2020-01-01", to: "2020-01-31" }));
    assert.equal(custom.orders, 0);
    assert.equal(custom.days.length, 31);
  });
});

test("M9-06: the payments CSV lists every payment and refund of the period and adds up to paid minus refunded; the orders CSV is safe to open", { skip }, async () => {
  await withWorld({}, async (world) => {
    const db = await createD1();
    const env = env0(db);
    const now = Date.now();
    const a = insertOrder(db, "APGO-US-CSV000000001", { shipping: { firstName: "=HYPERLINK(\"x\")", lastName: "Lee" }, paidAt: iso(now - 60_000), shipped: true });
    const b = insertOrder(db, "APGO-US-CSV000000002", { provider: "paypal", world, paidAt: iso(now - 30_000) });
    db.raw.prepare(`INSERT INTO order_refunds (id, order_id, payment_intent_id, amount_cents, currency, status, provider_created_at, provider_updated_at, received_at, provider)
      VALUES ('rfd_csv', ?, ?, 700, 'USD', 'SETTLED', ?, ?, ?, 'airwallex')`).run(a.id, a.ref, iso(now), iso(now), iso(now));
    db.raw.prepare(`INSERT INTO checkout_payments (provider, ref, checkout_id, amount_cents, currency, status, created_at, updated_at)
      VALUES ('airwallex', 'int_dup', ?, ?, 'USD', 'duplicate_refunded', ?, ?)`).run(a.id, a.total, iso(now - 10_000), iso(now - 5_000));
    // C20, M15: PayPal's fee and net for b are known; a's fee is not read yet (an "unknown" row is never shown).
    const fee = db.raw.prepare(`INSERT INTO payment_fees (provider, ref, order_id, provider_ref, gross_cents, fee_cents, net_cents, currency, status, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?)`);
    fee.run("paypal", b.ref, b.id, "CAPTURE-B", b.total, 312, b.total - 312, "final", iso(now));
    fee.run("airwallex", a.ref, a.id, "", 0, 0, 0, "unknown", iso(now));

    const payments = await call(env, "/admin/api/exports/payments.csv?preset=today", { headers: ownerLogin });
    assert.equal(payments.status, 200);
    assert.match(payments.headers.get("Content-Type"), /^text\/csv/);
    assert.match(payments.headers.get("Content-Disposition"), /attachment; filename="apgo-payments-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv"/);
    const lines = (await payments.text()).replace(/^﻿/, "").trim().split("\r\n");
    assert.match(lines[0], /^date \(Asia\/Taipei\),date \(UTC\),type,order,provider,reference,amount,currency,status,fee,net received,fee currency,provider reference$/);
    const paypalLine = lines.find((line) => line.includes(b.id) && line.includes('"payment"')).split(",");
    assert.deepEqual(paypalLine.slice(9), ["3.12", ((b.total - 312) / 100).toFixed(2), '"USD"', '"CAPTURE-B"'], "fee, net received and PayPal's capture id");
    const cardLine = lines.find((line) => line.includes(a.id) && line.includes('"payment"')).split(",");
    assert.deepEqual(cardLine.slice(9), ["", "", '""', '""'], "a fee not read yet is blank, never 0");
    const amounts = lines.slice(1).map((line) => Number(line.split(",")[6]));
    assert.equal(lines.length - 1, 5, "2 payments, 1 refund, a second payment and its refund");
    assert.equal(Math.round(amounts.reduce((sum, value) => sum + value, 0) * 100), a.total + b.total - 700);
    assert.ok(lines.some((line) => line.includes('"refund"') && line.includes("-7.00")));

    const orders = await (await call(env, "/admin/api/exports/orders.csv?preset=today", { headers: ownerLogin })).text();
    assert.match(orders, /"'=HYPERLINK\(""x""\) Lee"/, "a formula in a name is defused");
    assert.match(orders, /"APGO-US-CSV000000001",.*,"shipped|"APGO-US-CSV000000001"/);
    assert.equal(orders.replace(/^﻿/, "").trim().split("\r\n").length, 3);
    assert.deepEqual(rows(db, "SELECT action FROM admin_audit WHERE action LIKE 'export.%' ORDER BY id").map((r) => r.action), ["export.payments", "export.orders"]);
  });
});
