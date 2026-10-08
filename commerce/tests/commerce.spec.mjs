import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { DEFAULT_PRICING } from "../worker/pricing.js";
import { ORDER_ID, TEST_PHONE, fillCard, fillToPayment, mockStore, seedCart, selectPayMethod } from "./helpers/store-mock.mjs";

const usd = (cents) => `$${(cents / 100).toFixed(2)}`;
const { d204, d215 } = DEFAULT_PRICING.products;

test.describe("cart", () => {
  test("adds from a link, prices on the server and updates quantities", async ({ page }) => {
    await mockStore(page);
    await page.goto("/cart?add=d204");

    const line = page.locator('[data-line="d204"]');
    await expect(line).toContainText("DRY");
    await expect(line).toContainText(usd(d204.priceCents));
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.locator("[data-cart-count]").first()).toHaveText("1");

    await line.getByRole("button", { name: "Increase quantity" }).click();
    await expect(line).toContainText(usd(d204.priceCents * 2));
    // $7.99 per order, however many items (D31).
    await expect(page.locator(".price-row--total")).toContainText(usd(d204.priceCents * 2 + DEFAULT_PRICING.shippingMethods.standard.amountCents));

    await line.getByRole("button", { name: "Remove" }).click();
    await expect(page.locator("[data-cart-title]")).toHaveText("Your cart is empty.");
    await expect(page.locator("[data-checkout-button]")).toHaveAttribute("aria-disabled", "true");
  });

  test("shows a notice instead of prices when the store API is unavailable", async ({ page }) => {
    await seedCart(page, [{ sku: "d215", qty: 1 }]);
    await page.goto("/cart");
    await expect(page.locator("[data-cart-message]")).toContainText("Cart unavailable");
    await expect(page.locator("[data-checkout-button]")).toHaveAttribute("aria-disabled", "true");
  });
});

