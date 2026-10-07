#!/usr/bin/env node
// Generates the product pages from one template so the files cannot drift:
//
//   prototype/product.html                         default: SKU from ?sku=D204|D215 or #dry|#wet (falls back to DRY / D204)
//   prototype/products/atomic-colored-glaze.html   D204, served at /products/atomic-colored-glaze (Cloudflare drops ".html")
//   prototype/products/atomic-glaze-coating.html   D215, served at /products/atomic-glaze-coating
//   prototype/products.html                        the overview of every product on sale, served at /products (D39)
//
// The product pages differ only in the <head> and <body data-sku>; prototype/js/commerce/product.js fills them in.
// The overview gets its prices from prototype/js/commerce/products-overview.js. Prices come from /api/store/config,
// never from here.
//
//   node scripts/build-product-pages.mjs          write the files
//   node scripts/build-product-pages.mjs --check   exit 1 if a file is out of date or left over (used by test:static)

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { BRAND, PRODUCT_SLUGS, PRODUCTS, QUIZ, SEO, SHOP_FILE, SKUS, productFile } from "../prototype/js/commerce/product-data.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "prototype");

const esc = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// No customer-visible [TO CONFIRM] copy on these pages: the store is live (PRICING_APPROVED), so
// unconfirmed terms (pair discount, free shipping, 30-day returns, guarantee) are left out entirely
// instead of being shown with a marker. Add them back only once the brand confirms the exact wording.

// sku: "d204" | "d215" for a product page, null for product.html, "shop" for the overview.
function head(sku) {
  const seo = SEO[sku ?? "default"];
  const product = PRODUCTS[sku];
  const lines = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    // Same rule as the other store pages: not indexable until launch. Flip this one line (here) at go-live.
    '<meta name="robots" content="noindex,nofollow">',
    '<meta name="theme-color" content="#080A0C">',
    `<title>${esc(seo.title)}</title>`,
    `<meta name="description" content="${esc(seo.description)}">`,
    `<link rel="canonical" href="${esc(seo.path)}">`,
    `<meta property="og:site_name" content="${BRAND}">`,
    `<meta property="og:type" content="${product ? "product" : "website"}">`,
    `<meta property="og:title" content="${esc(seo.title)}">`,
    `<meta property="og:description" content="${esc(seo.description)}">`,
    `<meta property="og:url" content="${esc(seo.path)}">`,
    `<meta property="og:image" content="${esc(seo.image)}">`,
    '<meta name="twitter:card" content="summary">',
  ];
  if (product) {
    // Static Product data without any price: product.js adds `offers` only from /api/store/config
    // once pricing is approved (a placeholder price must never reach search engines).
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: `${product.name} (${product.routine === "dry" ? "DRY" : "WET"})`,
      sku: product.sku,
      description: seo.description,
      brand: { "@type": "Brand", name: BRAND },
      image: [seo.image],
    };
    lines.push(`<script type="application/ld+json" id="pdp-jsonld">${JSON.stringify(jsonLd)}</script>`);
  } else if (sku !== "shop") {
    lines.push('<script type="application/ld+json" id="pdp-jsonld">{}</script>');
  }
  return lines.join("\n    ");
}

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600;700&display=swap">
    <link rel="stylesheet" href="/css/commerce.css">
    <link rel="stylesheet" href="/css/product.css">
    <script src="/js/meta-pixel.js" defer></script>`;

const PIXEL_NOSCRIPT = '<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=2606879866471418&ev=PageView&noscript=1"></noscript>';

// One header for the product pages and the overview: Shop (the overview, D39), the two routines and the cart.
// Below 480px the routine links hide and Shop and the cart stay (product.css). product.js marks the routine shown.
function header(current) {
  const routines = SKUS.map((sku) => `<a href="${productFile(sku)}" data-nav-sku="${sku}">${PRODUCTS[sku].word}</a>`);
  return `<header class="shop-header">
      <div class="shop-header__inner">
        <a class="shop-header__logo" href="/" aria-label="APGO home"><img src="/assets/brand/apgo-logo.png" alt="APGO" width="89" height="24"></a>
        <nav class="shop-header__nav pdp-nav" aria-label="Products">
          <a href="${SHOP_FILE}" data-nav-shop${current === "shop" ? ' aria-current="page"' : ""}>Shop</a>
          ${routines.join("\n          ")}
        </nav>
        <a class="btn btn--sm" href="/cart.html" data-cart-link aria-label="Cart, 0 items">Cart · <span data-cart-count>0</span> <span aria-hidden="true">→</span></a>
      </div>
    </header>`;
}

const FOOTER = `<footer class="shop-footer">
      <div class="shop-footer__inner">
        <img src="/assets/brand/apgo-logo.png" alt="APGO" width="89" height="24">
        <nav class="shop-footer__links" aria-label="Legal and support">
          <a href="/privacy.html">Privacy Policy</a>
          <a href="/terms.html">Terms of Sale</a>
          <a href="/returns.html">Returns &amp; Refunds</a>
          <a href="/contact.html">Contact</a>
        </nav>
        <span>© <span data-year>2026</span> APGO.</span>
      </div>
    </footer>`;

const quiz = QUIZ.map(
  (item, i) => `
            <div class="quiz__q" role="group" aria-labelledby="quiz-label-${i}" data-quiz-q="${i}" data-state="${i > 0 ? "locked" : "open"}">
              <span class="quiz__legend" id="quiz-label-${i}">${i + 1}. ${esc(item.q)}</span>
              <div class="quiz__opts">
                <label class="quiz__opt"><input type="radio" name="quiz-${i}" value="yes"${i > 0 ? " disabled" : ""}><span>Yes</span></label>
                <label class="quiz__opt"><input type="radio" name="quiz-${i}" value="no"${i > 0 ? " disabled" : ""}><span>No</span></label>
              </div>
            </div>`,
).join("");

function page(sku) {
  return `<!doctype html>
