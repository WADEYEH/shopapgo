// Quote engine. Every number it uses (prices, shipping, tax, limits) comes from
// worker/pricing.js; this file only applies them. The browser only sends SKUs and
// quantities; prices, shipping and tax are always recomputed here. All money is
// held in integer cents.
//
// The constants exported below are the DEFAULT (placeholder) pricing, kept for
// tests and simple imports. The Worker itself calls `resolvePricing(env)` so that a
// `PRICING_JSON` override applies, and passes the result to quote()/publicConfig().

import { DEFAULT_PRICING, computeTax, pricingApproved, resolvePricing, storeReadiness, taxStatus } from "./pricing.js";
import { US_STATES } from "./states.js";
import { walletConfig } from "./wallets.js";

export { US_STATES };

export const CURRENCY = DEFAULT_PRICING.currency;
export const MAX_QTY_PER_LINE = DEFAULT_PRICING.maxQtyPerLine;
export const PRODUCTS = DEFAULT_PRICING.products;
export const SHIPPING_METHODS = DEFAULT_PRICING.shippingMethods;
export const DEFAULT_SHIPPING_METHOD = DEFAULT_PRICING.defaultShippingMethod;
// Same object as DEFAULT_PRICING.tax.stateRatesBps (empty: tax is undecided).
export const TAX_RATES_BPS = DEFAULT_PRICING.tax.stateRatesBps;

export class QuoteError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const toMajor = (cents) => Number((cents / 100).toFixed(2));

// Collapses duplicate SKUs and rejects anything the catalog does not sell.
export function normalizeItems(items, pricing = DEFAULT_PRICING) {
  const { products, maxQtyPerLine } = pricing;
  if (!Array.isArray(items) || items.length === 0) {
    throw new QuoteError("empty_cart", "Your cart is empty.");
  }
  const quantities = new Map();
  for (const item of items) {
    const key = String(item?.sku ?? "").toLowerCase();
    const qty = Number(item?.qty);
    if (!products[key]) throw new QuoteError("unknown_sku", "An item in your cart is no longer available.");
    if (!Number.isInteger(qty) || qty < 1) throw new QuoteError("invalid_qty", "Quantity must be at least 1.");
    quantities.set(key, (quantities.get(key) ?? 0) + qty);
  }
  for (const qty of quantities.values()) {
    if (qty > maxQtyPerLine) {
      throw new QuoteError("invalid_qty", `You can order up to ${maxQtyPerLine} of each item.`);
    }
  }
  return [...quantities].map(([key, qty]) => ({ key, qty }));
}

export function quote(items, { state, method } = {}, pricing = DEFAULT_PRICING) {
  const lines = normalizeItems(items, pricing).map(({ key, qty }) => {
    const product = pricing.products[key];
    return {
      id: key,
      sku: product.sku,
      name: product.name,
      routine: product.routine,
      size: product.size,
      qty,
      unitCents: product.priceCents,
      lineCents: product.priceCents * qty,
    };
  });

  const methodId = method ?? pricing.defaultShippingMethod;
  const shippingMethod = pricing.shippingMethods[methodId];
  if (!shippingMethod) throw new QuoteError("invalid_shipping", "Choose a shipping method.");
  if (state !== undefined && state !== null && !US_STATES[state]) {
    throw new QuoteError("invalid_state", "Choose a US state.");
  }

  const subtotalCents = lines.reduce((sum, line) => sum + line.lineCents, 0);
  const shippingCents = shippingMethod.amountCents;
  const taxCents = computeTax(pricing, { state, subtotalCents, shippingCents });
  const totalCents = subtotalCents + shippingCents + (taxCents ?? 0);

  return {
    currency: pricing.currency,
    lines,
    shippingMethod: methodId,
    subtotalCents,
    shippingCents,
    // null means "not yet known" (no destination state supplied).
    taxCents,
    totalCents,
  };
}

// What the browser may know about the store. Wallet buttons are on unless switched
// off (APPLE_PAY_ENABLED / GOOGLE_PAY_ENABLED = "false"); the page still hides any
// button the device or Airwallex cannot actually offer (see worker/wallets.js).
export function publicConfig(env = {}, pricing = resolvePricing(env)) {
  const enabled = (name) => String(env[name] ?? "true").toLowerCase() !== "false";
  return {
    currency: pricing.currency,
    airwallexEnv: env.AIRWALLEX_ENV === "prod" ? "prod" : "demo",
    maxQtyPerLine: pricing.maxQtyPerLine,
    defaultShippingMethod: pricing.defaultShippingMethod,
    shippingMethods: Object.entries(pricing.shippingMethods).map(([id, m]) => ({
      id,
      label: m.label,
      detail: m.detail,
      amountCents: m.amountCents,
    })),
    products: Object.fromEntries(
      Object.entries(pricing.products).map(([id, p]) => [id, { sku: p.sku, name: p.name, priceCents: p.priceCents }]),
    ),
    tax: { status: taxStatus(pricing) },
    storeReady: storeReadiness(env).ready,
    // false until the owner sets PRICING_APPROVED=true. While false, shipping, delivery
    // wording and tax are placeholders: `estimate` tells the pages to mark them
    // "[TO CONFIRM]" (they show nothing extra once approved).
    pricingApproved: pricingApproved(env),
    estimate: !pricingApproved(env),
    // Cart-page Apple Pay / Google Pay block. Off unless EXPRESS_CHECKOUT is exactly "true".
    expressCheckout: env.EXPRESS_CHECKOUT === "true",
    wallets: walletConfig(env),
    states: Object.entries(US_STATES).map(([code, name]) => ({ code, name })),
  };
}
