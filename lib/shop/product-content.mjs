// A product's words, photos and price as the site shows them: the site's own product data (product-data.mjs) with what
// an owner changed in the back office on top (D52; commerce/worker/product-content.js keeps the changes). Pure data, no
// DOM: the pages (lib/shop/live-content.js), the Worker (prices, quote lines, the page HTML it sends) and the tests all
// use these same functions, so every place shows the same thing.
import { BRAND, PRODUCTS, SEO } from "./product-data.mjs";

// What an owner may change, with the longest each may be (shorter keeps the page layout).
export const TEXT_FIELDS = { name: 60, promise: 200, when: 60, lasts: 30, scope: 240, seoTitle: 70, seoDescription: 170 };
export const MAX_IMAGES = 6;
const ASSETS = "/us/assets";

// The photos the site ships with: the pack shot, then up to three application photos.
export function defaultImages(sku) {
  const p = PRODUCTS[sku];
  return [
    { src: SEO[sku].image, alt: `APGO ${p.name} ${p.size}`, fit: "contain" },
    ...p.steps.slice(0, 3).map(([file, caption]) => ({ src: `${ASSETS}/application/${file}.webp`, alt: `${p.word} application, step: ${caption}`, fit: "cover" })),
  ];
}

const seoDescriptionOf = (p, { promise, lasts }) => `${promise} ${p.size} / ${p.oz}. Lasts up to ${lasts}.`;

// The words the site ships with.
export function defaultContent(sku) {
  const p = PRODUCTS[sku];
  return { name: p.name, promise: p.promise, when: p.when, lasts: p.lasts, scope: p.scope, seoTitle: SEO[sku].title, seoDescription: SEO[sku].description, images: defaultImages(sku) };
}

// overrides: what is live for this product ({} when nothing changed). Returns every field, ready to show:
// { name, promise, when, lasts, scope, seoTitle, seoDescription, images: [{ src, alt, fit }], image (the main photo) }.
// The search description follows the words unless an owner wrote one, as the original does.
export function productContent(sku, overrides = {}) {
  const p = PRODUCTS[sku];
  const o = overrides && typeof overrides === "object" ? overrides : {};
  const text = Object.fromEntries(Object.keys(TEXT_FIELDS).map((key) => [key, typeof o[key] === "string" && o[key].trim() ? o[key] : null]));
  const merged = {
    name: text.name ?? p.name,
    promise: text.promise ?? p.promise,
    when: text.when ?? p.when,
    lasts: text.lasts ?? p.lasts,
    scope: text.scope ?? p.scope,
  };
  merged.seoTitle = text.seoTitle ?? SEO[sku].title;
  merged.seoDescription = text.seoDescription ?? seoDescriptionOf(p, merged);
  // An owner's list of photos: uploaded ones and the site's own in any order. Without a description of its own, the main
  // photo is described by the product's name, one of the site's photos keeps its own, an uploaded one gets the name.
  const listed = Array.isArray(o.images) ? o.images.filter((image) => typeof image?.src === "string" && image.src).slice(0, MAX_IMAGES) : [];
  const builtIn = new Map(defaultImages(sku).map((image) => [image.src, image]));
  merged.images = listed.length
    ? listed.map((image, index) => {
      const own = builtIn.get(image.src);
      const alt = image.alt || (index === 0 ? `APGO ${merged.name} ${p.size}` : own?.alt ?? `${p.word} · ${merged.name}`);
      return { src: image.src, alt, fit: own?.fit ?? (index === 0 ? "contain" : "cover") };
    })
    : defaultImages(sku).map((image, index) => (index === 0 ? { ...image, alt: `APGO ${merged.name} ${p.size}` } : image));
  merged.image = merged.images[0].src;
  // The "6 mo" tile on the product page: the number and a short unit from "6 months"; the whole text when not a number.
  const parts = /^(\d+(?:\.\d+)?)\s*([A-Za-z]+)/.exec(merged.lasts);
  merged.lastsValue = parts ? parts[1] : merged.lasts;
  merged.lastsUnit = parts ? UNITS[parts[2].toLowerCase()] ?? parts[2] : "";
  return merged;
}

