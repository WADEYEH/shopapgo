// Back-office payment lookups (worker/payment-lookup.js via worker/admin.js): admin auth first, read-only,
// provider not configured -> 503, provider 404 -> 404, other provider errors -> 502, and only support fields
// come back (no card details, no payer email).
import assert from "node:assert/strict";
import test from "node:test";

import { handleAdminApi } from "../worker/admin.js";
import { resetAirwallexTokenCache } from "../worker/airwallex.js";
import { resetPaypalTokenCache } from "../worker/paypal.js";

const TOKEN = "admin-token-0123456789abcdef";
const INTENT = "int_hkdm0000test0001";
const PAYPAL_ORDER = "5O190127TN364715T";

const env = (extra = {}) => ({
  ADMIN_TOKEN: TOKEN,
  AIRWALLEX_ENV: "demo",
  AIRWALLEX_CLIENT_ID: "client",
  AIRWALLEX_API_KEY: "key",
  AIRWALLEX_RETRY_DELAY_MS: "0",
  PAYPAL_CLIENT_ID: "pp-client",
  PAYPAL_CLIENT_SECRET: "pp-secret",
  PAYPAL_RETRY_DELAY_MS: "0",
  ...extra,
});
const get = (path, headers = { Authorization: `Bearer ${TOKEN}` }, method = "GET") =>
  new Request(`https://admin.shop.example${path}`, { method, headers });
const call = (path, e = env(), headers, method) => handleAdminApi(get(path, headers, method), e, path);

const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const airwallexLogin = () => reply(201, { token: "t", expires_at: new Date(Date.now() + 30 * 60_000).toISOString().replace(/\.\d+Z$/, "+0000") });
const paypalLogin = () => reply(200, { access_token: "t", expires_in: 300 });

async function withFetch(handler, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET" });
    return handler(String(url));
  };
  resetAirwallexTokenCache();
  resetPaypalTokenCache();
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

test("lookups need admin auth like every other back-office API", async () => {
  await withFetch(() => assert.fail("no provider call without auth"), async () => {
    for (const path of [`/admin/api/airwallex/intents/${INTENT}`, `/admin/api/paypal/orders/${PAYPAL_ORDER}`]) {
      const response = await call(path, env(), {});
      assert.equal(response.status, 401, path);
    }
  });
});

test("lookups are GET only and answer 503 when the provider is not configured", async () => {
  await withFetch(() => assert.fail("no provider call"), async () => {
    assert.equal((await call(`/admin/api/airwallex/intents/${INTENT}`, env(), undefined, "POST")).status, 405);
    const airwallex = await call(`/admin/api/airwallex/intents/${INTENT}`, env({ AIRWALLEX_API_KEY: "" }));
    assert.equal(airwallex.status, 503);
    assert.equal((await airwallex.json()).error.code, "airwallex_not_configured");
    const paypal = await call(`/admin/api/paypal/orders/${PAYPAL_ORDER}`, env({ PAYPAL_CLIENT_SECRET: "" }));
    assert.equal(paypal.status, 503);
    assert.equal((await paypal.json()).error.code, "paypal_not_configured");
  });
});

test("malformed ids never reach the provider", async () => {
  await withFetch(() => assert.fail("no provider call"), async () => {
    for (const path of ["/admin/api/airwallex/intents/int-with-dash", "/admin/api/airwallex/intents/", "/admin/api/paypal/orders/lowercase123", "/admin/api/paypal/orders/AB"]) {
      assert.equal((await call(path)).status, 404, path);
    }
  });
});

