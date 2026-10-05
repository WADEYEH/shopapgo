import { expect, test } from "@playwright/test";

import { DEFAULT_PRICING } from "../worker/pricing.js";
import {
  ENABLED_PAYPAL,
  ORDER_ID,
  PAYPAL_ID,
  fillCard,
  fillToPayment,
  mockStore,
  seedCart,
} from "./helpers/store-mock.mjs";

const usd = (cents) => `$${(cents / 100).toFixed(2)}`;

async function toPaypalPayment(page, items = [{ sku: "d204", qty: 1 }]) {
  await seedCart(page, items);
  await page.goto("/checkout.html");
  await fillToPayment(page);
}

test.describe("PayPal checkout button", () => {
  test("hidden when paypal config is missing or disabled", async ({ page }) => {
    await mockStore(page);
    await toPaypalPayment(page);
    await expect(page.locator("[data-paypal]")).toBeHidden();
    await expect(page.locator("#paypal-button")).toBeHidden();
    await expect(page.locator("[data-wallet-divider]")).toBeHidden();
    await expect(page.locator("[data-payment-intro]")).toHaveText("Card details are encrypted by Airwallex and never stored by APGO.");
  });

  test("hidden when paypal.enabled is false", async ({ page }) => {
    await mockStore(page, { paypal: { enabled: false, clientId: "test-paypal-client", env: "sandbox" } });
    await toPaypalPayment(page);
    await expect(page.locator("[data-paypal]")).toBeHidden();
    await expect(page.locator("[data-stub-paypal]")).toHaveCount(0);
  });

  test("hidden when storeReady is false even if paypal.enabled", async ({ page }) => {
    await mockStore(page, {
      env: { AIRWALLEX_ENV: "prod", PRICING_APPROVED: "" },
      paypal: { enabled: true, clientId: "test-paypal-client", env: "sandbox" },
    });
    await toPaypalPayment(page);
    await expect(page.locator("[data-paypal]")).toBeHidden();
  });

  test("shown when paypal.enabled and storeReady, then pays without sending browser prices", async ({ page }) => {
    const calls = await mockStore(page, { paypal: ENABLED_PAYPAL });
    await toPaypalPayment(page, [{ sku: "d204", qty: 1 }, { sku: "d215", qty: 2 }]);

    await expect(page.locator("[data-paypal]")).toBeVisible();
    await expect(page.locator("[data-stub-paypal]")).toBeVisible();
    await expect(page.locator("[data-wallet-divider]")).toBeVisible();
    await expect(page.locator("[data-wallet-divider]")).toContainText("Or pay by card");
    await expect(page.locator("[data-payment-intro]")).toContainText("Pay with PayPal");
    await expect(page.locator("[data-summary-note]")).toContainText("Airwallex and PayPal");

    const total = usd(DEFAULT_PRICING.products.d204.priceCents + 2 * DEFAULT_PRICING.products.d215.priceCents);
    await expect(page.locator("[data-place-order]")).toContainText(total);

    await page.locator("[data-stub-paypal]").click();

    await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
    await expect(page.locator("[data-confirmation]")).toContainText(ORDER_ID);
    await expect(page).toHaveURL(new RegExp(`checkout\\.html\\?order=${ORDER_ID}$`));

    expect(calls.paypalOrder).toHaveLength(1);
    expect(calls.paypalCapture).toHaveLength(1);
    expect(calls.session).toHaveLength(0);

    const created = calls.paypalOrder[0];
    expect(created.items).toEqual([{ sku: "d204", qty: 1 }, { sku: "d215", qty: 2 }]);
    expect(created.contact).toMatchObject({ email: "test.shopper@example.com" });
    expect(created.shipping).toMatchObject({ state: "TX", zip: "78701" });
    expect(created.method).toBeTruthy();
    expect(created.attribution).toMatchObject({ sourceUrl: expect.stringMatching(/\/checkout\.html$/) });
    expect(JSON.stringify(created)).not.toMatch(/price|cents|total/i);

    expect(calls.paypalCapture[0]).toEqual({ paypalOrderId: PAYPAL_ID });

    const browser = await page.evaluate(() => ({
      cart: localStorage.getItem("apgo_us_cart_v1"),
      events: (window.dataLayer || []).map((e) => e.event),
      stored: sessionStorage.getItem("apgo_paypal_order"),
      paypalId: window.__paypalOrderId,
    }));
    expect(browser.cart).toBe("[]");
    expect(browser.paypalId).toBe(PAYPAL_ID);
    expect(browser.events).toEqual(expect.arrayContaining(["begin_checkout", "add_shipping_info", "checkout_session_created", "purchase"]));
    expect(browser.events.filter((e) => e === "checkout_session_created")).toHaveLength(1);
    expect(browser.events.filter((e) => e === "purchase")).toHaveLength(1);
    const stored = JSON.parse(browser.stored);
    expect(stored.eventIds).toEqual({ initiateCheckout: `ic_${ORDER_ID}`, purchase: `purchase_${ORDER_ID}` });
    expect(stored.paypal.id).toBe(PAYPAL_ID);
  });

  test("review capture is not treated as a Purchase", async ({ page }) => {
    const calls = await mockStore(page, { paypal: ENABLED_PAYPAL, paypalCaptureStatus: "review" });
    await toPaypalPayment(page);
    await page.locator("[data-stub-paypal]").click();

    await expect(page.locator("[data-confirmation]")).toContainText("Order received");
    await expect(page.locator("[data-confirmation]")).toContainText("verifying");
    await expect(page.locator("[data-confirmation]")).not.toContainText("Order confirmed");
    expect(calls.paypalCapture).toHaveLength(1);

    const events = await page.evaluate(() => (window.dataLayer || []).map((e) => e.event));
    expect(events).toContain("checkout_session_created");
    expect(events).not.toContain("purchase");
  });

  test("onCancel stays on checkout with a gentle message", async ({ page }) => {
    const calls = await mockStore(page, { paypal: ENABLED_PAYPAL });
    await page.addInitScript(() => { window.__paypalCancel = true; });
    await toPaypalPayment(page);
    await page.locator("[data-stub-paypal]").click();

    await expect(page.locator("[data-checkout-flow]")).toBeVisible();
    await expect(page.locator('[data-step="payment"]')).toBeVisible();
    await expect(page.locator("[data-payment-message]")).toContainText("PayPal checkout cancelled");
    await expect(page.locator("[data-confirmation]")).toBeHidden();
    expect(calls.paypalOrder).toHaveLength(1);
    expect(calls.paypalCapture).toHaveLength(0);
    expect(await page.evaluate(() => localStorage.getItem("apgo_us_cart_v1"))).not.toBe("[]");
  });

  test("?paypal=cancel stays on checkout with a gentle message", async ({ page }) => {
    await mockStore(page, { paypal: ENABLED_PAYPAL });
    await seedCart(page, [{ sku: "d204", qty: 1 }]);
    await page.goto(`/checkout.html?order=${ORDER_ID}&paypal=cancel`);

    await expect(page.locator("[data-checkout-flow]")).toBeVisible();
    await expect(page.locator("[data-checkout-message]")).toContainText("PayPal checkout cancelled");
    await expect(page.locator("[data-confirmation]")).toBeHidden();
    await expect(page).toHaveURL(/\/checkout\.html$/);
  });

  test("?order=&paypal=return captures then confirms when paid", async ({ page }) => {
    const calls = await mockStore(page, { paypal: ENABLED_PAYPAL });
    await seedCart(page, [{ sku: "d204", qty: 1 }]);
    await page.addInitScript((order) => {
      sessionStorage.setItem("apgo_paypal_order", JSON.stringify({
        orderId: order,
        quote: { currency: "USD", lines: [{ sku: "D204", name: "APGO Atomic Colored Glaze", qty: 1, unitCents: 5999, lineCents: 5999 }], totalCents: 5999 },
        eventIds: { initiateCheckout: `ic_${order}`, purchase: `purchase_${order}` },
      }));
    }, ORDER_ID);
    await page.goto(`/checkout.html?order=${ORDER_ID}&paypal=return`);

    await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
    await expect(page).toHaveURL(new RegExp(`checkout\\.html\\?order=${ORDER_ID}$`));
    expect(calls.paypalCapture).toEqual([{ orderId: ORDER_ID }]);
    const events = await page.evaluate(() => (window.dataLayer || []).map((e) => e.event));
    expect(events.filter((e) => e === "purchase")).toHaveLength(1);
  });

  test("return URL that stays pending shows a processing state, not Purchase", async ({ page }) => {
    await mockStore(page, { paypal: ENABLED_PAYPAL, paypalCaptureError: { status: 400, error: { code: "invalid_request", message: "Not yet approved." } }, orderStatus: "pending" });
    await seedCart(page, [{ sku: "d204", qty: 1 }]);
    await page.goto(`/checkout.html?order=${ORDER_ID}&paypal=return`);

    await expect(page.locator("[data-confirmation]")).toContainText("Payment processing", { timeout: 20_000 });
    const events = await page.evaluate(() => (window.dataLayer || []).map((e) => e.event));
    expect(events).not.toContain("purchase");
  });

  test("card checkout still works when the PayPal button is visible", async ({ page }) => {
    const calls = await mockStore(page, { paypal: ENABLED_PAYPAL });
    await toPaypalPayment(page);
    await expect(page.locator("[data-stub-paypal]")).toBeVisible();

    await fillCard(page);
    await page.locator("[data-place-order]").click();

    await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
    expect(calls.session).toHaveLength(1);
    expect(calls.paypalOrder).toHaveLength(0);
    expect(calls.paypalCapture).toHaveLength(0);
    expect(await page.evaluate(() => window.__awxConfirms)).toEqual([{ intent_id: "int_test", client_secret: "secret_test" }]);
  });
});
