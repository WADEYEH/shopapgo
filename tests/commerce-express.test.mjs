import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { publicConfig } from "../worker/catalog.js";

// /api/store/config: `expressCheckout` (cart-page wallets) and `pricingApproved` / `estimate`
// ([TO CONFIRM] markers on the cart summary and the checkout shipping step).

test("expressCheckout is off by default and only the exact string \"true\" turns it on", () => {
  assert.equal(publicConfig({}).expressCheckout, false);
  for (const value of [undefined, "", "false", "0", "1", "yes", "TRUE", "True", " true", true]) {
    assert.equal(publicConfig({ EXPRESS_CHECKOUT: value }).expressCheckout, false, `value ${JSON.stringify(value)}`);
  }
  assert.equal(publicConfig({ EXPRESS_CHECKOUT: "true" }).expressCheckout, true);
  assert.equal(typeof publicConfig({}).expressCheckout, "boolean");
});

test("expressCheckout does not change the wallet block the cart reads", () => {
  const off = publicConfig({});
  const on = publicConfig({ EXPRESS_CHECKOUT: "true" });
  assert.deepEqual(on.wallets, off.wallets);
  assert.equal(on.airwallexEnv, off.airwallexEnv);
  assert.equal(on.wallets.countryCode, "US");
  assert.ok(on.wallets.merchantName);
});

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

test("wrangler.toml: staging turns EXPRESS_CHECKOUT on, production and the top level do not set it", () => {
  const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const section = (name) => {
    const start = toml.indexOf(`[${name}]`);
    assert.notEqual(start, -1, `${name} section`);
    const rest = toml.slice(start + name.length + 2);
    const next = rest.search(/^\[/m);
    return next === -1 ? rest : rest.slice(0, next);
  };
  const setting = (text) => text.split("\n").filter((line) => /^\s*EXPRESS_CHECKOUT\s*=/.test(line));
  const staging = setting(section("env.staging.vars"));
  assert.equal(staging.length, 1);
  assert.match(staging[0], /^EXPRESS_CHECKOUT\s*=\s*"true"/);
  assert.deepEqual(setting(section("env.production.vars")), []);
  assert.deepEqual(setting(section("vars")), []);
  // The approval gate must stay unset in every section (owner-only switch).
  for (const name of ["vars", "env.staging.vars", "env.production.vars"]) {
    assert.equal(/^\s*PRICING_APPROVED\s*=/m.test(section(name)), false, `${name} must not set PRICING_APPROVED`);
  }
});
