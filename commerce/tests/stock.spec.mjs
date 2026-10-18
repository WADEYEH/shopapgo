// Amazon stock on the store and in the back office (D25, D76; M6-09, M9-17, A3, B3, I9; worker/inventory.js). On the store
// a product below 5 at Amazon says Out of stock everywhere and cannot be added or checked out, a cart that already has it
// says so, and a cart asking for more than Amazon can ship can be lowered with one press. /api is answered by the real
// Worker modules (tests/helpers/store-mock.mjs) with the stock given. The back office shows the stock, when it was read,
// Refresh, and lists stock-outs on the dashboard (/admin/api stubbed: tests/helpers/admin-mock.mjs).
import { expect, test } from "@playwright/test";

import { PRODUCT_SLUGS } from "../../lib/shop/product-data.mjs";
import { mockStore, seedCart } from "./helpers/store-mock.mjs";
import { mockAdminApi } from "./helpers/admin-mock.mjs";

const CART_KEY = "apgo_us_cart_v1";
const cartItems = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), CART_KEY);
const APPROVED = { AIRWALLEX_ENV: "prod", PRICING_APPROVED: "true", PRICING_JSON: JSON.stringify({ products: { d204: { priceCents: 5999 }, d215: { priceCents: 2999 } } }) };

test.describe("store", () => {
  test("an out-of-stock product's page says Out of stock, offers no Add to cart and tells Google", async ({ page }) => {
    await mockStore(page, { stock: { d204: 40, d215: 3 }, env: APPROVED });
    await page.goto(`/products/${PRODUCT_SLUGS.d215}`);
    await page.locator("html[data-pdp-ready='true']").waitFor();
    await expect(page.locator("[data-unavailable]")).toHaveText("Out of stock. Please check back soon.");
    await expect(page.locator("[data-unavailable]")).toHaveAttribute("data-out-of-stock", "true");
    await expect(page.locator("[data-buyrow] [data-pdp-add]")).toHaveCount(0);
    for (const button of await page.locator("[data-pdp-add]").all()) await expect(button).toBeDisabled();
    await expect.poll(async () => JSON.parse(await page.locator("#pdp-jsonld").textContent()).offers?.availability).toBe("https://schema.org/OutOfStock");
    expect(await cartItems(page)).toEqual([]);
  });

  test("the product in stock still sells, without offering the out-of-stock one as its pair", async ({ page }) => {
    await mockStore(page, { stock: { d204: 40, d215: 3 } });
    await page.goto(`/products/${PRODUCT_SLUGS.d204}`);
    await page.locator("html[data-pdp-ready='true']").waitFor();
    await expect(page.locator("[data-pair-card]")).toHaveCount(0);
    await page.locator("[data-buyrow] [data-pdp-add]").click();
    await expect.poll(() => cartItems(page)).toEqual([{ sku: "d204", qty: 1 }]);
  });

  test("the products overview marks the out-of-stock product", async ({ page }) => {
    await mockStore(page, { stock: { d204: 40, d215: 0 } });
    await page.goto("/products");
    await expect(page.locator('[data-unavailable="d215"]')).toHaveText("Out of stock");
    await expect(page.locator('[data-add-to-cart="d215"]')).toHaveCount(0);
    await expect(page.locator('[data-add-to-cart="d204"]')).toBeVisible();
  });

  test("a cart that already has it says Out of stock, cannot check out, and lets the shopper remove it", async ({ page }) => {
    await seedCart(page, [{ sku: "d215", qty: 1 }, { sku: "d204", qty: 2 }]);
    await mockStore(page, { stock: { d204: 40, d215: 4 } });
    await page.goto("/cart");
    const message = page.locator("[data-cart-message]");
    await expect(message.locator(".notice__title")).toHaveText("Out of stock");
    await expect(message).toContainText("Atomic Glaze Coating is out of stock. Remove it from your cart to check out.");
    await expect(message.locator('[data-line="d215"]')).toContainText("Out of stock");
    await expect(page.locator("[data-checkout-button]")).toHaveAttribute("aria-disabled", "true");
    await message.locator('[data-line="d215"]').getByRole("button", { name: "Remove" }).click();
    await expect(message).toBeEmpty();
    await expect(page.locator("[data-checkout-button]")).not.toHaveAttribute("aria-disabled", "true");
    expect(await cartItems(page)).toEqual([{ sku: "d204", qty: 2 }]);
  });

  test("a cart asking for more than Amazon can ship is lowered with one press", async ({ page }) => {
    await seedCart(page, [{ sku: "d204", qty: 9 }]);
    await mockStore(page, { stock: { d204: 7, d215: 40 } });
    await page.goto("/cart");
    const message = page.locator("[data-cart-message]");
    await expect(message.locator(".notice__title")).toHaveText("Not enough in stock");
    await expect(message).toContainText("Only 7 of APGO Atomic Colored Glaze can ship right now. Lower the quantity to check out.");
    await expect(page.locator("[data-checkout-button]")).toHaveAttribute("aria-disabled", "true");
    await message.locator("[data-cart-shortage]").getByRole("button", { name: "Change to 7" }).click();
    await expect(message).toBeEmpty();
    await expect(page.locator('[data-cart-lines] [data-line="d204"]')).toBeVisible();
    expect(await cartItems(page)).toEqual([{ sku: "d204", qty: 7 }]);
  });
});

