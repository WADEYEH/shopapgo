// PayPal Orders v2: create / capture / webhook, US address mapping, Meta event ids.
import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.js";
import { publicConfig } from "../worker/catalog.js";
import { validatePaypalCheckout } from "../worker/checkout.js";
import { QuoteError } from "../worker/catalog.js";
import {
  amountsMatch,
  inspectPaypalOrder,
  isUsableUsShipping,
  normalizePaypalState,
  paypalAmount,
  paypalApiBase,
  paypalEnvName,
  paypalOrderPayload,
  resetPaypalTokenCache,
  shippingFromPaypalOrder,
  storefrontOrigin,
} from "../worker/paypal.js";
import { metaEventId } from "../worker/meta-capi.js";
import { createD1, sqliteAvailable } from "./helpers/d1.mjs";
import { createFakePaypal } from "./helpers/fake-paypal.mjs";
import { FAKE_DATASET_ID, FAKE_META_ENV, createFakeMeta } from "./helpers/fake-meta-capi.mjs";

globalThis.fetch = async (url) => { throw new Error(`unexpected real network call: ${url}`); };

const hasSqlite = await sqliteAvailable();
const skip = hasSqlite ? false : "node:sqlite needs Node 22.5+";

const ORIGIN = "https://store.shopapgo.com";
const WEBHOOK_ID = "WH-TEST-ID";

const checkoutBody = {
  items: [{ sku: "d204", qty: 1 }, { sku: "d215", qty: 2 }],
  contact: { email: "ada@example.com", phone: "(512) 555-0134", marketingOptIn: false },
  shipping: { firstName: "Ada", lastName: "Lee", street: "100 Example Ave", street2: "Apt 4", city: "Austin", state: "TX", zip: "78701" },
  method: "standard",
};

const baseEnv = (db, extra = {}) => ({
  DB: db,
  PAYPAL_CLIENT_ID: "paypal_cid",
  PAYPAL_CLIENT_SECRET: "paypal_secret",
  PAYPAL_ENV: "sandbox",
  PAYPAL_WEBHOOK_ID: WEBHOOK_ID,
  PAYPAL_RETRY_DELAY_MS: "0",
  AIRWALLEX_ENV: "demo",
  ADMIN_TOKEN: "test-admin-token-0123456789",
  ASSETS: { fetch: async () => new Response("ok") },
  ...extra,
});

const ctxStub = () => ({ waitUntil(promise) { (this.pending ||= []).push(promise); }, async settled() { await Promise.all(this.pending ?? []); } });
const call = (env, path, init = {}, ctx = ctxStub()) => worker.fetch(new Request(`${ORIGIN}${path}`, init), env, ctx);
const post = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

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

function paypalHeaders(extra = {}) {
  return {
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
    "paypal-transmission-id": "tx-1",
    "paypal-transmission-sig": "sig",
    "paypal-transmission-time": new Date().toISOString(),
    ...extra,
  };
}

// ---------- pure helpers (no D1) ----------

test("PAYPAL_ENV selects api-m.paypal.com vs api-m.sandbox.paypal.com", () => {
  assert.equal(paypalEnvName({ PAYPAL_ENV: "live" }), "live");
  assert.equal(paypalEnvName({ PAYPAL_ENV: "LIVE" }), "live");
  assert.equal(paypalEnvName({ PAYPAL_ENV: "sandbox" }), "sandbox");
  assert.equal(paypalEnvName({}), "sandbox");
  assert.equal(paypalApiBase({ PAYPAL_ENV: "live" }), "https://api-m.paypal.com");
  assert.equal(paypalApiBase({ PAYPAL_ENV: "sandbox" }), "https://api-m.sandbox.paypal.com");
  assert.equal(paypalApiBase({ PAYPAL_API_BASE: "https://paypal.test" }), "https://paypal.test");
});

test("paypalAmount is always two decimal places and matches D1 cents", () => {
  assert.equal(paypalAmount(12897), "128.97");
  assert.equal(paypalAmount(5999), "59.99");
  assert.equal(paypalAmount(900), "9.00");
  assert.equal(paypalAmount(0), "0.00");
  assert.equal(amountsMatch("128.97", 12897), true);
  assert.equal(amountsMatch("128.96", 12897), false);
});

