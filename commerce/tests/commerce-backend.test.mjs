// Backend behaviour against a real SQLite-backed D1 stand-in: payment settlement,
// webhook handling, admin auth, notifications, and the Airwallex client's retries.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import worker from "../worker/index.js";
import { AirwallexError, createPaymentIntent, resetAirwallexTokenCache, retrievePaymentIntent } from "../worker/airwallex.js";
import { buildNotification, notificationChannels, notifyOrderPaid } from "../worker/notify.js";
import { buildConfirmationEmail, buildShipmentEmail, customerEmailConfig } from "../worker/customer-email.js";
import { createD1, sqliteAvailable } from "./helpers/d1.mjs";

// Safety net: a test that forgets to stub fetch must fail instead of calling the internet.
globalThis.fetch = async (url) => { throw new Error(`unexpected real network call: ${url}`); };

const hasSqlite = await sqliteAvailable();
const skip = hasSqlite ? false : "node:sqlite needs Node 22.5+";

const ADMIN_TOKEN = "test-admin-token-0123456789";
const WEBHOOK_SECRET = "whsec_unit_test";
const ORIGIN = "https://store.example";

const baseEnv = (db, extra = {}) => ({
  DB: db,
  AIRWALLEX_CLIENT_ID: "cid",
  AIRWALLEX_API_KEY: "key",
  AIRWALLEX_WEBHOOK_SECRET: WEBHOOK_SECRET,
  AIRWALLEX_ENV: "demo",
  AIRWALLEX_RETRY_DELAY_MS: "0",
  ADMIN_TOKEN,
  ASSETS: { fetch: async () => new Response("<h1>admin page</h1>", { headers: { "Content-Type": "text/html" } }) },
  ...extra,
});

const ctxStub = () => ({ waitUntil(promise) { (this.pending ||= []).push(promise); }, async settled() { await Promise.all(this.pending ?? []); } });

// Replaces global fetch for one test; `handler(url, init)` returns a Response.
async function withFetch(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls);
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const LOGIN_OK = jsonResponse.bind(null, 201, { token: "tok_1", expires_at: new Date(Date.now() + 30 * 60_000).toISOString().replace(/\.\d+Z$/, "+0000") });

function airwallexFake({ intent = {}, onCreate } = {}) {
  return (url, init) => {
    if (url.endsWith("/authentication/login")) return LOGIN_OK();
    if (url.endsWith("/payment_intents/create")) {
      const payload = JSON.parse(init.body);
      onCreate?.(payload);
      return jsonResponse(201, { id: "int_123", client_secret: "cs_secret", currency: payload.currency, amount: payload.amount, merchant_order_id: payload.merchant_order_id, status: "REQUIRES_PAYMENT_METHOD" });
    }
    const match = url.match(/payment_intents\/(int_[^/?]+)$/);
    if (match) return jsonResponse(200, { id: match[1], status: "SUCCEEDED", currency: "USD", ...intent });
    return jsonResponse(404, { code: "not_found" });
  };
}

const checkoutBody = {
  items: [{ sku: "d204", qty: 1 }, { sku: "d215", qty: 2 }],
  contact: { email: "ada@example.com", marketingOptIn: false },
  shipping: { firstName: "Ada", lastName: "Lee", street: "100 Example Ave", street2: "Apt 4", city: "Austin", state: "TX", zip: "78701" },
  method: "express",
};

const call = (env, path, init = {}, ctx = ctxStub()) => worker.fetch(new Request(`${ORIGIN}${path}`, init), env, ctx);
const post = (path, body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function createOrder(env, fake = airwallexFake()) {
  resetAirwallexTokenCache();
  return withFetch(fake, async () => {
    const response = await call(env, "/api/checkout/session", post("/", checkoutBody));
    assert.equal(response.status, 200);
    return response.json();
  });
}

function signedWebhook(event, { secret = WEBHOOK_SECRET, timestamp = String(Date.now()) } = {}) {
  const body = JSON.stringify(event);
  const signature = createHmac("sha256", secret).update(`${timestamp}${body}`).digest("hex");
  return { method: "POST", headers: { "x-timestamp": timestamp, "x-signature": signature }, body };
}

const succeededEvent = (orderId, patch = {}) => ({
  id: `evt_${Math.random().toString(36).slice(2)}`,
  name: "payment_intent.succeeded",
  data: { object: { id: "int_123", merchant_order_id: orderId, status: "SUCCEEDED", currency: "USD", amount: 128.97, ...patch } },
});

const failedAttempt = (orderId, { id = "evt_failed_1", attemptId = "att_failed_1", at = "2026-10-02T01:00:00Z", ...patch } = {}) => ({
  id, name: "payment_attempt.authorization_failed", created_at: at,
  data: { object: { id: attemptId, payment_intent_id: "int_123", merchant_order_id: orderId,
    failure_code: "authorization_failed", failure_details: { code: "issuer_declined", message: "Issuer declined the attempt", trace_id: "trace_1", details: { private: "never store raw provider data" } }, ...patch } },
});

test("failed attempts preserve pending orders and expose only safe guidance publicly", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  const { orderId } = await createOrder(env);
  const ctx = ctxStub();
  const event = failedAttempt(orderId, { failure_details: { code: "issuer_declined", message: "Declined for ada@example.com card 4035501000000008", trace_id: "trace_1", details: { card: "secret raw data" } } });
  assert.equal((await call(env, "/api/webhooks/airwallex", signedWebhook(event), ctx)).status, 200);
  await ctx.settled();
  const row = db.raw.prepare("SELECT * FROM order_payment_failures").get();
  assert.equal(row.message, "Declined for [redacted] card [redacted]");
  assert.equal(row.trace_id, "trace_1");
  assert.ok(!JSON.stringify(row).includes("secret raw data"));
  assert.equal(db.raw.prepare("SELECT status FROM orders").get().status, "pending");
  for (const table of ["order_notifications", "order_emails", "order_mcf"]) assert.equal(db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
  const admin = await (await call(env, `/admin/api/orders/${orderId}`, { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } })).json();
  assert.equal(admin.paymentFailures[0].providerCode, "issuer_declined");
  await withFetch(airwallexFake({ intent: { status: "REQUIRES_PAYMENT_METHOD", merchant_order_id: orderId } }), async () => {
    const publicView = await (await call(env, `/api/orders/${orderId}`)).json();
    assert.deepEqual(publicView.paymentFailure, { message: "Your payment wasn't completed. Check your card details or try another payment method." });
    assert.ok(!JSON.stringify(publicView).includes("trace_1"));
    assert.ok(!JSON.stringify(publicView).includes("issuer_declined"));
  });
});

