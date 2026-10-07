import { readFileSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { PRODUCT_SLUGS } from "../prototype/js/commerce/product-data.js";
import { mockStore, seedCart } from "./helpers/store-mock.mjs";

// Product pages (D204 DRY / D215 WET). /api is answered by the real Worker modules (store-mock),
// so every price below comes from the same /api/store/config the live pages read.

const CART_KEY = "apgo_us_cart_v1";
const PRICES = { PRICING_JSON: JSON.stringify({ products: { d204: { priceCents: 5999 }, d215: { priceCents: 2999 } } }) };
const APPROVED = { AIRWALLEX_ENV: "prod", PRICING_APPROVED: "true" };
const SKUS = ["d204", "d215"];
const WORD = { d204: "DRY", d215: "WET" };
const NAME = { d204: "Atomic Colored Glaze", d215: "Atomic Glaze Coating" };

async function open(page, path, { env = PRICES } = {}) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource|fonts\.g/.test(message.text())) errors.push(message.text());
  });
  await page.addInitScript(() => {
    window.__events = [];
    window.addEventListener("apgo:analytics", (event) => window.__events.push(event.detail));
  });
  await mockStore(page, { env });
  await page.goto(path);
  await page.locator("html[data-pdp-ready='true']").waitFor();
  return errors;
}