<!-- GENERATED by scripts/build-product-pages.mjs. Edit the script (or product-data.js), then run: node scripts/build-product-pages.mjs -->
<html lang="en">
  <head>
    ${head(sku)}
    ${FONTS}
    <script type="module" src="/js/commerce/product.js"></script>
    ${PIXEL_NOSCRIPT}
  </head>
  <body data-page="product"${sku ? ` data-sku="${sku}"` : ""}>
    <a class="skip-link" href="#main">Skip to content</a>
    ${header("product")}

    <noscript><p class="pdp-noscript">Turn on JavaScript to see prices and add products to your cart.</p></noscript>

    <main id="main" data-routine="dry">
      <!-- 1. Hero: sticky gallery + buy box -->
      <section class="pdp-hero" aria-labelledby="pdp-title">
        <div class="pdp-wrap pdp-hero__wrap">
          <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="${SHOP_FILE}">Shop</a><span aria-hidden="true">/</span><span aria-current="page" data-crumb></span>
          </nav>
          <div class="pdp-hero__grid">
            <div class="pdp-gallery">
              <div class="pdp-stage">
                <span class="pdp-ghost" aria-hidden="true" data-ghost></span>
                <span class="pdp-glow" aria-hidden="true"></span>
                <img class="pdp-stage__img" data-gallery-main alt="" width="1400" height="1400">
              </div>
              <ul class="pdp-thumbs" data-thumbs aria-label="Product images"></ul>
            </div>

            <div class="pdp-buy">
              <div class="pdp-id">
                <span class="routine routine--xl" data-routine-word></span>
                <span class="label pdp-id__when" data-when></span>
                <span class="sku-tag" data-sku-tag></span>
              </div>
              <h1 class="heading-guide-h1 pdp-title" id="pdp-title" data-name></h1>
              <p class="pdp-rating" data-rating hidden></p>
              <p class="body pdp-promise" data-promise></p>

              <fieldset class="pdp-switch" data-switch>
                <legend class="visually-hidden">Routine</legend>
                <label class="pdp-switch__opt"><input type="radio" name="routine" value="d204"><span class="pdp-switch__face"><span class="routine routine--sm">DRY</span> After drying</span></label>
                <label class="pdp-switch__opt"><input type="radio" name="routine" value="d215"><span class="pdp-switch__face"><span class="routine routine--sm">WET</span> While wet</span></label>
              </fieldset>

              <label class="check pdp-pair" data-pair-card>
                <span class="check__control"><input type="checkbox" data-pair><span class="check__box" aria-hidden="true"></span></span>
                <span class="pdp-pair__text">
                  <span class="check__label" data-pair-label></span>
                  <span class="check__description">Both routines in one order</span>
                </span>
                <img class="pdp-pair__img" data-pair-img alt="" width="56" height="56">
              </label>

              <div class="pdp-buyrow" data-buyrow>
                <div class="pdp-price">
                  <span class="label" data-size></span>
                  <span class="pdp-price__value" data-price aria-live="polite">—</span>
                </div>
                <div class="qty" role="group" aria-label="Quantity">
                  <button type="button" aria-label="Decrease quantity" data-qty-dec>−</button>
                  <output data-qty aria-live="polite">1</output>
                  <button type="button" aria-label="Increase quantity" data-qty-inc>+</button>
                </div>
                <button class="btn pdp-add" type="button" data-pdp-add data-placement="buybox">Add to cart <span aria-hidden="true">→</span></button>
              </div>
              <p class="pdp-price-note label" data-price-note></p>
              <div class="pdp-added" data-added aria-live="polite"></div>

              <ul class="pdp-trust" aria-label="About the product">
                <li><strong>Made in Taiwan</strong><span>Since 2011</span></li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- 2. Benefit strip -->
      <section class="pdp-benefits" aria-label="Key facts">
        <div class="pdp-wrap"><ul class="pdp-benefits__grid" data-benefits></ul></div>
      </section>

      <!-- 3. Before / after: shown only with a real photo pair (product-reviews.js); otherwise hidden -->
      <section class="pdp-section pdp-section--raised" data-result aria-labelledby="pdp-result-title" hidden>
        <div class="pdp-wrap pdp-section__inner">
          <div class="pdp-head"><p class="eyebrow eyebrow--plain">The result</p><h2 class="heading-guide-h2" id="pdp-result-title">See the difference on real paint.</h2><p class="body body--sm" data-result-lede></p></div>
          <div class="pdp-result" data-result-grid></div>
        </div>
      </section>

      <!-- 4. How to apply -->
      <section class="pdp-section" aria-labelledby="pdp-how-title">
        <div class="pdp-wrap pdp-section__inner">
          <div class="pdp-head"><p class="eyebrow eyebrow--plain">How to apply</p><h2 class="heading-guide-h2" id="pdp-how-title">Under 15 minutes. No machine.</h2></div>
          <div class="pdp-how">
            <div class="pdp-video" data-video>
              <div class="pdp-video__frame" data-video-frame>
                <img class="pdp-video__poster" data-video-poster alt="" loading="lazy" width="1600" height="900">
                <button class="pdp-video__play" type="button" data-video-play aria-label="Play application video"><span aria-hidden="true">▶</span></button>
              </div>
              <p class="pdp-video__caption"><span data-video-caption></span><span class="pdp-video__status">Real footage · English captions</span></p>
            </div>
            <div class="pdp-how__steps">
              <ol class="pdp-steps" data-steps></ol>
              <p class="pdp-note" data-scope></p>
            </div>
          </div>
        </div>
      </section>

      <!-- 5. Fit quiz -->
      <section class="pdp-section pdp-section--raised" aria-labelledby="pdp-quiz-title">
        <div class="pdp-wrap pdp-section__inner">
          <div class="pdp-head"><p class="eyebrow eyebrow--plain">Not sure?</p><h2 class="heading-guide-h2" id="pdp-quiz-title">Three questions. Your routine.</h2></div>
          <form class="quiz" data-quiz>${quiz}
          </form>
          <div class="quiz__result" data-quiz-result hidden aria-live="polite"></div>
        </div>
      </section>

      <!-- 6. Dry vs Wet -->
      <section class="pdp-section" aria-labelledby="pdp-compare-title">
        <div class="pdp-wrap pdp-section__inner">
          <div class="pdp-head"><p class="eyebrow eyebrow--plain">Dry vs Wet</p><h2 class="heading-guide-h2" id="pdp-compare-title">Same finish. Pick your moment.</h2></div>
          <table class="pdp-compare" data-compare>
            <caption class="visually-hidden">Dry and Wet compared</caption>
            <thead><tr><td></td><th scope="col" data-col="d204"><span class="routine routine--md">DRY</span> <span class="pdp-viewing">✓ Viewing</span></th><th scope="col" data-col="d215"><span class="routine routine--md">WET</span> <span class="pdp-viewing">✓ Viewing</span></th></tr></thead>
            <tbody data-compare-body></tbody>
          </table>
        </div>
      </section>

      <!-- 7. Reviews: hidden until 3 verified reviews exist (FTC 16 CFR 465) -->
      <section class="pdp-section pdp-section--raised" data-reviews aria-labelledby="pdp-reviews-title" hidden>
        <div class="pdp-wrap pdp-section__inner">
          <div class="pdp-head"><p class="eyebrow eyebrow--plain">Reviews</p><h2 class="heading-guide-h2" id="pdp-reviews-title">From drivers who use it.</h2></div>
          <ul class="pdp-reviews" data-reviews-list></ul>
        </div>
      </section>

      <!-- 8. Guarantee section intentionally omitted until its terms are confirmed by the brand. -->

      <!-- 9. FAQ -->
      <section class="pdp-section" aria-labelledby="pdp-faq-title">
        <div class="pdp-wrap pdp-section__inner">
          <div class="pdp-faq-grid">
            <div class="pdp-head"><p class="eyebrow eyebrow--plain">Before you order</p><h2 class="heading-guide-h2" id="pdp-faq-title">Straight answers.</h2></div>
            <div class="faq">
              <details><summary>Which one should I choose?</summary><p>Choose by routine. Dry if you prefer a separate step after drying; Wet if you prefer to apply while the paint is still wet.</p></details>
              <details><summary>Can I use it over wax?</summary><p>Apply to clean, bare paint. Remove existing wax first so the coating can bond to the surface.</p></details>
              <details><summary>What surfaces can I use it on?</summary><p>Use each product only on surfaces identified by its current label. Contact APGO when a surface is not listed.</p></details>
              <details><summary>Shipping and returns?</summary><p>Shipping options and their cost are shown at checkout. Return terms are on our <a href="/returns.html">Returns &amp; Refunds</a> page.</p></details>
            </div>
          </div>
        </div>
      </section>

      <!-- 10. Keep reading -->
      <section class="pdp-section" aria-labelledby="pdp-more-title">
        <div class="pdp-wrap pdp-section__inner">
          <h2 class="heading-guide-h2" id="pdp-more-title">Keep reading</h2>
          <div class="pdp-more">
            <a class="pdp-more__card" data-more-other href="${productFile(PRODUCTS[sku ?? "d204"].other)}"></a>
            <a class="pdp-more__card" href="/#how-it-works"><span class="pdp-more__cat">Basics · The routine</span><span class="pdp-more__title">How APGO works</span><span class="pdp-more__cta">Back to the store <span aria-hidden="true">→</span></span></a>
          </div>
        </div>
      </section>
    </main>

    ${FOOTER}

    <!-- Sticky add-to-cart: appears once the main buy row has scrolled out of view -->
    <aside class="pdp-sticky" data-sticky data-visible="false" aria-label="Quick add to cart" aria-hidden="true" inert>
      <div class="pdp-sticky__inner">
        <img data-sticky-img alt="" width="44" height="44">
        <div class="pdp-sticky__text">
          <span class="pdp-sticky__line"><span class="routine routine--sm" data-sticky-word></span><span class="pdp-sticky__price" data-sticky-price>—</span></span>
          <span class="pdp-sticky__name" data-sticky-name></span>
        </div>
        <button class="btn btn--md" type="button" data-pdp-add data-placement="sticky">Add to cart <span aria-hidden="true">→</span></button>
      </div>
    </aside>
  </body>