test("shippingFromPaypalOrder maps payer/purchase_unit into a US store address", () => {
  const shipping = shippingFromPaypalOrder({
    payer: { name: { given_name: "Ada", surname: "Lee" } },
    purchase_units: [{
      shipping: {
        name: { full_name: "Ada Lee" },
        address: {
          address_line_1: "2211 N First Street",
          address_line_2: "Building 17",
          admin_area_2: "San Jose",
          admin_area_1: "California",
          postal_code: "95131-1234",
          country_code: "US",
        },
      },
    }],
  });
  assert.deepEqual(shipping, {
    firstName: "Ada",
    lastName: "Lee",
    street: "2211 N First Street",
    street2: "Building 17",
    city: "San Jose",
    state: "CA",
    zip: "95131-1234",
    country: "US",
  });
  assert.equal(isUsableUsShipping(shipping), true);
  assert.equal(normalizePaypalState("tx"), "TX");
  assert.equal(normalizePaypalState("Texas"), "TX");
  assert.equal(normalizePaypalState("ZZ"), "");
  assert.equal(isUsableUsShipping({ ...shipping, country: "CA" }), false);
  assert.equal(isUsableUsShipping({ ...shipping, street: "" }), false);
  assert.equal(isUsableUsShipping({ ...shipping, zip: "9513" }), false);
});

test("validatePaypalCheckout allows email-only when tax is undecided", () => {
  const result = validatePaypalCheckout({ contact: { email: "Ada@Example.com" } });
  assert.equal(result.email, "ada@example.com");
  assert.equal(result.shippingSource, "paypal");
  assert.equal(result.shipping.street, "");
  assert.throws(() => validatePaypalCheckout({ contact: { email: "nope" } }), (e) => e instanceof QuoteError && e.code === "invalid_email");
  assert.throws(
    () => validatePaypalCheckout({ contact: { email: "ada@example.com", phone: "(512) 555-0134" }, shipping: { firstName: "Ada" } }),
    { code: "invalid_name" },
  );
  const full = validatePaypalCheckout(checkoutBody);
  assert.equal(full.shipping.state, "TX");
  assert.equal(full.shippingSource, "checkout");
});

test("publicConfig exposes the public PayPal client id and never a secret", () => {
  const off = publicConfig({});
  assert.deepEqual(off.paypal, { enabled: false, clientId: "", env: "sandbox" });
  const on = publicConfig({ PAYPAL_CLIENT_ID: "ACid", PAYPAL_CLIENT_SECRET: "secret", PAYPAL_ENV: "live" });
  assert.deepEqual(on.paypal, { enabled: true, clientId: "ACid", env: "live" });
  assert.equal(JSON.stringify(on).includes("secret"), false);
  assert.equal(on.wallets.applePay, true);
});

test("storefrontOrigin prefers www / store hosts for return URLs", () => {
  const www = new Request("https://apgo-us-store.example/api/checkout/paypal/order", { headers: { Origin: "https://www.shopapgo.com" } });
  assert.equal(storefrontOrigin(www, { PAYPAL_ENV: "live" }), "https://www.shopapgo.com");
  const store = new Request("https://store.shopapgo.com/api/checkout/paypal/order");
  assert.equal(storefrontOrigin(store, {}), "https://store.shopapgo.com");
  const bare = new Request("https://worker.example/api/x");
  assert.equal(storefrontOrigin(bare, { PAYPAL_ENV: "live" }), "https://www.shopapgo.com");
});

