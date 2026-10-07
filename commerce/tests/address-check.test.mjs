// Address check at checkout (worker/address-check.js, M3 §4): Google Address Validation verdicts, the page's
// POST /api/checkout/address, and the second check when the payment is created. Google is faked; nothing leaves the machine.
import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.js";
import { ADDRESS_MESSAGES, checkAddress, clearAddressCache, enforceAddress, interpretValidation } from "../worker/address-check.js";
import { QuoteError } from "../worker/catalog.js";
import { buildNotification } from "../worker/notify.js";
import { createD1, sqliteAvailable } from "./helpers/d1.mjs";

globalThis.fetch = async (url) => { throw new Error(`unexpected real network call: ${url}`); };
const skip = (await sqliteAvailable()) ? false : "node:sqlite needs Node 22.5+";

const GOOGLE_URL = "https://addressvalidation.googleapis.com/v1:validateAddress";
const KEY = "test-google-key";
const ADDRESS = { firstName: "Ada", lastName: "Lee", street: "100 Example Ave", street2: "Apt 4", city: "Austin", state: "TX", zip: "78701" };

// A Google response in the documented shape (validateAddress: result.verdict, result.address.postalAddress, result.uspsData).
function google(possibleNextAction, { postalAddress = {}, usps = {}, verdict = {} } = {}) {
  return {
    result: {
      verdict: { inputGranularity: "SUB_PREMISE", validationGranularity: "SUB_PREMISE", addressComplete: true, possibleNextAction, ...verdict },
      address: {
        formattedAddress: "100 Example Ave Apt 4, Austin, TX 78701-1234, USA",
        postalAddress: { regionCode: "US", languageCode: "en", postalCode: "78701-1234", administrativeArea: "TX", locality: "Austin", addressLines: ["100 Example Ave Apt 4"], ...postalAddress },
      },
      uspsData: { dpvConfirmation: "Y", addressRecordType: "S", ...usps },
    },
    responseId: "resp-1",
  };
}

const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fakeGoogle(answer) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init, body: JSON.parse(init.body) });
    return typeof answer === "function" ? answer() : jsonResponse(200, answer);
  };
  return { calls, fetchImpl };
}

test("Google's verdicts map to the checkout's outcomes", () => {
  assert.deepEqual(interpretValidation(google("ACCEPT"), ADDRESS), { status: "valid" });
  assert.deepEqual(interpretValidation(google("FIX"), ADDRESS), { status: "undeliverable" });
  assert.deepEqual(interpretValidation(google("CONFIRM_ADD_SUBPREMISES"), ADDRESS), { status: "missing_unit" });
  assert.deepEqual(interpretValidation(google("ACCEPT", { usps: { addressRecordType: "P" } }), ADDRESS), { status: "po_box" });
  assert.deepEqual(interpretValidation(google("ACCEPT", { usps: { poBoxOnlyPostalCode: true } }), ADDRESS), { status: "po_box" });
  assert.deepEqual(interpretValidation({}, ADDRESS), { status: "unverified", reason: "no_verdict" });
  assert.deepEqual(interpretValidation(google("POSSIBLE_NEXT_ACTION_UNSPECIFIED"), ADDRESS), { status: "unverified", reason: "no_next_action" });
});

test("CONFIRM offers Google's spelling only when the shopper would see a difference", () => {
  // Only a ZIP+4 added and the unit moved onto the first line: nothing to ask.
  assert.deepEqual(interpretValidation(google("CONFIRM"), ADDRESS), { status: "valid" });
  // A corrected street: offered, in the checkout's own fields.
  const corrected = interpretValidation(google("CONFIRM", { postalAddress: { addressLines: ["100 Example Avenue", "Apt 4"], locality: "Austin" } }), ADDRESS);
  assert.deepEqual(corrected, { status: "suggest", suggestion: { street: "100 Example Avenue", street2: "Apt 4", city: "Austin", state: "TX", zip: "78701-1234" } });
  // A suggestion that breaks the checkout rules (here: outside the 48 states) is never offered.
  assert.deepEqual(interpretValidation(google("CONFIRM", { postalAddress: { administrativeArea: "AK", postalCode: "99501", locality: "Anchorage" } }), ADDRESS), { status: "valid" });
});