const UNITS = { month: "mo", months: "mo", mo: "mo", week: "wk", weeks: "wk", year: "yr", years: "yrs", day: "day", days: "days" };

// What search engines show with the offer (merchant listings): delivery to the 48 contiguous states and DC (D4) in
// 3–5 business days after up to a day of handling, and returns by mail within 30 days of delivery (D13). The returns and
// shipping policies say the same; commerce/tests/policy-pages.test.mjs checks the numbers against them.
export const DELIVERY_DAYS = { handling: [0, 1], transit: [3, 5] };
export const RETURN_DAYS = 30;
const days = ([min, max]) => ({ "@type": "QuantitativeValue", minValue: min, maxValue: max, unitCode: "DAY" });
function shippingDetails(shippingCents, currency) {
  return [
    {
      "@type": "OfferShippingDetails",
      shippingRate: { "@type": "MonetaryAmount", value: (shippingCents / 100).toFixed(2), currency },
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" },
      deliveryTime: { "@type": "ShippingDeliveryTime", handlingTime: days(DELIVERY_DAYS.handling), transitTime: days(DELIVERY_DAYS.transit) },
    },
    { "@type": "OfferShippingDetails", shippingDestination: { "@type": "DefinedRegion", addressCountry: "US", addressRegion: ["AK", "HI"] }, doesNotShip: true },
  ];
}
const returnPolicy = (siteUrl) => ({
  "@type": "MerchantReturnPolicy",
  applicableCountry: "US",
  returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
  merchantReturnDays: RETURN_DAYS,
  returnMethod: "https://schema.org/ReturnByMail",
  // Changed your mind: the shopper pays the return postage (D18); damaged or wrong items are on us. ReturnShippingFees
  // would need a fixed amount (Google's Rich Results warning, 10/16), which we do not have: the carrier decides (C22).
  returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
  merchantReturnLink: new URL("/returns", siteUrl).href,
});

// The product page's schema.org data (search engines): built the same way by the page and by the Worker, so the HTML
// the Worker sends and the page's first render agree. A price only once the owner approved pricing.
export function productJsonLd(sku, content, { siteUrl, priceCents = null, currency = "USD", approved = false, onSale = true, shippingCents = null } = {}) {
  const p = PRODUCTS[sku];
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${content.name} (${p.routine === "dry" ? "DRY" : "WET"})`,
    sku: p.sku,
    description: content.seoDescription,
    brand: { "@type": "Brand", name: BRAND },
    image: [new URL(content.image, siteUrl).href],
  };
  if (approved && priceCents !== null) {
    data.offers = {
      "@type": "Offer",
      url: new URL(SEO[sku].path, siteUrl).href,
      priceCurrency: currency,
      price: (priceCents / 100).toFixed(2),
      // In stock unless an owner stopped selling it or Amazon has fewer than 5 (onSale from lib/shop/store-config.js, C4).
      availability: `https://schema.org/${onSale ? "InStock" : "OutOfStock"}`,
      ...(Number.isSafeInteger(shippingCents) ? { shippingDetails: shippingDetails(shippingCents, currency) } : {}),
      hasMerchantReturnPolicy: returnPolicy(siteUrl),
    };
  }
  return data;
}
export const jsonLdText = (data) => JSON.stringify(data).replace(/</g, "\\u003c");

// The Worker's pricing (commerce/worker/pricing.js) with what is live: the name on cart lines and emails, the price an
// owner set, and the changes the pages need (`content`). overridesBySku: { [sku]: overrides }.
export function applyContent(pricing, overridesBySku = {}) {
  const products = Object.fromEntries(Object.entries(pricing.products).map(([id, product]) => {
    const overrides = overridesBySku[id] ?? {};
    const price = Number.isSafeInteger(overrides.priceCents) && overrides.priceCents > 0 ? overrides.priceCents : null;
    // Cart lines and emails say "APGO <name>"; a new name keeps the brand in front.
    const renamed = typeof overrides.name === "string" && overrides.name.trim() ? `APGO ${overrides.name.trim()}` : null;
    return [id, { ...product, ...(renamed ? { name: renamed } : {}), ...(price ? { priceCents: price } : {}), content: overrides }];
  }));
  return { ...pricing, products };
}
