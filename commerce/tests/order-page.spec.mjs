// What the shopper sees after paying (C21): the order's page says whether it has shipped, with the carrier and a
// tracking link; a paid order that was cancelled says so (not "payment not completed"); opening an older order from
// the confirmation email leaves a new cart alone; and a total that changed between the quote and paying stops the
// payment until the shopper has seen it. /api is answered by the real Worker modules (tests/helpers/store-mock.mjs).
import { expect, test } from "@playwright/test";

import { ORDER_ID, fillCard, fillToPayment, mockStore, seedCart } from "./helpers/store-mock.mjs";

const CART_KEY = "apgo_us_cart_v1";
const cartItems = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), CART_KEY);
const orderPage = `/checkout?order=${ORDER_ID}`;

test("a paid order not shipped yet says it will be emailed the tracking number", async ({ page }) => {
  await mockStore(page, { orderExtra: { paid: true, shipment: { shipped: false } } });
  await page.goto(orderPage);
  await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
  await expect(page.locator('[data-shipment="waiting"]')).toContainText("We'll email you the tracking number as soon as it ships.");
});

test("a shipped order shows the carrier, the tracking number and a link for each package", async ({ page }) => {
  const one = { carrier: "UPS", trackingNumber: "1Z999AA10123456784", trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784" };
  await mockStore(page, { orderExtra: { paid: true, shipment: { shipped: true, ...one, packages: [one] } } });
  await page.goto(orderPage);
  const shipped = page.locator('[data-shipment="shipped"]');
  await expect(shipped).toContainText("UPS 1Z999AA10123456784");
  await expect(shipped.getByRole("link", { name: "Track package" })).toHaveAttribute("href", one.trackingUrl);

  const two = [
    { carrier: "Amazon Logistics", trackingNumber: "TBA111111111111", trackingUrl: "https://track.amazon.com/tracking/TBA111111111111" },
    { carrier: "Amazon Logistics", trackingNumber: "TBA222222222222", trackingUrl: null, deliveredAt: "2026-10-20T18:00:00Z" },
  ];
  const second = await page.context().newPage();
  await mockStore(second, { orderExtra: { paid: true, shipment: { shipped: true, ...two[0], packages: two } } });
  await second.goto(orderPage);
  const both = second.locator('[data-shipment="shipped"]');
  await expect(both.locator('[data-tracking="TBA111111111111"]')).toContainText("Package 1: Amazon Logistics TBA111111111111");
  await expect(both.locator('[data-tracking="TBA222222222222"]')).toContainText("Package 2: Amazon Logistics TBA222222222222 · Delivered");
  await expect(both.getByRole("link", { name: "Track package" })).toHaveCount(1);
});

test("a paid order that was cancelled says cancelled, not that the payment failed", async ({ page }) => {
  await mockStore(page, { orderStatus: "cancelled", orderExtra: { paid: true, shipment: null } });
  await page.goto(orderPage);
  await expect(page.locator("[data-confirmation]")).toContainText("Order cancelled");
  await expect(page.locator("[data-confirmation]")).not.toContainText("Payment didn't go through");
});

test("opening an older order from the confirmation email keeps the cart the shopper has now", async ({ page }) => {
  await seedCart(page, [{ sku: "d215", qty: 2 }]);
  await mockStore(page, { orderExtra: { paid: true, shipment: { shipped: false } } });
  await page.goto(orderPage);
  await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
  expect(await cartItems(page)).toEqual([{ sku: "d215", qty: 2 }]);
});

test("a total that changed before paying by card stops the payment and shows the new total; paying again goes through", async ({ page }) => {
  await seedCart(page, [{ sku: "d204", qty: 1 }]);
  await mockStore(page, { paymentPricing: { products: { d204: { priceCents: 6999 } } } });
  await page.goto("/checkout");
  await fillToPayment(page, { payMethod: "card" });
  await fillCard(page);
  await page.locator("[data-place-order]").click();
  await expect(page.locator("[data-payment-message]")).toContainText("Price updated");
  await expect(page.locator("[data-payment-message]")).toContainText("The total is now $77.98 (it was $67.98)");
  expect(await page.evaluate(() => window.__awxConfirms ?? [])).toEqual([]);

  await page.locator("[data-place-order]").click();
  await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
  expect(await page.evaluate(() => window.__awxConfirms)).toEqual([{ intent_id: "int_test", client_secret: "secret_test" }]);
});
