// Single source of truth for every internal URL on the US site.
// Homepage lives at domain root; guides and static assets stay under /us.
export const US_BASE = "/us";

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
  // Placeholders until legal pages exist.
  privacy: "#",
  terms: "#",
  contact: "#",
};

// Same-host store product pages (Worker routes). These are not under US_BASE.
export const store = {
  d204: "/products/d204",
  d215: "/products/d215",
};

export function productPathFor(sku) {
  return store[sku];
}

// Static files live in public/us/assets/**.
export const asset = (path) => `${US_BASE}/assets/${path}`;
