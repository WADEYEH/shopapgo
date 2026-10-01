import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const CART_KEY = "apgo_us_cart_v1";

async function openV3(page, path = "/v3.html") {
  await page.goto(path);
  await page.locator("html[data-apgo-v3-ready='true']").waitFor();
  await page.evaluate(() => document.fonts?.ready);
}

const storedCart = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), CART_KEY);
const events = (page, name) => page.evaluate((n) => window.dataLayer.filter((e) => e.event === n), name);

async function enableAmazon(page) {
  await page.evaluate(() => {
    window.APGO_CONFIG.products.d204.amazonUrl = "https://www.amazon.com/dp/B0D204TEST?tag=apgo-d204-20";
    window.APGO_CONFIG.products.d204.expectedAsin = "B0D204TEST";
    window.APGO_CONFIG.products.d204.linkReady = true;
    window.APGO_CONFIG.products.d215.amazonUrl = "https://www.amazon.com/dp/B0D215TEST?tag=apgo-d215-20";
    window.APGO_CONFIG.products.d215.expectedAsin = "B0D215TEST";
    window.APGO_CONFIG.products.d215.linkReady = true;
    window.dispatchEvent(new Event("apgo:config-updated"));
  });
}

test("header cart link starts with no badge and leads to the cart", async ({ page }) => {
  await openV3(page);
  const link = page.locator("[data-cart-link]");
  await expect(link).toHaveAttribute("href", "cart.html");
  await expect(link).toHaveAttribute("aria-label", "Cart, 0 items");
  await expect(link.locator("[data-cart-count]")).toBeHidden();
  await expect(page.locator(".v3-nav a")).toHaveText(["How It Works", "Choose", "Why APGO"]);
});

for (const sku of ["d204", "d215"]) {
  test(`${sku}: Add to cart stores the SKU, updates the badge and keeps Amazon as the secondary link`, async ({ page }) => {
    await openV3(page, `/v3.html#${sku}`);
    await enableAmazon(page);
    const panel = page.locator(`[data-product-panel="${sku}"]`);
    const add = panel.locator("[data-add-to-cart]");
    const amazon = panel.locator("[data-amazon-cta]");

    await expect(add).toHaveText(/Add to cart/);
    await expect(amazon).toContainText("Or shop on Amazon");
    await expect(amazon).toHaveAttribute("href", new RegExp(sku === "d204" ? "B0D204TEST" : "B0D215TEST"));
    await expect(amazon).toHaveClass(/button--secondary/);
    await expect(add).toHaveClass(/button--primary/);

    await add.click();
    await expect(panel.locator("[data-cart-status]")).toContainText("Added · 1 in cart");
    await expect(panel.locator("[data-cart-status] a")).toHaveAttribute("href", "cart.html");
    expect(await storedCart(page)).toEqual([{ sku, qty: 1 }]);
    await expect(page.locator("[data-cart-link] [data-cart-count]")).toHaveText("1");
    await expect(page.locator("[data-cart-link]")).toHaveAttribute("aria-label", "Cart, 1 item");

    await add.click();
    await expect(panel.locator("[data-cart-status]")).toContainText("Added · 2 in cart");
    await expect(page.locator("[data-cart-link] [data-cart-count]")).toHaveText("2");
    expect(await storedCart(page)).toEqual([{ sku, qty: 2 }]);

    const tracked = await events(page, "add_to_cart");
    expect(tracked.at(-1)).toMatchObject({ sku, quantity: 1, placement: "selected" });
    expect((await events(page, "amazon_referral_click")).length).toBe(0);
  });
}

test("both products share one cart and the badge counts units across SKUs", async ({ page }) => {
  await openV3(page, "/v3.html#d204");
  await page.locator('[data-product-panel="d204"] [data-add-to-cart]').click();
  await page.evaluate(() => { location.hash = "#d215"; });
  await expect(page.locator('[data-product-panel="d215"]')).toBeVisible();
  await page.locator('[data-product-panel="d215"] [data-add-to-cart]').click();
  expect(await storedCart(page)).toEqual([{ sku: "d204", qty: 1 }, { sku: "d215", qty: 1 }]);
  await expect(page.locator("[data-cart-link] [data-cart-count]")).toHaveText("2");
});

