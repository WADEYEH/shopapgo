// PayPal Checkout front-end contract (docs/paypal.md on PR #7). DOM-free helpers
// plus a static read of the checkout page (components/shop/checkout/CheckoutPage.js) so the JS SDK wiring cannot drift.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  PAYPAL_SESSION_KEY,
  paypalEnabled,
  paypalOrderPayload,
  paypalSdkUrl,
  readPaypalOrder,
  storePaypalOrder,
} from "../prototype/js/commerce/paypal.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(ROOT, file), "utf8");

const enabledConfig = {
  storeReady: true,
  paypal: { enabled: true, clientId: "test-client", env: "sandbox" },
};

test("paypalEnabled requires storeReady, paypal.enabled, and a public clientId", () => {
  assert.equal(paypalEnabled(enabledConfig), true);
  assert.equal(paypalEnabled({ ...enabledConfig, storeReady: false }), false);
  assert.equal(paypalEnabled({ storeReady: true, paypal: { enabled: false, clientId: "test-client" } }), false);
  assert.equal(paypalEnabled({ storeReady: true, paypal: { enabled: true, clientId: "" } }), false);
  assert.equal(paypalEnabled({ storeReady: true, paypal: { enabled: true, clientId: "   " } }), false);
  assert.equal(paypalEnabled({ storeReady: true }), false);
  assert.equal(paypalEnabled(null), false);
  assert.equal(paypalEnabled(undefined), false);
});

test("paypalSdkUrl is the documented live SDK URL (public client id, USD, capture)", () => {
  assert.equal(
    paypalSdkUrl("AeA-public-id"),
    "https://www.paypal.com/sdk/js?client-id=AeA-public-id&currency=USD&intent=capture",
  );
  assert.equal(
    paypalSdkUrl("id with space"),
    "https://www.paypal.com/sdk/js?client-id=id%20with%20space&currency=USD&intent=capture",
  );
});

test("paypalOrderPayload is items + contact + optional shipping/method/attribution, never prices", () => {
  const items = [{ sku: "d204", qty: 1 }];
  const contact = { email: "ada@example.com", marketingOptIn: false };
  const shipping = { firstName: "Ada", lastName: "Lee", street: "100 Example Ave", city: "Austin", state: "TX", zip: "78701" };
  const attribution = { fbp: "fb.1.1.2", sourceUrl: "https://www.shopapgo.com/checkout.html" };

  assert.deepEqual(paypalOrderPayload({ items, contact }), { items, contact });
  assert.deepEqual(paypalOrderPayload({ items, contact, shipping, method: "express", attribution }), {
    items,
    contact,
    shipping,
    method: "express",
    attribution,
  });
  assert.deepEqual(paypalOrderPayload({ items, contact, attribution: {} }), { items, contact });

  const json = JSON.stringify(paypalOrderPayload({ items, contact, shipping, method: "express", attribution }));
  assert.equal(/price|cents|total/i.test(json), false);
});

test("sessionStorage helper remembers the create-order response", () => {
  const store = new Map();
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  };
  const data = { orderId: "APGO-US-0A2B3C4D5E6F", paypal: { id: "5O190127TN364715T" }, eventIds: { initiateCheckout: "ic_APGO-US-0A2B3C4D5E6F" } };
  storePaypalOrder(data, storage);
  assert.equal(store.get(PAYPAL_SESSION_KEY), JSON.stringify(data));
  assert.deepEqual(readPaypalOrder(storage), data);
  assert.equal(readPaypalOrder({ getItem: () => "{not-json" }), null);
});

test("the checkout wires the documented PayPal create / capture / return / cancel contract", async () => {
  const source = await read("../components/shop/checkout/CheckoutPage.js");
  assert.ok(source.includes("/api/checkout/paypal/order"));
  assert.ok(source.includes("/api/checkout/paypal/capture"));
  assert.ok(source.includes("paypalOrderId"));
  assert.ok(source.includes('result.status === "paid"'));
  assert.ok(source.includes('result.status === "review"'));
  assert.ok(source.includes('track("checkout_session_created"'));
  assert.ok(source.includes('track("purchase"'));
  assert.ok(source.includes("paypalSdkUrl"));
  assert.ok(source.includes('params.get("paypal")'));
  assert.ok(source.includes('paypalFlag === "return"'));
  assert.ok(source.includes('paypalFlag === "cancel"'));
  assert.ok(source.includes("handlePaypalReturn"));
  assert.ok(source.includes("No payment was taken"));
  // Card session path stays on the Airwallex endpoint.
  assert.ok(source.includes('"/api/checkout/session"'));
  // Do not invent Meta event ids — Pixel still uses ic_ / purchase_ via meta-pixel.js.
  assert.ok(!source.includes("fbq("));
  assert.ok(!/eventIds\.(initiateCheckout|purchase)/.test(source) || source.includes("ic_<orderId>"));
});

test("the checkout hides the PayPal slot until the buttons are ready", async () => {
  const html = await read("../components/shop/checkout/CheckoutPage.js");
  assert.ok(html.includes('id="paypal-button"'));
  assert.ok(html.includes('data-paypal="" hidden={!paypalShown}'));
  assert.ok(html.includes("data-payment-intro"));
  assert.ok(html.includes("data-pay-methods"));
  assert.ok(html.includes('data-pay-panel="paypal"'));
  assert.ok(html.includes('data-pay-panel="card"'));
  assert.ok(!html.includes("www.paypal.com/sdk/js"), "SDK is loaded from config.clientId (paypalSdkUrl), not hard-coded");
});

test("the checkout persists the draft in sessionStorage and treats PayPal vs card as choose-one", async () => {
  const source = await read("../components/shop/checkout/CheckoutPage.js");
  assert.ok((await read("../lib/shop/checkout.js")).includes("checkout-draft.js"));
  assert.ok(source.includes("readCheckoutDraft"));
  assert.ok(source.includes("writeCheckoutDraft"));
  assert.ok(source.includes("clearCheckoutDraft"));
  assert.ok(source.includes("restoreDraft"));
  assert.ok(source.includes("clearCheckoutDraft"));
  assert.ok(!source.includes("localStorage"));
  assert.ok(source.includes('s.payMethod !== "paypal"'));
  assert.ok(source.includes('s.payMethod !== "card"'));
  assert.ok(source.includes('data-pay-panel="card" hidden={payMethod !== "card"}'));
  assert.ok(source.includes('data-pay-panel="paypal" hidden={payMethod !== "paypal" || !paypalShown}'));
  assert.ok(source.includes('data-pay-methods="" hidden={choices.length < 2}'));
});
