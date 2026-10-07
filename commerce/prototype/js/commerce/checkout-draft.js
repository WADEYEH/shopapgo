// Checkout draft in sessionStorage so contact + shipping survive a refresh.
// Schema matches checkout.js state keys only: step, contact, shipping, method.
// Not localStorage — this is a tab-scoped in-progress form, not a cart.

import { normalizeUsPhone } from "./address-rules.js";

export const CHECKOUT_DRAFT_KEY = "apgo_us_checkout_draft";

export const DRAFT_STEPS = ["contact", "shipping", "payment"];
export const CONTACT_FIELDS = ["email", "phone", "marketingOptIn"];
export const SHIPPING_FIELDS = ["firstName", "lastName", "street", "street2", "city", "state", "zip"];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_PATTERN = /^\d{5}(-\d{4})?$/;

const text = (value) => String(value ?? "").trim();

export function emptyDraft() {
  return {
    step: "contact",
    contact: { email: "", phone: "", marketingOptIn: false },
    shipping: null,
    method: null,
  };
}

export function shippingComplete(shipping) {
  if (!shipping || typeof shipping !== "object") return false;
  return Boolean(
    text(shipping.firstName) &&
      text(shipping.lastName) &&
      text(shipping.street) &&
      text(shipping.city) &&
      text(shipping.state) &&
      ZIP_PATTERN.test(text(shipping.zip)),
  );
}

export function normalizeCheckoutDraft(raw) {
  if (!raw || typeof raw !== "object") return null;
  const contactIn = raw.contact && typeof raw.contact === "object" ? raw.contact : {};
  const shippingIn = raw.shipping && typeof raw.shipping === "object" ? raw.shipping : null;
  const shipping = shippingIn
    ? {
        firstName: text(shippingIn.firstName),
        lastName: text(shippingIn.lastName),
        street: text(shippingIn.street),
        street2: text(shippingIn.street2),
        city: text(shippingIn.city),
        state: text(shippingIn.state),
        zip: text(shippingIn.zip),
      }
    : null;
  const shippingEmpty = !shipping || SHIPPING_FIELDS.every((name) => !shipping[name]);
  return {
    step: DRAFT_STEPS.includes(raw.step) ? raw.step : "contact",
    contact: {
      email: text(contactIn.email),
      phone: text(contactIn.phone),
      marketingOptIn: contactIn.marketingOptIn === true,
    },
    shipping: shippingEmpty ? null : shipping,
    method: typeof raw.method === "string" && raw.method.trim() ? raw.method.trim() : null,
  };
}

export function resolveDraftStep(draft) {
  const normalized = normalizeCheckoutDraft(draft) ?? emptyDraft();
  // The contact step is done once the email and a US phone are there (the phone became required with M3).
  const contactOk = EMAIL_PATTERN.test(normalized.contact.email) && Boolean(normalizeUsPhone(normalized.contact.phone));
  const shipOk = shippingComplete(normalized.shipping);
  if (normalized.step === "payment") return contactOk && shipOk ? "payment" : contactOk ? "shipping" : "contact";
  if (normalized.step === "shipping") return contactOk ? "shipping" : "contact";
  return "contact";
}

export function readCheckoutDraft(storage = globalThis.sessionStorage) {
  try {
    const raw = storage?.getItem(CHECKOUT_DRAFT_KEY);
    return raw ? normalizeCheckoutDraft(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeCheckoutDraft(draft, storage = globalThis.sessionStorage) {
  try {
    const normalized = normalizeCheckoutDraft(draft);
    if (!normalized) return;
    storage?.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(normalized));
  } catch {
    // Private mode: in-memory form state is enough for this page view.
  }
}

export function clearCheckoutDraft(storage = globalThis.sessionStorage) {
  try {
    storage?.removeItem(CHECKOUT_DRAFT_KEY);
  } catch {
    // Ignore quota / private-mode failures.
  }
}
