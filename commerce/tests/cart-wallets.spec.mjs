import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { publicConfig } from "../worker/catalog.js";
import { mockStore, seedCart } from "./helpers/store-mock.mjs";

// Cart-page express checkout (Apple Pay / Google Pay). UI states only, feature-flagged
// OFF by default. Feature detection is mocked like tests/wallets.spec.mjs: the Airwallex
// stub reports a wallet `ready` only when window.__awxWalletReady[type] is true.

async function device(page, { applePay = false, ready = {} } = {}) {
  await page.addInitScript(({ applePay, ready }) => {
    window.__awxWalletReady = ready;
    if (applePay) window.ApplePaySession = { canMakePayments: () => true };
  }, { applePay, ready });
}

// `flag`: undefined = config without the key (today's Worker), true/false = explicit.
async function openCart(page, { flag, items = [{ sku: "d204", qty: 1 }], env = {} } = {}) {
  const calls = await mockStore(page, { env });
  await page.route("**/api/store/config", (route) => {
    const config = publicConfig(env);
    if (flag !== undefined) config.expressCheckout = flag;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(config) });
  });
  await seedCart(page, items);
  await page.goto("/cart.html");
  await expect(page.locator("[data-cart-summary] .price-row--total")).toBeVisible().catch(() => {});
  return calls;
}

const block = (page) => page.locator("[data-express]");
const creates = (page) => page.evaluate(() => (window.__awxWalletCreates || []).map((c) => c.type));
const box = async (locator) => locator.boundingBox();