test("failure deliveries deduplicate by attempt and older events cannot overwrite a newer reason", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  const { orderId } = await createOrder(env);
  const first = failedAttempt(orderId);
  assert.equal((await (await call(env, "/api/webhooks/airwallex", signedWebhook(first))).json()).duplicate, false);
  assert.equal((await (await call(env, "/api/webhooks/airwallex", signedWebhook(first))).json()).duplicate, true);
  await call(env, "/api/webhooks/airwallex", signedWebhook(failedAttempt(orderId, { id: "evt_newer", at: "2026-10-02T02:00:00Z", failure_code: "provider_unavailable" })));
  await call(env, "/api/webhooks/airwallex", signedWebhook(failedAttempt(orderId, { id: "evt_older", at: "2026-10-02T00:00:00Z" })));
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_payment_failures").get().n, 1);
  assert.equal(db.raw.prepare("SELECT failure_code FROM order_payment_failures").get().failure_code, "provider_unavailable");
  await call(env, "/api/webhooks/airwallex", signedWebhook(failedAttempt(orderId, { id: "evt_second", attemptId: "att_second" })));
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_payment_failures").get().n, 2);
});

test("success after failure stays paid even when a signed late failure arrives", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  const { orderId } = await createOrder(env);
  await call(env, "/api/webhooks/airwallex", signedWebhook(failedAttempt(orderId)));
  const ctx = ctxStub();
  await call(env, "/api/webhooks/airwallex", signedWebhook(succeededEvent(orderId)), ctx);
  await ctx.settled();
  await call(env, "/api/webhooks/airwallex", signedWebhook(failedAttempt(orderId, { id: "evt_late", attemptId: "att_late" }), { timestamp: String(Date.now() - 86_400_000) }));
  const result = await (await call(env, `/api/orders/${orderId}`)).json();
  assert.equal(result.status, "paid");
  assert.equal(result.paymentFailure, null);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_payment_failures").get().n, 2);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_notifications").get().n, 1);
});

test("failure events cannot attach to an unrelated intent or merchant order", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  const { orderId } = await createOrder(env);
  for (const patch of [{ payment_intent_id: "int_foreign" }, { merchant_order_id: "APGO-US-FOREIGN" }, { attemptId: "invalid attempt id" }]) {
    assert.equal((await call(env, "/api/webhooks/airwallex", signedWebhook(failedAttempt(orderId, patch)))).status, 200);
  }
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_payment_failures").get().n, 0);
});

test("failure storage errors return 500 and the same webhook can be retried", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  const { orderId } = await createOrder(env);
  const failingDb = { prepare(sql) { if (sql.startsWith("INSERT INTO order_payment_failures")) throw new Error("simulated D1 write failure"); return db.prepare(sql); } };
  const event = failedAttempt(orderId);
  assert.equal((await call({ ...env, DB: failingDb }, "/api/webhooks/airwallex", signedWebhook(event))).status, 500);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM webhook_events").get().n, 0);
  assert.equal((await (await call(env, "/api/webhooks/airwallex", signedWebhook(event))).json()).duplicate, false);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_payment_failures").get().n, 1);
});

// ---------- checkout session ----------

test("checkout session sends an idempotent, correctly shaped PaymentIntent", { skip }, async () => {
  const db = await createD1();
  let sent;
  const session = await createOrder(baseEnv(db), airwallexFake({ onCreate: (payload) => { sent = payload; } }));

  assert.equal(session.intent.clientSecret, "cs_secret");
  assert.equal(sent.request_id, session.orderId, "request_id is stable per order so retries cannot duplicate the intent");
  assert.equal(sent.merchant_order_id, session.orderId);
  assert.equal(sent.amount, 128.97, "amount is sent in major units");
  assert.equal(sent.order.shipping.fee_amount, 9);
  assert.equal(sent.order.shipping.address.street, "100 Example Ave, Apt 4");
  assert.ok(sent.order.products.every((p) => p.code.length <= 12));
  const order = await db.prepare("SELECT status, payment_intent_id FROM orders WHERE id = ?").bind(session.orderId).first();
  assert.deepEqual(order, { status: "pending", payment_intent_id: "int_123" });
});

test("a failed PaymentIntent create cancels the orphan order and returns a generic 502", { skip }, async () => {
  const db = await createD1();
  resetAirwallexTokenCache();
  await withFetch(
    (url) => (url.endsWith("/login") ? LOGIN_OK() : jsonResponse(400, { code: "validation_error", message: "bad amount", source: "amount" })),
    async () => {
      const response = await call(baseEnv(db), "/api/checkout/session", post("/", checkoutBody));
      assert.equal(response.status, 502);
      assert.ok(!JSON.stringify(await response.json()).includes("bad amount"), "provider detail is not leaked");
    },
  );
  const order = await db.prepare("SELECT status FROM orders").first();
  assert.equal(order.status, "cancelled");
});

test("missing Airwallex credentials fail closed without calling the network", { skip }, async () => {
  const db = await createD1();
  resetAirwallexTokenCache();
  await withFetch(() => assert.fail("must not call Airwallex"), async (calls) => {
    const response = await call(baseEnv(db, { AIRWALLEX_CLIENT_ID: "", AIRWALLEX_API_KEY: "" }), "/api/checkout/session", post("/", checkoutBody));
    assert.equal(response.status, 502);
    assert.equal(calls.length, 0);
  });
});