test("without a key, or without an answer, the address is unverified and the checkout goes on", async () => {
  clearAddressCache();
  const none = fakeGoogle(() => assert.fail("no request without a key"));
  assert.deepEqual(await checkAddress({}, ADDRESS, { fetchImpl: none.fetchImpl }), { status: "unverified", reason: "not_configured" });

  const down = fakeGoogle(() => jsonResponse(503, { error: { code: 503 } }));
  assert.deepEqual(await checkAddress({ GOOGLE_ADDRESS_VALIDATION_KEY: KEY }, ADDRESS, { fetchImpl: down.fetchImpl }), { status: "unverified", reason: "unavailable" });
  await checkAddress({ GOOGLE_ADDRESS_VALIDATION_KEY: KEY }, ADDRESS, { fetchImpl: down.fetchImpl });
  assert.equal(down.calls.length, 2, "a failed answer is not remembered");

  const broken = fakeGoogle(() => { throw new Error("socket hang up"); });
  assert.deepEqual(await checkAddress({ GOOGLE_ADDRESS_VALIDATION_KEY: KEY }, ADDRESS, { fetchImpl: broken.fetchImpl }), { status: "unverified", reason: "unavailable" });
});

test("the request carries the key in a header (never the URL), the US address and USPS CASS; answers are remembered briefly", async () => {
  clearAddressCache();
  const { calls, fetchImpl } = fakeGoogle(google("ACCEPT"));
  let now = 1_000_000;
  const env = { GOOGLE_ADDRESS_VALIDATION_KEY: KEY };
  assert.deepEqual(await checkAddress(env, ADDRESS, { fetchImpl, now: () => now }), { status: "valid" });
  assert.equal(calls[0].url, GOOGLE_URL);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["X-Goog-Api-Key"], KEY);
  assert.ok(!calls[0].url.includes(KEY));
  assert.deepEqual(calls[0].body, {
    address: { regionCode: "US", addressLines: ["100 Example Ave", "Apt 4"], locality: "Austin", administrativeArea: "TX", postalCode: "78701" },
    enableUspsCass: true,
  });
  await checkAddress(env, { ...ADDRESS, street: "100 EXAMPLE AVE." }, { fetchImpl, now: () => now });
  assert.equal(calls.length, 1, "the same address again (case, punctuation) is answered from memory");
  now += 16 * 60 * 1000;
  await checkAddress(env, ADDRESS, { fetchImpl, now: () => now });
  assert.equal(calls.length, 2, "after 15 minutes Google is asked again");
});

test("at payment time: blocked addresses throw with the field to fix; the rest record how the address was checked", async () => {
  const env = { GOOGLE_ADDRESS_VALIDATION_KEY: KEY };
  const enforce = async (answer, review) => {
    clearAddressCache();
    return enforceAddress(env, ADDRESS, review, { fetchImpl: fakeGoogle(answer).fetchImpl });
  };
  const refused = async (answer, code, field, review) => {
    await assert.rejects(enforce(answer, review), (error) => error instanceof QuoteError && error.code === code && error.field === field);
  };
  await refused(google("FIX"), "address_undeliverable", "street");
  await refused(google("ACCEPT", { usps: { addressRecordType: "P" } }), "address_po_box", "street");
  await refused(google("CONFIRM_ADD_SUBPREMISES"), "address_needs_unit", "street2");
  await refused(google("CONFIRM_ADD_SUBPREMISES"), "address_needs_unit", "street2", { noUnit: false });
  assert.equal((await enforce(google("CONFIRM_ADD_SUBPREMISES"), { noUnit: true })).status, "no_unit_confirmed");
  assert.equal((await enforce(google("ACCEPT"))).status, "verified");
  assert.equal((await enforce(google("ACCEPT"), { choice: "suggested" })).status, "corrected");
  assert.equal((await enforce(google("CONFIRM", { postalAddress: { addressLines: ["100 Example Avenue", "Apt 4"] } }), { choice: "original" })).status, "kept_original");
  const unverified = await enforceAddress({}, ADDRESS, {});
  assert.deepEqual({ status: unverified.status, reason: unverified.reason }, { status: "unverified", reason: "not_configured" });
  assert.match(unverified.checkedAt, /^\d{4}-\d\d-\d\dT/);
});

// ---------- Through the Worker ----------

