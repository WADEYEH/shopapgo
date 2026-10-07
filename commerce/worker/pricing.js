// SINGLE SOURCE for everything that changes the amount a shopper is charged:
// product prices, shipping methods/fees, tax, quantity limit and currency.
//
// Product prices are the owner's decision (D204 $59.99, D215 $29.99), and so is shipping ($7.99 per order, D31).
// Tax below is still undecided (O1). To change any of them,
// either edit DEFAULT_PRICING or (no code change) set the optional `PRICING_JSON`
// Worker variable to a partial override, e.g.
//
//   PRICING_JSON='{"products":{"d204":{"priceCents":3490}},"tax":{"defaultRateBps":0}}'
//
// The Worker reads this file on every request (resolvePricing) and hands the result
// to the quote engine, `/api/cart/quote`, `/api/checkout/session` and
// `/api/store/config`. The browser never holds a price: it renders what
// `/api/cart/quote` returns, so front end and back end cannot disagree. Tests and
// Playwright mocks import this same module.
//
// All money is integer cents. Tax rates are basis points (725 = 7.25%).

import { US_STATES } from "./states.js";

export const DEFAULT_PRICING = {
  currency: "USD",
  maxQtyPerLine: 10,

  // D204 $59.99, D215 $29.99 (owner's decision, 2026-10-05). Shipping and tax below are still undecided.
  products: {
    d204: {
      sku: "D204",
      name: "APGO Atomic Colored Glaze",
      routine: "dry",
      size: "300 mL · 10.1 fl oz",
      priceCents: 5999,
    },
    d215: {
      sku: "D215",
      name: "APGO Atomic Glaze Coating",
      routine: "wet",
      size: "200 mL · 6.8 fl oz",
      priceCents: 2999,
    },
  },

  // $7.99 per order, every order (D12, D31). One speed: Amazon MCF Standard (M6); no express option. The delivery
  // wording is the shipping policy's (docs/legal/shipping-policy.md): an estimate, never a date.
  shippingMethods: {
    standard: { label: "Standard shipping", detail: "Most orders arrive in 3–5 business days", amountCents: 799 },
  },
  defaultShippingMethod: "standard",

  // TAX IS UNDECIDED. Default 0 everywhere, so every order is taxed $0.00.
  // Do not infer a tax regime from this structure; it only makes one configurable.
  tax: {
    // Rate for any destination state without its own entry below.
    defaultRateBps: 0,
    // Per-state override, e.g. { CA: 725 }. Empty until the nexus/registration
    // position is decided (or replace this calculation with a tax service).
    stateRatesBps: {},
    // Whether the shipping fee is part of the taxable base. Varies by state; undecided.
    shippingTaxable: false,
  },
};

export class PricingConfigError extends Error {
  constructor(message) {
    super(message);
    this.code = "pricing_config_invalid";
  }
}

const MAX_CENTS = 1_000_000_00; // $1,000,000 per unit/fee: a typo guard, not a business rule.
const MAX_RATE_BPS = 2500; // 25%: a typo guard, not a tax position.

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const clone = (value) => JSON.parse(JSON.stringify(value));

