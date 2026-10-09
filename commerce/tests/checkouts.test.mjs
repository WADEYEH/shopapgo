// Checkouts (PR 3-4, D36): an order exists only once paid; one checkout per purchase; every payment object recorded;
// a second payment refunded; 24-hour expiry; 30-day deletion of personal details; the Unfinished checkouts list.
// Acceptance M3-13, M3-18, M4-03, M4-04, M5-08, M9-22. Airwallex and PayPal are small in-memory fakes here (each
// payment object gets its own id); nothing reaches the network.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import worker from "../worker/index.js";
import { resetAirwallexTokenCache } from "../worker/airwallex.js";
import { resetPaypalTokenCache } from "../worker/paypal.js";
import { expireCheckouts, purgeCheckouts } from "../worker/checkout-jobs.js";
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

const env0 = (db, extra = {}) => ({
  DB: db,
  AIRWALLEX_CLIENT_ID: "cid", AIRWALLEX_API_KEY: "key", AIRWALLEX_WEBHOOK_SECRET: WEBHOOK_SECRET, AIRWALLEX_ENV: "demo", AIRWALLEX_RETRY_DELAY_MS: "0",
  PAYPAL_CLIENT_ID: "paypal_cid", PAYPAL_CLIENT_SECRET: "paypal_secret", PAYPAL_ENV: "sandbox", PAYPAL_RETRY_DELAY_MS: "0",
  ADMIN_TOKEN: TOKEN, ADMIN_OWNER_EMAIL: OWNER,
  RESEND_API_KEY: "rk_test_key", CUSTOMER_EMAIL_FROM: "APGO <orders@shop.example>", ORDER_NOTIFY_EMAIL_API_URL: MAIL_URL,
  ASSETS: { fetch: async () => new Response("ok") },
  ...extra,
});

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Airwallex: intents keyed by id, the same request_id returns the same intent; cancel; duplicate refunds.
// PayPal: one order per create, capture completes it; refunds.
function createProviders() {
  const intents = new Map();
  const byRequest = new Map();
  const paypal = new Map();
  const calls = { creates: [], cancels: [], refunds: [], paypalCreates: 0, captures: [], paypalRefunds: [], mails: [] };
  let n = 0;
  const shipping = { name: { full_name: "Ada Lee" }, address: { address_line_1: "100 Example Ave", address_line_2: "Apt 4", admin_area_2: "Austin", admin_area_1: "TX", postal_code: "78701", country_code: "US" } };
  const paypalView = (id) => {
    const row = paypal.get(id);
    return {
      id, status: row.status,
      purchase_units: [{ custom_id: row.storeOrderId, amount: { currency_code: "USD", value: row.value }, shipping,
        payments: row.status === "COMPLETED" ? { captures: [{ id: `CAP-${id}`, status: "COMPLETED", amount: { currency_code: "USD", value: row.value } }] } : undefined }],
      links: [{ rel: "approve", href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}` }],
    };
  };
  async function handler(href, init) {
    const method = init.method ?? "GET";
    if (href === MAIL_URL) { calls.mails.push(JSON.parse(init.body)); return json(200, { id: crypto.randomUUID() }); }
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
      calls.cancels.push(cancel[1]);
      const intent = intents.get(cancel[1]);
      if (intent.status === "SUCCEEDED") return json(400, { code: "invalid_status_for_operation", message: "succeeded" });
      intent.status = "CANCELLED";
      return json(200, intent);
    }
    const intentGet = href.match(/\/payment_intents\/([^/?]+)$/);
    if (intentGet && method === "GET") return intents.has(intentGet[1]) ? json(200, intents.get(intentGet[1])) : json(404, { code: "not_found" });
    if (href.endsWith("/refunds/create")) { calls.refunds.push(JSON.parse(init.body)); return json(201, { id: `rfd_${calls.refunds.length}`, status: "RECEIVED" }); }
    if (href.endsWith("/v1/oauth2/token")) return json(200, { access_token: "pp_tok", expires_in: 32400 });
    if (href.endsWith("/v2/checkout/orders") && method === "POST") {
      const body = JSON.parse(init.body);
      calls.paypalCreates += 1;
      const id = `PP${calls.paypalCreates}`;
      paypal.set(id, { status: "CREATED", storeOrderId: body.purchase_units[0].custom_id, value: body.purchase_units[0].amount.value });
      return json(201, paypalView(id));
    }
    const capture = href.match(/\/v2\/checkout\/orders\/([^/]+)\/capture$/);
    if (capture) { calls.captures.push(capture[1]); paypal.get(capture[1]).status = "COMPLETED"; return json(201, paypalView(capture[1])); }
    const paypalGet = href.match(/\/v2\/checkout\/orders\/([^/?]+)$/);
    if (paypalGet) return paypal.has(paypalGet[1]) ? json(200, paypalView(paypalGet[1])) : json(404, { name: "RESOURCE_NOT_FOUND" });
    const paypalRefund = href.match(/\/v2\/payments\/captures\/([^/]+)\/refund$/);
    if (paypalRefund) { calls.paypalRefunds.push(paypalRefund[1]); return json(201, { id: "PPREF1", status: "COMPLETED" }); }
    throw new Error(`unexpected network call: ${method} ${href}`);
  }
  return { intents, paypal, calls, handler, succeed: (id) => { intents.get(id).status = "SUCCEEDED"; } };
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
const post = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const cart = (qty = 1, extra = {}) => ({
  items: [{ sku: "d204", qty }],
  contact: { email: "ada@example.com", phone: "(512) 555-0134", marketingOptIn: false },
  shipping: { firstName: "Ada", lastName: "Lee", street: "100 Example Ave", street2: "Apt 4", city: "Austin", state: "TX", zip: "78701" },
  method: "standard",
  ...extra,
});
const session = async (env, body) => (await call(env, "/api/checkout/session", post(body))).json();
const paypalOrder = async (env, body) => (await call(env, "/api/checkout/paypal/order", post(body))).json();
function webhook(intent) {
  const body = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, name: "payment_intent.succeeded", data: { object: intent } });
  const timestamp = String(Date.now());
  return { method: "POST", headers: { "x-timestamp": timestamp, "x-signature": createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}${body}`).digest("hex") }, body };
}
const pay = async (env, providers, intentId) => {
  providers.succeed(intentId);
  assert.equal((await call(env, "/api/webhooks/airwallex", webhook(providers.intents.get(intentId)))).status, 200);
};
const rows = (db, sql, ...args) => db.raw.prepare(sql).all(...args).map((r) => ({ ...r }));
const row = (db, sql, ...args) => rows(db, sql, ...args)[0] ?? null;
const adminGet = async (env, path) => (await call(env, path, { headers: bearer })).json();
const alerts = (calls) => calls.mails.filter((m) => m.to.includes(OWNER));