const call = (env, path, body) =>
  worker.fetch(new Request(`https://store.example${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), env, { waitUntil() {} });

async function withFetch(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => handler(String(url), init);
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("POST /api/checkout/address: field errors name the field; otherwise Google's outcome with the shopper-facing message", async () => {
  clearAddressCache();
  const bad = await call({}, "/api/checkout/address", { shipping: { ...ADDRESS, zip: "10001" } });
  assert.equal(bad.status, 400);
  assert.deepEqual((await bad.json()).error, { code: "invalid_address", message: "This ZIP code doesn't match the state you selected.", field: "zip" });
  const box = await call({}, "/api/checkout/address", { shipping: { ...ADDRESS, street: "PO Box 12" } });
  assert.deepEqual((await box.json()).error.field, "street");

  assert.deepEqual(await (await call({}, "/api/checkout/address", { shipping: ADDRESS })).json(), { status: "unverified" });

  const env = { GOOGLE_ADDRESS_VALIDATION_KEY: KEY };
  await withFetch(() => jsonResponse(200, google("CONFIRM_ADD_SUBPREMISES")), async () => {
    assert.deepEqual(await (await call(env, "/api/checkout/address", { shipping: { ...ADDRESS, street2: "" } })).json(), { status: "missing_unit", message: ADDRESS_MESSAGES.missingUnit });
  });
  clearAddressCache();
  await withFetch(() => jsonResponse(200, google("CONFIRM", { postalAddress: { addressLines: ["100 Example Avenue", "Apt 4"] } })), async () => {
    const answer = await (await call(env, "/api/checkout/address", { shipping: ADDRESS })).json();
    assert.equal(answer.status, "suggest");
    assert.deepEqual(answer.suggestion, { street: "100 Example Avenue", street2: "Apt 4", city: "Austin", state: "TX", zip: "78701-1234" });
  });
});

const sessionEnv = (db) => ({
  DB: db,
  AIRWALLEX_CLIENT_ID: "cid",
  AIRWALLEX_API_KEY: "key",
  AIRWALLEX_WEBHOOK_SECRET: "whsec",
  AIRWALLEX_ENV: "demo",
  AIRWALLEX_RETRY_DELAY_MS: "0",
  GOOGLE_ADDRESS_VALIDATION_KEY: KEY,
});

function worldFetch(googleAnswer) {
  return (url, init) => {
    if (url === GOOGLE_URL) return jsonResponse(200, googleAnswer);
    if (url.endsWith("/authentication/login")) return jsonResponse(201, { token: "tok", expires_at: new Date(Date.now() + 1_800_000).toISOString().replace(/\.\d+Z$/, "+0000") });
    if (url.endsWith("/payment_intents/create")) {
      const payload = JSON.parse(init.body);
      return jsonResponse(201, { id: "int_1", client_secret: "cs_1", currency: payload.currency, amount: payload.amount, status: "REQUIRES_PAYMENT_METHOD" });
    }
    throw new Error(`unexpected request: ${url}`);
  };
}

const sessionBody = (patch = {}) => ({
  items: [{ sku: "d204", qty: 1 }],
  contact: { email: "ada@example.com", phone: "(512) 555-0134" },
  shipping: ADDRESS,
  ...patch,
});

test("the payment is refused for an address Google cannot deliver to, and no order is created", { skip }, async () => {
  clearAddressCache();
  const db = await createD1();
  await withFetch(worldFetch(google("FIX")), async () => {
    const response = await call(sessionEnv(db), "/api/checkout/session", sessionBody());
    assert.equal(response.status, 400);
    assert.deepEqual((await response.json()).error, { code: "address_undeliverable", message: ADDRESS_MESSAGES.undeliverable, field: "street" });
  });
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM orders").first()).n, 0);
});

test("a checked address is stored with the order, with the phone; a missing unit needs the shopper's confirmation", { skip }, async () => {
  clearAddressCache();
  const db = await createD1();
  const env = sessionEnv(db);
  const stored = async (orderId) => JSON.parse((await db.prepare("SELECT shipping_json FROM orders WHERE id = ?").bind(orderId).first()).shipping_json);
  await withFetch(worldFetch(google("ACCEPT")), async () => {
    const session = await (await call(env, "/api/checkout/session", sessionBody())).json();
    const shipping = await stored(session.orderId);
    assert.equal(shipping.phone, "+15125550134");
    assert.equal(shipping.addressCheck.status, "verified");
  });
  clearAddressCache();
  await withFetch(worldFetch(google("CONFIRM_ADD_SUBPREMISES")), async () => {
    const asked = await call(env, "/api/checkout/session", sessionBody({ shipping: { ...ADDRESS, street2: "" } }));
    assert.equal(asked.status, 400);
    assert.equal((await asked.json()).error.code, "address_needs_unit");
    const confirmed = await (await call(env, "/api/checkout/session", sessionBody({ shipping: { ...ADDRESS, street2: "" }, addressReview: { noUnit: true } }))).json();
    assert.equal((await stored(confirmed.orderId)).addressCheck.status, "no_unit_confirmed");
  });
});

test("the paid-order alert says when the address could not be verified", () => {
  const order = (addressCheck) => ({
    id: "APGO-US-0123456789AB", currency: "USD", total_cents: 6798, shipping_method: "standard", created_at: "", paid_at: "",
    lines_json: JSON.stringify([{ sku: "D204", name: "APGO Atomic Colored Glaze", qty: 1 }]),
    shipping_json: JSON.stringify({ ...ADDRESS, addressCheck }),
  });
  const unverified = buildNotification(order({ status: "unverified", reason: "unavailable" }));
  assert.match(unverified.text, /Address not verified: check it before the order ships\./);
  assert.equal(unverified.payload.order.addressVerified, false);
  const verified = buildNotification(order({ status: "verified" }));
  assert.doesNotMatch(verified.text, /not verified/);
  assert.equal(verified.payload.order.addressVerified, true);
});
