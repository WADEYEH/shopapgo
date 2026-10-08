import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { ORDER_ID, fillCard, fillToPayment, mockStore, seedCart } from "./helpers/store-mock.mjs";

// Apple Pay / Google Pay with feature-detection mocks. The Airwallex.js stub only
// reports a wallet `ready` when window.__awxWalletReady[type] is true, and
// ApplePaySession only exists when a test defines it, like a real browser.

const walletEnv = (extra = {}) => ({ env: extra });

async function device(page, { applePay = false, ready = {} } = {}) {
  await page.addInitScript(({ applePay, ready }) => {
    window.__awxWalletReady = ready;
    if (applePay) window.ApplePaySession = { canMakePayments: () => true };
  }, { applePay, ready });
}

const slot = (page, id) => page.locator(`[data-wallet-slot="${id}"]`);
const creates = (page) => page.evaluate(() => (window.__awxWalletCreates || []).map((c) => c.type));

async function toPayment(page, items = [{ sku: "d204", qty: 1 }]) {
  await seedCart(page, items);
  await page.goto("/checkout");
  await fillToPayment(page);
}

test.describe("Apple Pay / Google Pay", () => {
  test("a device without wallets: no buttons, no extra order, card flow unchanged", async ({ page }) => {
    // Not a secure context and no ApplePaySession: nothing is even attempted.
    await page.addInitScript(() => Object.defineProperty(window, "isSecureContext", { value: false }));
    const calls = await mockStore(page);
    await toPayment(page);

    expect(await creates(page)).toEqual([]);
    await expect(page.locator("[data-wallets]")).not.toHaveClass(/is-active/);
    await expect(page.locator("[data-wallet-divider]")).toBeHidden();
    expect(calls.session).toHaveLength(0);

    await fillCard(page);
    await page.locator("[data-place-order]").click();
    await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
    expect(calls.session).toHaveLength(1);
    expect(await page.evaluate(() => window.__awxConfirms)).toEqual([{ intent_id: "int_test", client_secret: "secret_test" }]);
  });

  test("Google Pay is attempted on a secure context but stays hidden until Airwallex reports ready", async ({ page }) => {
    await device(page, { ready: {} });
    const calls = await mockStore(page);
    await toPayment(page);

    await expect.poll(() => creates(page)).toEqual(["googlePayButton"]);
    await expect(slot(page, "googlePay")).not.toHaveClass(/is-ready/);
    await expect(page.locator("[data-stub-wallet]")).toBeHidden();
    await expect(page.locator("[data-wallet-divider]")).toBeHidden();
    expect(calls.session, "no order is created just to probe the device").toHaveLength(0);

    const options = await page.evaluate(() => window.__awxWalletCreates[0].options);
    expect(options.intent_id).toBeUndefined();
    expect(options.client_secret).toBeUndefined();
    expect(options).toMatchObject({ countryCode: "US", amount: { value: "67.98", currency: "USD" }, merchantInfo: { merchantName: "APGO" }, autoCapture: true });
  });

  test("a ready Google Pay button appears, gets the session and completes the order", async ({ page }) => {
    await device(page, { ready: { googlePayButton: true } });
    const calls = await mockStore(page);
    await toPayment(page);

    await expect(slot(page, "googlePay")).toHaveClass(/is-ready/);
    await expect(page.locator('[data-stub-wallet="googlePayButton"]')).toBeVisible();
    await expect(page.locator("[data-wallet-divider]")).toBeVisible();
    expect(calls.session).toHaveLength(1);

    const update = await page.evaluate(() => window.__awxWalletUpdates.at(-1));
    expect(update).toEqual({ type: "googlePayButton", patch: { intent_id: "int_test", client_secret: "secret_test", amount: { value: "67.98", currency: "USD" } } });

    await page.locator('[data-stub-wallet="googlePayButton"]').click();
    await page.evaluate(() => window.__awxWalletElements.googlePayButton.fire("success", {}));
    await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
    await expect(page).toHaveURL(new RegExp(`/checkout\\?order=${ORDER_ID}$`));
    const browser = await page.evaluate(() => ({ cart: localStorage.getItem("apgo_us_cart_v1"), events: window.dataLayer.map((e) => [e.event, e.payment_type]) }));
    expect(browser.cart).toBe("[]");
    expect(browser.events).toEqual(expect.arrayContaining([["add_payment_info", "google_pay"], ["purchase", undefined]]));
    expect(calls.session).toHaveLength(1);
  });

  test("wallet success does not clear the cart before server payment confirmation", async ({ page }) => {
    await device(page, { ready: { googlePayButton: true } });
    await mockStore(page, { orderStatus: "pending", paymentFailure: { message: "Your payment wasn't completed. Try again." } });
    await toPayment(page);
    await expect(slot(page, "googlePay")).toHaveClass(/is-ready/);
    await page.evaluate(() => window.__awxWalletElements.googlePayButton.fire("success", {}));
    await expect(page.locator("[data-confirmation]")).toContainText("Your payment wasn't completed.");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("apgo_us_cart_v1")))).toEqual([{ sku: "d204", qty: 1 }]);
  });

  test("Apple Pay needs ApplePaySession.canMakePayments and then shows beside Google Pay", async ({ page }) => {
    await device(page, { applePay: true, ready: { applePayButton: true, googlePayButton: true } });
    await mockStore(page);
    await toPayment(page, [{ sku: "d204", qty: 1 }, { sku: "d215", qty: 2 }]);

    await expect(slot(page, "applePay")).toHaveClass(/is-ready/);
    await expect(slot(page, "googlePay")).toHaveClass(/is-ready/);
    expect(await creates(page)).toEqual(["applePayButton", "googlePayButton"]);
    const apple = await page.evaluate(() => window.__awxWalletCreates.find((c) => c.type === "applePayButton").options);
    expect(apple).toMatchObject({ countryCode: "US", totalPriceLabel: "APGO", buttonType: "buy" });
    // 59.99 + 2 × 29.99 from the server quote (standard shipping is free)
    expect(apple.amount).toEqual({ value: "127.96", currency: "USD" });
    await expect(page.locator("[data-wallet-divider]")).toContainText("Or pay another way");
  });

  test("Apple Pay is not attempted when the device cannot pay, even if Google Pay can", async ({ page }) => {
    await device(page, { applePay: false, ready: { googlePayButton: true } });
    await mockStore(page);
    await toPayment(page);
    await expect(slot(page, "googlePay")).toHaveClass(/is-ready/);
    expect(await creates(page)).toEqual(["googlePayButton"]);
    await expect(slot(page, "applePay")).not.toHaveClass(/is-ready/);
  });

  test("the operator can switch either wallet off", async ({ page }) => {
    await device(page, { applePay: true, ready: { applePayButton: true, googlePayButton: true } });
    await mockStore(page, walletEnv({ APPLE_PAY_ENABLED: "false", GOOGLE_PAY_ENABLED: "false" }));
    await toPayment(page);
    expect(await creates(page)).toEqual([]);
    await expect(page.locator("[data-wallet-divider]")).toBeHidden();
  });

  test("a wallet error shows a message, keeps the card form usable and refreshes the session", async ({ page }) => {
    await device(page, { ready: { googlePayButton: true } });
    const calls = await mockStore(page);
    await toPayment(page);
    await expect(slot(page, "googlePay")).toHaveClass(/is-ready/);

    await page.evaluate(() => window.__awxWalletElements.googlePayButton.fire("error", { error: { code: "UNKNOWN_ERROR" } }));
    await expect(page.locator("[data-payment-message]")).toContainText("The wallet payment didn't go through. Try again or pay by card.");
    await expect.poll(() => calls.session.length).toBe(2);

    await fillCard(page);
    await page.locator("[data-place-order]").click();
    await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
  });

  test("cancelling the wallet sheet clears messages and leaves everything as it was", async ({ page }) => {
    await device(page, { ready: { googlePayButton: true } });
    const calls = await mockStore(page);
    await toPayment(page);
    await expect(slot(page, "googlePay")).toHaveClass(/is-ready/);
    await page.evaluate(() => window.__awxWalletElements.googlePayButton.fire("cancel", {}));
    await expect(page.locator("[data-payment-message]")).toBeEmpty();
    await expect(page.locator("[data-place-order]")).toBeEnabled();
    expect(calls.session).toHaveLength(1);
  });

  test("a card payment after a wallet button was shown reuses the same PaymentIntent", async ({ page }) => {
    await device(page, { ready: { googlePayButton: true } });
    const calls = await mockStore(page);
    await toPayment(page);
    await expect(slot(page, "googlePay")).toHaveClass(/is-ready/);
    await fillCard(page);
    await page.locator("[data-place-order]").click();
    await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
    expect(calls.session).toHaveLength(1);
  });

  test("WALLET_EAGER_SESSION creates the session first and passes the intent at creation", async ({ page }) => {
    await device(page, { ready: { googlePayButton: true } });
    const calls = await mockStore(page, walletEnv({ WALLET_EAGER_SESSION: "true" }));
    await toPayment(page);
    await expect(slot(page, "googlePay")).toHaveClass(/is-ready/);
    const options = await page.evaluate(() => window.__awxWalletCreates[0].options);
    expect(options).toMatchObject({ intent_id: "int_test", client_secret: "secret_test" });
    expect(calls.session).toHaveLength(1);
  });

  test("prices come from the single pricing source (PRICING_JSON override reaches the page)", async ({ page }) => {
    await device(page, { ready: { googlePayButton: true } });
    await mockStore(page, walletEnv({ PRICING_JSON: JSON.stringify({ products: { d204: { priceCents: 3490 } } }) }));
    await toPayment(page);
    await expect(page.locator(".summary .price-row--total")).toContainText("$42.89");
    const options = await page.evaluate(() => window.__awxWalletCreates[0].options);
    expect(options.amount).toEqual({ value: "42.89", currency: "USD" });
  });

  for (const width of [320, 390, 1440]) {
    test(`payment step with wallet buttons has no horizontal overflow at ${width}px`, async ({ page }) => {
      await device(page, { applePay: true, ready: { applePayButton: true, googlePayButton: true } });
      await mockStore(page);
      await page.setViewportSize({ width, height: 900 });
      await toPayment(page);
      await expect(slot(page, "applePay")).toHaveClass(/is-ready/);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("payment step with visible wallet buttons has no serious or critical axe violations", async ({ page }) => {
    await device(page, { applePay: true, ready: { applePayButton: true, googlePayButton: true } });
    await mockStore(page);
    await toPayment(page);
    await expect(slot(page, "applePay")).toHaveClass(/is-ready/);
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));
    expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
  });
});
