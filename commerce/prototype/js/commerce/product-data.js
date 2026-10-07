// Product page content for D204 (DRY) and D215 (WET).
//
// Source: Claude Design "product-v2" UI kit (export of 2026-10-05, see docs/product-pages.md). Copy is the design's FTC-reviewed text, kept verbatim.
//
// NO PRICES HERE. Every price on the page comes from /api/store/config (worker/pricing.js).
// Terms the design marks as placeholders (shipping, returns, pair price) are not shown to shoppers
// until confirmed. Pure data, no DOM: scripts/build-product-pages.mjs imports it too.

export const PRODUCTS = {
  d204: {
    sku: "D204",
    routine: "dry",
    word: "Dry",
    name: "Atomic Colored Glaze",
    size: "300 mL",
    oz: "10.1 fl oz",
    when: "After washing & fully drying",
    switchLabel: "After drying",
    lasts: "6 months",
    promise: "A separate finishing step after you dry—spray, spread, buff.",
    benefits: [
      ["6", "mo", "Lasts up to 6 months"],
      ["3", "steps", "Spray · Spread · Buff"],
      ["15", "yrs", "In-house R&D, Taiwan"],
    ],
    steps: [
      ["d204-step-1", "Spray"],
      ["d204-step-2", "Spread"],
      ["d204-step-3", "Buff"],
    ],
    videoCaption: "Real footage · Dry-surface application",
    scope: "Paint, clear coat, painted trim. Windshield only after oil film is removed.",
    other: "d215",
  },
  d215: {
    sku: "D215",
    routine: "wet",
    word: "Wet",
    name: "Atomic Glaze Coating",
    size: "200 mL",
    oz: "6.8 fl oz",
    when: "While paint is still wet",
    switchLabel: "While wet",
    lasts: "4 months",
    promise: "Finish inside your wash—spray on wet paint, dry as usual, final buff.",
    benefits: [
      ["4", "mo", "Lasts up to 4 months"],
      ["0", "extra rinse", "Applied before final drying"],
      ["15", "yrs", "In-house R&D, Taiwan"],
    ],
    steps: [
      ["d215-step-1", "Wash"],
      ["d215-step-2", "Keep wet"],
      ["d215-step-3", "Spray"],
      ["d215-step-4", "Dry"],
    ],
    videoCaption: "Real footage · Wet-surface application",
    scope: "Paint, clear coat, painted trim. Not for the front windshield.",
    other: "d204",
  },
};

export const SKUS = Object.keys(PRODUCTS);

export const QUIZ = [
  { q: "After drying, do you have 10 more minutes for the car?", yes: "d204", no: "d215" },
  { q: "Would you rather finish while you are still rinsing?", yes: "d215", no: "d204" },
  { q: "Is the longest time between applications most important?", yes: "d204", no: "d215" },
];

// Product page URLs are named, not SKU-based (owner decision D39, 2026-10-07). The Worker answers the earlier
// /products/d204 and /products/d215 with a 301 to these (worker/root-page.js), so old links and ads keep working.
// Clean URL (Cloudflare serves products/atomic-colored-glaze.html at /products/atomic-colored-glaze) and the file
// form that also works on a plain static server.
export const PRODUCT_SLUGS = { d204: "atomic-colored-glaze", d215: "atomic-glaze-coating" };
export const productPath = (sku) => `/products/${PRODUCT_SLUGS[sku]}`;
export const productFile = (sku) => `/products/${PRODUCT_SLUGS[sku]}.html`;
// The overview of every product on sale (D39): products.html, served at /products.
export const SHOP_PATH = "/products";
export const SHOP_FILE = "/products.html";

// Head content, used by scripts/build-product-pages.mjs for the static HTML and by product.js when
// the shopper switches routine in place. Descriptions only reuse the design copy above.
export const SEO = {
  d204: {
    title: "DRY · Atomic Colored Glaze (D204) | APGO",
    description: `${PRODUCTS.d204.promise} ${PRODUCTS.d204.size} / ${PRODUCTS.d204.oz}. Lasts up to ${PRODUCTS.d204.lasts}.`,
    path: productPath("d204"),
    image: "/assets/products/d204-packshot.webp",
  },
  d215: {
    title: "WET · Atomic Glaze Coating (D215) | APGO",
    description: `${PRODUCTS.d215.promise} ${PRODUCTS.d215.size} / ${PRODUCTS.d215.oz}. Lasts up to ${PRODUCTS.d215.lasts}.`,
    path: productPath("d215"),
    image: "/assets/products/d215-packshot.webp",
  },
  default: {
    title: "APGO Atomic Glaze · Choose DRY or WET",
    description: "Two APGO paint coatings built around your routine: DRY after you dry the car, or WET while the paint is still wet.",
    path: "/product",
    image: "/assets/products/d204-packshot.webp",
  },
  shop: {
    title: "Shop APGO Atomic Glaze · DRY and WET | APGO",
    description: "Two APGO paint coatings built around your routine: DRY after you dry the car, or WET while the paint is still wet.",
    path: SHOP_PATH,
    image: "/assets/products/d204-packshot.webp",
  },
};

export const BRAND = "APGO";
