import { QuoteError } from "./catalog.js";
import { checkContact, checkShipping } from "../../lib/shop/address-rules.mjs";

// Crockford base32 without I, L, O, U so IDs read cleanly over the phone.
const ORDER_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const text = (value, max) => String(value ?? "").trim().slice(0, max);

// Error codes per field (kept from before the shared rules, the page and the tests rely on them).
const ERROR_CODES = {
  email: "invalid_email",
  phone: "invalid_phone",
  firstName: "invalid_name",
  lastName: "invalid_name",
  street: "invalid_address",
  street2: "invalid_address",
  city: "invalid_city",
  state: "invalid_state",
  zip: "invalid_zip",
};

function throwFirst(errors) {
  const [field, message] = Object.entries(errors)[0] ?? [];
  if (field) throw new QuoteError(ERROR_CODES[field], message, field);
}

// What the shopper answered about the address check on the page (worker/address-check.js enforceAddress).
function addressReview(body) {
  const review = body?.addressReview ?? {};
  return {
    choice: review.choice === "suggested" || review.choice === "original" ? review.choice : undefined,
    noUnit: review.noUnit === true,
  };
}

// Validates the shopper-supplied parts of a checkout request with the same rules as the checkout page
// (lib/shop/address-rules.mjs: 48 states and DC, no PO boxes or military mail, ZIP matching the state,
// a US phone, Amazon's lengths). Throws QuoteError with a shopper-facing message and the field; the caller maps it to
// HTTP 400. The phone travels with the address (shipping.phone), where fulfillment and Meta read it.
export function validateCheckout(body) {
  const contact = checkContact(body?.contact);
  const shipping = checkShipping(body?.shipping);
  throwFirst({ ...contact.errors, ...shipping.errors });
  return {
    email: contact.value.email,
    marketingOptIn: body?.contact?.marketingOptIn === true,
    shipping: { ...shipping.value, phone: contact.value.phone },
    method: text(body?.method, 20) || undefined,
    addressReview: addressReview(body),
  };
}

// PayPal create: email + items are required. Shipping is optional because PayPal
// collects the US address; if the browser sent any address field we validate it
// the same way as card checkout. `requireShipping` is set when tax is configured
// so the PayPal amount includes destination tax. Without an address the PayPal one is checked with the same rules
// before capture (paypal.js isUsableUsShipping).
export function validatePaypalCheckout(body, { requireShipping = false } = {}) {
  const s = body?.shipping ?? {};
  const hasShipping = ["firstName", "lastName", "street", "city", "state", "zip"].some((key) => text(s[key], 120));
  if (hasShipping || requireShipping) {
    return { ...validateCheckout(body), shippingSource: "checkout" };
  }

  const contact = checkContact(body?.contact);
  throwFirst(contact.errors.email ? { email: contact.errors.email } : {});
  return {
    email: contact.value.email,
    marketingOptIn: body?.contact?.marketingOptIn === true,
    shipping: { firstName: "", lastName: "", street: "", street2: "", city: "", state: "", zip: "", phone: contact.value.phone },
    method: text(body?.method, 20) || undefined,
    addressReview: addressReview(body),
    shippingSource: "paypal",
  };
}

export function newOrderId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let id = "";
  for (const byte of bytes) id += ORDER_ALPHABET[byte % 32];
  return `APGO-US-${id}`;
}

export const ORDER_ID_PATTERN = /^APGO-US-[0-9A-HJKMNP-TV-Z]{12}$/;

// Lets the confirmation page show whose order it is without exposing the address.
export function maskEmail(email) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}${"•".repeat(Math.max(1, Math.min(local.length - 1, 6)))}@${domain}`;
}
