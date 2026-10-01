import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { DEFAULT_PRICING } from "../worker/pricing.js";
import { ORDER_ID, fillCard, fillToPayment, mockStore, seedCart } from "./helpers/store-mock.mjs";

const usd = (cents) => `$${(cents / 100).toFixed(2)}`;
const { d204, d215 } = DEFAULT_PRICING.products;

test.describe("cart", () => {
  test("adds from a link, prices on the server and updates quantities", async ({ page }) => {
    await mockStore(page);
    await page.goto("/cart.html?add=d204");

    const line = page.locator('[data-line="d204"]');
    await expect(line).toContainText("DRY");
    await expect(line).toContainText(usd(d204.priceCents));
    await expect(page).toHaveURL(/\/cart\.html$/);
    await expect(page.locator("[data-cart-count]").first()).toHaveText("1");

    await line.getByRole("button", { name: "Increase quantity" }).click();
    await expect(line).toContainText(usd(d204.priceCents * 2));
    await expect(page.locator(".price-row--total")).toContainText(usd(d204.priceCents * 2));

    await line.getByRole("button", { name: "Remove" }).click();
    await expect(page.locator("[data-cart-title]")).toHaveText("Your cart is empty.");
    await expect(page.locator("[data-checkout-button]")).toHaveAttribute("aria-disabled", "true");
  });

  test("shows a notice instead of prices when the store API is unavailable", async ({ page }) => {
    await seedCart(page, [{ sku: "d215", qty: 1 }]);
    await page.goto("/cart.html");
    await expect(page.locator("[data-cart-message]")).toContainText("Cart unavailable");
    await expect(page.locator("[data-checkout-button]")).toHaveAttribute("aria-disabled", "true");
  });
});

test.describe("checkout", () => {
  test("completes contact → shipping → payment and confirms the order", async ({ page }) => {
    const calls = await mockStore(page);
    await seedCart(page, [{ sku: "d204", qty: 1 }, { sku: "d215", qty: 2 }]);
    await page.goto("/checkout.html");

    await page.getByRole("button", { name: /Continue to shipping/ }).click();
    await expect(page.locator('[data-field="email"] [data-error]')).toHaveText("Enter a valid email address.");

    await page.locator("#email").fill("test.shopper@example.com");
    await page.getByRole("button", { name: /Continue to shipping/ }).click();
    await page.getByLabel("ZIP code").fill("787");
    await page.getByRole("button", { name: /Continue to payment/ }).click();
    await expect(page.locator('[data-field="zip"] [data-error]')).toHaveText("Enter a 5-digit ZIP.");

    await page.getByLabel("First name").fill("Test");
    await page.getByLabel("Last name").fill("Shopper");
    await page.getByLabel("Street address").fill("100 Example Ave");
    await page.getByLabel("City").fill("Austin");
    await page.getByLabel("State").selectOption("TX");
    await page.getByLabel("ZIP code").fill("78701");
    await page.getByText("Express", { exact: true }).click();
    await page.getByRole("button", { name: /Continue to payment/ }).click();

    // D204 + 2 × D215 + express, from the single pricing source
    const total = usd(d204.priceCents + 2 * d215.priceCents + DEFAULT_PRICING.shippingMethods.express.amountCents);
    await expect(page.locator(".price-row--total")).toContainText(total);
    await expect(page.locator("[data-place-order]")).toHaveText(`Place order · ${total}`);

    await page.locator("[data-place-order]").click();
    await expect(page.locator('[data-field="cardNumber"] [data-error]')).toHaveText("Enter your card number.");
    expect(calls.session).toHaveLength(0);

    await fillCard(page);
    await page.locator("[data-place-order]").click();

    await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
    await expect(page.locator("[data-confirmation]")).toContainText(ORDER_ID);
    await expect(page).toHaveURL(new RegExp(`checkout\\.html\\?order=${ORDER_ID}$`));

    expect(calls.session).toHaveLength(1);
    const sent = calls.session[0];
    expect(sent.method).toBe("express");
    expect(sent.shipping).toMatchObject({ state: "TX", zip: "78701" });
    expect(JSON.stringify(sent)).not.toMatch(/price|cents|total/i);

    const browser = await page.evaluate(() => ({
      init: window.__awxInit,
      confirms: window.__awxConfirms,
      cart: localStorage.getItem("apgo_us_cart_v1"),
      events: (window.dataLayer || []).map((e) => e.event),
    }));
    expect(browser.init).toEqual({ env: "demo", enabledElements: ["payments"] });
    expect(browser.confirms).toEqual([{ intent_id: "int_test", client_secret: "secret_test" }]);
    expect(browser.cart).toBe("[]");
    expect(browser.events).toEqual(expect.arrayContaining(["begin_checkout", "add_shipping_info", "add_payment_info", "purchase"]));
  });

  test("a declined card shows the issuer message and the retry reuses the same PaymentIntent", async ({ page }) => {
    const calls = await mockStore(page);
    await seedCart(page, [{ sku: "d204", qty: 1 }]);
    await page.goto("/checkout.html");
    await fillToPayment(page);
    await fillCard(page);

    await page.evaluate(() => { window.__awxDecline = true; });
    await page.locator("[data-place-order]").click();
    await expect(page.locator("[data-payment-message]")).toContainText("The card issuer declined this transaction.");
    await expect(page.locator("[data-place-order]")).toBeEnabled();

    await page.evaluate(() => { window.__awxDecline = false; });
    await page.locator("[data-place-order]").click();
    await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
    expect(calls.session).toHaveLength(1);
  });

  test("an empty cart does not start checkout", async ({ page }) => {
    await mockStore(page);
    await page.goto("/checkout.html");
    await expect(page.locator("[data-checkout-title]")).toHaveText("Your cart is empty.");
    await expect(page.locator("[data-checkout-flow]")).toBeHidden();
  });
});

for (const width of [320, 390, 1440]) {
  test(`cart and checkout have no horizontal overflow at ${width}px`, async ({ page }) => {
    await mockStore(page);
    await seedCart(page, [{ sku: "d204", qty: 10 }, { sku: "d215", qty: 10 }]);
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/cart.html", "/checkout.html"]) {
      await page.goto(path);
      await expect(page.locator(".summary .price-row--total")).toBeVisible();
      if (path === "/checkout.html") await fillToPayment(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} overflows at ${width}px`).toBeLessThanOrEqual(0);
    }
  });
}

test("cart and checkout have no serious or critical axe violations", async ({ page }) => {
  await mockStore(page);
  await seedCart(page, [{ sku: "d204", qty: 1 }]);
  for (const path of ["/cart.html", "/checkout.html"]) {
    await page.goto(path);
    await expect(page.locator(".summary .price-row--total")).toBeVisible();
    if (path === "/checkout.html") await fillToPayment(page);
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));
    expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`), path).toEqual([]);
  }
});
