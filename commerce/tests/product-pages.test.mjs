import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PRODUCT_SLUGS, PRODUCTS, QUIZ, SEO, SHOP_PATH, SKUS, productPath } from "../prototype/js/commerce/product-data.js";
import { BEFORE_AFTER, MIN_VERIFIED_REVIEWS, REVIEWS } from "../prototype/js/commerce/product-reviews.js";

// The store's Next.js pages (D41): the /products overview and the two product pages, in app/(us)/(shop) with their
// components in components/shop and the shared store code in lib/shop. What they do in a browser is in
// product-pages.spec.mjs; the cart and the review rules have unit tests in the site's tests/us-store.test.cjs.

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const site = join(repo, "..");
const read = (path) => readFileSync(join(site, path), "utf8");
const proto = (path) => join(repo, "prototype", path);
const readProto = (path) => readFileSync(proto(path), "utf8");

const LAYOUT = "app/(us)/(shop)/layout.js";
const OVERVIEW = "app/(us)/(shop)/products/page.js";
const PRODUCT = "app/(us)/(shop)/products/[slug]/page.js";
const PAGE = "components/shop/ProductPage.js";
const CARD = "components/shop/CatalogCard.js";
const SOURCES = [LAYOUT, OVERVIEW, PRODUCT, PAGE, CARD, "components/shop/ReadyFlag.js", "lib/shop/catalog.js", "lib/shop/cart.js", "lib/shop/store-config.js", "lib/shop/reviews.js"];
const DATA = ["commerce/prototype/js/commerce/product-data.js", "commerce/prototype/js/commerce/product-reviews.js"];
// What shoppers read: the code without its comments.
const visible = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("named product URLs (D39): one exported page per product, the overview at /products, the old HTML pages gone", () => {
  assert.deepEqual(PRODUCT_SLUGS, { d204: "atomic-colored-glaze", d215: "atomic-glaze-coating" });
  assert.equal(productPath("d204"), "/products/atomic-colored-glaze");
  assert.equal(SEO.d204.path, productPath("d204"));
  assert.equal(SEO.d215.path, productPath("d215"));
  assert.equal(SEO.shop.path, SHOP_PATH);
  assert.equal(SHOP_PATH, "/products");
  const page = read(PRODUCT);
  assert.match(page, /export const dynamicParams = false;/, "no product URL beyond the list");
  assert.match(page, /return SKUS\.map\(\(sku\) => \(\{ slug: PRODUCT_SLUGS\[sku\] \}\)\);/);
  // The plain HTML versions would collide with the export (scripts/build-site.mjs stops on a duplicate path).
  for (const file of ["product.html", "products.html", ...SKUS.map((sku) => `products/${PRODUCT_SLUGS[sku]}.html`), "js/commerce/product.js", "js/commerce/products-overview.js", "css/product.css"]) {
    assert.equal(existsSync(proto(file)), false, `prototype/${file} is gone`);
  }
  assert.equal(existsSync(join(repo, "scripts/build-product-pages.mjs")), false);
});

test("each page: its own title, description, canonical and og tags, not indexable until launch, and a price-free Product JSON-LD", () => {
  for (const key of [...SKUS, "shop"]) {
    const seo = SEO[key];
    assert.ok(seo.title.endsWith("| APGO"), `${key}: title`);
    assert.ok(seo.description.length >= 40, `${key}: description`);
    assert.ok(existsSync(proto(seo.image.slice(1))), `${key}: ${seo.image}`);
  }
  assert.equal(SEO.default, undefined, "the one-page-for-both /product is gone (301 to /products)");
  for (const file of [OVERVIEW, PRODUCT]) {
    const source = read(file);
    for (const field of ["title: { absolute: seo.title }", "description: seo.description", "alternates: { canonical: seo.path }", "robots: { index: false, follow: false }", "openGraph: { title: seo.title, description: seo.description, url: seo.path, images: [seo.image], type: \"website\" }"]) {
      assert.ok(source.includes(field), `${file}: ${field}`);
    }
  }
  assert.match(read(OVERVIEW), /const seo = SEO\.shop;/);
  assert.match(read(PRODUCT), /const seo = SEO\[skuFor\(slug\)\];/);
  // One h1 per page.
  assert.equal((read(OVERVIEW).match(/<h1\b/g) || []).length, 1);
  assert.equal((read(PAGE).match(/<h1\b/g) || []).length, 1);
  // JSON-LD: a price only from the live config, and only once pricing is approved.
  const page = read(PAGE);
  assert.match(page, /if \(config\?\.estimate === false && cents !== null\) \{\n\s+data\.offers = /);
  assert.equal(read(OVERVIEW).includes("pdp-jsonld"), false, "no Product JSON-LD on a list page");
});

test("no prices are hard-coded in the store pages, their code or the product data", () => {
  for (const file of [...SOURCES, ...DATA, "app/(us)/(shop)/shop.css"]) {
    const text = read(file).replace(/\$\{[^}]*\}/g, "");
    assert.equal(/\$\s?\d/.test(text), false, `${file} must not contain a dollar amount`);
    assert.equal(/priceCents\s*[:=]\s*\d/.test(text), false, `${file} must not define a price`);
  }
  assert.match(read("lib/shop/store-config.js"), /fetch\("\/api\/store\/config"\)/);
  for (const file of [PAGE, CARD]) assert.match(read(file), /useStoreConfig\(\)/, `${file} reads the Worker's prices`);
});