// ---------- M4-03 ----------

test("M4-03: a checkout is not an order until it is paid; then the order keeps the checkout's id and locked amount", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withProviders(async (providers) => {
    const started = await session(env, cart(2));
    assert.match(started.orderId, /^APGO-US-/);
    assert.equal(started.intent.id, "int_1");
    const list = await adminGet(env, "/admin/api/orders");
    assert.deepEqual([list.orders.length, list.counts], [0, { paid: 0, review: 0, cancelled: 0 }], "not an order (M9-22)");
    const checkouts = await adminGet(env, "/admin/api/checkouts");
    assert.deepEqual(checkouts.checkouts.map((c) => [c.id, c.status, c.email, c.totalCents]), [[started.orderId, "open", "ada@example.com", started.quote.totalCents]]);

    await pay(env, providers, "int_1");
    const after = await adminGet(env, "/admin/api/orders");
    assert.deepEqual(after.orders.map((o) => [o.id, o.status, o.totalCents]), [[started.orderId, "paid", started.quote.totalCents]]);
    assert.equal((await adminGet(env, "/admin/api/checkouts")).checkouts.length, 0);
    assert.equal(row(db, "SELECT status FROM checkout_payments WHERE ref = 'int_1'").status, "succeeded");
  });
});

// ---------- M3-13 ----------

