// The owners' stop-selling switch on the store (A4, M2-04, M9-07; PR 3-8): a stopped product cannot be added to a cart
// anywhere, it is not offered as the second half of a pair, and a cart that already has it says so and lets the shopper
// remove it. /api is answered by the real Worker modules (tests/helpers/store-mock.mjs) with the product stopped.
import { expect, test } from "@playwright/test";

import { PRODUCT_SLUGS } from "../../lib/shop/product-data.mjs";
import { mockStore, seedCart } from "./helpers/store-mock.mjs";

const CART_KEY = "apgo_us_cart_v1";
const cartItems = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), CART_KEY);

test("a stopped product's page has no Add to cart anywhere and says it is not available", async ({ page }) => {
  await mockStore(page, { stopped: ["d204"] });
  await page.goto(`/products/${PRODUCT_SLUGS.d204}`);
  await page.locator("html[data-pdp-ready='true']").waitFor();
  await expect(page.locator("[data-unavailable]")).toHaveText("Not available right now. Please check back soon.");
  await expect(page.locator('[data-buyrow] [data-pdp-add]')).toHaveCount(0);
  await expect(page.locator("[data-qty]")).toHaveCount(0);
  await expect(page.locator("[data-pair-card]")).toHaveCount(0);
  for (const button of await page.locator("[data-pdp-add]").all()) await expect(button).toBeDisabled();
  await expect(page.locator("[data-sticky]")).toHaveAttribute("data-visible", "false");
  expect(await cartItems(page)).toEqual([]);
});

test("the other product still sells, without offering the stopped one as its pair", async ({ page }) => {
  await mockStore(page, { stopped: ["d204"] });
  await page.goto(`/products/${PRODUCT_SLUGS.d215}`);
  await page.locator("html[data-pdp-ready='true']").waitFor();
  await expect(page.locator("[data-pair-card]")).toHaveCount(0);
  await page.locator('[data-buyrow] [data-pdp-add]').click();
  await expect.poll(() => cartItems(page)).toEqual([{ sku: "d215", qty: 1 }]);
});

test("the products overview marks the stopped product and offers only the other", async ({ page }) => {
  await mockStore(page, { stopped: ["d204"] });
  await page.goto("/products");
  await expect(page.locator('[data-unavailable="d204"]')).toHaveText("Not available right now");
  await expect(page.locator('[data-add-to-cart="d204"]')).toHaveCount(0);
  await expect(page.locator('[data-add-to-cart="d215"]')).toBeVisible();
});

test("a cart that already has the stopped product says so, cannot check out, and lets the shopper remove it", async ({ page }) => {
  await seedCart(page, [{ sku: "d204", qty: 1 }, { sku: "d215", qty: 2 }]);
  await mockStore(page, { stopped: ["d204"] });
  await page.goto("/cart");
  const message = page.locator("[data-cart-message]");
  await expect(message).toContainText("Not available right now");
  await expect(message).toContainText("Atomic Colored Glaze is not available right now. Remove it from your cart to check out.");
  await expect(page.locator("[data-checkout-button]")).toHaveAttribute("aria-disabled", "true");
  await message.locator('[data-line="d204"]').getByRole("button", { name: "Remove" }).click();
  await expect(message).toBeEmpty();
  await expect(page.locator('[data-cart-lines] [data-line="d215"]')).toBeVisible();
  await expect(page.locator("[data-checkout-button]")).not.toHaveAttribute("aria-disabled", "true");
  expect(await cartItems(page)).toEqual([{ sku: "d215", qty: 2 }]);
});
