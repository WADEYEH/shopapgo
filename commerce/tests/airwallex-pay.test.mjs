// Airwallex Pay front-end contract. DOM-free helpers plus a static read of
// checkout.js / checkout.html so the Drop-in wiring cannot drift.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { publicConfig } from "../worker/catalog.js";
import {
  AIRWALLEX_PAY_CONTAINER_ID,
  AIRWALLEX_PAY_ELEMENT,
  AIRWALLEX_PAY_METHOD,
  airwallexPayEnabled,
  dropInOptions,
  dropInUpdate,
  shopperName,
} from "../prototype/js/commerce/airwallex-pay.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(ROOT, file), "utf8");

const session = {
  intent: { id: "int_1", clientSecret: "cs_1", currency: "USD" },
  quote: { currency: "USD", totalCents: 5999 },
};

test("airwallexPayEnabled honours storeReady and the operator flag", () => {
  assert.equal(airwallexPayEnabled({ storeReady: true, airwallexPay: { enabled: true } }), true);
  assert.equal(airwallexPayEnabled({ storeReady: true }), true, "older configs without the key still offer it");
  assert.equal(airwallexPayEnabled({ storeReady: false, airwallexPay: { enabled: true } }), false);
  assert.equal(airwallexPayEnabled({ storeReady: true, airwallexPay: { enabled: false } }), false);
  assert.equal(airwallexPayEnabled(null), false);
});

test("publicConfig exposes airwallexPay.enabled (default on)", () => {
  assert.deepEqual(publicConfig({}).airwallexPay, { enabled: true });
  assert.equal(publicConfig({ AIRWALLEX_PAY_ENABLED: "false" }).airwallexPay.enabled, false);
  assert.equal(publicConfig({ AIRWALLEX_PAY_ENABLED: "FALSE" }).airwallexPay.enabled, false);
  assert.equal(publicConfig({ AIRWALLEX_PAY_ENABLED: "true" }).airwallexPay.enabled, true);
});

test("dropInOptions restrict Drop-in to airwallex_pay on the existing PaymentIntent", () => {
  assert.equal(AIRWALLEX_PAY_METHOD, "airwallex_pay");
  assert.equal(AIRWALLEX_PAY_ELEMENT, "dropIn");
  assert.equal(AIRWALLEX_PAY_CONTAINER_ID, "airwallex-pay");
  assert.equal(shopperName({ firstName: "Ada", lastName: "Lee" }), "Ada Lee");

  const options = dropInOptions(session, {
    email: "ada@example.com",
    shipping: { firstName: "Ada", lastName: "Lee" },
    countryCode: "US",
  });
  assert.equal(options.intent_id, "int_1");
  assert.equal(options.client_secret, "cs_1");
  assert.equal(options.currency, "USD");
  assert.equal(options.country_code, "US");
  assert.deepEqual(options.methods, ["airwallex_pay"]);
  assert.equal(options.alwaysShowMethodLabel, true);
  assert.equal(options.shopper_email, "ada@example.com");
  assert.equal(options.shopper_name, "Ada Lee");
  assert.equal(options.submitType, "pay");
  assert.equal(options.methods.includes("card"), false);

  assert.deepEqual(dropInUpdate(session), {
    intent_id: "int_1",
    client_secret: "cs_1",
    currency: "USD",
    methods: ["airwallex_pay"],
  });

  assert.throws(() => dropInOptions({ quote: session.quote }), /airwallex_pay_session_required/);
});

test("checkout.js mounts Drop-in restricted to airwallex_pay and keeps the card path", async () => {
  const source = await read("prototype/js/commerce/checkout.js");
  assert.ok(source.includes("createElement("));
  assert.ok(source.includes("AIRWALLEX_PAY_ELEMENT"));
  assert.ok(source.includes("dropInOptions"));
  assert.ok(source.includes("airwallexPayEnabled"));
  assert.ok(source.includes('payment_type: "airwallex_pay"'));
  assert.ok(source.includes("onWalletSuccess"));
  assert.ok(source.includes('state.payMethod !== "card"'));
  // Card session path stays on the Airwallex endpoint.
  assert.ok(source.includes('"/api/checkout/session"'));
  assert.ok(source.includes("cardNumber.confirm"));
});

test("checkout.html offers a choose-one payment method group", async () => {
  const html = await read("prototype/checkout.html");
  assert.ok(html.includes('data-pay-methods'));
  assert.ok(html.includes('data-pay-panel="airwallex_pay"'));
  assert.ok(html.includes('data-pay-panel="card"'));
  assert.ok(html.includes('data-pay-panel="paypal"'));
  assert.ok(html.includes('id="airwallex-pay"'));
  assert.ok(html.includes('id="card-number"'), "card fields stay in the markup");
  assert.ok(html.includes("data-paypal hidden"));
});