test("no runtime leftovers from the design export", () => {
  const banned = [/support\.js/, /\{\{\s*[\w.]+\s*\}\}/, /\bsc-if\b/, /\bx-dc\b/, /<x-dc/, /unpkg\.com/, /babel/i, /\.dc\.html/, /design-import/, /ds-loader/];
  for (const file of [...SOURCES, ...DATA]) {
    const text = read(file);
    for (const pattern of banned) assert.equal(pattern.test(text), false, `${file} matches ${pattern}`);
  }
});

test("every image, video and caption file the pages use exists", () => {
  const page = read(PAGE);
  // The paths ProductPage.js builds, expanded for both products. Served from commerce/prototype/assets until the
  // assets move with the cleanup (D41 step 7).
  for (const pattern of ["`/assets/application/${file}.webp`", "`/assets/video/${sku}-poster.webp`", "`/assets/video/${sku}-application.mp4`", "`/assets/video/${sku}-v3-captions-en.vtt`"]) {
    assert.ok(page.includes(pattern), pattern);
  }
  const missing = [];
  for (const sku of SKUS) {
    const refs = [
      ...PRODUCTS[sku].steps.map(([file]) => `/assets/application/${file}.webp`),
      `/assets/video/${sku}-poster.webp`, `/assets/video/${sku}-application.mp4`, `/assets/video/${sku}-v3-captions-en.vtt`, SEO[sku].image,
    ];
    for (const ref of refs) if (!existsSync(proto(ref.slice(1)))) missing.push(ref);
  }
  assert.ok(existsSync(proto("js/meta-pixel.js")), "the shop layout's pixel script");
  assert.deepEqual(missing, []);
});

