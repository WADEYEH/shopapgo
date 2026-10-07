// Checkout rules on the page (M3): where we ship, PO boxes, ZIP vs state, phone, email hint, and the address check
// before payment (suggested spelling, missing unit, undeliverable, refused at payment time). /api is the store mock with
// the real rules and validation modules; the address check's answer is set per test.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { TEST_PHONE, fillCard, fillContact, mockStore, seedCart } from "./helpers/store-mock.mjs";

async function openCheckout(page, options = {}) {
  const calls = await mockStore(page, options);
  await seedCart(page, [{ sku: "d204", qty: 1 }]);
  await page.goto("/checkout.html");
  return calls;
}

async function fillAddress(page, patch = {}) {
  const value = { firstName: "Test", lastName: "Shopper", street: "100 Example Ave", street2: "", city: "Austin", state: "TX", zip: "78701", ...patch };
  await page.getByLabel("First name").fill(value.firstName);
  await page.getByLabel("Last name").fill(value.lastName);
  await page.getByLabel("Street address").fill(value.street);
  await page.getByLabel("Apt, suite, unit").fill(value.street2);
  await page.getByLabel("City").fill(value.city);
  await page.getByLabel("State").selectOption(value.state);
  await page.getByLabel("ZIP code").fill(value.zip);
}

const continueToPayment = (page) => page.getByRole("button", { name: /Continue to payment/ }).click();
const fieldError = (page, name) => page.locator(`[data-field="${name}"] [data-error]`);

test("a slow first quote never sends a shopper who has already moved on back to step 1", async ({ page }) => {
  await mockStore(page);
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/cart/quote", async (route) => { await held; await route.fallback(); });
  await seedCart(page, [{ sku: "d204", qty: 1 }]);
  await page.goto("/checkout.html");
  await fillContact(page);
  await expect(page.locator('[data-step="shipping"]')).toBeVisible();
  release();
  await expect(page.locator(".summary .price-row--total")).toBeVisible();
  await expect(page.locator('[data-step="shipping"]')).toBeVisible();
  await expect(page.locator('[data-step="contact"]')).toBeHidden();
});

test("a draft save still waiting when the order is confirmed does not bring the draft back", async ({ page }) => {
  await page.clock.install();
  await openCheckout(page);
  await fillContact(page);
  await fillAddress(page);
  await continueToPayment(page);
  await fillCard(page);
  // An edit in the address form leaves a save waiting on its timer (the page's clock is held).
  await page.evaluate(() => document.querySelector('[data-step="shipping"] [name="city"]').dispatchEvent(new Event("input", { bubbles: true })));
  await page.locator("[data-place-order]").click();
  await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
  await page.clock.runFor(1000);
  expect(await page.evaluate(() => sessionStorage.getItem("apgo_us_checkout_draft"))).toBeNull();
});

test("the state list is the 48 contiguous states and DC, and the page says so", async ({ page }) => {
  await openCheckout(page);
  await fillContact(page);
  const codes = await page.locator("[data-state-select] option").evaluateAll((options) => options.map((o) => o.value).filter(Boolean));
  expect(codes).toHaveLength(49);
  for (const code of ["AK", "HI", "PR", "GU", "AA", "AE", "AP"]) expect(codes).not.toContain(code);
  await expect(page.locator('[data-step="shipping"]')).toContainText("We ship to the 48 contiguous states and DC. No PO boxes or military addresses.");
});

test("PO boxes, military mail, a ZIP from another state and too-long lines are stopped on the page", async ({ page }) => {
  const calls = await openCheckout(page);
  await fillContact(page);
  await fillAddress(page, { street: "PO Box 12" });
  await continueToPayment(page);
  await expect(fieldError(page, "street")).toHaveText("We can't ship to PO boxes or military addresses.");
  await expect(page.getByLabel("Street address")).toHaveAttribute("aria-invalid", "true");

  await fillAddress(page, { city: "APO" });
  await continueToPayment(page);
  await expect(fieldError(page, "city")).toHaveText("We can't ship to PO boxes or military addresses.");

  await fillAddress(page, { zip: "10001" });
  await continueToPayment(page);
  await expect(fieldError(page, "zip")).toHaveText("This ZIP code doesn't match the state you selected.");

  await fillAddress(page, { street: `1 ${"A".repeat(59)}` });
  await continueToPayment(page);
  await expect(fieldError(page, "street")).toHaveText("Use up to 60 characters.");
  await expect(page.getByLabel("Street address")).toHaveValue(`1 ${"A".repeat(59)}`, { timeout: 1000 });
  expect(calls.address).toHaveLength(0);
  await expect(page.locator('[data-step="shipping"]')).toBeVisible();
});

test("the phone is required, checked and shown back formatted; the hint stays linked to the field", async ({ page }) => {
  await openCheckout(page);
  await page.locator("#email").fill("ada@example.com");
  await page.locator("#phone").fill("555-0134");
  await page.getByRole("button", { name: /Continue to shipping/ }).click();
  await expect(fieldError(page, "phone")).toHaveText("Enter a 10-digit US phone number.");
  await expect(page.locator("#phone")).toHaveAttribute("aria-describedby", "phone-hint phone-error");
  await page.locator("#phone").fill("+1 512.555.0134");
  await page.getByRole("button", { name: /Continue to shipping/ }).click();
  await expect(page.locator('[data-step="shipping"]')).toBeVisible();
  await expect(page.locator("#phone")).toHaveValue(TEST_PHONE);
  await expect(page.locator("#phone")).toHaveAttribute("aria-describedby", "phone-hint");
});