test.describe("checkout", () => {
  test("completes contact → shipping → payment and confirms the order", async ({ page }) => {
    const calls = await mockStore(page);
    await seedCart(page, [{ sku: "d204", qty: 1 }, { sku: "d215", qty: 2 }]);
    await page.goto("/checkout");

    await page.getByRole("button", { name: /Continue to shipping/ }).click();
    await expect(page.locator('[data-field="email"] [data-error]')).toHaveText("Enter a valid email address.");
    await expect(page.locator('[data-field="phone"] [data-error]')).toHaveText("Enter a 10-digit US phone number.");

    await page.locator("#email").fill("test.shopper@example.com");
    await page.locator("#phone").fill("512 555 0134");
    await page.getByRole("button", { name: /Continue to shipping/ }).click();
    await expect(page.locator("#phone")).toHaveValue("(512) 555-0134");
    await page.getByLabel("ZIP code").fill("787");
    await page.getByRole("button", { name: /Continue to payment/ }).click();
    await expect(page.locator('[data-field="zip"] [data-error]')).toHaveText("Enter a 5-digit ZIP code.");

    await page.getByLabel("First name").fill("Test");
    await page.getByLabel("Last name").fill("Shopper");
    await page.getByLabel("Street address").fill("100 Example Ave");
    await page.getByLabel("City").fill("Austin");
    await page.getByLabel("State").selectOption("TX");
    await page.getByLabel("ZIP code").fill("78701");
    await expect(page.locator("[data-ship-options]")).toContainText("Most orders arrive in 3–5 business days · $7.99");
    await page.getByRole("button", { name: /Continue to payment/ }).click();

    // D204 + 2 × D215 + $7.99 shipping, from the single pricing source
    const total = usd(d204.priceCents + 2 * d215.priceCents + DEFAULT_PRICING.shippingMethods.standard.amountCents);
    await expect(page.locator(".price-row--total")).toContainText(total);
    await expect(page.locator("[data-place-order]")).toHaveText(`Place order · ${total}`);

    await page.locator("[data-place-order]").click();
    await expect(page.locator('[data-field="cardNumber"] [data-error]')).toHaveText("Enter your card number.");
    expect(calls.session).toHaveLength(0);

    await fillCard(page);
    await page.locator("[data-place-order]").click();

    await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
    await expect(page.locator("[data-confirmation]")).toContainText(ORDER_ID);
    await expect(page).toHaveURL(new RegExp(`/checkout\\?order=${ORDER_ID}$`));

    expect(calls.session).toHaveLength(1);
    const sent = calls.session[0];
    expect(sent.method).toBe("standard");
    expect(sent.shipping).toMatchObject({ state: "TX", zip: "78701" });
    expect(sent.contact).toEqual({ email: "test.shopper@example.com", phone: "+15125550134", marketingOptIn: false });
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
    expect(await page.evaluate(() => sessionStorage.getItem("apgo_us_checkout_draft"))).toBeNull();
  });

  test("a declined card shows a safe message, retains the cart and retries the same PaymentIntent", async ({ page }) => {
    const calls = await mockStore(page);
    await seedCart(page, [{ sku: "d204", qty: 1 }]);
    await page.goto("/checkout");
    await fillToPayment(page);
    await fillCard(page);

    await page.evaluate(() => { window.__awxDecline = true; });
    await page.locator("[data-place-order]").click();
    await expect(page.locator("[data-payment-message]")).toContainText("Your payment wasn't completed.");
    await expect(page.locator("[data-payment-message]")).not.toContainText("issuer declined");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("apgo_us_cart_v1")))).toEqual([{ sku: "d204", qty: 1 }]);
    await expect(page.locator("[data-place-order]")).toBeEnabled();

    await page.evaluate(() => { window.__awxDecline = false; });
    await page.locator("[data-place-order]").click();
    await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
    expect(calls.session).toHaveLength(1);
  });

  test("contact and shipping survive a refresh from sessionStorage", async ({ page }) => {
    await mockStore(page);
    await seedCart(page, [{ sku: "d204", qty: 1 }]);
    await page.goto("/checkout");

    await page.locator("#email").fill("ada@example.com");
    await page.locator("#phone").fill(TEST_PHONE);
    await page.getByText("Email me when new application guides go live").click();
    // The draft is saved 200 ms after the last change: wait for the last one (the checkbox), not just the email.
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem("apgo_us_checkout_draft"))).toContain('"marketingOptIn":true');
    expect(await page.evaluate(() => sessionStorage.getItem("apgo_us_checkout_draft"))).toContain("ada@example.com");

    await page.reload();
    await expect(page.locator("#email")).toHaveValue("ada@example.com");
    await expect(page.locator("#phone")).toHaveValue(TEST_PHONE);
    await expect(page.locator('input[name="marketingOptIn"]')).toBeChecked();
    await expect(page.locator('[data-step="contact"]')).toBeVisible();

    await page.getByRole("button", { name: /Continue to shipping/ }).click();
    await page.getByLabel("First name").fill("Ada");
    await page.getByLabel("Last name").fill("Lee");
    await page.getByLabel("Street address").fill("100 Example Ave");
    await page.getByLabel("City").fill("Austin");
    await page.getByLabel("State").selectOption("TX");
    await page.getByLabel("ZIP code").fill("78701");
    await page.getByRole("button", { name: /Continue to payment/ }).click();
    await expect(page.locator('[data-step="payment"]')).toBeVisible();

    await page.reload();
    await expect(page.locator('[data-step="payment"]')).toBeVisible();
    await expect(page.locator("#email")).toHaveValue("ada@example.com");
    await expect(page.getByLabel("First name")).toHaveValue("Ada");
    await expect(page.getByLabel("ZIP code")).toHaveValue("78701");
    const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem("apgo_us_checkout_draft")));
    expect(draft.step).toBe("payment");
    expect(draft.contact).toEqual({ email: "ada@example.com", phone: TEST_PHONE, marketingOptIn: true });
    expect(draft.shipping).toMatchObject({ firstName: "Ada", state: "TX", zip: "78701" });
  });

  test("Airwallex Pay is a choose-one option and confirms through the same session", async ({ page }) => {
    const calls = await mockStore(page);
    await seedCart(page, [{ sku: "d204", qty: 1 }]);
    await page.goto("/checkout");
    await fillToPayment(page);

    await expect(page.locator('input[name="payMethod"][value="airwallex_pay"]')).toBeVisible();
    await expect(page.locator('input[name="payMethod"][value="card"]')).toBeChecked();
    await expect(page.locator("[data-pay-panel=\"card\"]")).toBeVisible();
    await expect(page.locator("#card-number")).toBeVisible();

    await selectPayMethod(page, "airwallex_pay");
    await expect(page.locator("[data-pay-panel=\"airwallex_pay\"]")).toBeVisible();
    await expect(page.locator("[data-pay-panel=\"card\"]")).toBeHidden();
    await expect(page.locator("[data-place-order]")).toBeHidden();
    await expect(page.locator('[data-stub-drop-in="airwallex_pay"]')).toBeVisible();

    await page.locator('[data-stub-drop-in="airwallex_pay"]').click();
    await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
    await expect(page).toHaveURL(new RegExp(`/checkout\\?order=${ORDER_ID}$`));
    expect(calls.session).toHaveLength(1);
    const created = await page.evaluate(() => window.__awxDropInCreates);
    expect(created).toHaveLength(1);
    expect(created[0].options.methods).toEqual(["airwallex_pay"]);
    expect(created[0].options.intent_id).toBe("int_test");
    expect(created[0].options.client_secret).toBe("secret_test");
    expect(created[0].options.currency).toBe("USD");
    expect(created[0].options.country_code).toBe("US");
  });

  test("an empty cart does not start checkout", async ({ page }) => {
    await mockStore(page);
    await page.goto("/checkout");
    await expect(page.locator("[data-checkout-title]")).toHaveText("Your cart is empty.");
    await expect(page.locator("[data-checkout-flow]")).toBeHidden();
  });

  test("server-reported failure retains the cart and shows a retry link", async ({ page }) => {
    await mockStore(page, { orderStatus: "pending", paymentFailure: { message: "Card verification wasn't completed. Try again or use another payment method." } });
    await seedCart(page, [{ sku: "d204", qty: 1 }]);
    await page.goto("/checkout");
    await fillToPayment(page);
    await fillCard(page);
    await page.locator("[data-place-order]").click();
    await expect(page.locator("[data-confirmation]")).toContainText("Card verification wasn't completed.");
    await expect(page.locator("[data-confirmation]")).not.toContainText("Your card was not charged");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("apgo_us_cart_v1")))).toEqual([{ sku: "d204", qty: 1 }]);
    await page.locator('[data-confirmation] a[href="/checkout"]').click();
    // The checkout draft (js/commerce/checkout-draft.js) brings the shopper straight back to the payment step with their
    // details kept, so they can retry at once. (Waiting for #email to be visible raced that restore.)
    await expect(page.locator('[data-step="payment"]')).toBeVisible();
    await expect(page.locator("#email")).toHaveValue("test.shopper@example.com");
  });
});

for (const width of [320, 390, 1440]) {
  test(`cart and checkout have no horizontal overflow at ${width}px`, async ({ page }) => {
    await mockStore(page);
    await seedCart(page, [{ sku: "d204", qty: 10 }, { sku: "d215", qty: 10 }]);
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/cart", "/checkout"]) {
      await page.goto(path);
      await expect(page.locator(".summary .price-row--total")).toBeVisible();
      if (path === "/checkout") await fillToPayment(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} overflows at ${width}px`).toBeLessThanOrEqual(0);
    }
  });
}

test("cart and checkout have no serious or critical axe violations", async ({ page }) => {
  await mockStore(page);
  await seedCart(page, [{ sku: "d204", qty: 1 }]);
  for (const path of ["/cart", "/checkout"]) {
    await page.goto(path);
    await expect(page.locator(".summary .price-row--total")).toBeVisible();
    if (path === "/checkout") await fillToPayment(page);
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));
    expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`), path).toEqual([]);
  }
});