test("the final handoff also offers Add to cart first and Amazon second", async ({ page }) => {
  await openV3(page, "/v3.html#d215");
  await enableAmazon(page);
  const final = page.locator('[data-final-state="d215"]');
  await final.scrollIntoViewIfNeeded();
  const order = await final.locator("[data-add-to-cart], [data-amazon-cta]").evaluateAll((nodes) => nodes.map((n) => n.hasAttribute("data-add-to-cart") ? "cart" : "amazon"));
  expect(order).toEqual(["cart", "amazon"]);
  await final.locator("[data-add-to-cart]").click();
  await expect(final.locator("[data-cart-status]")).toContainText("Added · 1 in cart");
  expect(await storedCart(page)).toEqual([{ sku: "d215", qty: 1 }]);
  expect((await events(page, "add_to_cart")).at(-1)).toMatchObject({ placement: "final" });
});

test("a cart saved on an earlier visit shows its badge on load and across tabs", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify([{ sku: "d204", qty: 3 }])), CART_KEY);
  await openV3(page);
  await expect(page.locator("[data-cart-link] [data-cart-count]")).toHaveText("3");
  await page.evaluate((key) => {
    localStorage.setItem(key, JSON.stringify([{ sku: "d204", qty: 4 }]));
    window.dispatchEvent(new StorageEvent("storage", { key, newValue: "[]" }));
  }, CART_KEY);
  await expect(page.locator("[data-cart-link] [data-cart-count]")).toHaveText("4");
});

test("the header cart link opens cart.html with the added item", async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const { pathname } = new URL(route.request().url());
    const reply = (data) => route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
    if (pathname === "/api/cart/quote") {
      return reply({ currency: "USD", lines: [{ id: "d204", sku: "D204", name: "APGO Atomic Colored Glaze", routine: "dry", size: "300 mL", qty: 1, unitCents: 2990, lineCents: 2990 }], shippingMethod: "standard", subtotalCents: 2990, shippingCents: 0, taxCents: null, totalCents: 2990 });
    }
    return reply({ currency: "USD", shippingMethods: [{ id: "standard", label: "Standard", detail: "", amountCents: 0 }], defaultShippingMethod: "standard", states: [] });
  });
  await openV3(page, "/v3.html#d204");
  await page.locator('[data-product-panel="d204"] [data-add-to-cart]').click();
  await page.locator("[data-cart-link]").click();
  await expect(page).toHaveURL(/\/cart\.html$/);
  await expect(page.locator('[data-line="d204"]')).toContainText("DRY");
});

test("mobile sticky bar offers Add to cart beside Amazon and announces the add", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openV3(page);
  await enableAmazon(page);
  await page.locator('[data-selector-radio][value="d215"]').check({ force: true });
  await page.waitForTimeout(400);
  await page.locator("#why").scrollIntoViewIfNeeded();
  const sticky = page.locator("[data-mobile-sticky]");
  await expect.poll(() => sticky.getAttribute("data-visible")).toBe("true");

  const add = sticky.locator('[data-sticky-state="d215"] [data-add-to-cart]');
  await expect(add).toBeVisible();
  await expect(sticky.locator('[data-sticky-state="d215"] [data-amazon-cta]')).toHaveAttribute("href", /B0D215TEST/);
  const box = await add.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(36);
  await add.click();
  await expect(sticky.locator('[data-sticky-state="d215"] [data-cart-status]')).toContainText("added to cart. 1 in cart.");
  await expect(page.locator("[data-cart-link] [data-cart-count]")).toHaveText("1");
  expect((await events(page, "add_to_cart")).at(-1)).toMatchObject({ sku: "d215", placement: "sticky" });
});

for (const width of [320, 390, 1440]) {
  test(`v3 with the cart entry has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify([{ sku: "d204", qty: 10 }, { sku: "d215", qty: 10 }])), CART_KEY);
    await page.setViewportSize({ width, height: 900 });
    for (const hash of ["", "#d204", "#d215"]) {
      await openV3(page, `/v3.html${hash}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `#${hash} at ${width}px`).toBeLessThanOrEqual(1);
      const header = await page.locator("[data-cart-link]").boundingBox();
      expect(header.x + header.width).toBeLessThanOrEqual(width);
      expect(header.height).toBeGreaterThanOrEqual(44);
    }
  });
}

test("v3 with the cart entry has no serious or critical axe violations", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify([{ sku: "d204", qty: 1 }])), CART_KEY);
  for (const hash of ["#d204", "#d215"]) {
    await openV3(page, `/v3.html${hash}`);
    await page.locator(`[data-product-panel="${hash.slice(1)}"] [data-add-to-cart]`).click();
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));
    expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`), hash).toEqual([]);
  }
});

test("the landing copy still shows no price or cart totals", async ({ page }) => {
  await openV3(page, "/v3.html#d204");
  await page.locator('[data-product-panel="d204"] [data-add-to-cart]').click();
  expect(await page.locator("body").innerText()).not.toMatch(/\$\s?\d/);
});
