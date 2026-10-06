import { US_STATES, QuoteError } from "./catalog.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_PATTERN = /^\d{5}(-\d{4})?$/;
// Crockford base32 without I, L, O, U so IDs read cleanly over the phone.
const ORDER_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const text = (value, max) => String(value ?? "").trim().slice(0, max);

// Validates the shopper-supplied parts of a checkout request. Throws QuoteError
// with a shopper-facing message; the caller maps it to HTTP 400.
export function validateCheckout(body) {
  const email = text(body?.contact?.email, 254).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new QuoteError("invalid_email", "Enter a valid email address.");

  const s = body?.shipping ?? {};
  const shipping = {
    firstName: text(s.firstName, 60),
    lastName: text(s.lastName, 60),
    street: text(s.street, 120),
    street2: text(s.street2, 120),
    city: text(s.city, 60),
    state: text(s.state, 2).toUpperCase(),
    zip: text(s.zip, 10),
  };
  if (!shipping.firstName || !shipping.lastName) throw new QuoteError("invalid_name", "Enter your first and last name.");
  if (!shipping.street) throw new QuoteError("invalid_address", "Enter a street address.");
  if (!shipping.city) throw new QuoteError("invalid_city", "Enter a city.");
  if (!US_STATES[shipping.state]) throw new QuoteError("invalid_state", "Choose a US state.");
  if (!ZIP_PATTERN.test(shipping.zip)) throw new QuoteError("invalid_zip", "Enter a 5-digit ZIP code.");

  return {
    email,
    marketingOptIn: body?.contact?.marketingOptIn === true,
    shipping,
    method: text(body?.method, 20) || undefined,
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