test("the store pages use the site's own header and footer (Shop, cart count) and keep Amazon out of the buy flow", () => {
  for (const file of [LAYOUT, OVERVIEW, PAGE, CARD]) {
    const source = read(file);
    assert.equal(/<header\b|<footer\b/.test(source), false, `${file}: no header or footer of its own`);
    assert.equal(/amazon\./i.test(source), false, `${file} must not push Amazon`);
  }
  const root = read("app/(us)/layout.js");
  assert.ok(root.includes("<SiteChrome footer={<SiteFooter />}>{children}</SiteChrome>"), "the site layout brings the header and footer");
  const chrome = read("components/us/SiteChrome.js");
  assert.equal((chrome.match(/\{singleSite && <CartLink \/>\}/g) || []).length, 2, "the cart in the desktop and the phone header");
  assert.match(chrome, /<a href=\{routes\.shop\}/, "Shop");
  assert.match(read("components/us/CartLink.js"), /import \{ useCartCount \} from "@\/lib\/shop\/cart";/, "the header count is the store's own cart");
  const page = read(PAGE);
  assert.match(page, /data-sticky=""/, "sticky add-to-cart bar");
  // Same-host links in their clean form.
  for (const href of ['href="/products"', 'href="/cart"', 'href="/returns"']) assert.ok(page.includes(href), href);
  assert.match(read(CARD), /<a href="\/cart">View cart/);
  // Store styles stay on the store pages: everything in shop.css is under .shop, apart from the footer room for the
  // sticky bar.
  const css = read("app/(us)/(shop)/shop.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const unscoped = [];
  for (const [, selectors] of css.matchAll(/(?:^|[{}])\s*([^{}@]+?)\s*\{/g)) { // rules, also inside @media
    for (const selector of selectors.split(",").map((s) => s.trim())) {
      if (!selector || /^(from|to|\d+%)$/.test(selector)) continue;
      if (!selector.startsWith(".shop") && selector !== 'body[data-sticky-bar="on"] .us-site-footer') unscoped.push(selector);
    }
  }
  assert.deepEqual(unscoped, []);
});

test("no unconfirmed promises or [TO CONFIRM] copy reach shoppers; nothing is invented", () => {
  // The store is live (PRICING_APPROVED): unconfirmed terms are left out, not shown with a marker.
  const unconfirmed = [/data-to-confirm/, /TO CONFIRM/i, /pair price/i, /free (us )?shipping/i, /30[- ]day/i, /30 days/i, /full refund/i, /pending brand confirmation/i, /placeholder/i, /data-placement="guarantee"/, /toConfirm/, /real photo pending/];
  for (const file of [OVERVIEW, PAGE, CARD, "commerce/prototype/js/commerce/product-data.js"]) {
    const text = visible(read(file));
    for (const pattern of unconfirmed) assert.doesNotMatch(text, pattern, `${file}: ${pattern}`);
  }
  for (const sku of SKUS) {
    assert.ok(REVIEWS[sku].every((review) => review.verified === true), "only verified reviews may ever be listed");
    if (BEFORE_AFTER[sku]) {
      assert.ok(existsSync(proto(BEFORE_AFTER[sku].before.src.replace(/^\//, ""))) && existsSync(proto(BEFORE_AFTER[sku].after.src.replace(/^\//, ""))));
    }
  }
  assert.equal(MIN_VERIFIED_REVIEWS, 3);
  const page = read(PAGE);
  assert.match(page, /const reviews = reviewsToShow\(REVIEWS\[sku\], MIN_VERIFIED_REVIEWS\);/);
  assert.match(page, /\{reviews\.length > 0 && \(/, "no reviews, no section and no rating");
  assert.match(read("lib/shop/reviews.js"), /review\?\.verified === true/);
  assert.match(page, /\{photos\?\.before\?\.src && photos\?\.after\?\.src && \(/, "before/after only with a real photo pair");
});

test("design copy is kept: routine-first names, quiz, steps, section titles", () => {
  assert.equal(PRODUCTS.d204.name, "Atomic Colored Glaze");
  assert.equal(PRODUCTS.d215.name, "Atomic Glaze Coating");
  assert.equal(PRODUCTS.d204.routine, "dry");
  assert.equal(PRODUCTS.d215.routine, "wet");
  assert.equal(QUIZ.length, 3);
  assert.deepEqual(PRODUCTS.d204.steps.map((s) => s[1]), ["Spray", "Spread", "Buff"]);
  assert.deepEqual(PRODUCTS.d215.steps.map((s) => s[1]), ["Wash", "Keep wet", "Spray", "Dry"]);
  const page = read(PAGE);
  for (const section of ["Under 15 minutes. No machine.", "Three questions. Your routine.", "Same finish. Pick your moment.", "Straight answers.", "Keep reading"]) {
    assert.ok(page.includes(section), section);
  }
  assert.ok(read(OVERVIEW).includes("Same finish. Pick your moment."));
});

test("the landing page, cart lines and checkout summary link to the product pages", () => {
  const v3 = readProto("v3.html");
  for (const sku of SKUS) {
    assert.ok(v3.includes(`href="products/${PRODUCT_SLUGS[sku]}.html"`), `v3 links to ${sku}`);
    assert.equal((v3.match(new RegExp(`data-product-link="${sku}"`, "g")) || []).length, 2, `${sku}: selected panel + final choice`);
  }
  assert.ok(v3.includes('<a href="products.html">Shop</a>'), "header link to the overview");
  const shared = readProto("js/commerce/shared.js");
  assert.match(shared, /products\/\$\{PRODUCT_SLUGS\[id\]\}\.html/);
  assert.match(readProto("js/commerce/checkout.js"), /productName\(line, \{ newTab: true \}\)/);
  assert.match(readProto("js/commerce/cart.js"), /productTitle\(line\)/);
});

test("package.json runs these tests; the page generator and its screenshots script are gone", () => {
  const scripts = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).scripts;
  assert.match(scripts["test:static"], /tests\/product-pages\.test\.mjs/);
  assert.equal(scripts["build:product-pages"], undefined);
  assert.equal(scripts["capture:product-pages"], undefined);
});

test("the overview lists every product with its own Add to cart, price slot and product link, and no price", () => {
  const overview = read(OVERVIEW);
  assert.match(overview, /\{SKUS\.map\(\(sku\) => <CatalogCard key=\{sku\} sku=\{sku\} \/>\)\}/);
  assert.match(overview, /<ReadyFlag name="shopReady" \/>/);
  const card = read(CARD);
  for (const marker of ["data-shop-card={sku}", "data-add-to-cart={sku}", "data-price-sku={sku}", "data-shop-added={sku}", "href={productPath(sku)}", "{p.name}", "{p.promise}"]) {
    assert.ok(card.includes(marker), marker);
  }
  assert.ok(card.includes("if (status === \"ready\" && !config.products?.[sku]) return null;"), "a product the store no longer sells is hidden");
  assert.equal((card.match(/addToCart\(/g) || []).length, 1, "one add per click");
});

test("store pages that are still plain HTML link to the overview (Shop) next to the cart; checkout stays focused", () => {
  for (const file of ["cart.html", "privacy.html", "terms.html", "returns.html", "contact.html"]) {
    const header = readProto(file).split("</header>")[0];
    assert.ok(header.includes('<a href="products.html">Shop</a>'), `${file}: Shop`);
    assert.ok(header.includes("data-cart-count"), `${file}: cart count`);
  }
  assert.equal(readProto("checkout.html").split("</header>")[0].includes("products.html"), false, "no Shop link in the checkout header");
  assert.ok(readProto("cart.html").includes('<a class="btn btn--sm" href="products.html">Choose Dry or Wet'), "an empty cart leads to the overview");
});
