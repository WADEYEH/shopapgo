// The single site: brand pages and store pages served by one Worker from one asset directory (scripts/build-site.mjs,
// brand built with NEXT_PUBLIC_APGO_US_SINGLE_SITE=true). Runs only against a served single site, for example locally:
//   npm run build:site
//   npx wrangler dev --port 8799 --assets ./site --var ROOT_PAGE:off --var SITE_HOME_URL:http://127.0.0.1:8799
//   APGO_SITE_URL=http://127.0.0.1:8799 npx playwright test tests/brand-store.spec.mjs
import { expect, test } from "@playwright/test";

const site = process.env.APGO_SITE_URL;
test.skip(!site, "Run against a served single site with APGO_SITE_URL (see the header).");

const header = (page, width) => page.locator(width < 901 ? ".us-header-mobile" : ".us-header-desktop");

for (const width of [360, 1440]) {
  test(`brand home -> product page -> cart count in both headers -> cart -> guides on one origin at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${site}/`);
    const cta = page.locator('[data-product-cta][data-sku="d204"][data-placement="hero"]');
    await expect(cta).toHaveAttribute("href", "/products/atomic-colored-glaze");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await expect(header(page, width).locator("[data-cart-count]")).toBeHidden(); // empty cart: no badge
    await cta.click();
    await expect(page).toHaveURL(`${site}/products/atomic-colored-glaze`);
    await page.locator("html[data-pdp-ready='true']").waitFor();

    // The product page is in the same header (D41).
    await page.getByRole("button", { name: "Add to cart" }).first().click();
    await expect(header(page, width).locator("[data-cart-count]")).toHaveText("1");

    // Back on a brand page, its header shows the same count and leads to the same cart.
    await page.goto(`${site}/us/guides`);
    const brandCart = header(page, width).locator("[data-cart-link]");
    await expect(brandCart.locator("[data-cart-count]")).toHaveText("1");
    await expect(brandCart).toHaveAttribute("aria-label", "Cart, 1 item");
    await brandCart.click();
    await expect(page).toHaveURL((url) => url.origin === site && ["/cart", "/cart.html"].includes(url.pathname));
    await expect(page.locator('[data-line="d204"]')).toBeVisible();

    // The cart is in the site's own header and footer (D41): back to the guides on the same origin.
    await page.locator("#site-footer").getByRole("link", { name: "All guides" }).click();
    await expect(page).toHaveURL(`${site}/us/guides`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("APGO car care guides");
  });

  test(`Shop in the brand header opens the overview, which adds to the same cart, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${site}/`);
    const shop = header(page, width).locator('a[href="/products"]');
    await expect(shop).toBeVisible();
    await expect(shop).toContainText("Shop");
    await shop.click();
    await expect(page).toHaveURL(`${site}/products`);
    await expect(page.locator("h1")).toHaveText("Same finish. Pick your moment.");
    await expect(page.locator('[data-price-sku="d215"]')).toHaveText(/^\$\d+\.\d\d$/);
    await page.locator('[data-add-to-cart="d215"]').click();
    await expect(header(page, width).locator("[data-cart-count]")).toHaveText("1");
    await page.goto(`${site}/`);
    await expect(header(page, width).locator("[data-cart-count]")).toHaveText("1");
  });
}

test("the brand footer links to Shop, the cart and every policy page on this origin", async ({ page, request }) => {
  await page.goto(`${site}/`);
  const footer = page.locator("#site-footer");
  await expect(footer.getByRole("link", { name: "Shop APGO" })).toHaveAttribute("href", "/products");
  await expect(footer.getByRole("link", { name: "Cart", exact: true })).toHaveAttribute("href", "/cart");
  const legal = footer.getByRole("navigation", { name: "Legal" }).getByRole("link");
  await expect(legal).toHaveText(["Privacy Policy", "Terms of Sale", "Returns & Refunds", "Shipping", "Contact"]);
  for (const href of ["/privacy", "/terms", "/returns", "/shipping", "/contact", "/products", "/cart", "/checkout"]) {
    expect((await request.get(`${site}${href}`)).status(), href).toBe(200);
  }
});

test("moved URLs answer 301 with the query string; the guides and unknown paths behave", async ({ request }) => {
  const moved = {
    "/us?utm_source=test": "/?utm_source=test",
    "/products/d204?fbclid=X": "/products/atomic-colored-glaze?fbclid=X",
    "/products/d215.html": "/products/atomic-glaze-coating",
    "/v3": "/",
    "/product.html": "/products",
    "/checkout.html?order=APGO-US-0123456789AB&paypal=return": "/checkout?order=APGO-US-0123456789AB&paypal=return",
    "/cart.html?add=d204": "/cart?add=d204",
  };
  for (const [from, to] of Object.entries(moved)) {
    const redirect = await request.get(`${site}${from}`, { maxRedirects: 0 });
    expect(redirect.status(), from).toBe(301);
    expect(new URL(redirect.headers().location, site).href, from).toBe(`${site}${to}`);
  }
  const guide = await request.get(`${site}/us/guides/what-is-car-glaze`);
  expect(guide.status()).toBe(200);
  const missing = await request.get(`${site}/no-such-page`);
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain("<html");
});

test("a test-site build loads no GA4, GTM or Meta Pixel", async ({ page }) => {
  const external = [];
  page.on("request", (request) => {
    const host = new URL(request.url()).hostname;
    if (/googletagmanager\.com|google-analytics\.com|connect\.facebook\.net|facebook\.com/.test(host)) external.push(request.url());
  });
  for (const path of ["/", "/us/guides", "/products", "/products/atomic-glaze-coating"]) await page.goto(`${site}${path}`);
  expect(external).toEqual([]);
});