const cartItems = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), CART_KEY);
const events = (page, name) => page.evaluate((n) => window.__events.filter((e) => e.event === n), name);
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const sku of SKUS) {
  test.describe(`${sku} product page`, () => {
    test("loads with routine-first identity, SEO head and no script errors", async ({ page }) => {
      const errors = await open(page, `/products/${PRODUCT_SLUGS[sku]}.html`);
      await expect(page.locator("h1")).toHaveText(NAME[sku]);
      await expect(page.locator("[data-routine-word]")).toHaveText(WORD[sku]);
      await expect(page.locator("[data-sku-tag]")).toHaveText(sku.toUpperCase());
      await expect(page).toHaveTitle(new RegExp(`${WORD[sku]} · ${NAME[sku]}`));
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`^http://127\\.0\\.0\\.1:\\d+/products/${PRODUCT_SLUGS[sku]}$`));
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`/assets/products/${sku}-packshot\\.webp$`));
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
      await expect(page.locator("[data-gallery-main]")).toHaveAttribute("src", `/assets/products/${sku}-packshot.webp`);
      // All images load.
      const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
      expect(broken).toEqual([]);
      expect(errors).toEqual([]);
      expect(await events(page, "view_item")).toHaveLength(1);
    });

    test("prices come from /api/store/config and nowhere else", async ({ page }) => {
      await open(page, `/products/${PRODUCT_SLUGS[sku]}.html`);
      const html = readFileSync(new URL(`../prototype/products/${PRODUCT_SLUGS[sku]}.html`, import.meta.url), "utf8");
      expect(html).not.toMatch(/\$\d/);
      const own = sku === "d204" ? "$59.99" : "$29.99";
      await expect(page.locator("[data-price]")).toHaveText(own);
      await expect(page.locator("[data-sticky-price]")).toHaveText(own);
      await expect(page.locator("[data-compare-body] tr", { hasText: "Price" })).toContainText("$59.99");
      await expect(page.locator("[data-compare-body] tr", { hasText: "Price" })).toContainText("$29.99");
      // Quantity multiplies the config price.
      await page.locator("[data-qty-inc]").click();
      await expect(page.locator("[data-price]")).toHaveText(sku === "d204" ? "$119.98" : "$59.98");
    });

    test("no price can be shown when the config is unavailable, but the cart still works", async ({ page }) => {
      await page.route("**/api/store/config", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
      await page.addInitScript(() => {
        window.__events = [];
        window.addEventListener("apgo:analytics", (event) => window.__events.push(event.detail));
      });
      await page.goto(`/products/${PRODUCT_SLUGS[sku]}.html`);
      await page.locator("html[data-pdp-ready='true']").waitFor();
      await expect(page.locator("[data-price]")).toHaveText("—");
      await expect(page.locator("[data-price-note]")).toContainText("Price unavailable");
      await page.locator("[data-buyrow] [data-pdp-add]").click();
      expect(await cartItems(page)).toEqual([{ sku, qty: 1 }]);
    });

    test("Add to cart stores the SKU and quantity, updates the badge and reports value and items", async ({ page }) => {
      await open(page, `/products/${PRODUCT_SLUGS[sku]}.html`);
      await page.locator("[data-qty-inc]").click();
      await page.locator("[data-qty-inc]").click();
      await expect(page.locator("[data-qty]")).toHaveText("3");
      await page.locator("[data-buyrow] [data-pdp-add]").click();

      expect(await cartItems(page)).toEqual([{ sku, qty: 3 }]);
      await expect(page.locator("[data-cart-link] [data-cart-count]")).toHaveText("3");
      await expect(page.locator("[data-cart-link]")).toHaveAttribute("aria-label", "Cart, 3 items");
      await expect(page.locator("[data-added]")).toContainText("Added to cart");
      await expect(page.locator("[data-added] a")).toHaveAttribute("href", "/cart.html");

      const [event] = await events(page, "add_to_cart");
      const unit = sku === "d204" ? 59.99 : 29.99;
      expect(event).toMatchObject({ sku, quantity: 3, placement: "pdp-buybox", currency: "USD", pair: false });
      expect(event.value).toBeCloseTo(unit * 3, 2);
      expect(event.items).toEqual([expect.objectContaining({ item_id: sku.toUpperCase(), quantity: 3, price: unit })]);

      // The same cart renders on the cart page with a link back to this product.
      await page.goto("/cart.html");
      await expect(page.locator(`[data-line="${sku}"] .product-link`)).toHaveAttribute("href", `products/${PRODUCT_SLUGS[sku]}.html`);
    });

    test("pair upsell: ticking it adds the other routine too, with a price that is the sum of the config prices", async ({ page }) => {
      await open(page, `/products/${PRODUCT_SLUGS[sku]}.html`);
      const other = sku === "d204" ? "d215" : "d204";
      await expect(page.locator(".pdp-pair")).toContainText(`Add ${WORD[other][0] + WORD[other].slice(1).toLowerCase()} too`);
      await expect(page.locator(".pdp-pair")).toContainText("Both routines in one order");
      await expect(page.locator(".pdp-pair")).not.toContainText(/pair price|TO CONFIRM|save|discount/i);
      await page.locator("[data-pair]").check({ force: true });
      await expect(page.locator("[data-price]")).toHaveText("$89.98");
      await expect(page.locator("[data-size]")).toHaveText("Dry + Wet");
      await page.locator("[data-qty-inc]").click();
      await page.locator("[data-buyrow] [data-pdp-add]").click();

      const items = await cartItems(page);
      expect(items).toContainEqual({ sku, qty: 2 });
      expect(items).toContainEqual({ sku: other, qty: 1 });
      expect((await events(page, "add_to_cart")).map((e) => [e.sku, e.quantity, e.pair])).toEqual([[sku, 2, true], [other, 1, true]]);
      await expect(page.locator("[data-added]")).toContainText("+");
    });

    test("page is usable at 390px: no horizontal overflow, axe clean", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, `/products/${PRODUCT_SLUGS[sku]}.html`);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    });

    test("desktop 1440px: no overflow, axe clean, sticky gallery beside the buy box", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, `/products/${PRODUCT_SLUGS[sku]}.html`);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
      const gallery = await page.locator(".pdp-gallery").boundingBox();
      const buy = await page.locator(".pdp-buy").boundingBox();
      expect(gallery.x + gallery.width).toBeLessThanOrEqual(buy.x + 1);
      await expect(page.locator(".pdp-gallery")).toHaveCSS("position", "sticky");
    });
  });
}

