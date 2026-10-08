import { readFileSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { PRODUCT_SLUGS } from "../prototype/js/commerce/product-data.js";
import { mockStore, seedCart } from "./helpers/store-mock.mjs";

// The store's Next.js pages (D41): the /products overview and the two product pages (D204 DRY / D215 WET), inside the
// site's own header and footer. /api is answered by the real Worker modules (store-mock), so every price below comes from
// the same /api/store/config the live pages read. Runs against the built single site (npm run build:site).

const CART_KEY = "apgo_us_cart_v1";
const PRICES = { PRICING_JSON: JSON.stringify({ products: { d204: { priceCents: 5999 }, d215: { priceCents: 2999 } } }) };
const APPROVED = { AIRWALLEX_ENV: "prod", PRICING_APPROVED: "true" };
const SKUS = ["d204", "d215"];
const WORD = { d204: "DRY", d215: "WET" };
const NAME = { d204: "Atomic Colored Glaze", d215: "Atomic Glaze Coating" };
const SITE = "https://www.shopapgo.com";
const pathOf = (sku) => `/products/${PRODUCT_SLUGS[sku]}`;
// The desktop header (default 1280px viewport); the phone header has its own copy of the cart link.
const headerCart = (page) => page.locator(".us-header-desktop [data-cart-link]");

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

// Clicks something low on a product page with it in the middle of the screen: the sticky add-to-cart bar slides in
// over the bottom of the page and would otherwise be able to take the click.
async function press(locator) {
  await locator.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await locator.click();
}
const cartItems = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), CART_KEY);
const events = (page, name) => page.evaluate((n) => window.__events.filter((e) => e.event === n), name);
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const axe = async (page) => (await new AxeBuilder({ page }).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);