test("paypalOrderPayload uses server totals and GET_FROM_FILE when no address", () => {
  const quote = {
    currency: "USD",
    totalCents: 12897,
    subtotalCents: 11997,
    shippingCents: 900,
    taxCents: 0,
    lines: [{ sku: "D204", name: "APGO Atomic Colored Glaze", qty: 1, unitCents: 5999 }],
  };
  const empty = paypalOrderPayload({
    orderId: "APGO-US-AAAAAAAAAAAA",
    quote,
    checkout: { shipping: { firstName: "", lastName: "", street: "", city: "", state: "", zip: "" } },
    returnUrl: "https://www.shopapgo.com/checkout?order=APGO-US-AAAAAAAAAAAA&paypal=return",
    cancelUrl: "https://www.shopapgo.com/checkout?order=APGO-US-AAAAAAAAAAAA&paypal=cancel",
  });
  assert.equal(empty.intent, "CAPTURE");
  assert.equal(empty.purchase_units[0].amount.value, "128.97");
  assert.equal(empty.application_context.shipping_preference, "GET_FROM_FILE");
  assert.equal(empty.purchase_units[0].shipping, undefined);

  const withAddr = paypalOrderPayload({
    orderId: "APGO-US-AAAAAAAAAAAA",
    quote,
    checkout: { shipping: checkoutBody.shipping },
    returnUrl: "https://store.shopapgo.com/checkout?order=APGO-US-AAAAAAAAAAAA&paypal=return",
    cancelUrl: "https://store.shopapgo.com/checkout?order=APGO-US-AAAAAAAAAAAA&paypal=cancel",
  });
  assert.equal(withAddr.application_context.shipping_preference, "SET_PROVIDED_ADDRESS");
  assert.equal(withAddr.purchase_units[0].shipping.address.admin_area_1, "TX");
});

test("inspectPaypalOrder reads COMPLETED from a capture", () => {
  const inspected = inspectPaypalOrder({
    id: "5O190127TN364715T",
    status: "COMPLETED",
    purchase_units: [{
      custom_id: "APGO-US-AAAAAAAAAAAA",
      amount: { currency_code: "USD", value: "128.97" },
      payments: { captures: [{ status: "COMPLETED", amount: { currency_code: "USD", value: "128.97" } }] },
      shipping: {
        name: { full_name: "Ada Lee" },
        address: { address_line_1: "1 Main", admin_area_2: "Austin", admin_area_1: "TX", postal_code: "78701", country_code: "US" },
      },
    }],
    payer: { name: { given_name: "Ada", surname: "Lee" } },
  });
  assert.equal(inspected.status, "COMPLETED");
  assert.equal(inspected.storeOrderId, "APGO-US-AAAAAAAAAAAA");
  assert.equal(isUsableUsShipping(inspected.shipping), true);
});

// ---------- HTTP (D1) ----------

async function createPaypalStoreOrder(env, fake = createFakePaypal(), body = checkoutBody) {
  resetPaypalTokenCache();
  return withFetch(fake.handler, async () => {
    const ctx = ctxStub();
    const response = await call(env, "/api/checkout/paypal/order", post(body), ctx);
    await ctx.settled();
    assert.equal(response.status, 200, await response.clone().text());
    return { session: await response.json(), fake };
  });
}

test("PayPal create stores a pending APGO-US order and returns the PayPal order id", { skip }, async () => {
  const db = await createD1();
  let sent;
  const fake = createFakePaypal({ onCreate: (payload, init) => { sent = { payload, requestId: init.headers["PayPal-Request-Id"] }; } });
  const { session } = await createPaypalStoreOrder(baseEnv(db), fake);
  assert.match(session.orderId, /^APGO-US-[0-9A-HJKMNP-TV-Z]{12}$/);
  assert.equal(session.paypal.id, "5O190127TN364715T");
  assert.equal(session.quote.totalCents, 12796);
  assert.equal(session.eventIds.initiateCheckout, metaEventId("InitiateCheckout", session.orderId));
  assert.equal(session.eventIds.purchase, `purchase_${session.orderId}`);
  assert.equal(sent.payload.purchase_units[0].amount.value, "127.96");
  assert.equal(sent.payload.purchase_units[0].custom_id, session.orderId);
  assert.equal(sent.requestId, session.orderId);
  assert.match(sent.payload.application_context.return_url, /store\.shopapgo\.com\/checkout\?order=/);
  const row = await db.prepare("SELECT status, payment_intent_id, total_cents FROM orders WHERE id = ?").bind(session.orderId).first();
  assert.deepEqual(row, { status: "pending", payment_intent_id: "5O190127TN364715T", total_cents: 12796 });
  const payment = await db.prepare("SELECT provider, provider_ref FROM order_payments WHERE order_id = ?").bind(session.orderId).first();
  assert.deepEqual(payment, { provider: "paypal", provider_ref: "5O190127TN364715T" });
});