test("M3-13: a retry, a refresh or a second tab reuse the checkout and its PaymentIntent; a new amount replaces it", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withProviders(async (providers) => {
    const first = await session(env, cart(1));
    const again = await session(env, cart(1, { checkoutId: first.orderId })); // refresh / second tab: same id from storage
    assert.equal(again.orderId, first.orderId);
    assert.deepEqual(again.intent, first.intent, "the same PaymentIntent, so only one can be charged");
    assert.equal(providers.calls.creates.length, 1);

    const changed = await session(env, cart(3, { checkoutId: first.orderId }));
    assert.equal(changed.orderId, first.orderId, "same checkout, priced again");
    assert.notEqual(changed.intent.id, first.intent.id);
    assert.deepEqual(providers.calls.cancels, [first.intent.id], "the old amount's intent is cancelled");
    assert.equal(providers.calls.creates.at(-1).request_id, `${first.orderId}-2`);
    assert.equal(row(db, "SELECT total_cents FROM orders WHERE id = ?", first.orderId).total_cents, changed.quote.totalCents);
    assert.equal(row(db, "SELECT COUNT(*) AS n FROM orders").n, 1, "one checkout");

    // Switching to PayPal stays the same checkout; paying with the old (cancelled) intent is impossible.
    const pp = await paypalOrder(env, cart(3, { checkoutId: first.orderId }));
    assert.equal(pp.orderId, first.orderId);
    assert.equal(row(db, "SELECT COUNT(*) AS n FROM orders").n, 1);
    assert.deepEqual(rows(db, "SELECT provider, ref, status FROM checkout_payments ORDER BY created_at, rowid").map((r) => `${r.provider}:${r.ref}:${r.status}`), ["airwallex:int_1:voided", `airwallex:${changed.intent.id}:open`, "paypal:PP1:open"]);

    // A checkout id that is not open any more (or made up) starts a new checkout.
    await pay(env, providers, changed.intent.id);
    const next = await session(env, cart(1, { checkoutId: first.orderId }));
    assert.notEqual(next.orderId, first.orderId);
    assert.equal((await session(env, cart(1, { checkoutId: "APGO-US-NOTAREALID00" }))).orderId.length, 20);
  });
});

test("M3-13: a page that asks again after the checkout was paid elsewhere is sent to the order, not charged again", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withProviders(async (providers) => {
    const first = await session(env, cart(1));
    providers.succeed(first.intent.id); // paid in another tab; the webhook has not arrived yet
    const again = await session(env, cart(1, { checkoutId: first.orderId }));
    assert.deepEqual([again.orderId, again.settled, again.intent], [first.orderId, "paid", undefined]);
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", first.orderId).status, "paid");
    assert.equal(providers.calls.creates.length, 1);
  });
});

test("PayPal: a replaced PayPal order or a checkout paid by card is never captured", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withProviders(async (providers) => {
    const first = await paypalOrder(env, cart(1));
    const second = await paypalOrder(env, cart(1, { checkoutId: first.orderId }));
    assert.equal(second.orderId, first.orderId);
    const replaced = await call(env, "/api/checkout/paypal/capture", post({ paypalOrderId: first.paypal.id }));
    assert.equal(replaced.status, 409);
    assert.equal((await replaced.json()).error.code, "payment_replaced");

    const card = await session(env, cart(1, { checkoutId: first.orderId }));
    await pay(env, providers, card.intent.id);
    const closed = await call(env, "/api/checkout/paypal/capture", post({ paypalOrderId: second.paypal.id }));
    assert.equal(closed.status, 409);
    assert.equal((await closed.json()).error.code, "checkout_closed");
    assert.deepEqual(providers.calls.captures, [], "PayPal was never charged");
    assert.equal(row(db, "SELECT status FROM checkout_payments WHERE ref = ?", second.paypal.id).status, "voided", "voided once the card paid");
  });
});

// ---------- M5-08 ----------

test("M5-08: card started, PayPal paid, then the card payment succeeds too: one order, the card payment refunded, team told", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withProviders(async (providers) => {
    const card = await session(env, cart(1));
    const pp = await paypalOrder(env, cart(1, { checkoutId: card.orderId }));
    const captured = await (await call(env, "/api/checkout/paypal/capture", post({ paypalOrderId: pp.paypal.id }))).json();
    assert.equal(captured.status, "paid");
    assert.deepEqual(providers.calls.cancels, [card.intent.id], "once PayPal paid, the card intent is cancelled");

    // The card payment was already going through in the other tab and succeeds anyway.
    providers.intents.get(card.intent.id).status = "SUCCEEDED";
    await call(env, "/api/webhooks/airwallex", webhook(providers.intents.get(card.intent.id)));
    await call(env, "/api/webhooks/airwallex", webhook(providers.intents.get(card.intent.id))); // delivered twice
    assert.equal(row(db, "SELECT COUNT(*) AS n FROM orders").n, 1);
    assert.equal(row(db, "SELECT payment_intent_id FROM orders").payment_intent_id, pp.paypal.id, "the order stays paid by PayPal");
    assert.deepEqual(providers.calls.refunds.map((r) => [r.payment_intent_id, r.amount, r.request_id]), [[card.intent.id, card.quote.totalCents / 100, `dup-${card.intent.id}`]], "refunded once, in full");
    assert.equal(row(db, "SELECT status FROM checkout_payments WHERE ref = ?", card.intent.id).status, "duplicate_refunded");
    assert.equal(alerts(providers.calls).filter((m) => /was paid twice/.test(m.subject)).length, 1);
    assert.ok(rows(db, "SELECT action FROM order_audit").some((a) => a.action === "order.duplicate_payment_refunded"));
  });
});

