// Single pricing source: defaults, PRICING_JSON overrides, validation, tax, prod gate,
// and proof that the front end imports no price of its own.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { publicConfig, quote } from "../worker/catalog.js";
import { DEFAULT_PRICING, PricingConfigError, applyOverrides, computeTax, resolvePricing, storeReadiness, taxStatus } from "../worker/pricing.js";

const ITEMS = [{ sku: "d204", qty: 1 }];

test("defaults are the owner prices and shipping ($7.99, one speed), and tax is undecided (0)", () => {
  assert.equal(DEFAULT_PRICING.products.d204.priceCents, 5999);
  assert.equal(DEFAULT_PRICING.products.d215.priceCents, 2999);
  assert.deepEqual(Object.keys(DEFAULT_PRICING.shippingMethods), ["standard"], "no express (D31)");
  assert.equal(DEFAULT_PRICING.shippingMethods.standard.amountCents, 799);
  assert.equal(DEFAULT_PRICING.shippingMethods.standard.detail, "Most orders arrive in 3–5 business days", "the shipping policy's wording");
  assert.equal(DEFAULT_PRICING.tax.defaultRateBps, 0);
  assert.deepEqual(DEFAULT_PRICING.tax.stateRatesBps, {});
  assert.equal(taxStatus(DEFAULT_PRICING), "undecided");
  assert.equal(quote(ITEMS, { state: "CA" }).taxCents, 0);
  assert.equal(quote(ITEMS).taxCents, null, "tax stays unknown until a state is known");
});

test("resolvePricing without PRICING_JSON returns the defaults", () => {
  assert.equal(resolvePricing({}), DEFAULT_PRICING);
  assert.equal(resolvePricing({ PRICING_JSON: "  " }), DEFAULT_PRICING);
});

test("PRICING_JSON overrides prices, shipping and tax, and feeds quote() and publicConfig()", () => {
  const env = {
    PRICING_JSON: JSON.stringify({
      products: { d204: { priceCents: 3490 } },
      shippingMethods: { ground: { label: "Ground", detail: "3–5 days", amountCents: 599 } },
      tax: { defaultRateBps: 100, stateRatesBps: { CA: 725 }, shippingTaxable: true },
    }),
  };
  const pricing = resolvePricing(env);
  assert.equal(DEFAULT_PRICING.products.d204.priceCents, 5999, "defaults are never mutated");

  const result = quote(ITEMS, { state: "CA" }, pricing);
  assert.equal(result.lines[0].unitCents, 3490);
  assert.equal(result.shippingMethod, "ground", "default shipping falls back to the first configured method");
  assert.equal(result.shippingCents, 599);
  assert.equal(result.taxCents, Math.round(((3490 + 599) * 725) / 10000), "shipping is taxable when configured");
  assert.equal(quote(ITEMS, { state: "TX" }, pricing).taxCents, Math.round(((3490 + 599) * 100) / 10000), "default rate applies elsewhere");
  assert.throws(() => quote(ITEMS, { method: "express" }, pricing), { code: "invalid_shipping" });

  const config = publicConfig(env, pricing);
  assert.equal(config.products.d204.priceCents, 3490);
  assert.deepEqual(config.shippingMethods.map((m) => m.id), ["ground"]);
  assert.equal(config.tax.status, "configured");
});

test("shipping is not taxed unless configured", () => {
  const pricing = applyOverrides(DEFAULT_PRICING, { tax: { defaultRateBps: 1000 }, shippingMethods: { a: { label: "A", detail: "d", amountCents: 1000 } } });
  assert.equal(computeTax(pricing, { state: "TX", subtotalCents: 2000, shippingCents: 1000 }), 200);
  assert.equal(computeTax(pricing, { state: null, subtotalCents: 2000, shippingCents: 1000 }), null);
});

test("an invalid override throws instead of silently charging other numbers", () => {
  const bad = [
    "not json",
    '{"products":{"d204":{"priceCents":0}}}',
    '{"products":{"d204":{"priceCents":19.9}}}',
    '{"products":{"x999":{"priceCents":100}}}',
    '{"products":{"d204":{"price":100}}}',
    '{"shippingMethods":{}}',
    '{"shippingMethods":{"Bad Id":{"label":"x","detail":"y","amountCents":1}}}',
    '{"shippingMethods":{"a":{"label":"x","detail":"y","amountCents":-1}}}',
    '{"defaultShippingMethod":"nope"}',
    '{"tax":{"defaultRateBps":99999}}',
    '{"tax":{"stateRatesBps":{"ZZ":100}}}',
    '{"tax":{"shippingTaxable":"yes"}}',
    '{"currency":"EUR"}',
    '{"surprise":1}',
    "[]",
  ];
  for (const raw of bad) {
    assert.throws(() => resolvePricing({ PRICING_JSON: raw }), PricingConfigError, raw);
  }
});

test("production stays closed until PRICING_APPROVED=true; the sandbox is never blocked", () => {
  assert.deepEqual(storeReadiness({}), { ready: true, prod: false, approved: false });
  assert.equal(storeReadiness({ AIRWALLEX_ENV: "demo" }).ready, true);
  assert.equal(storeReadiness({ AIRWALLEX_ENV: "prod" }).ready, false);
  assert.equal(storeReadiness({ AIRWALLEX_ENV: "prod", PRICING_APPROVED: "false" }).ready, false);
  assert.equal(storeReadiness({ AIRWALLEX_ENV: "prod", PRICING_APPROVED: "true" }).ready, true);
  assert.equal(publicConfig({ AIRWALLEX_ENV: "prod" }).storeReady, false);
});

test("front-end code contains no price, shipping fee or tax rate of its own", async () => {
  const dir = "prototype/js/commerce";
  for (const file of await readdir(dir)) {
    const source = await readFile(`${dir}/${file}`, "utf8");
    assert.ok(!/priceCents\s*[:=]\s*\d|amountCents\s*[:=]\s*\d|5999|2999|\b59\.99|\b29\.99|\b7\.99/.test(source), `${file} hard-codes a price`);
    assert.ok(!/RateBps|taxRate/i.test(source), `${file} hard-codes a tax rate`);
  }
});

test("worker code takes every amount from pricing.js", async () => {
  const catalog = await readFile("worker/catalog.js", "utf8");
  const index = await readFile("worker/index.js", "utf8");
  assert.ok(!/\b(5999|2999|900)\b/.test(catalog + index), "no literal price in catalog.js / index.js");
  assert.ok(index.includes("resolvePricing(env)"));
});