// ---------- webhook ----------

test("webhook: valid signed success marks paid, notifies once, and dedupes redeliveries", { skip }, async () => {
  const db = await createD1();
  const notifyCalls = [];
  const env = baseEnv(db, { ORDER_NOTIFY_WEBHOOK_URL: "https://hooks.example/notify" });
  const { orderId } = await createOrder(env);

  await withFetch(
    (url, init) => {
      if (url.startsWith("https://hooks.example")) { notifyCalls.push(JSON.parse(init.body)); return new Response("ok"); }
      return jsonResponse(500, {});
    },
    async () => {
      const event = succeededEvent(orderId);
      const ctx = ctxStub();
      const first = await call(env, "/api/webhooks/airwallex", signedWebhook(event), ctx);
      await ctx.settled();
      assert.deepEqual(await first.json(), { received: true, duplicate: false });

      const ctx2 = ctxStub();
      const again = await call(env, "/api/webhooks/airwallex", signedWebhook(event), ctx2);
      await ctx2.settled();
      assert.deepEqual(await again.json(), { received: true, duplicate: true });
    },
  );

  const order = await db.prepare("SELECT status, paid_at FROM orders WHERE id = ?").bind(orderId).first();
  assert.equal(order.status, "paid");
  assert.ok(order.paid_at);
  assert.equal(notifyCalls.length, 1, "exactly one notification");
  assert.equal(notifyCalls[0].order.id, orderId);
  assert.equal(notifyCalls[0].order.totalCents, 12897);
  assert.ok(!JSON.stringify(notifyCalls[0]).match(/ada@example|100 Example|78701/), "no email or street address in the payload");
});