test("PayPal create without shipping still prices from the catalog and asks PayPal for the address", { skip }, async () => {
  const db = await createD1();
  let sent;
  const fake = createFakePaypal({ onCreate: (payload) => { sent = payload; } });
  const { session } = await createPaypalStoreOrder(baseEnv(db), fake, {
    items: checkoutBody.items,
    contact: { email: "ada@example.com" },
  });
  assert.equal(session.quote.totalCents, 12796, "default shipping ($7.99 standard) when method is omitted");
  assert.equal(sent.application_context.shipping_preference, "GET_FROM_FILE");
});

test("a failed PayPal create returns a generic 502 and leaves the checkout open for the next try (D36)", { skip }, async () => {
  const db = await createD1();
  resetPaypalTokenCache();
  await withFetch(
    (url) => {
      if (url.endsWith("/v1/oauth2/token")) return new Response(JSON.stringify({ access_token: "t", expires_in: 300 }), { status: 200, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ name: "UNPROCESSABLE_ENTITY", message: "bad amount", details: [{ issue: "INVALID_PARAMETER" }] }), { status: 422, headers: { "Content-Type": "application/json" } });
    },
    async () => {
      const response = await call(baseEnv(db), "/api/checkout/paypal/order", post(checkoutBody));
      assert.equal(response.status, 502);
      assert.ok(!JSON.stringify(await response.json()).includes("bad amount"));
    },
  );
  assert.equal((await db.prepare("SELECT status FROM orders").first()).status, "pending");
});

test("PayPal create is closed in prod until PRICING_APPROVED, same as cards", { skip }, async () => {
  const db = await createD1();
  const response = await call(baseEnv(db, { AIRWALLEX_ENV: "prod" }), "/api/checkout/paypal/order", post(checkoutBody));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "store_not_ready");
});

test("capture writes the PayPal shipping address and marks the order paid", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  const fake = createFakePaypal();
  const { session } = await createPaypalStoreOrder(env, fake);
  fake.approve();

  const captured = await withFetch(fake.handler, async () => {
    const ctx = ctxStub();
    const response = await call(env, "/api/checkout/paypal/capture", post({ paypalOrderId: session.paypal.id }), ctx);
    await ctx.settled();
    assert.equal(response.status, 200);
    return response.json();
  });
  assert.equal(captured.status, "paid");
  assert.equal(captured.orderId, session.orderId);
  const row = await db.prepare("SELECT status, shipping_json, paid_at FROM orders WHERE id = ?").bind(session.orderId).first();
  assert.equal(row.status, "paid");
  assert.ok(row.paid_at);
  const { addressCheck, ...stored } = JSON.parse(row.shipping_json);
  assert.deepEqual(stored, {
    firstName: "Ada",
    lastName: "Lee",
    street: "100 Example Ave",
    street2: "Apt 4",
    city: "Austin",
    state: "TX",
    zip: "78701",
    phone: "+15125550134",
  });
  // Same address as our checkout, so its check result stays (no Google key in tests: "unverified").
  assert.deepEqual({ status: addressCheck.status, reason: addressCheck.reason }, { status: "unverified", reason: "not_configured" });
});

test("capture refuses to take payment when PayPal has no usable US address", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  const fake = createFakePaypal({ shipping: { name: { full_name: "Ada Lee" }, address: { country_code: "CA", address_line_1: "1 King", admin_area_2: "Toronto", admin_area_1: "ON", postal_code: "M5V 2T6" } } });
  const { session } = await createPaypalStoreOrder(env, fake);
  fake.approve(session.paypal.id, {
    shipping: { name: { full_name: "Ada Lee" }, address: { country_code: "CA", address_line_1: "1 King", admin_area_2: "Toronto", admin_area_1: "ON", postal_code: "M5V 2T6" } },
  });
  await withFetch(fake.handler, async () => {
    const response = await call(env, "/api/checkout/paypal/capture", post({ paypalOrderId: session.paypal.id }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "missing_shipping_address");
  });
  assert.equal((await db.prepare("SELECT status FROM orders WHERE id = ?").bind(session.orderId).first()).status, "pending");
});