</html>
`;
}

// The overview (D39): every product on sale, with its price and an Add to cart button (shared.js handles the add).
// Copy reuses product-data.js only. products-overview.js fills in the prices and hides a product the store no
// longer sells (missing from /api/store/config).
function card(sku) {
  const p = PRODUCTS[sku];
  return `
            <li class="catalog-card" data-shop-card="${sku}">
              <a class="catalog-card__media" href="${productFile(sku)}" tabindex="-1" aria-hidden="true"><img src="${SEO[sku].image}" alt="" width="1400" height="1400"></a>
              <div class="catalog-card__body">
                <p class="catalog-card__id"><span class="routine routine--md routine--${p.routine}">${p.routine === "dry" ? "DRY" : "WET"}</span><span class="label">${esc(p.when)}</span><span class="sku-tag">${p.sku}</span></p>
                <h2 class="catalog-card__name"><a href="${productFile(sku)}">${esc(p.name)}</a></h2>
                <p class="body body--sm">${esc(p.promise)}</p>
                <p class="label">${esc(p.size)} · ${esc(p.oz)} · Lasts up to ${esc(p.lasts)}</p>
                <div class="catalog-card__buy">
                  <span class="catalog-card__price" data-price-sku="${sku}">—</span>
                  <button class="btn btn--md" type="button" data-add-to-cart="${sku}" data-placement="shop">Add to cart <span aria-hidden="true">→</span></button>
                </div>
                <p class="catalog-card__added" data-shop-added="${sku}" aria-live="polite"></p>
                <a class="btn btn--text" href="${productFile(sku)}">Product details <span class="glyph" aria-hidden="true">→</span></a>
              </div>
            </li>`;
}

function overview() {
  return `<!doctype html>