test("webhook: bad or missing signature, and non-JSON bodies, are rejected", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  const { orderId } = await createOrder(env);
  const good = signedWebhook(succeededEvent(orderId));

  assert.equal((await call(env, "/api/webhooks/airwallex", { ...good, headers: { ...good.headers, "x-signature": "0".repeat(64) } })).status, 400);
  assert.equal((await call(env, "/api/webhooks/airwallex", { method: "POST", body: good.body })).status, 400);
  assert.equal((await call(baseEnv(db, { AIRWALLEX_WEBHOOK_SECRET: "" }), "/api/webhooks/airwallex", good)).status, 400);
  assert.equal((await call(env, "/api/webhooks/airwallex", signedWebhook("not an event object"))).status, 400);

  const notJson = "<<<";
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}${notJson}`).digest("hex");
  const response = await call(env, "/api/webhooks/airwallex", { method: "POST", headers: { "x-timestamp": timestamp, "x-signature": signature }, body: notJson });
  assert.equal(response.status, 400);
  assert.equal((await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).status, "pending");
});

test("webhook: a genuine but late delivery settles from the Retrieve API, not from the stale body", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  const { orderId } = await createOrder(env);
  const stale = succeededEvent(orderId, { status: "SUCCEEDED", amount: 128.97 });
  const old = String(Date.now() - 2 * 60 * 60 * 1000);

  // Retrieve says the intent is actually still unpaid: the stale "succeeded" body must not win.
  resetAirwallexTokenCache();
  await withFetch(airwallexFake({ intent: { status: "REQUIRES_PAYMENT_METHOD", merchant_order_id: orderId, amount: 128.97 } }), async () => {
    assert.equal((await call(env, "/api/webhooks/airwallex", signedWebhook(stale, { timestamp: old }))).status, 200);
  });
  assert.equal((await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).status, "pending");

  resetAirwallexTokenCache();
  await withFetch(airwallexFake({ intent: { status: "SUCCEEDED", merchant_order_id: orderId, amount: 128.97 } }), async () => {
    assert.equal((await call(env, "/api/webhooks/airwallex", signedWebhook({ ...stale, id: "evt_late_2" }, { timestamp: old }))).status, 200);
  });
  assert.equal((await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).status, "paid");
});

test("webhook: amount mismatch goes to review and does not notify", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db, { ORDER_NOTIFY_WEBHOOK_URL: "https://hooks.example/notify" });
  const { orderId } = await createOrder(env);
  await withFetch(() => assert.fail("no notification for review orders"), async () => {
    const ctx = ctxStub();
    await call(env, "/api/webhooks/airwallex", signedWebhook(succeededEvent(orderId, { amount: 1 })), ctx);
    await ctx.settled();
  });
  assert.equal((await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).status, "review");
  assert.equal(await db.prepare("SELECT 1 FROM order_notifications").first(), null);
});

test("GET /api/orders/:id settles through Retrieve and notifies once across concurrent polls", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db, { ORDER_NOTIFY_WEBHOOK_URL: "https://hooks.example/notify" });
  const { orderId } = await createOrder(env);
  let notifications = 0;
  resetAirwallexTokenCache();
  await withFetch(
    (url, init) => {
      if (url.startsWith("https://hooks.example")) { notifications += 1; return new Response("ok"); }
      return airwallexFake({ intent: { merchant_order_id: orderId, amount: 128.97 } })(url, init);
    },
    async () => {
      const ctx = ctxStub();
      const responses = await Promise.all([call(env, `/api/orders/${orderId}`, {}, ctx), call(env, `/api/orders/${orderId}`, {}, ctx)]);
      await ctx.settled();
      for (const response of responses) assert.equal((await response.json()).status, "paid");
    },
  );
  assert.equal(notifications, 1);
  const row = await db.prepare("SELECT status FROM order_notifications WHERE order_id = ?").bind(orderId).first();
  assert.equal(row.status, "sent");
});

// ---------- admin ----------

test("admin: closed when neither login nor ADMIN_TOKEN is configured; 401 with a Basic challenge otherwise", { skip }, async () => {
  const db = await createD1();
  for (const token of [undefined, "", "short"]) {
    const response = await call(baseEnv(db, { ADMIN_TOKEN: token }), "/admin/api/orders", { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 503);
  }
  const env = baseEnv(db);
  const none = await call(env, "/admin/api/orders");
  assert.equal(none.status, 401);
  assert.match(none.headers.get("WWW-Authenticate"), /^Basic /);
  assert.equal(none.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.equal((await call(env, "/admin/api/orders", { headers: { Authorization: "Bearer wrong-wrong-wrong-wrong" } })).status, 401);
  assert.equal((await call(env, "/admin/", {})).status, 401, "the page itself is gated too");
  assert.equal((await call(env, "/admin", {})).status, 401);
});

test("admin: email/password Basic opens the office without ADMIN_TOKEN; token fallback still works", { skip }, async () => {
  const db = await createD1();
  const login = { ADMIN_LOGIN_EMAIL: "owner@example.com", ADMIN_LOGIN_PASSWORD: "owner-login-password-test" };
  const loginOnly = baseEnv(db, { ...login, ADMIN_TOKEN: "" });
  const emailBasic = { Authorization: `Basic ${Buffer.from(`${login.ADMIN_LOGIN_EMAIL}:${login.ADMIN_LOGIN_PASSWORD}`).toString("base64")}` };
  assert.equal((await call(loginOnly, "/admin/api/orders", { headers: emailBasic })).status, 200);
  assert.equal((await call(loginOnly, "/admin/", { headers: emailBasic })).status, 200);
  assert.equal((await call(loginOnly, "/admin/api/orders", { headers: { Authorization: `Bearer ${login.ADMIN_LOGIN_PASSWORD}` } })).status, 401);
  const both = baseEnv(db, login);
  assert.equal((await call(both, "/admin/api/orders", { headers: emailBasic })).status, 200);
  assert.equal((await call(both, "/admin/api/orders", { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } })).status, 200);
  assert.equal((await call(baseEnv(db, { ADMIN_TOKEN: "short", ...login }), "/admin/api/orders", { headers: emailBasic })).status, 200);
});

test("admin: Bearer and Basic auth list orders with address, items, totals and payment state", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  const { orderId } = await createOrder(env);
  await withFetch(() => assert.fail("no network"), async () => {
    const ctx = ctxStub();
    await call(env, "/api/webhooks/airwallex", signedWebhook(succeededEvent(orderId)), ctx);
    await ctx.settled();
  });

  const basic = `Basic ${Buffer.from(`admin:${ADMIN_TOKEN}`).toString("base64")}`;
  const list = await (await call(env, "/admin/api/orders", { headers: { Authorization: basic } })).json();
  assert.equal(list.orders.length, 1);
  assert.deepEqual(list.counts, { pending: 0, paid: 1, review: 0, cancelled: 0 });
  assert.equal(list.orders[0].notification, "skipped", "no channel configured → skipped and recorded");
  assert.equal(list.orders[0].itemCount, 3);

  const detail = await (await call(env, `/admin/api/orders/${orderId}`, { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } })).json();
  assert.equal(detail.status, "paid");
  assert.equal(detail.shipping.street2, "Apt 4");
  assert.equal(detail.email, "ada@example.com");
  assert.equal(detail.totalCents, 12897);
  assert.equal(detail.lines.length, 2);
  assert.equal(detail.paymentIntentId, "int_123");

  const filtered = await (await call(env, "/admin/api/orders?status=pending", { headers: { Authorization: basic } })).json();
  assert.equal(filtered.orders.length, 0);
  const search = await (await call(env, "/admin/api/orders?q=austin", { headers: { Authorization: basic } })).json();
  assert.equal(search.orders.length, 1);
  assert.equal((await call(env, "/admin/api/orders?status=bogus", { headers: { Authorization: basic } })).status, 400);
  assert.equal((await call(env, "/admin/api/orders/APGO-US-NOPE", { headers: { Authorization: basic } })).status, 404);
  assert.equal((await call(env, "/admin/api/orders", { method: "POST", headers: { Authorization: basic } })).status, 405);

  const page = await call(env, "/admin/", { headers: { Authorization: basic } });
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("X-Robots-Tag"), "noindex, nofollow");
});

test("public order endpoint never exposes the address or full email", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  const { orderId } = await createOrder(env);
  resetAirwallexTokenCache();
  const body = await withFetch(airwallexFake({ intent: { status: "REQUIRES_PAYMENT_METHOD", merchant_order_id: orderId } }), async () =>
    JSON.stringify(await (await call(env, `/api/orders/${orderId}`, {})).json()),
  );
  assert.ok(body.includes('"status":"pending"'));
  assert.ok(!body.includes("Example Ave") && !body.includes("ada@example.com"));
});

// ---------- notifications ----------

const sampleOrder = {
  id: "APGO-US-0123456789AB", currency: "USD", total_cents: 12897, shipping_method: "express",
  created_at: "2026-09-30T00:00:00.000Z", paid_at: "2026-09-30T00:01:00.000Z",
  lines_json: JSON.stringify([{ sku: "D204", name: "APGO Atomic Colored Glaze", qty: 1 }]),
  shipping_json: JSON.stringify({ state: "TX", street: "secret street", zip: "78701" }),
};

test("notify: nothing configured is skipped and never touches the network", async () => {
  const results = await notifyOrderPaid({}, sampleOrder, { fetchImpl: () => assert.fail("must not send") });
  assert.deepEqual(results.map((r) => r.status), ["skipped"]);
  assert.deepEqual(notificationChannels({ ORDER_NOTIFY_WEBHOOK_URL: "http://evil.example/x" }), [], "plain http is ignored");
  assert.deepEqual(notificationChannels({ RESEND_API_KEY: "k", ORDER_NOTIFY_EMAIL_TO: "a@b.co" }), [], "email needs a sender too");
});

test("notify: webhook is HMAC-signed, email uses the API, failures are contained", async () => {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, init }); return new Response("ok", { status: url.includes("fail") ? 500 : 200 }); };
  const env = {
    ORDER_NOTIFY_WEBHOOK_URL: "https://hooks.example/a", ORDER_NOTIFY_WEBHOOK_SECRET: "s3cret",
    RESEND_API_KEY: "rk", ORDER_NOTIFY_EMAIL_TO: "a@b.co, c@d.co", ORDER_NOTIFY_EMAIL_FROM: "shop@b.co",
    ORDER_NOTIFY_EMAIL_API_URL: "https://mail.example/fail",
  };
  const results = await notifyOrderPaid(env, sampleOrder, { adminUrl: `${ORIGIN}/admin/`, fetchImpl });
  assert.deepEqual(results.map((r) => [r.channel, r.status]), [["webhook", "sent"], ["email", "failed"]]);

  const hook = sent[0];
  const expected = createHmac("sha256", "s3cret").update(`${hook.init.headers["X-APGO-Timestamp"]}.${hook.init.body}`).digest("hex");
  assert.equal(hook.init.headers["X-APGO-Signature"], `sha256=${expected}`);
  const mail = JSON.parse(sent[1].init.body);
  assert.deepEqual(mail.to, ["a@b.co", "c@d.co"]);
  assert.equal(sent[1].init.headers.Authorization, "Bearer rk");

  const message = buildNotification(sampleOrder, { adminUrl: `${ORIGIN}/admin/` });
  assert.match(message.subject, /APGO-US-0123456789AB · \$128\.97/);
  assert.ok(!message.text.includes("secret street"));
  assert.ok(!results.some((r) => r.detail.includes("rk") || r.detail.includes("s3cret")));
});

// ---------- Airwallex client ----------

test("airwallex client: token is cached and expired tokens are refreshed", async () => {
  resetAirwallexTokenCache();
  let logins = 0;
  await withFetch(
    (url) => {
      if (url.endsWith("/login")) { logins += 1; return LOGIN_OK(); }
      return jsonResponse(200, { id: "int_1", status: "SUCCEEDED" });
    },
    async (calls) => {
      const env = { AIRWALLEX_CLIENT_ID: "cid", AIRWALLEX_API_KEY: "key", AIRWALLEX_RETRY_DELAY_MS: "0" };
      await retrievePaymentIntent(env, "int_1");
      await retrievePaymentIntent(env, "int_1");
      assert.equal(logins, 1);
      const login = calls.find((c) => c.url.endsWith("/login"));
      assert.equal(login.init.headers["x-client-id"], "cid");
      assert.equal(login.init.headers["x-api-key"], "key");
      assert.equal(login.init.headers["x-login-as"], undefined);
      assert.ok(login.url.startsWith("https://api.sandbox.airwallex.com/"));
      await retrievePaymentIntent({ ...env, AIRWALLEX_LOGIN_AS: "acct_1" }, "int_1");
      assert.equal(logins, 2, "a different login-as account needs its own token");
    },
  );
});

test("airwallex client: a 401 re-authenticates once; 5xx/429 retry; 4xx does not", async () => {
  resetAirwallexTokenCache();
  const env = { AIRWALLEX_CLIENT_ID: "cid", AIRWALLEX_API_KEY: "key", AIRWALLEX_RETRY_DELAY_MS: "0" };
  let attempts = 0;
  await withFetch(
    (url) => {
      if (url.endsWith("/login")) return LOGIN_OK();
      attempts += 1;
      if (attempts === 1) return jsonResponse(401, { code: "unauthorized" });
      if (attempts === 2) return jsonResponse(503, {});
      if (attempts === 3) return jsonResponse(429, {});
      return jsonResponse(200, { id: "int_1", status: "SUCCEEDED" });
    },
    async () => assert.equal((await retrievePaymentIntent(env, "int_1")).status, "SUCCEEDED"),
  );
  assert.equal(attempts, 4);

  attempts = 0;
  await withFetch(
    (url) => (url.endsWith("/login") ? LOGIN_OK() : (attempts += 1, jsonResponse(400, { code: "validation_error", message: "nope", source: "amount" }))),
    async () => {
      await assert.rejects(createPaymentIntent(env, { request_id: "r1", amount: 1 }), (e) => e instanceof AirwallexError && e.code === "validation_error" && e.source === "amount");
    },
  );
  assert.equal(attempts, 1);
});

test("airwallex client: creates without a request_id are never retried (no duplicate charges)", async () => {
  resetAirwallexTokenCache();
  const env = { AIRWALLEX_CLIENT_ID: "cid", AIRWALLEX_API_KEY: "key", AIRWALLEX_RETRY_DELAY_MS: "0" };
  let attempts = 0;
  await withFetch(
    (url) => (url.endsWith("/login") ? LOGIN_OK() : (attempts += 1, jsonResponse(503, {}))),
    async () => { await assert.rejects(createPaymentIntent(env, { amount: 1 })); },
  );
  assert.equal(attempts, 1);
});

test("airwallex client: login failures surface the provider code and stay closed without credentials", async () => {
  resetAirwallexTokenCache();
  await withFetch(() => jsonResponse(401, { code: "credentials_invalid", message: "bad" }), async () => {
    await assert.rejects(
      retrievePaymentIntent({ AIRWALLEX_CLIENT_ID: "x", AIRWALLEX_API_KEY: "y", AIRWALLEX_RETRY_DELAY_MS: "0" }, "int_1"),
      (e) => e.code === "credentials_invalid" && e.status === 401,
    );
  });
  await assert.rejects(retrievePaymentIntent({}, "int_1"), (e) => e.code === "not_configured");
});

// ---------- fulfilment, customer emails, audit ----------

const MAIL_URL = "https://mail.example/send";
const mailEnv = (db, extra = {}) =>
  baseEnv(db, { RESEND_API_KEY: "rk_test_key", CUSTOMER_EMAIL_FROM: "APGO <orders@shop.example>", ORDER_NOTIFY_EMAIL_API_URL: MAIL_URL, ...extra });
const bearer = { Authorization: `Bearer ${ADMIN_TOKEN}` };
const shipRequest = (body, headers = {}) => ({
  method: "POST",
  headers: { ...bearer, "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});
const SHIPMENT = { carrier: "UPS", trackingNumber: "1Z999AA10123456784", trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784" };

// Creates an order and (optionally) pays it through the real webhook path. `mails` collects every
// request to the mocked email API; nothing ever reaches Resend.
async function paidOrder(env, { pay = true } = {}) {
  const { orderId } = await createOrder(env);
  const mails = [];
  if (pay) {
    await withFetch((url, init) => { if (url === MAIL_URL) { mails.push(JSON.parse(init.body)); return Response.json({ id: crypto.randomUUID() }); } return jsonResponse(500, {}); }, async () => {
      const ctx = ctxStub();
      await call(env, "/api/webhooks/airwallex", signedWebhook(succeededEvent(orderId)), ctx);
      await ctx.settled();
    });
  }
  return { orderId, mails };
}

async function ship(env, orderId, body = SHIPMENT, headers = {}, mails = []) {
  return withFetch((url, init) => { if (url === MAIL_URL) { mails.push({ payload: JSON.parse(init.body), headers: init.headers }); return Response.json({ id: crypto.randomUUID() }); } return jsonResponse(500, {}); }, () =>
    call(env, `/admin/api/orders/${orderId}/ship`, shipRequest(body, headers)),
  );
}

test("schema: re-running the migration on an existing database is a no-op and adds no columns to orders", { skip }, async () => {
  const { readFile } = await import("node:fs/promises");
  const db = await createD1();
  const before = db.raw.prepare("PRAGMA table_info(orders)").all().map((c) => c.name);
  await db.prepare("INSERT INTO orders (id,status,email,shipping_json,shipping_method,lines_json,currency,subtotal_cents,shipping_cents,tax_cents,total_cents,created_at,updated_at) VALUES ('APGO-US-01D000000001','paid','a@b.co','{}','standard','[]','USD',1,0,0,1,'t','t')").run();
  const schema = await readFile(new URL("../worker/schema.sql", import.meta.url), "utf8");
  db.raw.exec(schema); // second and third run must not throw
  db.raw.exec(schema);
  assert.deepEqual(db.raw.prepare("PRAGMA table_info(orders)").all().map((c) => c.name), before);
  assert.ok(!/^[^-\n]*ALTER\s+TABLE/im.test(schema), "D1 cannot re-run ALTER ADD COLUMN; new data goes in IF NOT EXISTS tables");
  const legacy = await (await call(baseEnv(db), "/admin/api/orders/APGO-US-01D000000001", { headers: bearer })).json();
  assert.equal(legacy.fulfillmentStatus, "unfulfilled", "pre-existing orders read as unfulfilled");
});

test("payment success sends exactly one customer confirmation with order id, items, totals and address", { skip }, async () => {
  const db = await createD1();
  const env = mailEnv(db, { CUSTOMER_EMAIL_POLICY_NOTE: "Policy note from owner." });
  const { orderId, mails } = await paidOrder(env);
  assert.equal(mails.length, 1);
  const mail = mails[0];
  assert.deepEqual(mail.to, ["ada@example.com"]);
  assert.equal(mail.from, "APGO <orders@shop.example>");
  assert.match(mail.subject, new RegExp(orderId));
  for (const part of [mail.text, mail.html]) {
    assert.ok(part.includes(orderId));
    assert.ok(part.includes("APGO Atomic Colored Glaze") && part.includes("APGO Atomic Glaze Coating"));
    assert.ok(part.includes("$128.97"));
    assert.ok(part.includes("100 Example Ave") && part.includes("Austin, TX 78701"));
    assert.ok(part.includes("Policy note from owner."));
  }
  assert.ok(mail.html.startsWith("<!doctype html>"));
  assert.ok(!/business days|guarantee|refund|return within|arrive by/i.test(mail.text), "no invented delivery or returns promise");

  // redelivery / polling never resends
  await withFetch(() => assert.fail("no network"), async () => {
    const ctx = ctxStub();
    await call(env, "/api/webhooks/airwallex", signedWebhook(succeededEvent(orderId)), ctx);
    await ctx.settled();
  });
  const rows = db.raw.prepare("SELECT kind, status FROM order_emails WHERE order_id = ?").all(orderId);
  assert.deepEqual(rows.map((r) => ({ ...r })), [{ kind: "confirmation", status: "sent" }]);
});

test("customer emails are skipped safely (and logged) when Resend is not configured", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db); // no RESEND_API_KEY / sender
  const { orderId } = await paidOrder(env);
  const confirmation = await db.prepare("SELECT status FROM order_emails WHERE order_id = ? AND kind = 'confirmation'").bind(orderId).first();
  assert.equal(confirmation.status, "skipped");
  const response = await withFetch(() => assert.fail("must not call the network"), () => call(env, `/admin/api/orders/${orderId}/ship`, shipRequest(SHIPMENT)));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.order.fulfillmentStatus, "shipped", "shipping works without email");
  assert.equal(body.email.status, "skipped");
  assert.equal((await db.prepare("SELECT status FROM order_emails WHERE order_id = ? AND kind = 'shipment'").bind(orderId).first()).status, "skipped");

  const off = mailEnv(db, { CUSTOMER_EMAIL_ENABLED: "false" });
  const other = await paidOrder(off);
  assert.equal((await db.prepare("SELECT status FROM order_emails WHERE order_id = ?").bind(other.orderId).first()).status, "skipped");
  assert.equal(other.mails.length, 0);
});

test("a failing email API is recorded and never undoes payment or shipping", { skip }, async () => {
  const db = await createD1();
  const env = mailEnv(db);
  const { orderId } = await createOrder(env);
  await withFetch((url) => (url === MAIL_URL ? new Response("nope", { status: 500 }) : jsonResponse(500, {})), async () => {
    const ctx = ctxStub();
    const hook = await call(env, "/api/webhooks/airwallex", signedWebhook(succeededEvent(orderId)), ctx);
    await ctx.settled();
    assert.equal(hook.status, 200);
  });
  assert.equal((await db.prepare("SELECT status FROM orders WHERE id = ?").bind(orderId).first()).status, "paid");
  const row = await db.prepare("SELECT status, detail FROM order_emails WHERE order_id = ? AND kind = 'confirmation'").bind(orderId).first();
  assert.equal(row.status, "failed");
  assert.match(row.detail, /500/);
  assert.ok(!row.detail.includes("rk_test_key"));

  const res = await withFetch((url) => (url === MAIL_URL ? new Response("nope", { status: 500 }) : jsonResponse(500, {})), () => call(env, `/admin/api/orders/${orderId}/ship`, shipRequest(SHIPMENT)));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.order.fulfillmentStatus, "shipped");
  assert.equal(body.email.status, "failed");
  assert.deepEqual(body.order.emails.map((e) => [e.kind, e.status]), [["confirmation", "failed"], ["shipment", "failed"]]);
});

test("ship: a paid order is marked shipped once, stores time + carrier + tracking, audits, and emails the tracking number", { skip }, async () => {
  const db = await createD1();
  const env = mailEnv(db, { CUSTOMER_EMAIL_REPLY_TO: "help@shop.example" });
  const { orderId } = await paidOrder(env);
  const mails = [];
  const before = Date.now();
  const res = await ship(env, orderId, SHIPMENT, {}, mails);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.order.fulfillmentStatus, "shipped");
  assert.equal(body.order.status, "paid", "payment status is untouched");
  assert.equal(body.order.fulfillment.carrier, "UPS");
  assert.equal(body.order.fulfillment.trackingNumber, SHIPMENT.trackingNumber);
  assert.equal(body.order.fulfillment.trackingUrl, SHIPMENT.trackingUrl);
  assert.equal(body.order.fulfillment.shippedBy, "admin");
  assert.ok(Date.parse(body.order.fulfillment.shippedAt) >= before - 1000);
  assert.deepEqual(body.order.audit.map((a) => [a.action, a.actor]), [["order.shipped", "admin"]]);
  assert.equal(body.order.audit[0].detail.trackingNumber, SHIPMENT.trackingNumber);

  assert.equal(mails.length, 1);
  const { payload, headers } = mails[0];
  assert.equal(headers.Authorization, "Bearer rk_test_key");
  assert.deepEqual(payload.to, ["ada@example.com"]);
  assert.equal(payload.reply_to, "help@shop.example");
  assert.match(payload.subject, /has shipped/);
  for (const part of [payload.text, payload.html]) {
    assert.ok(part.includes(orderId) && part.includes("1Z999AA10123456784") && part.includes("UPS"));
    assert.ok(part.includes("APGO Atomic Colored Glaze") && part.includes("$128.97") && part.includes("Austin, TX 78701"));
    assert.ok(part.includes(SHIPMENT.trackingUrl.replace("&", "&amp;")) || part.includes(SHIPMENT.trackingUrl));
  }
  assert.ok(!/business days|guarantee|arrive by|refund/i.test(payload.text), "no invented delivery or returns promise");
  assert.ok(!JSON.stringify(payload).includes("rk_test_key"));
});

test("ship: a second shipment is rejected (409), keeps the first record, and sends no second email", { skip }, async () => {
  const db = await createD1();
  const env = mailEnv(db);
  const { orderId } = await paidOrder(env);
  const mails = [];
  assert.equal((await ship(env, orderId, SHIPMENT, {}, mails)).status, 200);
  const again = await ship(env, orderId, { carrier: "FedEx", trackingNumber: "OTHER" }, {}, mails);
  assert.equal(again.status, 409);
  assert.equal((await again.json()).error.code, "already_shipped");
  assert.equal(mails.length, 1);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_fulfillments").get().n, 1);
  assert.equal((await db.prepare("SELECT carrier FROM order_fulfillments WHERE order_id = ?").bind(orderId).first()).carrier, "UPS");
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_audit").get().n, 1);
});

test("ship: only paid orders can ship (pending / review / cancelled / unknown are refused)", { skip }, async () => {
  const db = await createD1();
  const env = mailEnv(db);
  const { orderId } = await paidOrder(env, { pay: false });
  const res = await ship(env, orderId);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, "not_paid");
  for (const status of ["review", "cancelled"]) {
    db.raw.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, orderId);
    assert.equal((await ship(env, orderId)).status, 409, status);
  }
  assert.equal((await ship(env, "APGO-US-ZZZZZZZZZZZZ")).status, 404);
  assert.equal((await ship(env, "APGO-US-NOPE")).status, 404);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_fulfillments").get().n, 0);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_emails WHERE kind = 'shipment'").get().n, 0);
});

test("ship: requires ADMIN_TOKEN, POST only, JSON only and same-origin", { skip }, async () => {
  const db = await createD1();
  const env = mailEnv(db);
  const { orderId } = await paidOrder(env);
  const path = `/admin/api/orders/${orderId}/ship`;
  const noAuth = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(SHIPMENT) };
  assert.equal((await call(env, path, noAuth)).status, 401);
  assert.equal((await call(env, path, { ...noAuth, headers: { ...noAuth.headers, Authorization: "Bearer wrong-wrong-wrong-wrong" } })).status, 401);
  assert.equal((await call(baseEnv(db, { ADMIN_TOKEN: "" }), path, noAuth)).status, 503);
  for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
    const res = await call(env, path, { method, headers: bearer });
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get("Allow"), "POST");
  }
  const basic = { Authorization: `Basic ${Buffer.from(`admin:${ADMIN_TOKEN}`).toString("base64")}` };
  const formPost = await call(env, path, { method: "POST", headers: { ...basic, "Content-Type": "text/plain" }, body: JSON.stringify(SHIPMENT) });
  assert.equal(formPost.status, 403, "a cross-site <form> cannot send application/json");
  assert.equal((await call(env, path, shipRequest(SHIPMENT, { Origin: "https://evil.example", ...basic }))).status, 403);
  assert.equal((await call(env, path, shipRequest(SHIPMENT, { "Sec-Fetch-Site": "cross-site", ...basic }))).status, 403);
  assert.equal((await call(env, path, { method: "POST", headers: { ...bearer, "Content-Type": "application/json" }, body: "not json" })).status, 400);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_fulfillments").get().n, 0, "nothing was written by any refused request");

  // same-origin browser request with Basic credentials is accepted
  const ok = await withFetch(() => new Response("{}"), () => call(env, path, shipRequest(SHIPMENT, { Origin: ORIGIN, "Sec-Fetch-Site": "same-origin", ...basic, Authorization: basic.Authorization })));
  assert.equal(ok.status, 200);
});

test("ship: validates carrier, tracking number and the optional https tracking link", { skip }, async () => {
  const db = await createD1();
  const env = mailEnv(db);
  const { orderId } = await paidOrder(env);
  const bad = [
    [{ carrier: "", trackingNumber: "1" }, "invalid_carrier"],
    [{ carrier: "UPS", trackingNumber: "  " }, "invalid_tracking_number"],
    [{ carrier: "UPS", trackingNumber: "1\r\nBcc: x@evil.example" }, "invalid_tracking_number"],
    [{ carrier: "x".repeat(61), trackingNumber: "1" }, "invalid_carrier"],
    [{ carrier: "UPS", trackingNumber: "1", trackingUrl: "javascript:alert(1)" }, "invalid_tracking_url"],
    [{ carrier: "UPS", trackingNumber: "1", trackingUrl: "http://ups.com/t" }, "invalid_tracking_url"],
    [{ carrier: "UPS", trackingNumber: "1", trackingUrl: "not a url" }, "invalid_tracking_url"],
  ];
  for (const [payload, code] of bad) {
    const res = await ship(env, orderId, payload);
    assert.equal(res.status, 400, JSON.stringify(payload));
    assert.equal((await res.json()).error.code, code);
  }
  const ok = await ship(env, orderId, { carrier: "USPS", trackingNumber: "9400 1000" });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).order.fulfillment.trackingUrl, null, "link is optional");
});

test("ship: two simultaneous requests ship once", { skip }, async () => {
  const db = await createD1();
  const env = mailEnv(db);
  const { orderId } = await paidOrder(env);
  const results = await Promise.all([ship(env, orderId), ship(env, orderId)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_emails WHERE kind = 'shipment'").get().n, 1);
});

test("admin list filters by fulfilment status and exposes the to-ship queue counts", { skip }, async () => {
  const db = await createD1();
  const env = mailEnv(db);
  const a = await paidOrder(env);
  const b = await paidOrder(env);
  await paidOrder(env, { pay: false });
  await ship(env, a.orderId);
  const get = async (query) => (await call(env, `/admin/api/orders${query}`, { headers: bearer })).json();

  const toShip = await get("?fulfillment=unfulfilled");
  assert.deepEqual(toShip.orders.map((o) => o.id), [b.orderId], "unfulfilled = paid and not shipped");
  assert.equal(toShip.orders[0].fulfillmentStatus, "unfulfilled");
  const shipped = await get("?fulfillment=shipped");
  assert.deepEqual(shipped.orders.map((o) => [o.id, o.fulfillmentStatus]), [[a.orderId, "shipped"]]);
  assert.ok(shipped.orders[0].shippedAt);
  assert.deepEqual(shipped.fulfillmentCounts, { unfulfilled: 1, shipped: 1 });
  assert.equal((await get("")).orders.length, 3);
  assert.equal((await call(env, "/admin/api/orders?fulfillment=bogus", { headers: bearer })).status, 400);
});

test("customer email builders escape HTML, omit policy text when unset and never throw on odd input", () => {
  const order = {
    ...sampleOrder, email: "x@example.com", subtotal_cents: 12897, shipping_cents: 0, tax_cents: 0,
    lines_json: JSON.stringify([{ sku: "D204", name: "<b>Glaze</b>", qty: 1, lineCents: 12897 }]),
    shipping_json: JSON.stringify({ firstName: "A<script>", lastName: "Lee", street: "1 & 2 St", street2: "", city: "Austin", state: "TX", zip: "78701" }),
  };
  const confirmation = buildConfirmationEmail(order);
  assert.ok(!confirmation.html.includes("<script>") && !confirmation.html.includes("<b>Glaze"));
  assert.ok(confirmation.html.includes("&lt;b&gt;Glaze&lt;/b&gt;") && confirmation.html.includes("1 &amp; 2 St"));
  assert.ok(confirmation.text.includes("Shipping: Free"));
  const shipment = buildShipmentEmail(order, { carrier: "UPS", trackingNumber: "T1", trackingUrl: 'https://x.example/?a="1"' });
  assert.ok(shipment.html.includes('href="https://x.example/?a=&quot;1&quot;"'));
  assert.ok(shipment.text.includes("Tracking number: T1"));
  assert.deepEqual(customerEmailConfig({ RESEND_API_KEY: "k" }), null, "needs a sender");
  assert.equal(customerEmailConfig({ RESEND_API_KEY: "k", ORDER_NOTIFY_EMAIL_FROM: "a@b.co" }).from, "a@b.co", "falls back to the team sender");
  assert.equal(customerEmailConfig({ RESEND_API_KEY: "k", CUSTOMER_EMAIL_FROM: "a@b.co", CUSTOMER_EMAIL_ENABLED: "false" }), null);
});