test.describe("back office", () => {
  test("Products show Amazon's stock, what is out of stock and when it was read; Refresh reads again", async ({ page }) => {
    const requests = await mockAdminApi(page, { stock: { d204: 40, d215: 3 }, stockAfterRefresh: { d204: 40, d215: 60 } });
    await page.goto("/admin/index.html#/products");
    await expect(page.locator("[data-product]")).toHaveCount(2);
    await expect(page.locator('[data-product="d204"] [data-stock="40"]')).toContainText("12 on the way");
    await expect(page.locator('[data-product="d215"] [data-out-of-stock="true"]')).toHaveText("Out of stock");
    await expect(page.locator('[data-product="d204"] [data-out-of-stock]')).toHaveCount(0);
    await expect(page.locator("[data-chip-out-of-stock]")).toContainText("1");
    await expect(page.locator('[data-stock-status="ok"]')).toContainText("Amazon stock last read");
    await page.locator("[data-refresh-stock]").click();
    await expect(page.locator("[data-stock-outcome]")).toContainText("Stock read just now");
    await expect(page.locator('[data-product="d215"] [data-out-of-stock]')).toHaveCount(0);
    expect(requests.stockRefresh).toBe(1);
  });

  test("an out-of-stock product's page says since when and what it means; a failed Refresh says the site keeps selling", async ({ page }) => {
    await mockAdminApi(page, { stock: { d204: 40, d215: 3 }, stockRefresh: "failed" });
    await page.goto("/admin/index.html#/products/d215");
    const stock = page.locator('[data-product-stock="out"]');
    await expect(stock).toContainText("Out of stock on the site since");
    await expect(stock).toContainText("paid orders still ship");
    await expect(stock.locator(".stat").first()).toContainText("3");
    await expect(stock.locator("[data-stock-times]")).toContainText("Amazon updated");
    await expect(page.locator(".page-head [data-out-of-stock]")).toHaveText("Out of stock");
    await stock.locator("[data-refresh-stock]").click();
    await expect(page.locator("[data-product-outcome]")).toContainText("Could not read Amazon's stock; the site sells on the last numbers");
  });

  test("the dashboard lists products out of stock and stock not read for an hour", async ({ page }) => {
    await mockAdminApi(page, { stock: { d204: 40, d215: 2 }, stockStale: true });
    await page.goto("/admin/index.html#/");
    const list = page.locator("[data-dashboard-stock]");
    await expect(list.locator('[data-attention="stock-stale"]')).toContainText("Amazon stock not read for over an hour");
    await expect(list.locator('[data-attention="stock-out"]')).toContainText("Out of stock on the site: ");
    await expect(list.locator('[data-attention="stock-out"]')).toContainText("2 at Amazon");
    await expect(list.locator('[data-attention="stock-out"]')).toHaveAttribute("href", "#/products/d215");
    await expect(page.locator("[data-dashboard-attention]")).not.toContainText("Nothing is waiting");
  });

  test("without the Amazon connection the page says the site sells without checking stock, with no Refresh", async ({ page }) => {
    await mockAdminApi(page);
    await page.goto("/admin/index.html#/products");
    await expect(page.locator('[data-stock-status="off"]')).toHaveText("Amazon stock is not connected: the site sells without checking stock");
    await expect(page.locator("[data-refresh-stock]")).toHaveCount(0);
    await expect(page.locator('[data-product="d204"]')).toContainText("Stock not connected");
  });
});
