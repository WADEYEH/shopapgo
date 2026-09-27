// Single source of truth for every internal URL on the US site.
// To promote the US site to the root of the domain later, change US_BASE to ""
// and add redirects from the old /us/* paths in next.config.mjs.
export const US_BASE = "/us";

export const routes = {
  home: US_BASE || "/",
  compare: `${US_BASE}/#compare`,
  faq: `${US_BASE}/#faq`,
  final: `${US_BASE}/#final`,
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
  typesOfCarPaintProtection: `${US_BASE}/guides/types-of-car-paint-protection`,
  whatIsSprayCeramicCoating: `${US_BASE}/guides/what-is-spray-ceramic-coating`,
  ceramicSprayVsCoating: `${US_BASE}/guides/ceramic-spray-vs-ceramic-coating`,
  whatIsCarGlaze: `${US_BASE}/guides/what-is-car-glaze`,
  howToPrepCarForCeramicSpray: `${US_BASE}/guides/how-to-prep-car-for-ceramic-spray`,
  howToRemoveWaxBeforeCeramicCoating: `${US_BASE}/guides/how-to-remove-wax-before-ceramic-coating`,
  howLongToWaitToWashAfterCeramicSpray: `${US_BASE}/guides/how-long-to-wait-to-wash-after-ceramic-spray`,
  ceramicCoatingMaintenance: `${US_BASE}/guides/ceramic-coating-maintenance`,
  howToWashCeramicCoatedCar: `${US_BASE}/guides/how-to-wash-a-ceramic-coated-car`,
  ceramicSprayStreaksHighSpots: `${US_BASE}/guides/ceramic-spray-streaks-high-spots`,
  // Placeholders until legal pages exist.
  privacy: "#",
  terms: "#",
  contact: "#",
};

// Static files live in public/us/assets/**.
export const asset = (path) => `${US_BASE}/assets/${path}`;
