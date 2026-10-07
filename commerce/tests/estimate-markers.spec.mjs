import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { fillToPayment, mockStore, seedCart } from "./helpers/store-mock.mjs";

// "[TO CONFIRM]" markers on placeholder shipping / delivery / tax, driven by the Worker's own
// /api/store/config (`estimate`, false only once PRICING_APPROVED=true), plus the cart's
// express block being switched by the Worker's real EXPRESS_CHECKOUT flag.

const APPROVED = { AIRWALLEX_ENV: "prod", PRICING_APPROVED: "true" };
const marks = (scope) => scope.locator("mark[data-to-confirm]");

async function openCart(page, env) {
  await mockStore(page, { env });
  await seedCart(page, [{ sku: "d204", qty: 1 }]);
  await page.goto("/cart.html");
  await expect(page.locator("[data-cart-summary] .price-row--total")).toBeVisible();
}

test.describe("[TO CONFIRM] markers", () => {
  test("cart summary marks shipping and tax while pricing is not approved", async ({ page }) => {
    await openCart(page, {});
    const summary = page.locator("[data-cart-summary]");
    await expect(marks(summary)).toHaveCount(2);
    await expect(summary.locator(".price-row", { hasText: "Shipping" })).toContainText("[TO CONFIRM]");
    await expect(summary.locator(".price-row", { hasText: "Tax" })).toContainText("[TO CONFIRM]");
    // The total row is untouched: D204 $59.99 + $7.99 shipping.
    await expect(summary.locator(".price-row--total dd")).toHaveText("$67.98");
    await expect(page.locator("[data-checkout-button]")).toBeEnabled();
  });

  test("cart summary shows no marker once pricing is approved (prod)", async ({ page }) => {
    await openCart(page, APPROVED);
    await expect(page.locator("[data-cart-summary]")).toContainText("Calculated at checkout");
    await expect(marks(page.locator("[data-cart-summary]"))).toHaveCount(0);
  });

  test("checkout shipping options and summary carry the marker until approved", async ({ page }) => {
    await mockStore(page, {});
    await seedCart(page, [{ sku: "d204", qty: 1 }]);
    await page.goto("/checkout.html");
    await page.locator("#email").fill("test.shopper@example.com");
    await page.locator("#phone").fill("(512) 555-0134");
    await page.getByRole("button", { name: /Continue to shipping/ }).click();
    const options = page.locator("[data-ship-options]");
    await expect(options).toBeVisible();
    await expect(marks(options)).toHaveCount(1); // one per shipping method (standard only)
    await expect(marks(page.locator("[data-summary-rows]"))).toHaveCount(2);
    const scan = await new AxeBuilder({ page }).analyze();
    expect(scan.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
  });

  test("checkout shows no marker anywhere once pricing is approved", async ({ page }) => {
    await mockStore(page, { env: APPROVED });
    await seedCart(page, [{ sku: "d204", qty: 1 }]);
    await page.goto("/checkout.html");
    await fillToPayment(page);
    await expect(marks(page.locator("body"))).toHaveCount(0);
  });

  for (const width of [320, 390, 1440]) {
    test(`markers do not cause horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openCart(page, {});
      await expect(marks(page.locator("[data-cart-summary]"))).toHaveCount(2);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});

test.describe("cart express block follows the Worker's EXPRESS_CHECKOUT", () => {
  const device = (page) =>
    page.addInitScript(() => {
      window.__awxWalletReady = { googlePayButton: true };
    });

  test("EXPRESS_CHECKOUT=\"true\" shows the block with no test override of the config", async ({ page }) => {
    await device(page);
    await openCart(page, { EXPRESS_CHECKOUT: "true" });
    await expect(page.locator("[data-express]")).toHaveAttribute("data-state", "ready");
    await expect(page.locator("[data-express]")).toBeVisible();
  });

  test("unset (production default) keeps the block hidden and never creates a wallet", async ({ page }) => {
    await device(page);
    await openCart(page, {});
    await expect(page.locator("[data-express]")).toHaveAttribute("data-state", "hidden");
    expect(await page.evaluate(() => (window.__awxWalletCreates || []).length)).toBe(0);
  });
});