// ---------- M3-18, M4-04 ----------

test("M3-18: after 24 hours an unpaid checkout expires; processing payments keep it open; a payment that succeeded makes the order", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withProviders(async (providers) => {
    const idle = await session(env, cart(1));
    const processing = await session(env, cart(2));
    const succeeded = await session(env, cart(3));
    const pp = await paypalOrder(env, cart(1));
    const young = await session(env, cart(4));
    const old = new Date(Date.now() - 25 * HOUR).toISOString();
    for (const id of [idle.orderId, processing.orderId, succeeded.orderId, pp.orderId]) db.raw.prepare("UPDATE orders SET created_at = ? WHERE id = ?").run(old, id);
    providers.intents.get(processing.intent.id).status = "PENDING";
    providers.intents.get(succeeded.intent.id).status = "SUCCEEDED";

    const summary = await expireCheckouts(env);
    assert.deepEqual(summary, { checked: 4, expired: 2, paid: 1, processing: 1, retry: 0 });
    const status = (id) => row(db, "SELECT status, expired_at FROM orders WHERE id = ?", id);
    assert.equal(status(idle.orderId).status, "expired");
    assert.ok(status(idle.orderId).expired_at);
    assert.ok(providers.calls.cancels.includes(idle.intent.id), "its payment object was cancelled");
    assert.equal(status(processing.orderId).status, "pending");
    assert.equal(status(succeeded.orderId).status, "paid");
    assert.equal(status(pp.orderId).status, "expired");
    assert.equal(row(db, "SELECT status FROM checkout_payments WHERE ref = ?", pp.paypal.id).status, "voided");
    assert.equal(status(young.orderId).status, "pending", "younger than 24 hours");
    assert.equal(providers.calls.mails.filter((m) => m.to.includes("ada@example.com") && /expire/i.test(m.subject)).length, 0, "no email to the shopper");
    // An expired checkout cannot be paid with PayPal any more.
    const late = await call(env, "/api/checkout/paypal/capture", post({ paypalOrderId: pp.paypal.id }));
    assert.equal(late.status, 409);
  });
});

test("M4-04: a payment that succeeds after the checkout expired still makes the order, and the team is told", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withProviders(async (providers) => {
    const started = await session(env, cart(1));
    db.raw.prepare("UPDATE orders SET status = 'expired', expired_at = ? WHERE id = ?").run(new Date().toISOString(), started.orderId);
    await pay(env, providers, started.intent.id);
    assert.equal(row(db, "SELECT status FROM orders WHERE id = ?", started.orderId).status, "paid");
    assert.equal(alerts(providers.calls).filter((m) => /paid after its checkout expired/.test(m.subject)).length, 1);
  });
});

test("legacy unpaid rows from before checkouts (one payment id on the row) expire the same way", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withProviders(async (providers) => {
    providers.intents.set("int_legacy", { id: "int_legacy", status: "REQUIRES_PAYMENT_METHOD", amount: 10, currency: "USD", merchant_order_id: "APGO-US-0000000000AB" });
    const old = new Date(Date.now() - 3 * DAY).toISOString();
    db.raw.prepare(`INSERT INTO orders (id, status, email, shipping_json, shipping_method, lines_json, currency, subtotal_cents, shipping_cents, tax_cents, total_cents, payment_intent_id, created_at, updated_at)
      VALUES ('APGO-US-0000000000AB', 'pending', 'old@example.com', '{"state":"WA"}', 'standard', '[]', 'USD', 1000, 0, 0, 1000, 'int_legacy', ?, ?)`).run(old, old);
    assert.equal((await expireCheckouts(env)).expired, 1);
    assert.deepEqual(providers.calls.cancels, ["int_legacy"]);
    assert.equal(row(db, "SELECT status FROM checkout_payments WHERE ref = 'int_legacy'").status, "voided");
  });
});