test.describe("routine switch", () => {
  test("DRY -> WET swaps copy, price, steps, head and URL in place and back", async ({ page }) => {
    await open(page, "/products/atomic-colored-glaze.html");
    await expect(page.locator("[data-promise]")).toContainText("A separate finishing step after you dry");
    await expect(page.locator("[data-steps] li")).toHaveCount(3);

    await page.getByLabel("WET While wet", { exact: false }).check({ force: true });
    await expect(page.locator("h1")).toHaveText("Atomic Glaze Coating");
    await expect(page.locator("[data-routine-word]")).toHaveText("WET");
    await expect(page.locator("[data-price]")).toHaveText("$29.99");
    await expect(page.locator("[data-steps] li")).toHaveCount(4);
    await expect(page.locator("[data-benefits]")).toContainText("Lasts up to 4 months");
    await expect(page).toHaveTitle(/WET · Atomic Glaze Coating/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/products\/atomic-glaze-coating$/);
    await expect(page.locator("main")).toHaveAttribute("data-routine", "wet");
    expect(new URL(page.url()).pathname).toBe("/products/atomic-glaze-coating.html");
    expect(JSON.parse(await page.locator("#pdp-jsonld").textContent())).toMatchObject({ sku: "D215" });

    await page.getByLabel("DRY After drying", { exact: false }).check({ force: true });
    await expect(page.locator("h1")).toHaveText("Atomic Colored Glaze");
    expect(new URL(page.url()).pathname).toBe("/products/atomic-colored-glaze.html");
    expect(await events(page, "view_item")).toHaveLength(3);
  });

  test("keyboard: arrow keys move the radio selection and the page follows", async ({ page }) => {
    await open(page, "/products/atomic-colored-glaze.html");
    await page.locator('input[name="routine"][value="d204"]').focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("h1")).toHaveText("Atomic Glaze Coating");
  });

  test("the compare table and the quiz switch routine too", async ({ page }) => {
    await open(page, "/products/atomic-colored-glaze.html");
    await page.locator('[data-compare-body] [data-switch-to="d215"]').click();
    await expect(page.locator("h1")).toHaveText("Atomic Glaze Coating");
    await expect(page.locator("thead th.is-current")).toContainText("WET");
  });

  test("the 'Keep reading' card links to the other product page", async ({ page }) => {
    await open(page, "/products/atomic-colored-glaze.html");
    await expect(page.locator("[data-more-other]")).toHaveAttribute("href", "/products/atomic-glaze-coating.html");
    await page.locator("[data-more-other]").click();
    await expect(page.locator("h1")).toHaveText("Atomic Glaze Coating");
  });
});

test.describe("addresses", () => {
  test("/product.html: ?sku=D215, #wet, #dry and the default pick the right product", async ({ page }) => {
    await open(page, "/product.html?sku=D215");
    await expect(page.locator("h1")).toHaveText("Atomic Glaze Coating");
    await page.goto("/product.html#wet");
    await expect(page.locator("h1")).toHaveText("Atomic Glaze Coating");
    await page.goto("/product.html#dry");
    await expect(page.locator("h1")).toHaveText("Atomic Colored Glaze");
    await page.goto("/product.html");
    await expect(page.locator("h1")).toHaveText("Atomic Colored Glaze");
    await page.locator('input[name="routine"][value="d215"]').check({ force: true });
    expect(page.url()).toMatch(/\/product\.html#wet$/);
    await page.goBack().catch(() => {});
  });

  test("the clean /products/atomic-glaze-coating URL (Cloudflare drops .html) works with root-absolute assets", async ({ page }) => {
    const html = readFileSync(new URL("../prototype/products/atomic-glaze-coating.html", import.meta.url), "utf8");
    await page.route("**/products/atomic-glaze-coating", (route) => route.fulfill({ status: 200, contentType: "text/html", body: html }));
    const errors = await open(page, "/products/atomic-glaze-coating");
    await expect(page.locator("h1")).toHaveText("Atomic Glaze Coating");
    await expect(page.locator("[data-gallery-main]")).toHaveAttribute("src", "/assets/products/d215-packshot.webp");
    expect(await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length)).toBe(0);
    expect(errors).toEqual([]);
  });
});

