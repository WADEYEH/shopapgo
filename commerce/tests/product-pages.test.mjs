import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PRODUCT_SLUGS, PRODUCTS, QUIZ, SEO, SHOP_FILE, SKUS, productFile } from "../prototype/js/commerce/product-data.js";
import { BEFORE_AFTER, MIN_VERIFIED_REVIEWS, REVIEWS } from "../prototype/js/commerce/product-reviews.js";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const proto = (path) => join(repo, "prototype", path);
const read = (path) => readFileSync(proto(path), "utf8");
const PAGES = { "product.html": null, ...Object.fromEntries(SKUS.map((sku) => [productFile(sku).slice(1), sku])) };
const OVERVIEW = "products.html";
const SOURCES = ["js/commerce/product.js", "js/commerce/product-data.js", "js/commerce/product-reviews.js", "js/commerce/products-overview.js", "css/product.css"];

test("the product pages are in sync with scripts/build-product-pages.mjs", () => {
  const result = spawnSync(process.execPath, [join(repo, "scripts/build-product-pages.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("each page has a title, description, canonical, og tags, noindex and a price-free Product JSON-LD", () => {
  for (const [file, sku] of Object.entries(PAGES)) {
    const html = read(file);
    const seo = SEO[sku ?? "default"];
    assert.match(html, new RegExp(`<title>${seo.title.replace(/[()|·]/g, "\\$&")}</title>`), file);
    assert.match(html, /<meta name="description" content="[^"]{40,}">/, file);
    assert.match(html, new RegExp(`<link rel="canonical" href="${seo.path}">`), file);
    for (const property of ["og:title", "og:description", "og:image", "og:url", "og:type"]) {
      assert.ok(html.includes(`property="${property}"`), `${file} ${property}`);
    }
    assert.match(html, /<meta name="robots" content="noindex,nofollow">/, `${file} follows the other store pages until launch`);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, `${file} has exactly one h1`);
    const ld = /<script type="application\/ld\+json" id="pdp-jsonld">(.*?)<\/script>/s.exec(html);
    assert.ok(ld, `${file} JSON-LD`);
    const data = JSON.parse(ld[1]);
    if (sku) {
      assert.equal(data["@type"], "Product");
      assert.equal(data.sku, PRODUCTS[sku].sku);
      assert.equal(data.offers, undefined, "no price in the static markup: it is injected from /api/store/config once approved");
      assert.equal(html.includes(`data-sku="${sku}"`), true);
    }
  }
  // Named product URLs (D39); the old /products/d204|d215 answer 301 (worker/root-page.js, tests/single-site.test.mjs).
  assert.deepEqual(PRODUCT_SLUGS, { d204: "atomic-colored-glaze", d215: "atomic-glaze-coating" });
  assert.equal(SEO.d204.path, "/products/atomic-colored-glaze");
  assert.equal(SEO.d215.path, "/products/atomic-glaze-coating");
  assert.deepEqual(Object.keys(PAGES).sort(), ["product.html", "products/atomic-colored-glaze.html", "products/atomic-glaze-coating.html"]);
});

test("no prices are hard-coded in the product page markup, data or script", () => {
  for (const file of [...Object.keys(PAGES), OVERVIEW, "js/commerce/product.js", "js/commerce/product-data.js", "js/commerce/products-overview.js"]) {
    const text = read(file).replace(/\$\{[^}]*\}/g, "");
    assert.equal(/\$\s?\d/.test(text), false, `${file} must not contain a dollar amount`);
    assert.equal(/priceCents\s*[:=]\s*\d/.test(text), false, `${file} must not define a price`);
  }
  assert.match(read("js/commerce/product.js"), /\/api\/store\/config/);
  assert.match(read("js/commerce/products-overview.js"), /\/api\/store\/config/);
});

test("no runtime leftovers from the design export", () => {
  const banned = [/support\.js/, /\{\{/, /\bsc-if\b/, /\bx-dc\b/, /<x-dc/, /unpkg\.com/, /babel/i, /react(-dom)?\b/i, /\.dc\.html/, /design-import/, /ds-loader/];
  for (const file of [...Object.keys(PAGES), OVERVIEW, ...SOURCES]) {
    const text = read(file);
    for (const pattern of banned) assert.equal(pattern.test(text), false, `${file} matches ${pattern}`);
  }
});

test("every local link, script, stylesheet and image on the pages exists", () => {
  const missing = [];
  const check = (from, ref) => {
    if (/^(https?:|mailto:|#|data:)/.test(ref)) return;
    const path = ref.split("#")[0].split("?")[0];
    if (!path || path === "/") return;
    const target = path.startsWith("/") ? path.slice(1) : join(dirname(from), path);
    if (!existsSync(proto(target))) missing.push(`${from} -> ${ref}`);
  };
  for (const file of [...Object.keys(PAGES), OVERVIEW]) {
    const html = read(file);
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (Object.values(SEO).some((seo) => seo.path === match[1])) continue; // canonical / og:url: the clean URL
      check(file, match[1]);
    }
  }
  // Assets the script builds at runtime, expanded for both products.
  for (const sku of SKUS) {
    for (const [step] of PRODUCTS[sku].steps) check("product.js", `/assets/application/${step}.webp`);
    for (const ref of [`/assets/video/${sku}-poster.webp`, `/assets/video/${sku}-application.mp4`, `/assets/video/${sku}-v3-captions-en.vtt`, SEO[sku].image]) check("product.js", ref);
    check("product-data.js", productFile(sku));
  }
  assert.deepEqual(missing, []);
});

test("the pages reuse the shop header (cart badge), the policy footer and keep Amazon out of the buy flow", () => {
  for (const file of Object.keys(PAGES)) {
    const html = read(file);
    assert.match(html, /data-cart-count/, `${file} cart badge`);
    assert.match(html, /href="\/cart\.html"/, `${file} cart link`);
    for (const policy of ["privacy", "terms", "returns", "contact"]) assert.ok(html.includes(`href="/${policy}.html"`), `${file} ${policy}`);
    assert.equal(/amazon\./i.test(html), false, `${file} must not push Amazon`);
    assert.match(html, /data-sticky/, `${file} sticky add-to-cart bar`);
  }
});

test("no unconfirmed promises or [TO CONFIRM] copy reach shoppers; nothing is invented", () => {
  // The store is live (PRICING_APPROVED): unconfirmed terms are left out, not shown with a marker.
  const unconfirmed = [/data-to-confirm/, /TO CONFIRM/i, /pair price/i, /free (us )?shipping/i, /30[- ]day/i, /30 days/i, /full refund/i, /pending brand confirmation/i, /placeholder/i, /data-placement="guarantee"/];
  for (const file of [...Object.keys(PAGES), OVERVIEW]) {
    const visible = read(file).replace(/<!--.*?-->/gs, "");
    for (const pattern of unconfirmed) assert.doesNotMatch(visible, pattern, `${file}: ${pattern}`);
  }
  const js = read("js/commerce/product.js");
  for (const pattern of [/toConfirm/, /TO CONFIRM/, /Price shown is a placeholder/, /real photo pending/]) {
    assert.doesNotMatch(js, pattern, `product.js: ${pattern}`);
  }
  for (const sku of SKUS) {
    assert.ok(REVIEWS[sku].every((review) => review.verified === true), "only verified reviews may ever be listed");
    if (BEFORE_AFTER[sku]) {
      assert.ok(existsSync(proto(BEFORE_AFTER[sku].before.src.replace(/^\//, ""))) && existsSync(proto(BEFORE_AFTER[sku].after.src.replace(/^\//, ""))));
    }
  }
  assert.equal(MIN_VERIFIED_REVIEWS, 3);
  assert.match(js, /MIN_VERIFIED_REVIEWS/);
  assert.match(js, /verified === true/);
});

test("design copy is kept: routine-first names, quiz, steps", () => {
  assert.equal(PRODUCTS.d204.name, "Atomic Colored Glaze");
  assert.equal(PRODUCTS.d215.name, "Atomic Glaze Coating");
  assert.equal(PRODUCTS.d204.routine, "dry");
  assert.equal(PRODUCTS.d215.routine, "wet");
  assert.equal(QUIZ.length, 3);
  assert.deepEqual(PRODUCTS.d204.steps.map((s) => s[1]), ["Spray", "Spread", "Buff"]);
  assert.deepEqual(PRODUCTS.d215.steps.map((s) => s[1]), ["Wash", "Keep wet", "Spray", "Dry"]);
  const html = read(productFile("d215").slice(1));
  for (const section of ["Under 15 minutes. No machine.", "Three questions. Your routine.", "Same finish. Pick your moment.", "Straight answers.", "Keep reading"]) {
    assert.ok(html.includes(section), section);
  }
});

test("the landing page, cart lines and checkout summary link to the product pages", () => {
  const v3 = read("v3.html");
  for (const sku of SKUS) {
    assert.ok(v3.includes(`href="${productFile(sku).slice(1)}"`), `v3 links to ${sku}`);
    assert.equal((v3.match(new RegExp(`data-product-link="${sku}"`, "g")) || []).length, 2, `${sku}: selected panel + final choice`);
  }
  assert.ok(v3.includes('<a href="products.html">Shop</a>'), "header link to the overview");
  const shared = read("js/commerce/shared.js");
  assert.match(shared, /products\/\$\{PRODUCT_SLUGS\[id\]\}\.html/);
  assert.match(read("js/commerce/checkout.js"), /productName\(line, \{ newTab: true \}\)/);
  assert.match(read("js/commerce/cart.js"), /productTitle\(line\)/);
});

test("package.json runs the new tests", () => {
  const scripts = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).scripts;
  assert.match(scripts["test:static"], /tests\/product-pages\.test\.mjs/);
  assert.match(scripts["capture:product-pages"] || "", /capture-product-pages\.mjs/);
});

test("the overview lists every product with its own Add to cart, price slot and product link, and no price", () => {
  const html = read(OVERVIEW);
  assert.ok(html.includes(`<title>${SEO.shop.title}</title>`));
  assert.match(html, /<link rel="canonical" href="\/products">/);
  assert.match(html, /<meta name="robots" content="noindex,nofollow">/, "not indexable until launch, like the product pages");
  assert.equal((html.match(/<h1\b/g) || []).length, 1);
  assert.equal(html.includes("pdp-jsonld"), false, "no Product JSON-LD on a list page");
  assert.match(html, /<script type="module" src="\/js\/commerce\/products-overview\.js"><\/script>/);
  for (const sku of SKUS) {
    assert.equal(html.split(`data-add-to-cart="${sku}"`).length - 1, 1, `${sku}: one Add to cart`);
    assert.ok(html.includes(`data-price-sku="${sku}"`), `${sku}: price slot`);
    assert.ok(html.includes(`data-shop-card="${sku}"`), `${sku}: card the script can hide`);
    assert.ok(html.includes(`href="${productFile(sku)}"`), `${sku}: links to its page`);
    assert.ok(html.includes(PRODUCTS[sku].name) && html.includes(PRODUCTS[sku].promise), `${sku}: design copy`);
  }
  for (const policy of ["privacy", "terms", "returns", "contact"]) assert.ok(html.includes(`href="/${policy}.html"`), policy);
  const js = read("js/commerce/products-overview.js");
  assert.ok(js.includes("card.hidden = !config.products[card.dataset.shopCard]"), "a product the store no longer sells is hidden");
  assert.equal(js.includes("cart.add("), false, "adding stays in shared.js (one add per click)");
});

test("store headers link to the overview (Shop) next to the cart; checkout stays focused", () => {
  for (const file of [...Object.keys(PAGES), OVERVIEW]) {
    assert.ok(read(file).includes(`<a href="${SHOP_FILE}" data-nav-shop`), `${file}: Shop`);
  }
  assert.ok(read(OVERVIEW).includes(`<a href="${SHOP_FILE}" data-nav-shop aria-current="page">Shop</a>`));
  for (const file of ["cart.html", "privacy.html", "terms.html", "returns.html", "contact.html"]) {
    const header = read(file).split("</header>")[0];
    assert.ok(header.includes('<a href="products.html">Shop</a>'), `${file}: Shop`);
    assert.ok(header.includes("data-cart-count"), `${file}: cart count`);
  }
  assert.equal(read("checkout.html").split("</header>")[0].includes("products.html"), false, "no Shop link in the checkout header");
  assert.ok(read("cart.html").includes('<a class="btn btn--sm" href="products.html">Choose Dry or Wet'), "an empty cart leads to the overview");
  // Phones keep Shop: only the Dry / Wet links hide.
  assert.ok(read("css/product.css").includes("@media (max-width: 480px) { .pdp-nav [data-nav-sku] { display: none; } }"));
});