// ---------- 30 days ----------

test("30 days: an unpaid checkout keeps only items, amounts and the state; ad IP and browser go for every order", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withProviders(async (providers) => {
    const unpaid = await session(env, cart(1));
    const paid = await session(env, cart(2));
    await pay(env, providers, paid.intent.id);
    const old = new Date(Date.now() - 31 * DAY).toISOString();
    db.raw.prepare("UPDATE orders SET created_at = ?, status = CASE WHEN status = 'pending' THEN 'expired' ELSE status END").run(old);
    for (const id of [unpaid.orderId, paid.orderId]) {
      db.raw.prepare("INSERT INTO order_attribution (order_id, fbp, fbc, fbclid, source_url, client_ip, client_user_agent, created_at) VALUES (?, 'fb.1.1.1', '', '', 'https://www.shopapgo.com/checkout', '203.0.113.9', 'Mozilla/5.0', ?)").run(id, old);
    }
    const result = await purgeCheckouts(env);
    assert.deepEqual(result, { checkouts: 1, attribution: 1, ipAndBrowser: 1 });
    const gone = row(db, "SELECT email, shipping_json, purged_at, lines_json, total_cents FROM orders WHERE id = ?", unpaid.orderId);
    assert.equal(gone.email, "");
    assert.deepEqual(JSON.parse(gone.shipping_json), { state: "TX", purged: 1 });
    assert.ok(gone.purged_at);
    assert.equal(JSON.parse(gone.lines_json).length, 1, "items and amounts stay for statistics");
    assert.equal(row(db, "SELECT COUNT(*) AS n FROM order_attribution WHERE order_id = ?", unpaid.orderId).n, 0);
    const kept = row(db, "SELECT email FROM orders WHERE id = ?", paid.orderId);
    assert.equal(kept.email, "ada@example.com", "orders keep their details");
    assert.deepEqual(row(db, "SELECT client_ip, client_user_agent, fbp FROM order_attribution WHERE order_id = ?", paid.orderId), { client_ip: "", client_user_agent: "", fbp: "fb.1.1.1" });
    assert.equal((await purgeCheckouts(env)).checkouts, 0, "once only");
    const listed = await adminGet(env, "/admin/api/checkouts");
    assert.deepEqual(listed.checkouts.map((c) => [c.status, c.email, c.purged]), [["expired", null, true]]);
  });
});

// ---------- M9-22 ----------

test("M9-22: Unfinished checkouts list shows status, email, items, amount and why a payment failed; filters and search", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withProviders(async () => {
    const a = await session(env, cart(1));
    const b = await session(env, cart(2, { contact: { email: "sam@example.com", phone: "(512) 555-0134", marketingOptIn: false } }));
    db.raw.prepare("UPDATE orders SET status = 'expired' WHERE id = ?").run(b.orderId);
    db.raw.prepare(`INSERT INTO order_payment_failures (attempt_id, order_id, event_id, event_name, failure_code, provider_code, message, trace_id, occurred_at, received_at)
      VALUES ('att_1', ?, 'evt_1', 'payment_attempt.authorization_failed', 'authorization_failed', 'issuer_declined', 'The card was declined.', '', ?, ?)`).run(a.orderId, new Date().toISOString(), new Date().toISOString());
    const all = await adminGet(env, "/admin/api/checkouts");
    assert.deepEqual(all.counts, { open: 1, expired: 1 });
    const first = all.checkouts.find((c) => c.id === a.orderId);
    assert.deepEqual([first.status, first.items, first.lastFailure], ["open", [{ sku: "D204", name: first.items[0].name, qty: 1 }], { code: "authorization_failed", message: "The card was declined.", count: 1 }]);
    assert.deepEqual((await adminGet(env, "/admin/api/checkouts?status=expired")).checkouts.map((c) => c.id), [b.orderId]);
    assert.deepEqual((await adminGet(env, "/admin/api/checkouts?q=sam@")).checkouts.map((c) => c.id), [b.orderId]);
    assert.equal((await call(env, "/admin/api/checkouts?status=bogus", { headers: bearer })).status, 400);
    assert.equal((await adminGet(env, "/admin/api/orders")).orders.length, 0);
  });
});
