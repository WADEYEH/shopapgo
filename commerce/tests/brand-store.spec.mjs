import { expect, test } from "@playwright/test";
import { fillCard, fillToPayment, mockStore } from "./helpers/store-mock.mjs";

const brand = process.env.APGO_BRAND_URL;
const store = process.env.APGO_STORE_URL;
test.skip(!brand || !store, "Run against the Next.js and Worker preview servers with APGO_BRAND_URL/APGO_STORE_URL.");

for (const width of [360, 390, 768, 1024, 1440]) {
  test(`brand → correct cart → guides works across origins at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${brand}#d215`);
    const add = page.locator('#d215 [data-store-add="d215"]');
    await expect(add).toBeVisible();
    await expect(add).toHaveAttribute("href", `${store}/cart.html?add=d215`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await add.click();
    // Worker Static Assets canonicalizes HTML to extensionless URLs; the local
    // static test server keeps .html. In both cases the add parameter is consumed.
    await expect(page).toHaveURL((url) => url.origin === store && ["/cart", "/cart.html"].includes(url.pathname) && !url.search);
    await expect(page.locator('[data-line="d215"]')).toContainText("WET");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("apgo_us_cart_v1")))).toEqual([{ sku: "d215", qty: 1 }]);
    await page.reload();
    await expect(page.locator('[data-line="d215"]')).toBeVisible();
    await expect(page.locator("[data-cart-count]").first()).toHaveText("1");
    await expect(page.locator("[data-site-guides]")).toHaveAttribute("href", `${brand}/guides`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await page.locator("[data-site-guides]").click();
    await expect(page).toHaveURL(`${brand}/guides`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("APGO car care guides");
    await expect(page.locator('header a.us-store-cart:visible')).toHaveAttribute("href", `${store}/cart.html`);
  });
}

test("brand cart entry can complete checkout with a mocked payment provider", async ({ page }) => {
  const calls = await mockStore(page, { env: { SITE_HOME_URL: brand } });
  await page.goto(`${brand}#d204`);
  await page.locator('#d204 [data-store-add="d204"]').click();
  await expect(page.locator('[data-line="d204"]')).toBeVisible();
  await page.locator("[data-checkout-button]").click();
  await fillToPayment(page);
  await fillCard(page);
  await page.getByRole("button", { name: /Place order/ }).click();
  await expect(page.getByRole("heading", { name: "Thanks for your order." })).toBeVisible();
  expect(calls.session).toHaveLength(1);
  expect(calls.session[0].items).toEqual([{ sku: "d204", qty: 1 }]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("apgo_us_cart_v1")))).toEqual([]);
});