test("a misspelled email domain gets a one-click hint that never blocks", async ({ page }) => {
  await openCheckout(page);
  await page.locator("#email").fill("ada@gmial.com");
  await page.locator("#phone").focus();
  const hint = page.locator("[data-email-suggestion]");
  await expect(hint).toHaveText("Did you mean ada@gmail.com?");
  await hint.getByRole("button", { name: "ada@gmail.com" }).click();
  await expect(page.locator("#email")).toHaveValue("ada@gmail.com");
  await expect(hint).toBeHidden();

  await page.locator("#email").fill("ada@gmial.com");
  await page.locator("#phone").fill(TEST_PHONE);
  await page.getByRole("button", { name: /Continue to shipping/ }).click();
  await expect(page.locator('[data-step="shipping"]')).toBeVisible();
});

test("a suggested spelling: the shopper picks it (or keeps their own) and the payment carries that choice", async ({ page }) => {
  const calls = await openCheckout(page, { addressCheck: "suggest" });
  await fillContact(page);
  await fillAddress(page);
  await continueToPayment(page);
  const panel = page.locator("[data-address-check]");
  await expect(panel).toContainText("Check your address");
  await expect(panel).toContainText("100 EXAMPLE AVE STE 200, Austin, TX 78701-1234");
  await expect(panel).toContainText("100 Example Ave, Austin, TX 78701");
  await expect(page.locator('input[name="addressChoice"][value="suggested"]')).toBeChecked();
  const scan = await new AxeBuilder({ page }).include("[data-step=\"shipping\"]").analyze();
  expect(scan.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);

  await continueToPayment(page);
  await expect(page.locator('[data-step="payment"]')).toBeVisible();
  await expect(page.getByLabel("Street address")).toHaveValue("100 EXAMPLE AVE STE 200");
  await expect(page.getByLabel("ZIP code")).toHaveValue("78701-1234");
  await fillCard(page);
  await page.locator("[data-place-order]").click();
  await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
  expect(calls.session[0].addressReview).toEqual({ choice: "suggested" });
  expect(calls.session[0].shipping).toMatchObject({ street: "100 EXAMPLE AVE STE 200", zip: "78701-1234" });
  expect(calls.address).toHaveLength(1);
});

test("keeping the address as typed sends that choice", async ({ page }) => {
  const calls = await openCheckout(page, { addressCheck: "suggest" });
  await fillContact(page);
  await fillAddress(page);
  await continueToPayment(page);
  await page.locator('label:has(input[name="addressChoice"][value="original"]) .check__label').click();
  await continueToPayment(page);
  await expect(page.locator('[data-step="payment"]')).toBeVisible();
  await fillCard(page);
  await page.locator("[data-place-order]").click();
  await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
  expect(calls.session[0].addressReview).toEqual({ choice: "original" });
  expect(calls.session[0].shipping.street).toBe("100 Example Ave");
});

test("a missing unit number: add one, or confirm there is none", async ({ page }) => {
  const calls = await openCheckout(page, { addressCheck: "missing_unit" });
  await fillContact(page);
  await fillAddress(page);
  await continueToPayment(page);
  const panel = page.locator("[data-address-check]");
  await expect(panel).toContainText("Apartment or unit number?");
  await expect(page.getByLabel("Apt, suite, unit")).toBeFocused();

  await continueToPayment(page);
  await expect(page.locator('[data-step="shipping"]')).toBeVisible();
  await page.locator('label:has(input[name="noUnit"]) .check__label').click();
  await continueToPayment(page);
  await expect(page.locator('[data-step="payment"]')).toBeVisible();
  await fillCard(page);
  await page.locator("[data-place-order]").click();
  await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
  expect(calls.session[0].addressReview).toEqual({ noUnit: true });
});

test("an undeliverable address is stopped until it changes", async ({ page }) => {
  let answers = 0;
  const calls = await openCheckout(page, { addressCheck: () => ({ status: answers++ === 0 ? "undeliverable" : "valid", message: "We couldn't confirm this address. Check the street, city and ZIP code." }) });
  await fillContact(page);
  await fillAddress(page, { street: "1 Nowhere Rd" });
  await continueToPayment(page);
  await expect(page.locator("[data-address-check]")).toContainText("We couldn't confirm this address");
  await continueToPayment(page);
  await expect(page.locator('[data-step="shipping"]')).toBeVisible();
  expect(calls.address).toHaveLength(1);

  await page.getByLabel("Street address").fill("100 Example Ave");
  await expect(page.locator("[data-address-check]")).toBeEmpty();
  await continueToPayment(page);
  await expect(page.locator('[data-step="payment"]')).toBeVisible();
  expect(calls.address).toHaveLength(2);
});

test("an address refused when the payment is created sends the shopper back to the field", async ({ page }) => {
  let answers = 0;
  // The page's check passes; the Worker's second check at payment time does not.
  const calls = await openCheckout(page, { addressCheck: () => (answers++ === 0 ? { status: "valid" } : { status: "undeliverable" }) });
  await fillContact(page);
  await fillAddress(page);
  await continueToPayment(page);
  await fillCard(page);
  await page.locator("[data-place-order]").click();
  await expect(page.locator('[data-step="shipping"]')).toBeVisible();
  await expect(fieldError(page, "street")).toHaveText("We couldn't confirm this address. Check the street, city and ZIP code.");
  await expect(page.getByLabel("Street address")).toBeFocused();
  await expect(page.locator("[data-place-order]")).toBeEnabled();
  expect(calls.session).toHaveLength(1);
});
