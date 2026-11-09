import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CHECKOUT_DRAFT_KEY,
  CHECKOUT_ID_KEY,
  CHECKOUT_KEY_KEY,
  CONTACT_FIELDS,
  DRAFT_STEPS,
  SHIPPING_FIELDS,
  clearCheckoutDraft,
  clearCheckoutId,
  emptyDraft,
  normalizeCheckoutDraft,
  readCheckoutDraft,
  readCheckoutId,
  readCheckoutKey,
  resolveDraftStep,
  shippingComplete,
  storeCheckoutId,
  writeCheckoutDraft,
} from "../../lib/shop/checkout-draft.mjs";

function memoryStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    store,
  };
}

const validShipping = {
  firstName: "Ada",
  lastName: "Lee",
  street: "100 Example Ave",
  street2: "Apt 4",
  city: "Austin",
  state: "TX",
  zip: "78701",
};

test("draft key and schema match checkout.js state fields only", () => {
  assert.equal(CHECKOUT_DRAFT_KEY, "apgo_us_checkout_draft");
  assert.deepEqual(DRAFT_STEPS, ["contact", "shipping", "payment"]);
  assert.deepEqual(CONTACT_FIELDS, ["email", "phone", "marketingOptIn"]);
  assert.deepEqual(SHIPPING_FIELDS, ["firstName", "lastName", "street", "street2", "city", "state", "zip"]);
  assert.deepEqual(emptyDraft(), {
    step: "contact",
    contact: { email: "", phone: "", marketingOptIn: false },
    shipping: null,
    method: null,
  });
});

test("normalizeCheckoutDraft keeps existing keys and drops unknown fields", () => {
  const normalized = normalizeCheckoutDraft({
    step: "shipping",
    contact: { email: "  ada@example.com ", marketingOptIn: true, phone: "555" },
    shipping: { ...validShipping, company: "APGO", phone: "555" },
    method: "express",
    payWith: "paypal",
    quote: { totalCents: 1 },
  });
  assert.deepEqual(normalized, {
    step: "shipping",
    contact: { email: "ada@example.com", phone: "555", marketingOptIn: true },
    shipping: validShipping,
    method: "express",
  });
  assert.equal("phone" in normalized.shipping, false, "the phone belongs to the contact step");
  assert.equal("payWith" in normalized, false);
  assert.equal("quote" in normalized, false);
  assert.equal(normalizeCheckoutDraft(null), null);
  assert.equal(normalizeCheckoutDraft("nope"), null);
  assert.deepEqual(normalizeCheckoutDraft({ step: "mystery", contact: { marketingOptIn: "yes" } }), {
    step: "contact",
    contact: { email: "", phone: "", marketingOptIn: false },
    shipping: null,
    method: null,
  });
});

test("resolveDraftStep never skips ahead of valid contact/shipping", () => {
  const contact = { email: "ada@example.com", phone: "(512) 555-0134" };
  assert.equal(resolveDraftStep({ step: "payment" }), "contact");
  assert.equal(resolveDraftStep({ step: "shipping", contact: { email: "ada@example.com" } }), "contact", "a phone is part of the contact step");
  assert.equal(resolveDraftStep({ step: "shipping", contact: { ...contact, phone: "555" } }), "contact");
  assert.equal(resolveDraftStep({ step: "shipping", contact }), "shipping");
  assert.equal(resolveDraftStep({ step: "payment", contact }), "shipping");
  assert.equal(resolveDraftStep({ step: "payment", contact, shipping: validShipping }), "payment");
  assert.equal(shippingComplete({ ...validShipping, zip: "787" }), false);
  assert.equal(shippingComplete(validShipping), true);
});

test("sessionStorage helpers read, write, and clear the draft", () => {
  const storage = memoryStorage();
  writeCheckoutDraft(
    { step: "contact", contact: { email: "ada@example.com", marketingOptIn: false }, extra: true },
    storage,
  );
  assert.equal(storage.getItem(CHECKOUT_DRAFT_KEY), JSON.stringify({
    step: "contact",
    contact: { email: "ada@example.com", phone: "", marketingOptIn: false },
    shipping: null,
    method: null,
  }));
  assert.deepEqual(readCheckoutDraft(storage).contact, { email: "ada@example.com", phone: "", marketingOptIn: false });
  clearCheckoutDraft(storage);
  assert.equal(readCheckoutDraft(storage), null);
  assert.equal(readCheckoutDraft({ getItem: () => "{not-json" }), null);
});

test("F1: the checkout key is kept beside the id, only in this browser's storage, and dropped with it", async () => {
  const storage = memoryStorage();
  const key = "k".repeat(43);
  storeCheckoutId("APGO-US-ABCDEFGHJKMN", key, storage);
  assert.deepEqual([readCheckoutId(storage), readCheckoutKey(storage)], ["APGO-US-ABCDEFGHJKMN", key]);
  storeCheckoutId("APGO-US-ABCDEFGHJKMN", "not a key", storage);
  assert.equal(readCheckoutKey(storage), key, "a malformed key never replaces the real one");
  storage.setItem(CHECKOUT_KEY_KEY, "tampered!");
  assert.equal(readCheckoutKey(storage), null);
  clearCheckoutId(storage);
  assert.equal(storage.store.has(CHECKOUT_ID_KEY) || storage.store.has(CHECKOUT_KEY_KEY), false);

  // The page sends it in request bodies only: never in a URL, an analytics event or the per-tab PayPal copy.
  const page = await readFile(new URL("../../components/shop/checkout/CheckoutPage.js", import.meta.url), "utf8");
  const uses = page.split(/\r?\n/).filter((line) => /checkoutKey|readCheckoutKey/.test(line)).map((line) => line.trim());
  assert.ok(uses.length >= 4);
  for (const line of uses) {
    assert.doesNotMatch(line, /track\(|dataLayer|history\.|location|orderUrl|storePaypalOrder\(/, line);
  }
  assert.match(page, /delete data\.checkoutKey;\s*storePaypalOrder\(data\);/);
});
