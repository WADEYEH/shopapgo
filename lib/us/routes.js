// Single source of truth for every internal URL on the US site.
// Homepage lives at domain root; guides and static assets stay under /us.
export const US_BASE = "/us";

// The single site (D37): the brand pages and the store pages come from one Worker on one host, so the store links
// below are same-host paths. Only builds for that site set NEXT_PUBLIC_APGO_US_SINGLE_SITE=true: the test site now
// (commerce/scripts/build-site.mjs), www after the cutover. Every other build (the live www until then, previews)
// keeps today's links: no Shop or cart in the chrome, product buttons to /products/d204 and /products/d215.
export const singleSite = process.env.NEXT_PUBLIC_APGO_US_SINGLE_SITE === "true";
const onSingleSite = (path) => (singleSite ? path : "#");

export const routes = {
  home: "/",
  compare: "/#compare",
  faq: "/#faq",
  final: "/#final",
  guides: `${US_BASE}/guides`,
  afterWashing: `${US_BASE}/guides/after-washing-your-car`,
  wetOrDry: `${US_BASE}/guides/wet-or-dry-application`,
  coloredGlaze: `${US_BASE}/guides/how-to-apply-colored-glaze`,
  glazeCoating: `${US_BASE}/guides/how-to-apply-glaze-coating`,
  waxVsSprayCoating: `${US_BASE}/guides/car-wax-vs-spray-ceramic-coating`,
  coatingOverWax: `${US_BASE}/guides/can-i-apply-ceramic-coating-over-wax`,
  howOftenReapply: `${US_BASE}/guides/how-often-to-apply-ceramic-spray-coating`,
  autoWashCoating: `${US_BASE}/guides/does-an-automatic-car-wash-remove-ceramic-coating`,
  rainDamageCoating: `${US_BASE}/guides/does-rain-damage-ceramic-coating`,
  diyVsPro: `${US_BASE}/guides/diy-ceramic-coating-vs-professional`,
  // Batch 1 guides
  paintProtectionTypes: `${US_BASE}/guides/types-of-car-paint-protection`,
  whatIsSprayCeramic: `${US_BASE}/guides/what-is-spray-ceramic-coating`,
  sprayVsCoating: `${US_BASE}/guides/ceramic-spray-vs-ceramic-coating`,
  whatIsCarGlaze: `${US_BASE}/guides/what-is-car-glaze`,
  prepForSpray: `${US_BASE}/guides/how-to-prep-car-for-ceramic-spray`,
  removeWaxFirst: `${US_BASE}/guides/how-to-remove-wax-before-ceramic-coating`,
  waitToWash: `${US_BASE}/guides/how-long-to-wait-to-wash-after-ceramic-spray`,
  coatingMaintenance: `${US_BASE}/guides/ceramic-coating-maintenance`,
  washCoatedCar: `${US_BASE}/guides/how-to-wash-a-ceramic-coated-car`,
  streaksHighSpots: `${US_BASE}/guides/ceramic-spray-streaks-high-spots`,
  // Batch 2 guides (early)
  winterWash: `${US_BASE}/guides/how-to-wash-your-car-in-winter`,
  coatingScratches: `${US_BASE}/guides/does-ceramic-coating-prevent-scratches`,
  // Batch 2 guides (#13, #21, #26, #30, #51)
  isSprayWorthIt: `${US_BASE}/guides/is-ceramic-spray-worth-it`,
  chooseCoatingSpray: `${US_BASE}/guides/how-to-choose-a-ceramic-coating`,
  clayBarFirst: `${US_BASE}/guides/clay-bar-before-ceramic-coating`,
  detailingSteps: `${US_BASE}/guides/exterior-car-detailing-steps`,
  windshieldCoating: `${US_BASE}/guides/ceramic-coating-on-windshield`,
  // Store pages (Worker routes, not under US_BASE): the overview, the cart and the policy pages. "#" where they are
  // not on this host keeps the link out (SiteChrome, SiteFooter).
  shop: onSingleSite("/products"),
  cart: onSingleSite("/cart"),
  checkout: onSingleSite("/checkout"),
  privacy: onSingleSite("/privacy"),
  terms: onSingleSite("/terms"),
  returns: onSingleSite("/returns"),
  shipping: onSingleSite("/shipping"),
  contact: onSingleSite("/contact"),
};

// Same-host store product pages (Worker routes). These are not under US_BASE. The named URLs (D39) are the single
// site's; the live www keeps the SKU URLs until the cutover, and the Worker 301s those afterwards.
export const store = singleSite
  ? { d204: "/products/atomic-colored-glaze", d215: "/products/atomic-glaze-coating" }
  : { d204: "/products/d204", d215: "/products/d215" };

export function productPathFor(sku) {
  return store[sku];
}

// Static files live in public/us/assets/**.
export const asset = (path) => `${US_BASE}/assets/${path}`;