<!-- GENERATED by scripts/build-product-pages.mjs. Edit the script (or product-data.js), then run: node scripts/build-product-pages.mjs -->
<html lang="en">
  <head>
    ${head("shop")}
    ${FONTS}
    <script type="module" src="/js/commerce/products-overview.js"></script>
    ${PIXEL_NOSCRIPT}
  </head>
  <body data-page="shop">
    <a class="skip-link" href="#main">Skip to content</a>
    ${header("shop")}

    <noscript><p class="pdp-noscript">Turn on JavaScript to see prices and add products to your cart.</p></noscript>

    <main id="main">
      <section class="pdp-section" aria-labelledby="shop-title">
        <div class="pdp-wrap pdp-section__inner">
          <div class="pdp-head">
            <p class="eyebrow eyebrow--plain">Shop</p>
            <h1 class="heading-guide-h1" id="shop-title">Same finish. Pick your moment.</h1>
            <p class="body">${esc(SEO.shop.description)}</p>
          </div>
          <ul class="catalog" aria-label="Products">${SKUS.map(card).join("")}
          </ul>
        </div>
      </section>
    </main>

    ${FOOTER}
  </body>
</html>
`;
}

const outputs = {
  "product.html": page(null),
  ...Object.fromEntries(SKUS.map((sku) => [`products/${PRODUCT_SLUGS[sku]}.html`, page(sku)])),
  "products.html": overview(),
};

const check = process.argv.includes("--check");
let stale = 0;
// A page left over from an earlier URL (e.g. products/d204.html before D39) would still be served: flag it.
for (const name of readdirSync(join(root, "products"))) {
  if (name.endsWith(".html") && !(`products/${name}` in outputs)) {
    console.error(`left over: prototype/products/${name} (no longer generated; delete it)`);
    stale += 1;
  }
}
for (const [file, html] of Object.entries(outputs)) {
  const target = join(root, file);
  if (check) {
    let current = null;
    try {
      current = readFileSync(target, "utf8");
    } catch {
      // missing counts as stale
    }
    if (current !== html) {
      console.error(`stale: prototype/${file}`);
      stale += 1;
    }
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, html);
    console.log(`wrote prototype/${file}`);
  }
}
if (stale) {
  console.error(check ? "Run: node scripts/build-product-pages.mjs" : "Delete the left-over pages listed above.");
  process.exit(1);
}
