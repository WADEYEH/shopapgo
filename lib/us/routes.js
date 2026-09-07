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
  // Placeholders until legal pages exist.
  privacy: "#",
  terms: "#",
  contact: "#",
};

// Static files live in public/us/assets/**.
export const asset = (path) => `${US_BASE}/assets/${path}`;
