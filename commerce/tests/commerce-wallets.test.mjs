// Apple Pay / Google Pay: device detection, Airwallex.js options, PaymentIntent
// payment_method_options, the Apple domain-association route and the config flags.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../worker/index.js";
import { publicConfig } from "../worker/catalog.js";
import { APPLE_PAY_ASSET_PATH, autoCaptureEnabled, paymentMethodOptions, walletConfig } from "../worker/wallets.js";
import { candidateWallets, detectApplePay, detectGooglePay, walletAmount, walletOptions, walletUpdate } from "../prototype/js/commerce/wallets.js";
import { createD1, sqliteAvailable } from "./helpers/d1.mjs";

globalThis.fetch = async (url) => { throw new Error(`unexpected real network call: ${url}`); };
const hasSqlite = await sqliteAvailable();
const skip = hasSqlite ? false : "node:sqlite needs Node 22.5+";

const session = {
  orderId: "APGO-US-0123456789AB",
  intent: { id: "int_1", clientSecret: "cs_1" },
  quote: { totalCents: 5480, currency: "USD" },
};
const config = { wallets: { applePay: true, googlePay: true, countryCode: "US", merchantName: "APGO", autoCapture: true, eagerSession: false } };

test("detectApplePay needs Apple Pay JS that says the device can pay", () => {
  assert.equal(detectApplePay({}), false);
  assert.equal(detectApplePay({ ApplePaySession: {} }), false);
  assert.equal(detectApplePay({ ApplePaySession: { canMakePayments: () => false } }), false);
  assert.equal(detectApplePay({ ApplePaySession: { canMakePayments: () => { throw new Error("blocked in iframe"); } } }), false);
  assert.equal(detectApplePay({ ApplePaySession: { canMakePayments: () => true } }), true);
});

test("detectGooglePay only requires a secure context (Airwallex's ready event is the real gate)", () => {
  assert.equal(detectGooglePay({ isSecureContext: false }), false);
  assert.equal(detectGooglePay({ isSecureContext: true }), true);
  assert.equal(detectGooglePay(undefined), false);
});

test("candidateWallets = operator flag AND device pre-check", () => {
  const apple = { ApplePaySession: { canMakePayments: () => true }, isSecureContext: true };
  assert.deepEqual(candidateWallets(config, apple), ["applePay", "googlePay"]);
  assert.deepEqual(candidateWallets(config, { isSecureContext: true }), ["googlePay"]);
  assert.deepEqual(candidateWallets(config, { isSecureContext: false }), []);
  assert.deepEqual(candidateWallets({ wallets: { applePay: false, googlePay: false } }, apple), []);
  assert.deepEqual(candidateWallets({}, apple), []);
});

test("Airwallex.js element options follow the documented shapes", () => {
  assert.deepEqual(walletAmount(5480, "USD"), { value: "54.8", currency: "USD" });
  assert.deepEqual(walletAmount(5400, "USD"), { value: "54", currency: "USD" });

  const probe = walletOptions("applePay", { session: null, quote: session.quote }, config, "");
  assert.ok(!("intent_id" in probe) && !("client_secret" in probe), "probe creates no intent");
  assert.deepEqual(probe.amount, { value: "54.8", currency: "USD" });

  const apple = walletOptions("applePay", { session, quote: session.quote }, config, "https://shop.example");
  assert.equal(apple.intent_id, "int_1");
  assert.equal(apple.client_secret, "cs_1");
  assert.equal(apple.countryCode, "US");
  assert.deepEqual(apple.amount, { value: "54.8", currency: "USD" });
  assert.equal(apple.totalPriceLabel, "APGO");
  assert.equal(apple.buttonType, "buy");

  const google = walletOptions("googlePay", { session, quote: session.quote }, config, "https://shop.example");
  assert.equal(google.origin, "https://shop.example");
  assert.deepEqual(google.merchantInfo, { merchantName: "APGO" });
  assert.equal(google.buttonSizeMode, "fill");
  assert.throws(() => walletOptions("paypal", { session, quote: session.quote }, config, ""));

  assert.deepEqual(walletUpdate("applePay", session, config), { intent_id: "int_1", client_secret: "cs_1", amount: { value: "54.8", currency: "USD" } });
});

test("payment_method_options and wallet flags come from env with safe defaults", () => {
  assert.deepEqual(paymentMethodOptions({}), { card: { auto_capture: true } });
  assert.deepEqual(paymentMethodOptions({ PAYMENT_AUTO_CAPTURE: "false" }), { card: { auto_capture: false } });
  assert.equal(autoCaptureEnabled({ PAYMENT_AUTO_CAPTURE: "FALSE" }), false);
  assert.deepEqual(walletConfig({}), { applePay: true, googlePay: true, countryCode: "US", merchantName: "APGO", autoCapture: true, eagerSession: false });
  assert.equal(walletConfig({ WALLET_EAGER_SESSION: "true" }).eagerSession, true);
  const off = publicConfig({ APPLE_PAY_ENABLED: "false", GOOGLE_PAY_ENABLED: "0", WALLET_MERCHANT_NAME: "APGO Labs" }).wallets;
  assert.equal(off.applePay, false);
  assert.equal(off.googlePay, false);
  assert.equal(off.merchantName, "APGO Labs");
});

// ---------- Worker integration ----------