test("webhook PAYMENT.CAPTURE.COMPLETED is idempotent and stores the PayPal address", { skip }, async () => {
  const db = await createD1();
  const notifyCalls = [];
  const env = baseEnv(db, { ORDER_NOTIFY_WEBHOOK_URL: "https://hooks.example/notify" });
  const fake = createFakePaypal();
  const { session } = await createPaypalStoreOrder(env, fake);
  fake.complete();

  const event = {
    id: "WH-EVENT-1",
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: {
      id: "CAP-1",
      status: "COMPLETED",
      custom_id: session.orderId,
      amount: { currency_code: "USD", value: "127.96" },
      supplementary_data: { related_ids: { order_id: session.paypal.id } },
    },
  };

  await withFetch(
    (url, init) => {
      if (url.startsWith("https://hooks.example")) { notifyCalls.push(JSON.parse(init.body)); return new Response("ok"); }
      return fake.handler(url, init);
    },
    async () => {
      const ctx = ctxStub();
      const first = await call(env, "/api/webhooks/paypal", { method: "POST", headers: paypalHeaders(), body: JSON.stringify(event) }, ctx);
      await ctx.settled();
      assert.deepEqual(await first.json(), { received: true, duplicate: false });
      const ctx2 = ctxStub();
      const again = await call(env, "/api/webhooks/paypal", { method: "POST", headers: paypalHeaders(), body: JSON.stringify(event) }, ctx2);
      await ctx2.settled();
      assert.deepEqual(await again.json(), { received: true, duplicate: true });
    },
  );

  const row = await db.prepare("SELECT status, shipping_json FROM orders WHERE id = ?").bind(session.orderId).first();
  assert.equal(row.status, "paid");
  assert.equal(JSON.parse(row.shipping_json).street, "100 Example Ave");
  assert.equal(notifyCalls.length, 1);
});

test("webhook: captured payment with a bad address or amount goes to review, never paid", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db, { ORDER_NOTIFY_WEBHOOK_URL: "https://hooks.example/notify" });
  const fake = createFakePaypal({
    shipping: { name: { full_name: "X" }, address: { country_code: "US" } },
  });
  const { session } = await createPaypalStoreOrder(env, fake);
  fake.complete();
  fake.orders.get(session.paypal.id).shipping = { name: { full_name: "X" }, address: { country_code: "US" } };

  await withFetch(
    (url, init) => {
      if (url.startsWith("https://hooks.example")) throw new Error("must not notify review orders");
      return fake.handler(url, init);
    },
    async () => {
      const event = {
        id: "WH-EVENT-REVIEW",
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: { supplementary_data: { related_ids: { order_id: session.paypal.id } }, custom_id: session.orderId },
      };
      const ctx = ctxStub();
      assert.equal((await call(env, "/api/webhooks/paypal", { method: "POST", headers: paypalHeaders(), body: JSON.stringify(event) }, ctx)).status, 200);
      await ctx.settled();
    },
  );
  assert.equal((await db.prepare("SELECT status FROM orders WHERE id = ?").bind(session.orderId).first()).status, "review");
});

test("webhook rejects missing or failed signatures and does not settle", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  const fake = createFakePaypal({ verifyStatus: "FAILURE" });
  const { session } = await createPaypalStoreOrder(env, fake);
  fake.complete();
  const event = { id: "WH-BAD", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { supplementary_data: { related_ids: { order_id: session.paypal.id } } } };
  await withFetch(fake.handler, async () => {
    assert.equal((await call(env, "/api/webhooks/paypal", { method: "POST", headers: paypalHeaders(), body: JSON.stringify(event) })).status, 400);
    assert.equal((await call(env, "/api/webhooks/paypal", { method: "POST", body: JSON.stringify(event) })).status, 400);
    assert.equal((await call(baseEnv(db, { PAYPAL_WEBHOOK_ID: "" }), "/api/webhooks/paypal", { method: "POST", headers: paypalHeaders(), body: JSON.stringify(event) })).status, 400);
  });
  assert.equal((await db.prepare("SELECT status FROM orders WHERE id = ?").bind(session.orderId).first()).status, "pending");
});