test("Airwallex lookup returns the intent and its latest attempt without card details", async () => {
  const intent = {
    id: INTENT,
    status: "REQUIRES_PAYMENT_METHOD",
    amount: 67.98,
    currency: "USD",
    merchant_order_id: "APGO-US-0123456789AB",
    created_at: "2026-10-05T10:00:00+0000",
    updated_at: "2026-10-05T10:01:00+0000",
    next_action: { type: "redirect" },
    latest_payment_attempt: {
      id: "att_1",
      status: "FAILED",
      failure_code: "issuer_declined",
      failure_details: { reason: "do_not_honor" },
      provider_original_response_code: "05",
      provider_original_response_msg: "x".repeat(600),
      payment_method: { type: "card", card: { number: "4035501000000008", name: "Ada Lee", last4: "0008" } },
    },
  };
  await withFetch((url) => {
    if (url.endsWith("/api/v1/authentication/login")) return airwallexLogin();
    if (url.endsWith(`/api/v1/pa/payment_intents/${INTENT}`)) return reply(200, intent);
    return reply(404, { code: "resource_not_found" });
  }, async (calls) => {
    const response = await call(`/admin/api/airwallex/intents/${INTENT}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
    const body = await response.json();
    assert.equal(body.status, "REQUIRES_PAYMENT_METHOD");
    assert.equal(body.merchant_order_id, "APGO-US-0123456789AB");
    assert.equal(body.next_action, "redirect");
    assert.deepEqual({ ...body.latest_payment_attempt, provider_original_response_msg: undefined }, {
      id: "att_1",
      status: "FAILED",
      payment_method: "card",
      failure_code: "issuer_declined",
      failure_details: { reason: "do_not_honor" },
      provider_original_response_code: "05",
      provider_original_response_msg: undefined,
    });
    assert.equal(body.latest_payment_attempt.provider_original_response_msg.length, 400);
    assert.ok(!JSON.stringify(body).includes("4035501000000008") && !JSON.stringify(body).includes("Ada Lee"), "no card details");
    assert.ok(calls.every((entry) => entry.method === "GET" || entry.url.endsWith("/authentication/login")), "read-only");
  });
});

test("Airwallex lookup: unknown id -> 404, provider failure -> 502 with the provider status", async () => {
  await withFetch((url) => (url.endsWith("/api/v1/authentication/login") ? airwallexLogin() : reply(404, { code: "resource_not_found", message: "not found" })), async () => {
    const response = await call(`/admin/api/airwallex/intents/${INTENT}`);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "not_found");
  });
  await withFetch((url) => (url.endsWith("/api/v1/authentication/login") ? airwallexLogin() : reply(500, { code: "internal_error", message: "boom" })), async () => {
    const response = await call(`/admin/api/airwallex/intents/${INTENT}`);
    assert.equal(response.status, 502);
    const { error } = await response.json();
    assert.equal(error.code, "provider_error");
    assert.equal(error.providerStatus, 500);
  });
});

test("PayPal lookup returns the order, captures and countries, never the payee email", async () => {
  const order = {
    id: PAYPAL_ORDER,
    status: "COMPLETED",
    intent: "CAPTURE",
    create_time: "2026-10-05T10:00:00Z",
    update_time: "2026-10-05T10:02:00Z",
    purchase_units: [{
      reference_id: "APGO-US-0123456789AB",
      amount: { currency_code: "USD", value: "67.98" },
      payee: { merchant_id: "MERCHANT1", email_address: "seller@example.com" },
      shipping: { type: "SHIPPING", address: { country_code: "US", postal_code: "78701" }, name: { full_name: "Ada Lee" } },
      payments: { captures: [{ id: "CAP1", status: "COMPLETED", status_details: null, amount: { value: "67.98" } }] },
    }],
    payer: { email_address: "buyer@example.com", name: { given_name: "Ada" }, address: { country_code: "US" } },
    payment_source: { paypal: { email_address: "buyer@example.com", experience_context: { shipping_preference: "GET_FROM_FILE" } } },
    links: [{ rel: "self", href: "https://api.sandbox.paypal.com/v2/checkout/orders/x" }],
  };
  await withFetch((url) => {
    if (url.endsWith("/v1/oauth2/token")) return paypalLogin();
    if (url.endsWith(`/v2/checkout/orders/${PAYPAL_ORDER}`)) return reply(200, order);
    return reply(404, { name: "RESOURCE_NOT_FOUND" });
  }, async () => {
    const response = await call(`/admin/api/paypal/orders/${PAYPAL_ORDER}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.env, "sandbox");
    assert.equal(body.status, "COMPLETED");
    assert.deepEqual(body.purchase_units[0].payee, { merchant_id: "MERCHANT1", email_set: true });
    assert.equal(body.purchase_units[0].shipping_country, "US");
    assert.deepEqual(body.purchase_units[0].captures, [{ status: "COMPLETED", status_details: null }]);
    assert.equal(body.payer_country, "US");
    assert.deepEqual(body.payment_source_keys, ["paypal"]);
    assert.deepEqual(body.links, ["self"]);
    const text = JSON.stringify(body);
    assert.ok(!text.includes("@example.com") && !text.includes("Ada") && !text.includes("78701"), "no emails, names or postal codes");
  });
});