for (const sku of SKUS) {
  test.describe(`${sku} product page`, () => {
    test("loads with routine-first identity, SEO head, the site header and no script errors", async ({ page }) => {
      const errors = await open(page, pathOf(sku));
      await expect(page.locator("h1")).toHaveText(NAME[sku]);
      await expect(page.locator("[data-routine-word]")).toHaveText(WORD[sku]);
      await expect(page.locator("[data-sku-tag]")).toHaveText(sku.toUpperCase());
      await expect(page).toHaveTitle(`${WORD[sku]} · ${NAME[sku]} (${sku.toUpperCase()}) | APGO`);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE}${pathOf(sku)}`);
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `${SITE}/assets/products/${sku}-packshot.webp`);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
      await expect(page.locator("[data-gallery-main]")).toHaveAttribute("src", `/assets/products/${sku}-packshot.webp`);
      await expect(page.locator(".us-site-header")).toBeVisible();
      await expect(page.locator(".us-site-footer")).toBeVisible();
      const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
      expect(broken).toEqual([]);
      expect(errors).toEqual([]);
      expect(await events(page, "view_item")).toHaveLength(1);
    });

    test("prices come from /api/store/config and nowhere else", async ({ page }) => {
      await open(page, pathOf(sku));
      // The exported page's markup (its scripts carry React's "$1"-style references, not prices).
      const html = readFileSync(new URL(`../site${pathOf(sku)}.html`, import.meta.url), "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
      expect(html).toContain(NAME[sku]);
      expect(html).not.toMatch(/\$\d/);
      const own = sku === "d204" ? "$59.99" : "$29.99";
      await expect(page.locator("[data-price]")).toHaveText(own);
      await expect(page.locator("[data-sticky-price]")).toHaveText(own);
      await expect(page.locator("[data-compare-body] tr", { hasText: "Price" })).toContainText("$59.99");
      await expect(page.locator("[data-compare-body] tr", { hasText: "Price" })).toContainText("$29.99");
      await page.locator("[data-qty-inc]").click();
      await expect(page.locator("[data-price]")).toHaveText(sku === "d204" ? "$119.98" : "$59.98");
    });

    test("no price can be shown when the config is unavailable, but the cart still works", async ({ page }) => {
      await page.route("**/api/store/config", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
      await page.goto(pathOf(sku));
      await page.locator("html[data-pdp-ready='true']").waitFor();
      await expect(page.locator("[data-price]")).toHaveText("—");
      await expect(page.locator("[data-price-note]")).toContainText("Price unavailable");
      await page.locator("[data-buyrow] [data-pdp-add]").click();
      expect(await cartItems(page)).toEqual([{ sku, qty: 1 }]);
    });

    test("Add to cart stores the SKU and quantity, updates the site header's cart and reports value and items", async ({ page }) => {
      await open(page, pathOf(sku));
      await expect(headerCart(page).locator("[data-cart-count]")).toBeHidden();
      await page.locator("[data-qty-inc]").click();
      await page.locator("[data-qty-inc]").click();
      await expect(page.locator("[data-qty]")).toHaveText("3");
      await page.locator("[data-buyrow] [data-pdp-add]").click();

      expect(await cartItems(page)).toEqual([{ sku, qty: 3 }]);
      await expect(headerCart(page).locator("[data-cart-count]")).toHaveText("3");
      await expect(headerCart(page)).toHaveAttribute("aria-label", "Cart, 3 items");
      await expect(page.locator("[data-added]")).toContainText("Added to cart");
      await expect(page.locator("[data-added] a")).toHaveAttribute("href", "/cart");

      const [event] = await events(page, "add_to_cart");
      const unit = sku === "d204" ? 59.99 : 29.99;
      expect(event).toMatchObject({ sku, quantity: 3, placement: "pdp-buybox", currency: "USD", pair: false });
      expect(event.value).toBeCloseTo(unit * 3, 2);
      expect(event.items).toEqual([expect.objectContaining({ item_id: sku.toUpperCase(), quantity: 3, price: unit })]);

      // The same cart on the cart page, with a link back to this product.
      await page.goto("/cart.html");
      await expect(page.locator(`[data-line="${sku}"] .product-link`)).toHaveAttribute("href", `products/${PRODUCT_SLUGS[sku]}.html`);
    });

    test("pair upsell: ticking it adds the other routine too, with a price that is the sum of the config prices", async ({ page }) => {
      await open(page, pathOf(sku));
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
      const [pairEvent] = await events(page, "pdp_pair_added");
      expect(pairEvent.value).toBeCloseTo(sku === "d204" ? 59.99 * 2 + 29.99 : 29.99 * 2 + 59.99, 2);
    });

    test("page is usable at 390px: no horizontal overflow, axe clean", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await open(page, pathOf(sku));
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(await axe(page)).toEqual([]);
    });

    test("desktop 1440px: no overflow, axe clean, sticky gallery beside the buy box", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(page, pathOf(sku));
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(await axe(page)).toEqual([]);
      const gallery = await page.locator(".pdp-gallery").boundingBox();
      const buy = await page.locator(".pdp-buy").boundingBox();
      expect(gallery.x + gallery.width).toBeLessThanOrEqual(buy.x + 1);
      await expect(page.locator(".pdp-gallery")).toHaveCSS("position", "sticky");
    });
  });
}

test.describe("the other routine is its own page", () => {
  test("the DRY / WET switch links to the other product page, with its own copy, price, steps, head and JSON-LD", async ({ page }) => {
    await open(page, pathOf("d204"));
    await expect(page.locator(".pdp-switch a[aria-current='page']")).toHaveAttribute("href", pathOf("d204"));
    await expect(page.locator("[data-promise]")).toContainText("A separate finishing step after you dry");
    await expect(page.locator("[data-steps] li")).toHaveCount(3);

    await page.locator(`.pdp-switch a[href="${pathOf("d215")}"]`).click();
    await page.locator("html[data-pdp-ready='true']").waitFor();
    await expect(page.locator("h1")).toHaveText("Atomic Glaze Coating");
    expect(new URL(page.url()).pathname).toBe(pathOf("d215"));
    await expect(page.locator("[data-routine-word]")).toHaveText("WET");
    await expect(page.locator("[data-price]")).toHaveText("$29.99");
    await expect(page.locator("[data-steps] li")).toHaveCount(4);
    await expect(page.locator("[data-benefits]")).toContainText("Lasts up to 4 months");
    await expect(page).toHaveTitle(/WET · Atomic Glaze Coating/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE}${pathOf("d215")}`);
    await expect(page.locator("main")).toHaveAttribute("data-routine", "wet");
    expect(JSON.parse(await page.locator("#pdp-jsonld").textContent())).toMatchObject({ sku: "D215" });
    expect(await events(page, "view_item")).toHaveLength(1);
  });

  test("keyboard: Tab to the other routine and Enter opens it", async ({ page }) => {
    await open(page, pathOf("d204"));
    await page.locator(`.pdp-switch a[href="${pathOf("d215")}"]`).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("h1")).toHaveText("Atomic Glaze Coating");
  });

  test("the compare table, the quiz and 'Keep reading' link to it too", async ({ page }) => {
    await open(page, pathOf("d204"));
    await expect(page.locator("[data-more-other]")).toHaveAttribute("href", pathOf("d215"));
    await expect(page.locator("thead th.is-current")).toContainText("DRY");
    await press(page.locator('[data-compare-body] [data-switch-to="d215"]'));
    await expect(page.locator("h1")).toHaveText("Atomic Glaze Coating");
    await expect(page.locator("thead th.is-current")).toContainText("WET");
  });

  test("the .html form of the address works the same (a plain static server, links from the HTML store pages)", async ({ page }) => {
    const errors = await open(page, `${pathOf("d215")}.html`);
    await expect(page.locator("h1")).toHaveText("Atomic Glaze Coating");
    await expect(page.locator("[data-gallery-main]")).toHaveAttribute("src", "/assets/products/d215-packshot.webp");
    expect(await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length)).toBe(0);
    expect(errors).toEqual([]);
  });
});

