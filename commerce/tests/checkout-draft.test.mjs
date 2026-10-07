import assert from "node:assert/strict";
import test from "node:test";

import {
  CHECKOUT_DRAFT_KEY,
  CONTACT_FIELDS,
  DRAFT_STEPS,
  SHIPPING_FIELDS,
  clearCheckoutDraft,
  emptyDraft,
  normalizeCheckoutDraft,
  readCheckoutDraft,
  resolveDraftStep,
  shippingComplete,
  writeCheckoutDraft,
} from "../prototype/js/commerce/checkout-draft.js";

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