function integer(value, label, { min, max }) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new PricingConfigError(`${label} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function text(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 120) {
    throw new PricingConfigError(`${label} must be a non-empty string (max 120 chars).`);
  }
  return value.trim();
}

function only(object, allowed, label) {
  if (!isPlainObject(object)) throw new PricingConfigError(`${label} must be an object.`);
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) throw new PricingConfigError(`${label}.${key} is not a recognised setting.`);
  }
}

// Applies a partial override onto a copy of the defaults, validating as it goes.
// An invalid override throws instead of silently falling back: a wrong price must
// never be charged quietly.
export function applyOverrides(base, overrides) {
  const pricing = clone(base);
  only(overrides, ["currency", "maxQtyPerLine", "products", "shippingMethods", "defaultShippingMethod", "tax"], "PRICING_JSON");

  if (overrides.currency !== undefined) {
    if (overrides.currency !== "USD") throw new PricingConfigError("currency: only USD is supported by the storefront.");
    pricing.currency = overrides.currency;
  }
  if (overrides.maxQtyPerLine !== undefined) {
    pricing.maxQtyPerLine = integer(overrides.maxQtyPerLine, "maxQtyPerLine", { min: 1, max: 99 });
  }

  if (overrides.products !== undefined) {
    only(overrides.products, Object.keys(pricing.products), "products");
    for (const [id, patch] of Object.entries(overrides.products)) {
      only(patch, ["name", "size", "priceCents"], `products.${id}`);
      if (patch.name !== undefined) pricing.products[id].name = text(patch.name, `products.${id}.name`);
      if (patch.size !== undefined) pricing.products[id].size = text(patch.size, `products.${id}.size`);
      if (patch.priceCents !== undefined) {
        pricing.products[id].priceCents = integer(patch.priceCents, `products.${id}.priceCents`, { min: 1, max: MAX_CENTS });
      }
    }
  }

  if (overrides.shippingMethods !== undefined) {
    if (!isPlainObject(overrides.shippingMethods) || Object.keys(overrides.shippingMethods).length === 0) {
      throw new PricingConfigError("shippingMethods must be a non-empty object.");
    }
    // A provided map replaces the defaults entirely (so a method can be removed).
    const methods = {};
    for (const [id, method] of Object.entries(overrides.shippingMethods)) {
      if (!/^[a-z][a-z0-9_]{0,19}$/.test(id)) throw new PricingConfigError(`shippingMethods.${id}: id must be lowercase letters/digits/underscore.`);
      only(method, ["label", "detail", "amountCents"], `shippingMethods.${id}`);
      methods[id] = {
        label: text(method.label, `shippingMethods.${id}.label`),
        detail: text(method.detail, `shippingMethods.${id}.detail`),
        amountCents: integer(method.amountCents, `shippingMethods.${id}.amountCents`, { min: 0, max: MAX_CENTS }),
      };
    }
    pricing.shippingMethods = methods;
    if (!methods[pricing.defaultShippingMethod]) pricing.defaultShippingMethod = Object.keys(methods)[0];
  }
  if (overrides.defaultShippingMethod !== undefined) {
    if (!pricing.shippingMethods[overrides.defaultShippingMethod]) {
      throw new PricingConfigError("defaultShippingMethod must be one of shippingMethods.");
    }
    pricing.defaultShippingMethod = overrides.defaultShippingMethod;
  }

  if (overrides.tax !== undefined) {
    only(overrides.tax, ["defaultRateBps", "stateRatesBps", "shippingTaxable"], "tax");
    const { tax } = pricing;
    if (overrides.tax.defaultRateBps !== undefined) {
      tax.defaultRateBps = integer(overrides.tax.defaultRateBps, "tax.defaultRateBps", { min: 0, max: MAX_RATE_BPS });
    }
    if (overrides.tax.stateRatesBps !== undefined) {
      if (!isPlainObject(overrides.tax.stateRatesBps)) throw new PricingConfigError("tax.stateRatesBps must be an object.");
      tax.stateRatesBps = {};
      for (const [state, rate] of Object.entries(overrides.tax.stateRatesBps)) {
        if (!US_STATES[state]) throw new PricingConfigError(`tax.stateRatesBps.${state} is not a US state code.`);
        tax.stateRatesBps[state] = integer(rate, `tax.stateRatesBps.${state}`, { min: 0, max: MAX_RATE_BPS });
      }
    }
    if (overrides.tax.shippingTaxable !== undefined) {
      if (typeof overrides.tax.shippingTaxable !== "boolean") throw new PricingConfigError("tax.shippingTaxable must be true or false.");
      tax.shippingTaxable = overrides.tax.shippingTaxable;
    }
  }
  return pricing;
}

let memo = { raw: undefined, pricing: DEFAULT_PRICING };

// env.PRICING_JSON (optional) overrides DEFAULT_PRICING. env.PRICING_APPROVED="true"
// is the owner's explicit "these numbers are final" switch (see storeReadiness).
export function resolvePricing(env = {}) {
  const raw = typeof env.PRICING_JSON === "string" ? env.PRICING_JSON.trim() : "";
  if (!raw) return DEFAULT_PRICING;
  if (memo.raw === raw) return memo.pricing;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PricingConfigError("PRICING_JSON is not valid JSON.");
  }
  const pricing = applyOverrides(DEFAULT_PRICING, parsed);
  memo = { raw, pricing };
  return pricing;
}

export const pricingApproved = (env = {}) => String(env.PRICING_APPROVED ?? "").toLowerCase() === "true";

// "tax undecided" = every rate is still 0.
export function taxStatus(pricing) {
  const { defaultRateBps, stateRatesBps } = pricing.tax;
  return defaultRateBps > 0 || Object.values(stateRatesBps).some((rate) => rate > 0) ? "configured" : "undecided";
}

// Production safety: with AIRWALLEX_ENV=prod the store refuses to take payment until
// the owner sets PRICING_APPROVED=true, so placeholder numbers cannot go live by
// accident. Sandbox ("demo") is never blocked.
export function storeReadiness(env = {}) {
  const prod = env.AIRWALLEX_ENV === "prod";
  return { ready: !prod || pricingApproved(env), prod, approved: pricingApproved(env) };
}

// Tax for one order, in cents. `state` is required: null means "not known yet".
export function computeTax(pricing, { state, subtotalCents, shippingCents }) {
  if (!state) return null;
  const rate = pricing.tax.stateRatesBps[state] ?? pricing.tax.defaultRateBps;
  const base = subtotalCents + (pricing.tax.shippingTaxable ? shippingCents : 0);
  return Math.round((base * rate) / 10000);
}