test.describe("sticky add-to-cart bar", () => {
  test("hidden and unfocusable at the top, appears after the buy row scrolls away, adds to cart, never covers the footer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, pathOf("d204"));
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
    const last = await page.locator(".us-site-footer a").last().boundingBox();
    const barBox = await bar.boundingBox();
    expect(last.y + last.height).toBeLessThanOrEqual(barBox.y + 0.5);

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(bar).toHaveAttribute("data-visible", "false");
  });

  test("axe is clean with the bar showing", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, pathOf("d215"));
    await page.locator("#pdp-faq-title").scrollIntoViewIfNeeded();
    await expect(page.locator("[data-sticky]")).toHaveAttribute("data-visible", "true");
    expect(await axe(page)).toEqual([]);
  });
});

test.describe("reviews and before/after stay hidden until real", () => {
  test("no reviews: section and rating line are not on the page, nothing invented", async ({ page }) => {
    await open(page, pathOf("d204"));
    await expect(page.locator("[data-reviews]")).toHaveCount(0);
    await expect(page.locator("[data-rating]")).toHaveCount(0);
    expect(await page.locator("main").innerText()).not.toMatch(/★|verified buyer/i);
  });

  test("before/after: no real photo pair -> no section, approved or not (no placeholder slots)", async ({ page }) => {
    await open(page, pathOf("d204"));
    await expect(page.locator("[data-result]")).toHaveCount(0);
    const approved = await page.context().newPage();
    await open(approved, pathOf("d204"), { env: { ...PRICES, ...APPROVED } });
    await expect(approved.locator("[data-result]")).toHaveCount(0);
  });
});