test.describe("cart express checkout", () => {
  test("hidden by default: a store config without the flag never creates a wallet", async ({ page }) => {
    await device(page, { applePay: true, ready: { applePayButton: true, googlePayButton: true } });
    await openCart(page);
    await expect(page.locator("[data-checkout-button]")).toBeVisible();
    await expect(block(page)).toHaveAttribute("data-state", "hidden");
    await expect(block(page)).toBeHidden();
    expect(await creates(page)).toEqual([]);
  });

  test("hidden when the flag is explicitly off", async ({ page }) => {
    await device(page, { applePay: true, ready: { applePayButton: true, googlePayButton: true } });
    await openCart(page, { flag: false });
    await expect(page.locator("[data-checkout-button]")).toBeVisible();
    await expect(block(page)).toBeHidden();
    expect(await creates(page)).toEqual([]);
  });

  test("hidden when the device cannot pay (no secure context, no ApplePaySession)", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(window, "isSecureContext", { value: false }));
    await device(page, { ready: { googlePayButton: true } });
    await openCart(page, { flag: true });
    await expect(page.locator("[data-checkout-button]")).toBeVisible();
    await expect(block(page)).toBeHidden();
    expect(await creates(page)).toEqual([]);
  });

  test("flag on but the wallet never reports ready: stays hidden, nothing in the layout", async ({ page }) => {
    await device(page, { ready: {} });
    await openCart(page, { flag: true });
    await expect.poll(() => creates(page)).toEqual(["googlePayButton"]);
    await expect(block(page)).toHaveAttribute("data-state", "hidden");
    await expect(block(page)).toBeHidden();
    await expect(page.locator(".express__divider")).toBeHidden();
    // The card Checkout button sits directly under the order summary rows, no gap for the block.
    const summary = await box(page.locator("[data-cart-summary]"));
    const checkout = await box(page.locator("[data-checkout-button]"));
    expect(checkout.y - (summary.y + summary.height)).toBeLessThan(40);
  });

  test("flag on and wallet ready: buttons and the card divider show above Checkout", async ({ page }) => {
    await device(page, { applePay: true, ready: { applePayButton: true, googlePayButton: true } });
    const calls = await openCart(page, { flag: true });
    await expect(block(page)).toHaveAttribute("data-state", "ready");
    await expect(block(page)).toBeVisible();
    await expect(page.locator('[data-express] [data-stub-wallet="applePayButton"]')).toBeVisible();
    await expect(page.locator('[data-express] [data-stub-wallet="googlePayButton"]')).toBeVisible();
    await expect(page.locator(".express__divider")).toContainText("Or checkout with card");
    expect(await creates(page)).toEqual(["applePayButton", "googlePayButton"]);

    const express = await box(block(page));
    const checkout = await box(page.locator("[data-checkout-button]"));
    expect(express.y + express.height).toBeLessThanOrEqual(checkout.y);

    // The amount handed to the wallet is the server quote (from the store mock), not a front-end number.
    const apple = await page.evaluate(() => window.__awxWalletCreates.find((c) => c.type === "applePayButton").options);
    expect(apple.amount).toEqual({ value: "67.98", currency: "USD" });
    expect(apple.intent_id, "no PaymentIntent is created from the cart page").toBeUndefined();
    expect(calls.session, "no order is created from the cart page").toHaveLength(0);
  });

  test("a wallet error shows a message and keeps the card Checkout usable", async ({ page }) => {
    await device(page, { ready: { googlePayButton: true } });
    await openCart(page, { flag: true });
    await expect(block(page)).toHaveAttribute("data-state", "ready");
    await page.evaluate(() => window.__awxWalletElements.googlePayButton.fire("error", { error: { code: "UNKNOWN_ERROR" } }));
    await expect(block(page)).toHaveAttribute("data-state", "error");
    await expect(page.locator("[data-express-message]")).toContainText("Express checkout didn't go through");
    await expect(page.locator("[data-checkout-button]")).not.toHaveAttribute("aria-disabled", "true");
    await page.evaluate(() => window.__awxWalletElements.googlePayButton.fire("cancel", {}));
    await expect(block(page)).toHaveAttribute("data-state", "ready");
  });

  test("changing the quantity shows the loading skeleton, then the updated amount", async ({ page }) => {
    await device(page, { ready: { googlePayButton: true } });
    await openCart(page, { flag: true });
    await expect(block(page)).toHaveAttribute("data-state", "ready");
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route("**/api/cart/quote", async (route) => { await gate; await route.fallback(); });
    await page.getByRole("button", { name: "Increase quantity" }).click();
    await expect(block(page)).toHaveAttribute("data-state", "updating");
    await expect(block(page)).toHaveAttribute("aria-busy", "true");
    await expect(page.locator("[data-express-skeleton]")).toBeVisible();
    release();
    await expect(block(page)).toHaveAttribute("data-state", "ready");
    const update = await page.evaluate(() => window.__awxWalletUpdates.at(-1));
    expect(update).toEqual({ type: "googlePayButton", patch: { amount: { value: "127.97", currency: "USD" } } });
  });

  test("emptying the cart hides the block again", async ({ page }) => {
    await device(page, { ready: { googlePayButton: true } });
    await openCart(page, { flag: true });
    await expect(block(page)).toHaveAttribute("data-state", "ready");
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.locator("[data-cart-empty]")).toBeVisible();
    await expect(block(page)).toHaveAttribute("data-state", "hidden");
    await expect(block(page)).toBeHidden();
  });

  test("an empty cart never shows the block, even with the flag on and a ready wallet", async ({ page }) => {
    await device(page, { applePay: true, ready: { applePayButton: true, googlePayButton: true } });
    await openCart(page, { flag: true, items: [] });
    await expect(page.locator("[data-cart-empty]")).toBeVisible();
    await expect(block(page)).toBeHidden();
    expect(await creates(page)).toEqual([]);
  });

  test("a failed quote hides the block", async ({ page }) => {
    await device(page, { ready: { googlePayButton: true } });
    await mockStore(page);
    await page.route("**/api/store/config", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...publicConfig({}), expressCheckout: true }) }));
    await page.route("**/api/cart/quote", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "store_not_ready", message: "Not ready." } }) }));
    await seedCart(page, [{ sku: "d204", qty: 1 }]);
    await page.goto("/cart.html");
    await expect(page.locator("[data-cart-message]")).toContainText("Cart unavailable");
    await expect(block(page)).toBeHidden();
  });

  for (const width of [320, 390, 1440]) {
    test(`cart with the express block shown has no horizontal overflow at ${width}px`, async ({ page }) => {
      await device(page, { applePay: true, ready: { applePayButton: true, googlePayButton: true } });
      await page.setViewportSize({ width, height: 900 });
      await openCart(page, { flag: true });
      await expect(block(page)).toHaveAttribute("data-state", "ready");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test(`cart without the express block has no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openCart(page);
      await expect(page.locator("[data-checkout-button]")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("cart with the express block shown is axe clean (serious/critical)", async ({ page }) => {
    await device(page, { applePay: true, ready: { applePayButton: true, googlePayButton: true } });
    await openCart(page, { flag: true });
    await expect(block(page)).toHaveAttribute("data-state", "ready");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id} [${v.impact}]: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
  });

  test("cart with the block hidden is axe clean", async ({ page }) => {
    await openCart(page);
    await expect(page.locator("[data-checkout-button]")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
