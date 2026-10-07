// The single site: brand pages and store pages served by one Worker from one asset directory (scripts/build-site.mjs).
// Runs only against a served single site, for example locally:
//   npm run build:site
//   npx wrangler dev --port 8799 --assets ./site --var ROOT_PAGE:off --var SITE_HOME_URL:http://127.0.0.1:8799
//   APGO_SITE_URL=http://127.0.0.1:8799 npx playwright test tests/brand-store.spec.mjs
import { expect, test } from "@playwright/test";

const site = process.env.APGO_SITE_URL;
test.skip(!site, "Run against a served single site with APGO_SITE_URL (see the header).");

for (const width of [360, 1440]) {
  test(`brand home -> product page -> cart -> guides on one origin at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${site}/`);
    const cta = page.locator('[data-product-cta][data-sku="d204"][data-placement="hero"]');
    await expect(cta).toHaveAttribute("href", "/products/d204");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await cta.click();
    await expect(page).toHaveURL(`${site}/products/d204`);

    await page.getByRole("button", { name: "Add to cart" }).first().click();
    await expect(page.locator("[data-cart-count]").first()).toHaveText("1");
    await page.locator("[data-cart-link]").first().click();
    await expect(page).toHaveURL((url) => url.origin === site && ["/cart", "/cart.html"].includes(url.pathname));
    await expect(page.locator('[data-line="d204"]')).toBeVisible();

    // The store's links back to the brand site stay on the same origin.
    await expect(page.locator("[data-site-home]").first()).toHaveAttribute("href", `${site}/`);
    await expect(page.locator("[data-site-guides]").first()).toHaveAttribute("href", `${site}/us/guides`);
    await page.locator("[data-site-guides]").first().click();
    await expect(page).toHaveURL(`${site}/us/guides`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("APGO car care guides");
  });
}

test("exact /us answers 301 to the brand home; the guides and unknown paths behave", async ({ page, request }) => {
  const redirect = await request.get(`${site}/us?utm_source=test`, { maxRedirects: 0 });
  expect(redirect.status()).toBe(301);
  expect(new URL(redirect.headers().location, site).href).toBe(`${site}/?utm_source=test`);

  const guide = await request.get(`${site}/us/guides/what-is-car-glaze`);
  expect(guide.status()).toBe(200);
  const missing = await request.get(`${site}/no-such-page`);
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain("<html");
});

test("a test-site build loads no GA4, GTM or brand Meta Pixel", async ({ page }) => {
  const external = [];
  page.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if (/googletagmanager\.com|google-analytics\.com|connect\.facebook\.net|facebook\.com/.test(host)) external.push(request.url());
  });
  await page.goto(`${site}/`);
  await page.goto(`${site}/us/guides`);
  await page.goto(`${site}/products/d215`);
  expect(external).toEqual([]);
});