test.describe("structured data", () => {
  test("no price in the JSON-LD while pricing is a placeholder", async ({ page }) => {
    await open(page, pathOf("d204"));
    const data = JSON.parse(await page.locator("#pdp-jsonld").textContent());
    expect(data).toMatchObject({ "@type": "Product", sku: "D204", brand: { name: "APGO" } });
    expect(data.offers).toBeUndefined();
    expect(data.image[0]).toBe(`${SITE}/assets/products/d204-packshot.webp`);
  });

  test("approved pricing: offers carry the config price", async ({ page }) => {
    await open(page, pathOf("d215"), { env: { ...PRICES, ...APPROVED } });
    await expect.poll(async () => JSON.parse(await page.locator("#pdp-jsonld").textContent()).offers).toMatchObject({
      "@type": "Offer", priceCurrency: "USD", price: "29.99", url: `${SITE}${pathOf("d215")}`,
    });
    await expect(page.locator("[data-price-note]")).toHaveCount(0);
  });

  test("approved store: no [TO CONFIRM] marker or unconfirmed shipping/returns promise anywhere on the page", async ({ page }) => {
    await open(page, pathOf("d204"), { env: { ...PRICES, ...APPROVED } });
    await expect(page.locator("mark[data-to-confirm]")).toHaveCount(0);
    await page.locator(".faq details").last().locator("summary").click();
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/TO CONFIRM|placeholder|pair price|free (us )?shipping|30[- ]day|30 days|full refund|pending/i);
  });
});

test.describe("fit quiz", () => {
  test("later questions unlock one at a time and recommend a routine", async ({ page }) => {
    await open(page, pathOf("d204"));
    const q = (i, value) => page.locator(`[data-quiz-q="${i}"] input[value="${value}"]`);
    await expect(q(1, "yes")).toBeDisabled();
    await q(0, "no").check({ force: true });
    await expect(q(1, "yes")).toBeEnabled();
    await expect(page.locator("[data-quiz-result]")).toHaveCount(0);
    await q(1, "yes").check({ force: true });
    await q(2, "no").check({ force: true });
    const result = page.locator("[data-quiz-result]");
    await expect(result).toBeVisible();
    await expect(result).toContainText("WET");
    await press(result.getByRole("link", { name: /Switch to Wet/ }));
    await expect(page.locator("h1")).toHaveText("Atomic Glaze Coating");
  });

  test("recommending the current product offers Add to cart", async ({ page }) => {
    await open(page, pathOf("d204"));
    for (const [i, value] of [[0, "yes"], [1, "no"], [2, "yes"]]) await page.locator(`[data-quiz-q="${i}"] input[value="${value}"]`).check({ force: true });
    await press(page.locator("[data-quiz-result] [data-pdp-add]"));
    expect(await cartItems(page)).toEqual([{ sku: "d204", qty: 1 }]);
    expect((await events(page, "add_to_cart"))[0].placement).toBe("pdp-quiz");
  });
});