test("GET /api/orders/:id auto-captures an APPROVED PayPal order that has a US address", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  const fake = createFakePaypal();
  const { session } = await createPaypalStoreOrder(env, fake);
  fake.approve();
  const body = await withFetch(fake.handler, async () => {
    const ctx = ctxStub();
    const response = await call(env, `/api/orders/${session.orderId}`, {}, ctx);
    await ctx.settled();
    return response.json();
  });
  assert.equal(body.status, "paid");
  assert.equal(body.paymentStatus, "COMPLETED");
  assert.ok(!JSON.stringify(body).includes("Example Ave"));
});

test("PayPal InitiateCheckout and Purchase share ic_/purchase_ event ids and keep META_TEST_EVENT_CODE", { skip }, async () => {
  const db = await createD1();
  const meta = createFakeMeta();
  const env = baseEnv(db, { ...FAKE_META_ENV, META_TEST_EVENT_CODE: "TEST27938" });
  const fake = createFakePaypal();
  resetPaypalTokenCache();

  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.startsWith("https://graph.facebook.com/")) return meta.fetch(href, init);
    return fake.handler(href, init);
  };
  try {
    const ctx = ctxStub();
    const created = await call(env, "/api/checkout/paypal/order", post({
      ...checkoutBody,
      attribution: { sourceUrl: "https://www.shopapgo.com/checkout.html", fbp: "fb.1.1759600000000.1" },
    }), ctx);
    await ctx.settled();
    assert.equal(created.status, 200);
    const session = await created.json();
    assert.equal(meta.events().length, 1);
    assert.equal(meta.events()[0].event_name, "InitiateCheckout");
    assert.equal(meta.events()[0].event_id, `ic_${session.orderId}`);
    assert.equal(meta.calls[0].body.test_event_code, "TEST27938");

    fake.approve();
    const ctx2 = ctxStub();
    const capture = await call(env, "/api/checkout/paypal/capture", post({ paypalOrderId: session.paypal.id }), ctx2);
    await ctx2.settled();
    assert.equal(capture.status, 200);
    const purchases = meta.events().filter((e) => e.event_name === "Purchase");
    assert.equal(purchases.length, 1);
    assert.equal(purchases[0].event_id, `purchase_${session.orderId}`);
    assert.equal(purchases[0].custom_data.value, 127.96);
    assert.equal(purchases[0].custom_data.order_id, session.orderId);
    assert.equal(meta.calls[1].body.test_event_code, "TEST27938");
    assert.ok(meta.calls.every((c) => c.url.includes(FAKE_DATASET_ID)));
  } finally {
    globalThis.fetch = original;
  }
});

test("card checkout session is unchanged when PayPal credentials are present", { skip }, async () => {
  const db = await createD1();
  resetPaypalTokenCache();
  const { resetAirwallexTokenCache } = await import("../worker/airwallex.js");
  resetAirwallexTokenCache();
  const login = new Response(JSON.stringify({ token: "tok", expires_at: new Date(Date.now() + 1_800_000).toISOString().replace(/\.\d+Z$/, "+0000") }), { status: 201, headers: { "Content-Type": "application/json" } });
  await withFetch((url, init) => {
    if (url.endsWith("/authentication/login")) return login;
    if (url.endsWith("/payment_intents/create")) {
      const payload = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: "int_123", client_secret: "cs_secret", currency: payload.currency }), { status: 201, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`unexpected ${url}`);
  }, async () => {
    const response = await call(baseEnv(db, { AIRWALLEX_CLIENT_ID: "cid", AIRWALLEX_API_KEY: "key", AIRWALLEX_RETRY_DELAY_MS: "0" }), "/api/checkout/session", post(checkoutBody));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.intent.id, "int_123");
    assert.equal(body.intent.clientSecret, "cs_secret");
    assert.equal(body.paypal, undefined);
  });
});
