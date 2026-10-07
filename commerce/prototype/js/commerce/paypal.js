// PayPal Checkout helpers for the payment step. DOM-free so node:test can import
// it. checkout.js owns script loading, Buttons(), and the confirmation UX.
// Contract: docs/paypal.md (PR #7) — public clientId, no browser prices, same
// Meta event ids as the card path (`ic_<orderId>`, `purchase_<orderId>`).

export const PAYPAL_SESSION_KEY = "apgo_paypal_order";

export function paypalEnabled(config) {
  const clientId = String(config?.paypal?.clientId ?? "").trim();
  return Boolean(config?.storeReady !== false && config?.paypal?.enabled === true && clientId);
}

export function paypalSdkUrl(clientId) {
  return `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`;
}

// Same shape as POST /api/checkout/session (items + contact + optional shipping /
// method / attribution). Never include prices — the Worker re-quotes.
export function paypalOrderPayload({ items, contact, shipping, method, addressReview, attribution }) {
  const body = { items, contact };
  if (shipping) body.shipping = shipping;
  if (method) body.method = method;
  if (addressReview && Object.keys(addressReview).length) body.addressReview = addressReview;
  if (attribution && Object.keys(attribution).length) body.attribution = attribution;
  return body;
}

export function storePaypalOrder(data, storage = globalThis.sessionStorage) {
  try {
    storage?.setItem(PAYPAL_SESSION_KEY, JSON.stringify(data));
  } catch {
    // Private mode: in-memory state on the page is enough for this attempt.
  }
}

export function readPaypalOrder(storage = globalThis.sessionStorage) {
  try {
    const raw = storage?.getItem(PAYPAL_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