test.describe("sticky add-to-cart bar", () => {
  test("hidden and unfocusable at the top, appears after the buy row scrolls away, adds to cart, never covers the footer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "/products/atomic-colored-glaze.html");
    const bar = page.locator("[data-sticky]");
    await expect(bar).toHaveAttribute("data-visible", "false");
    await expect(bar).toBeHidden();
    await expect(bar).toHaveAttribute("aria-hidden", "true");

    await page.locator("#pdp-compare-title").scrollIntoViewIfNeeded();
    await expect(bar).toHaveAttribute("data-visible", "true");
    await expect(bar).toBeVisible();
    await expect(bar).not.toHaveAttribute("inert", "");
    await expect(bar.locator("[data-sticky-price]")).toHaveText("$59.99");

    await bar.locator("[data-pdp-add]").click();
    expect(await cartItems(page)).toEqual([{ sku: "d204", qty: 1 }]);
    expect((await events(page, "add_to_cart"))[0]).toMatchObject({ placement: "pdp-sticky", sku: "d204" });

    // Bottom of the page: the last footer link is not under the bar.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(bar).toHaveAttribute("data-visible", "true");
    const last = await page.locator(".shop-footer__links a").last().boundingBox();
    const barBox = await bar.boundingBox();
    expect(last.y + last.height).toBeLessThanOrEqual(barBox.y + 0.5);

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(bar).toHaveAttribute("data-visible", "false");
  });

  test("axe is clean with the bar showing", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "/products/atomic-glaze-coating.html");
    await page.locator("#pdp-faq-title").scrollIntoViewIfNeeded();
    await expect(page.locator("[data-sticky]")).toHaveAttribute("data-visible", "true");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("reviews and before/after follow the hide/slot rules", () => {
  const reviewModule = (reviews) => `export const MIN_VERIFIED_REVIEWS = 3; export const REVIEWS = ${JSON.stringify(reviews)}; export const BEFORE_AFTER = { d204: null, d215: null };`;
  const review = (n, verified = true) => ({ rating: 5, author: `Driver ${n}`, model: "Test car", quote: `Real quote ${n}`, verified });

  test("no reviews: section and rating line stay hidden, nothing invented", async ({ page }) => {
    await open(page, "/products/atomic-colored-glaze.html");
    await expect(page.locator("[data-reviews]")).toBeHidden();
    await expect(page.locator("[data-rating]")).toBeHidden();
    expect(await page.locator("body").innerText()).not.toMatch(/★|verified buyer/i);
  });

  test("two verified reviews, or three unverified ones: still hidden", async ({ page }) => {
    await page.route("**/js/commerce/product-reviews.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: reviewModule({ d204: [review(1), review(2), review(3, false)], d215: [] }) }));
    await open(page, "/products/atomic-colored-glaze.html");
    await expect(page.locator("[data-reviews]")).toBeHidden();
    await expect(page.locator("[data-rating]")).toBeHidden();
  });

  test("three verified reviews show the section and an average rating", async ({ page }) => {
    await page.route("**/js/commerce/product-reviews.js", (route) =>
      route.fulfill({ contentType: "application/javascript", body: reviewModule({ d204: [review(1), review(2), review(3)], d215: [] }) }));
    await open(page, "/products/atomic-colored-glaze.html");
    await expect(page.locator("[data-reviews]")).toBeVisible();
    await expect(page.locator(".pdp-review")).toHaveCount(3);
    await expect(page.locator("[data-rating]")).toHaveText("★ 5.0 · 3 verified reviews");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    // The other product has none.
    await page.locator('input[name="routine"][value="d215"]').check({ force: true });
    await expect(page.locator("[data-reviews]")).toBeHidden();
  });

  test("before/after: no real photo pair -> the section stays hidden, approved or not (no placeholder slots)", async ({ page }) => {
    await open(page, "/products/atomic-colored-glaze.html");
    await expect(page.locator("[data-result]")).toBeHidden();
    await expect(page.locator("[data-slot]")).toHaveCount(0);

    const approved = await page.context().newPage();
    await open(approved, "/products/atomic-colored-glaze.html", { env: { ...PRICES, ...APPROVED } });
    await expect(approved.locator("[data-result]")).toBeHidden();
  });
});

test.describe("structured data", () => {
  test("no price in the JSON-LD while pricing is a placeholder", async ({ page }) => {
    await open(page, "/products/atomic-colored-glaze.html");
    const data = JSON.parse(await page.locator("#pdp-jsonld").textContent());
    expect(data).toMatchObject({ "@type": "Product", sku: "D204", brand: { name: "APGO" } });
    expect(data.offers).toBeUndefined();
    expect(data.image[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/assets\/products\/d204-packshot\.webp$/);
  });

  test("approved pricing: offers carry the config price", async ({ page }) => {
    await open(page, "/products/atomic-glaze-coating.html", { env: { ...PRICES, ...APPROVED } });
    const data = JSON.parse(await page.locator("#pdp-jsonld").textContent());
    expect(data.offers).toMatchObject({ "@type": "Offer", priceCurrency: "USD", price: "29.99" });
    await expect(page.locator("[data-price-note]")).toBeHidden();
  });

  test("no price placeholder note, approved or not", async ({ page }) => {
    await open(page, "/products/atomic-glaze-coating.html");
    await expect(page.locator("[data-price-note]")).toBeHidden();
    await expect(page.locator("body")).not.toContainText(/placeholder|TO CONFIRM/i);
  });

  test("approved store: no [TO CONFIRM] marker or unconfirmed shipping/returns promise anywhere on the page", async ({ page }) => {
    await open(page, "/products/atomic-colored-glaze.html", { env: { ...PRICES, ...APPROVED } });
    await expect(page.locator("mark[data-to-confirm]")).toHaveCount(0);
    await page.locator(".faq details").last().locator("summary").click();
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/TO CONFIRM|placeholder|pair price|free (us )?shipping|30[- ]day|30 days|full refund|pending/i);
  });
});

test.describe("fit quiz", () => {
  test("later questions unlock one at a time and recommend a routine", async ({ page }) => {
    await open(page, "/products/atomic-colored-glaze.html");
    const q = (i, value) => page.locator(`[data-quiz-q="${i}"] input[value="${value}"]`);
    await expect(q(1, "yes")).toBeDisabled();
    await q(0, "no").check({ force: true });
    await expect(q(1, "yes")).toBeEnabled();
    await expect(page.locator("[data-quiz-result]")).toBeHidden();
    await q(1, "yes").check({ force: true });
    await q(2, "no").check({ force: true });
    const result = page.locator("[data-quiz-result]");
    await expect(result).toBeVisible();
    await expect(result).toContainText("WET");
    await result.getByRole("button", { name: /Switch to Wet/ }).click();
    await expect(page.locator("h1")).toHaveText("Atomic Glaze Coating");
  });

  test("recommending the current product offers Add to cart", async ({ page }) => {
    await open(page, "/products/atomic-colored-glaze.html");
    for (const [i, value] of [[0, "yes"], [1, "no"], [2, "yes"]]) await page.locator(`[data-quiz-q="${i}"] input[value="${value}"]`).check({ force: true });
    await page.locator("[data-quiz-result] [data-pdp-add]").click();
    expect(await cartItems(page)).toEqual([{ sku: "d204", qty: 1 }]);
    expect((await events(page, "add_to_cart"))[0].placement).toBe("pdp-quiz");
  });
});

test.describe("keyboard and touch targets", () => {
  test("every control in the buy box, header, FAQ, quiz and footer is at least 44px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "/products/atomic-colored-glaze.html");
    const small = await page.evaluate(() => {
      const selectors = [
        ".shop-header a", ".breadcrumb a", ".pdp-switch__opt", ".pdp-pair", ".qty button", ".pdp-add", ".pdp-thumb",
        ".quiz__opt", ".faq summary", ".pdp-video__play", ".pdp-compare button",
        ".pdp-more__card", ".shop-footer__links a",
      ];
      const found = [];
      for (const selector of selectors) {
        for (const node of document.querySelectorAll(selector)) {
          const rect = node.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          if (rect.height < 43.5 || rect.width < 43.5) found.push(`${selector} ${Math.round(rect.width)}x${Math.round(rect.height)}`);
        }
      }
      return found;
    });
    expect(small).toEqual([]);
  });

  test("keyboard only: Tab reaches the controls, Enter on Add to cart adds, +/- work", async ({ page }) => {
    await open(page, "/products/atomic-colored-glaze.html");
    await page.locator("[data-qty-inc]").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-qty]")).toHaveText("2");
    await page.keyboard.press("Tab");
    await expect(page.locator("[data-buyrow] [data-pdp-add]")).toBeFocused();
    await page.keyboard.press("Enter");
    expect(await cartItems(page)).toEqual([{ sku: "d204", qty: 2 }]);
    const outline = await page.locator("[data-buyrow] [data-pdp-add]").evaluate((node) => getComputedStyle(node).outlineStyle);
    expect(outline).not.toBe("none");
  });

  test("skip link reaches main; FAQ opens with the keyboard; gallery thumbs swap the image", async ({ page }) => {
    await open(page, "/products/atomic-glaze-coating.html");
    await page.keyboard.press("Tab");
    await expect(page.locator(".skip-link")).toBeFocused();
    await page.locator(".faq summary").first().focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".faq details").first()).toHaveAttribute("open", "");
    await page.locator('[data-thumb="1"]').click();
    await expect(page.locator("[data-gallery-main]")).toHaveAttribute("src", "/assets/application/d215-step-1.webp");
    await expect(page.locator('[data-thumb="1"]')).toHaveAttribute("aria-pressed", "true");
  });

  test("the video loads only after a click and has captions", async ({ page }) => {
    await open(page, "/products/atomic-colored-glaze.html");
    await expect(page.locator("video")).toHaveCount(0);
    await page.locator("[data-video-play]").click();
    await expect(page.locator("video[data-video-player]")).toHaveAttribute("src", "/assets/video/d204-application.mp4");
    await expect(page.locator("video track[kind='captions']")).toHaveAttribute("src", "/assets/video/d204-v3-captions-en.vtt");
  });
});

