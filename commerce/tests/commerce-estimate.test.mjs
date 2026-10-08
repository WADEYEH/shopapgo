import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { publicConfig } from "../worker/catalog.js";

// /api/store/config: `pricingApproved` / `estimate` ([TO CONFIRM] markers on the cart summary and the checkout shipping
// step), and the wallet settings the payment step reads.

test("pricingApproved / estimate follow PRICING_APPROVED", () => {
  const unset = publicConfig({});
  assert.equal(unset.pricingApproved, false);
  assert.equal(unset.estimate, true);
  const staging = publicConfig({ AIRWALLEX_ENV: "demo", SITE_ENV: "staging" });
  assert.equal(staging.estimate, true);
  const prodUnapproved = publicConfig({ AIRWALLEX_ENV: "prod" });
  assert.equal(prodUnapproved.estimate, true);
  assert.equal(prodUnapproved.storeReady, false);
  const prodApproved = publicConfig({ AIRWALLEX_ENV: "prod", PRICING_APPROVED: "true" });
  assert.equal(prodApproved.pricingApproved, true);
  assert.equal(prodApproved.estimate, false);
  assert.equal(prodApproved.storeReady, true);
  assert.equal(publicConfig({ PRICING_APPROVED: "false" }).estimate, true);
});

test("the payment step's wallet settings; the unfinished cart-page express block and its flag are gone", () => {
  const config = publicConfig({ EXPRESS_CHECKOUT: "true" });
  assert.equal("expressCheckout" in config, false);
  assert.equal(config.wallets.countryCode, "US");
  assert.ok(config.wallets.merchantName);
});

test("wrangler.toml: no EXPRESS_CHECKOUT anywhere, and the approval gate stays unset in every section", () => {
  const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.equal(/^\s*EXPRESS_CHECKOUT\s*=/m.test(toml), false);
  const section = (name) => {
    const start = toml.indexOf(`[${name}]`);
    assert.notEqual(start, -1, `${name} section`);
    const rest = toml.slice(start + name.length + 2);
    const next = rest.search(/^\[/m);
    return next === -1 ? rest : rest.slice(0, next);
  };
  // The approval gate is the owner's switch only.
  for (const name of ["vars", "env.staging.vars", "env.production.vars"]) {
    assert.equal(/^\s*PRICING_APPROVED\s*=/m.test(section(name)), false, `${name} must not set PRICING_APPROVED`);
  }
});