test.describe("keyboard and touch targets", () => {
  test("every control in the buy box, header, FAQ, quiz and footer is at least 44px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, pathOf("d204"));
    const small = await page.evaluate(() => {
      // The logo is the brand header's own design (24px tall on phones, the WCAG AA minimum); every other control
      // follows the store's 44px rule.
      const selectors = [
        ".us-site-header a:not(.us-site-logo)", ".us-site-header button", ".breadcrumb a", ".pdp-switch__opt", ".pdp-pair", ".qty button", ".pdp-add",
        ".pdp-thumb", ".quiz__opt", ".faq summary", ".pdp-video__play", ".pdp-compare .btn", ".pdp-more__card",
        ".us-site-footer a:not(.us-site-logo)",
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
    await open(page, pathOf("d204"));
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
    await open(page, pathOf("d215"));
    await page.keyboard.press("Tab");
    await expect(page.locator(".us-skip")).toBeFocused();
    await expect(page.locator(".us-skip")).toHaveAttribute("href", "#main");
    await expect(page.locator("main#main")).toHaveCount(1);
    await page.locator(".faq summary").first().focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".faq details").first()).toHaveAttribute("open", "");
    await page.locator('[data-thumb="1"]').click();
    await expect(page.locator("[data-gallery-main]")).toHaveAttribute("src", "/assets/application/d215-step-1.webp");
    await expect(page.locator('[data-thumb="1"]')).toHaveAttribute("aria-pressed", "true");
  });

  test("the video loads only after a click and has captions", async ({ page }) => {
    await open(page, pathOf("d204"));
    await expect(page.locator("video")).toHaveCount(0);
    await page.locator("[data-video-play]").click();
    await expect(page.locator("video[data-video-player]")).toHaveAttribute("src", "/assets/video/d204-application.mp4");
    await expect(page.locator("video track[kind='captions']")).toHaveAttribute("src", "/assets/video/d204-v3-captions-en.vtt");
    expect(await events(page, "video_play")).toEqual([expect.objectContaining({ sku: "d204", placement: "pdp" })]);
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
    await page.goto("/products");
    await page.locator("html[data-shop-ready='true']").waitFor();
    return errors;
  }

  test("lists both products with the store's prices, in the site's header and footer, and passes axe", async ({ page }) => {
    const errors = await openShop(page);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page).toHaveTitle("Shop APGO Atomic Glaze · DRY and WET | APGO");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE}/products`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    await expect(page.locator(".us-site-header")).toBeVisible();
    await expect(page.locator('[data-price-sku="d204"]')).toHaveText("$59.99");
    await expect(page.locator('[data-price-sku="d215"]')).toHaveText("$29.99");
    for (const sku of SKUS) {
      const card = page.locator(`[data-shop-card="${sku}"]`);
      await expect(card).toBeVisible();
      await expect(card.locator(".routine")).toHaveText(WORD[sku]);
      await expect(card.locator("h2")).toHaveText(NAME[sku]);
      await expect(card.locator("h2 a")).toHaveAttribute("href", pathOf(sku));
    }
    expect(await axe(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("Add to cart adds one, updates the site header's count and confirms next to the button", async ({ page }) => {
    await openShop(page);
    await page.locator('[data-add-to-cart="d215"]').click();
    await page.locator('[data-add-to-cart="d215"]').click();
    await page.locator('[data-add-to-cart="d204"]').click();
    expect(await cartItems(page)).toEqual([{ sku: "d215", qty: 2 }, { sku: "d204", qty: 1 }]);
    await expect(headerCart(page).locator("[data-cart-count]")).toHaveText("3");
    await expect(headerCart(page)).toHaveAttribute("aria-label", "Cart, 3 items");
    await expect(page.locator('[data-shop-added="d215"]')).toContainText("Added · 2 in cart");
    const adds = await events(page, "add_to_cart");
    expect(adds.map((e) => [e.sku, e.placement])).toEqual([["d215", "shop"], ["d215", "shop"], ["d204", "shop"]]);
    await page.locator('[data-shop-added="d215"] a').click();
    await expect(page).toHaveURL(/\/cart(\.html)?$/);
  });

  test("a product the store no longer sells is hidden; prices that fail to load read a dash", async ({ page }) => {
    await openShop(page, { config: { currency: "USD", products: { d204: { sku: "D204", priceCents: 5999 } } } });
    await expect(page.locator('[data-shop-card="d204"]')).toBeVisible();
    await expect(page.locator('[data-shop-card="d215"]')).toHaveCount(0);

    const down = await page.context().newPage();
    await mockStore(down);
    await down.route("**/api/store/config", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
    await down.goto("/products");
    await down.locator("html[data-shop-ready='true']").waitFor();
    await expect(down.locator('[data-price-sku="d204"]')).toHaveText("—");
    await expect(down.locator('[data-shop-card="d215"]')).toBeVisible();
  });

  test("phones: one column, no sideways scroll, the site header keeps Shop and the cart", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 780 });
    await openShop(page);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await expect(page.locator(".us-header-mobile [data-cart-link]")).toBeVisible();
    await expect(page.locator('.us-header-mobile a[href="/products"]')).toBeVisible();
    const [first, second] = await Promise.all(SKUS.map((sku) => page.locator(`[data-shop-card="${sku}"]`).boundingBox()));
    expect(second.y).toBeGreaterThan(first.y + first.height - 1);
  });

  test("product pages lead back to it from the breadcrumb and the site header", async ({ page }) => {
    await open(page, pathOf("d204"));
    await expect(page.locator(".breadcrumb a")).toHaveAttribute("href", "/products");
    await expect(page.locator(".breadcrumb a")).toHaveText("Shop");
    await page.locator('.us-header-desktop a[href="/products"]').click();
    await page.locator("html[data-shop-ready='true']").waitFor();
    await expect(page.locator("h1")).toHaveText("Same finish. Pick your moment.");
  });
});