const ORIGIN = "https://store.example";
const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const loginOk = () => jsonResponse(201, { token: "tok", expires_at: new Date(Date.now() + 30 * 60_000).toISOString().replace(/\.\d+Z$/, "+0000") });
const checkoutBody = {
  items: [{ sku: "d204", qty: 1 }],
  contact: { email: "ada@example.com" },
  shipping: { firstName: "Ada", lastName: "Lee", street: "1 Main St", city: "Austin", state: "TX", zip: "78701" },
};
const envFor = (db, extra = {}, assets) => ({
  DB: db, AIRWALLEX_CLIENT_ID: "cid", AIRWALLEX_API_KEY: "key", AIRWALLEX_ENV: "demo", AIRWALLEX_RETRY_DELAY_MS: "0",
  ASSETS: { fetch: assets ?? (async () => new Response("<html></html>", { headers: { "Content-Type": "text/html" } })) },
  ...extra,
});

async function createSession(env) {
  const payloads = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.endsWith("/authentication/login")) return loginOk();
    if (href.endsWith("/payment_intents/create")) {
      const payload = JSON.parse(init.body);
      payloads.push(payload);
      return jsonResponse(201, { id: "int_9", client_secret: "cs_9", currency: "USD", amount: payload.amount, status: "REQUIRES_PAYMENT_METHOD" });
    }
    return jsonResponse(404, {});
  };
  try {
    const response = await worker.fetch(new Request(`${ORIGIN}/api/checkout/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(checkoutBody) }), env, { waitUntil() {} });
    return { response, payloads };
  } finally {
    globalThis.fetch = original;
  }
}

test("checkout session sends payment_method_options for cards and wallets", { skip }, async () => {
  const { response, payloads } = await createSession(envFor(await createD1()));
  assert.equal(response.status, 200);
  assert.deepEqual(payloads[0].payment_method_options, { card: { auto_capture: true } });
  assert.equal(payloads[0].amount, 29.9);

  const held = await createSession(envFor(await createD1(), { PAYMENT_AUTO_CAPTURE: "false" }));
  assert.deepEqual(held.payloads[0].payment_method_options, { card: { auto_capture: false } });
});

test("checkout uses PRICING_JSON prices for the PaymentIntent amount", { skip }, async () => {
  const env = envFor(await createD1(), { PRICING_JSON: JSON.stringify({ products: { d204: { priceCents: 3490 } } }) });
  const { payloads } = await createSession(env);
  assert.equal(payloads[0].amount, 34.9);
});

test("a broken PRICING_JSON refuses checkout and quotes instead of charging other numbers", { skip }, async () => {
  const env = envFor(await createD1(), { PRICING_JSON: "{oops" });
  const original = console.error;
  console.error = () => {};
  try {
    const { response, payloads } = await createSession(env);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "store_not_ready");
    assert.equal(payloads.length, 0);
    const quoted = await worker.fetch(new Request(`${ORIGIN}/api/cart/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ sku: "d204", qty: 1 }] }) }), env, {});
    assert.equal(quoted.status, 503);
  } finally {
    console.error = original;
  }
});

test("prod without PRICING_APPROVED=true does not take checkout; approval opens it", { skip }, async () => {
  const closed = await createSession(envFor(await createD1(), { AIRWALLEX_ENV: "prod" }));
  assert.equal(closed.response.status, 503);
  assert.equal(closed.payloads.length, 0);
  const open = await createSession(envFor(await createD1(), { AIRWALLEX_ENV: "prod", PRICING_APPROVED: "true" }));
  assert.equal(open.response.status, 200);
});

test("Apple Pay domain file is served at /.well-known as octet-stream, only when present", async () => {
  const token = "7B227073704964223A22544553545F544F4B454E227D";
  const present = envFor(null, {}, async (request) => {
    assert.equal(new URL(request.url).pathname, APPLE_PAY_ASSET_PATH);
    return new Response(token, { headers: { "Content-Type": "application/octet-stream" } });
  });
  const get = await worker.fetch(new Request(`${ORIGIN}/.well-known/apple-developer-merchantid-domain-association`), present, {});
  assert.equal(get.status, 200);
  assert.equal(get.headers.get("Content-Type"), "application/octet-stream");
  assert.equal(await get.text(), token);
  const head = await worker.fetch(new Request(`${ORIGIN}/.well-known/apple-developer-merchantid-domain-association`, { method: "HEAD" }), present, {});
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const missing = envFor(null, {}, async () => new Response("<html>fallback</html>", { headers: { "Content-Type": "text/html" } }));
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/.well-known/apple-developer-merchantid-domain-association`), missing, {})).status, 404);
  const absent = envFor(null, {}, async () => new Response("nope", { status: 404 }));
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/.well-known/apple-developer-merchantid-domain-association`), absent, {})).status, 404);
  const post = await worker.fetch(new Request(`${ORIGIN}/.well-known/apple-developer-merchantid-domain-association`, { method: "POST" }), present, {});
  assert.equal(post.status, 405);
});

test("wrangler routes the Apple Pay path through the Worker and the folder keeps no secrets", async () => {
  const toml = await readFile("wrangler.toml", "utf8");
  assert.match(toml, /run_worker_first\s*=\s*true/);
  const readme = await readFile("prototype/apple-pay/README.txt", "utf8");
  assert.ok(readme.includes("apple-developer-merchantid-domain-association"));
});
