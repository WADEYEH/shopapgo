// Address check at checkout (docs/design/modules/M3-cart-checkout.md §4, D18, D32): Google Address Validation.
// The page asks once when the shopper continues to payment (POST /api/checkout/address) so it can offer a corrected
// spelling or ask for a missing unit number; the Worker asks again when the payment is created (enforceAddress), so a
// page that skipped the first call cannot get past it. A short per-isolate cache usually spares the second request.
//
// Secret GOOGLE_ADDRESS_VALIDATION_KEY: a Google Cloud API key restricted to the Address Validation API. Without it,
// or when Google does not answer in time, the address passes on the field rules alone and is recorded as
// "unverified"; the paid-order alert tells the team (worker/notify.js).

import { MESSAGES, checkShipping } from "../prototype/js/commerce/address-rules.js";
import { QuoteError } from "./catalog.js";

const ENDPOINT = "https://addressvalidation.googleapis.com/v1:validateAddress";
const TIMEOUT_MS = 5000;
const CACHE_MS = 15 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map();

export const ADDRESS_MESSAGES = {
  undeliverable: "We couldn't confirm this address. Check the street, city and ZIP code.",
  missingUnit: "Add your apartment, suite or unit number, or confirm that your address doesn't have one.",
  poBox: MESSAGES.poBox,
};

const ADDRESS_FIELDS = ["street", "street2", "city", "state", "zip"];
const squash = (value) => String(value ?? "").toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
const cacheKey = (shipping) => JSON.stringify(ADDRESS_FIELDS.map((field) => squash(shipping[field])));

// Same delivery point, ignoring case, punctuation, how the unit is split over the two lines and an added ZIP+4.
function sameAddress(a, b) {
  return squash(`${a.street} ${a.street2}`) === squash(`${b.street} ${b.street2}`) &&
    squash(a.city) === squash(b.city) &&
    a.state === b.state &&
    String(a.zip).slice(0, 5) === String(b.zip).slice(0, 5);
}

// Google's corrected address, in the checkout's own fields, or null when it would not pass the checkout rules.
function suggestionFrom(postalAddress, input) {
  const lines = (postalAddress?.addressLines ?? []).map((line) => String(line ?? "").trim()).filter(Boolean);
  if (!lines.length) return null;
  const { value, errors } = checkShipping({
    firstName: input.firstName,
    lastName: input.lastName,
    street: lines[0],
    street2: lines.slice(1).join(" "),
    city: postalAddress.locality,
    state: postalAddress.administrativeArea,
    zip: postalAddress.postalCode,
  });
  return Object.keys(errors).length ? null : Object.fromEntries(ADDRESS_FIELDS.map((field) => [field, value[field]]));
}

// Google's verdict -> { status, suggestion? }. possibleNextAction is Google's own recommendation (FIX, CONFIRM_ADD_SUBPREMISES,
// CONFIRM, ACCEPT); USPS data adds the PO Box test.
export function interpretValidation(response, input) {
  const result = response?.result;
  const verdict = result?.verdict;
  if (!verdict) return { status: "unverified", reason: "no_verdict" };
  const usps = result.uspsData ?? {};
  if (usps.addressRecordType === "P" || usps.poBoxOnlyPostalCode === true) return { status: "po_box" };
  switch (verdict.possibleNextAction) {
    case "FIX":
      return { status: "undeliverable" };
    case "CONFIRM_ADD_SUBPREMISES":
      return { status: "missing_unit" };
    case "ACCEPT":
      return { status: "valid" };
    case "CONFIRM": {
      // Deliverable once Google's changes are applied. Only a change the shopper would notice is offered; an added
      // ZIP+4 or different capitals are not worth a question.
      const suggestion = suggestionFrom(result.address?.postalAddress, input);
      return suggestion && !sameAddress(suggestion, input) ? { status: "suggest", suggestion } : { status: "valid" };
    }
    default:
      return { status: "unverified", reason: "no_next_action" };
  }
}

// shipping: an address that already passed checkShipping. Never throws; a failed call is "unverified".
export async function checkAddress(env, shipping, { fetchImpl = fetch, now = Date.now } = {}) {
  const apiKey = String(env.GOOGLE_ADDRESS_VALIDATION_KEY ?? "").trim();
  if (!apiKey) return { status: "unverified", reason: "not_configured" };
  const key = cacheKey(shipping);
  const hit = cache.get(key);
  if (hit && now() - hit.at < CACHE_MS) return hit.result;

  let result;
  try {
    const response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
      body: JSON.stringify({
        address: {
          regionCode: "US",
          addressLines: [shipping.street, shipping.street2].filter(Boolean),
          locality: shipping.city,
          administrativeArea: shipping.state,
          postalCode: shipping.zip,
        },
        enableUspsCass: true,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { status: "unverified", reason: "unavailable" };
    result = interpretValidation(await response.json(), shipping);
  } catch {
    return { status: "unverified", reason: "unavailable" };
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: now(), result });
  return result;
}

// At payment time. review is what the shopper answered on the page: { choice: "suggested" | "original", noUnit: true }.
// Returns what is stored with the order (shipping.addressCheck); throws QuoteError when the address cannot be used.
export async function enforceAddress(env, shipping, review = {}, options) {
  const result = await checkAddress(env, shipping, options);
  const checkedAt = new Date().toISOString();
  switch (result.status) {
    case "po_box":
      throw new QuoteError("address_po_box", ADDRESS_MESSAGES.poBox, "street");
    case "undeliverable":
      throw new QuoteError("address_undeliverable", ADDRESS_MESSAGES.undeliverable, "street");
    case "missing_unit":
      if (review?.noUnit !== true) throw new QuoteError("address_needs_unit", ADDRESS_MESSAGES.missingUnit, "street2");
      return { status: "no_unit_confirmed", checkedAt };
    case "suggest":
      return { status: "kept_original", checkedAt };
    case "valid":
      return { status: review?.choice === "suggested" ? "corrected" : "verified", checkedAt };
    default:
      return { status: "unverified", reason: result.reason, checkedAt };
  }
}

export const addressUnverified = (shipping) => shipping?.addressCheck?.status === "unverified";

export function clearAddressCache() {
  cache.clear();
}