test.describe("entry points", () => {
  test("v3 landing: header link and each product's detail link lead to the product pages", async ({ page }) => {
    await page.goto("/v3.html#d215");
    await page.locator("html[data-apgo-v3-ready='true']").waitFor();
    const link = page.locator('[data-product-panel="d215"] [data-product-link="d215"]');
    await expect(link).toHaveAttribute("href", "products/atomic-glaze-coating.html");
    await expect(page.locator('.v3-nav a[href="products.html"]')).toHaveText("Shop");
    await mockStore(page);
    await link.click();
    await expect(page.locator("h1")).toHaveText("Atomic Glaze Coating");
  });

  test("checkout summary names link to the product page in a new tab", async ({ page }) => {
    await mockStore(page);
    await seedCart(page, [{ sku: "d204", qty: 1 }, { sku: "d215", qty: 2 }]);
    await page.goto("/checkout.html");
    const links = page.locator("[data-summary-lines] .product-link");
    await expect(links).toHaveCount(2);
    await expect(links.first()).toHaveAttribute("href", "products/atomic-colored-glaze.html");
    await expect(links.first()).toHaveAttribute("target", "_blank");
    await expect(links.first()).toHaveAttribute("rel", "noopener");
  });
});

test.describe("/products overview", () => {
  async function openShop(page, { env = PRICES, config } = {}) {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.__events = [];
      window.addEventListener("apgo:analytics", (event) => window.__events.push(event.detail));
    });
    await mockStore(page, { env });
    if (config) await page.route("**/api/store/config", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(config) }));
    await page.goto("/products.html");
    await page.locator("html[data-shop-ready='true']").waitFor();
    return errors;
  }

  test("lists both products with the store's prices and passes axe", async ({ page }) => {
    const errors = await openShop(page);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator('[data-nav-shop][aria-current="page"]')).toHaveText("Shop");
    await expect(page.locator('[data-price-sku="d204"]')).toHaveText("$59.99");
    await expect(page.locator('[data-price-sku="d215"]')).toHaveText("$29.99");
    for (const sku of SKUS) {
      const card = page.locator(`[data-shop-card="${sku}"]`);
      await expect(card).toBeVisible();
      await expect(card.locator(".routine")).toHaveText(WORD[sku]);
      await expect(card.locator("h2")).toHaveText(NAME[sku]);
    }
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("Add to cart adds one, updates the header count and confirms next to the button", async ({ page }) => {
    await openShop(page);
    await page.locator('[data-add-to-cart="d215"]').click();
    await page.locator('[data-add-to-cart="d215"]').click();
    await page.locator('[data-add-to-cart="d204"]').click();
    expect(await cartItems(page)).toEqual([{ sku: "d215", qty: 2 }, { sku: "d204", qty: 1 }]);
    await expect(page.locator("header [data-cart-count]")).toHaveText("3");
    await expect(page.locator("header [data-cart-link]")).toHaveAttribute("aria-label", "Cart, 3 items");
    await expect(page.locator('[data-shop-added="d215"]')).toContainText("Added · 2 in cart");
    const adds = await events(page, "add_to_cart");
    expect(adds.map((e) => [e.sku, e.placement])).toEqual([["d215", "shop"], ["d215", "shop"], ["d204", "shop"]]);
    await page.locator('[data-shop-added="d215"] a').click();
    await expect(page).toHaveURL(/\/cart(\.html)?$/);
  });

  test("a product the store no longer sells is hidden; prices that fail to load read a dash", async ({ page }) => {
    await openShop(page, { config: { currency: "USD", products: { d204: { sku: "D204", priceCents: 5999 } } } });
    await expect(page.locator('[data-shop-card="d204"]')).toBeVisible();
    await expect(page.locator('[data-shop-card="d215"]')).toBeHidden();

    const down = await page.context().newPage();
    await mockStore(down);
    await down.route("**/api/store/config", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
    await down.goto("/products.html");
    await down.locator("html[data-shop-ready='true']").waitFor();
    await expect(down.locator('[data-price-sku="d204"]')).toHaveText("—");
    await expect(down.locator('[data-shop-card="d215"]')).toBeVisible();
  });

  test("phones: one column, no sideways scroll; the header keeps the cart, and Shop on the product pages", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 780 });
    await openShop(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await expect(page.locator("header [data-cart-link]")).toBeVisible();
    await expect(page.locator("[data-nav-shop]")).toBeHidden(); // the page you are on gives way
    const [first, second] = await Promise.all(SKUS.map((sku) => page.locator(`[data-shop-card="${sku}"]`).boundingBox()));
    expect(second.y).toBeGreaterThan(first.y + first.height - 1);

    await page.goto("/products/atomic-colored-glaze.html");
    await page.locator("html[data-pdp-ready='true']").waitFor();
    await expect(page.locator("[data-nav-shop]")).toBeVisible();
    await expect(page.locator('[data-nav-sku="d204"]')).toBeHidden();
    await expect(page.locator("header [data-cart-link]")).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test("product pages lead back to it from the header and the breadcrumb", async ({ page }) => {
    await open(page, "/products/atomic-colored-glaze.html");
    await expect(page.locator(".breadcrumb a")).toHaveAttribute("href", "/products.html");
    await expect(page.locator(".breadcrumb a")).toHaveText("Shop");
    await page.locator("[data-nav-shop]").click();
    await page.locator("html[data-shop-ready='true']").waitFor();
    await expect(page.locator("h1")).toHaveText("Same finish. Pick your moment.");
  });
});
