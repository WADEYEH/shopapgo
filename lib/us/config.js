// Runtime configuration for the US site. All values come from NEXT_PUBLIC_* env vars
// so they can be set per-environment on Vercel without a code change.
// See .env.example for the full list.

const bool = (v, fallback = false) => (v == null || v === "" ? fallback : v === "true" || v === "1");
const str = (v, fallback = "") => (v == null ? fallback : v);

export const AMAZON_URL_RE = /^https:\/\/([a-z0-9-]+\.)*amazon\.com\//i;
// Container IDs are always GTM- followed by uppercase alphanumerics. This allowlist is
// what makes it safe to interpolate the value into the inline loader in
// components/us/GtmScripts.js: quotes and "</script" cannot be represented.
export const GTM_ID_RE = /^GTM-[A-Z0-9]{4,10}$/;

export const config = {
  supportEmail: str(process.env.NEXT_PUBLIC_APGO_US_SUPPORT_EMAIL),
  // Master switch: CTAs stay disabled until this is true AND the product's own linkReady is true.
  linksReady: bool(process.env.NEXT_PUBLIC_APGO_US_LINKS_READY, false),
  videoReady: bool(process.env.NEXT_PUBLIC_APGO_US_VIDEO_READY, false),
  // Analytics is off everywhere by default. Set this true only in the Vercel Production
  // environment, so local dev and preview deploys never reach GA4. NODE_ENV is no use
  // here: Vercel builds previews with NODE_ENV="production" too.
  analyticsReady: bool(process.env.NEXT_PUBLIC_APGO_US_ANALYTICS_READY, false),
  gtmId: str(process.env.NEXT_PUBLIC_APGO_US_GTM_ID).trim(),
  // Amazon Attribution / Associates query string, e.g. "maas=maas_adg_...&ref_=aa_maas".
  // Raw query-string form with no leading "?"; a per-product value overrides this one.
  amazonAttribution: str(process.env.NEXT_PUBLIC_APGO_US_AMAZON_ATTRIBUTION),
  showOrigin: bool(process.env.NEXT_PUBLIC_APGO_US_SHOW_ORIGIN, true),
  rankSource: str(process.env.NEXT_PUBLIC_APGO_US_RANK_SOURCE, "By retail sales volume in Taiwan"),
  products: {
    d204: {
      amazonUrl: str(process.env.NEXT_PUBLIC_APGO_US_D204_AMAZON_URL),
      linkReady: bool(process.env.NEXT_PUBLIC_APGO_US_D204_LINK_READY, false),
      washResistance: str(process.env.NEXT_PUBLIC_APGO_US_D204_WASH_RESISTANCE),
      amazonAttribution: str(process.env.NEXT_PUBLIC_APGO_US_D204_AMAZON_ATTRIBUTION),
    },
    d215: {
      amazonUrl: str(process.env.NEXT_PUBLIC_APGO_US_D215_AMAZON_URL),
      linkReady: bool(process.env.NEXT_PUBLIC_APGO_US_D215_LINK_READY, false),
      washResistance: str(process.env.NEXT_PUBLIC_APGO_US_D215_WASH_RESISTANCE),
      amazonAttribution: str(process.env.NEXT_PUBLIC_APGO_US_D215_AMAZON_ATTRIBUTION),
    },
  },
};

// Returns the GTM container ID when every gate passes, otherwise undefined.
export function gtmContainerId() {
  return config.analyticsReady && GTM_ID_RE.test(config.gtmId) ? config.gtmId : undefined;
}

// Attribution keys stay conservative; anything unexpected is dropped rather than guessed at.
const ATTRIBUTION_KEY_RE = /^[A-Za-z0-9_-]{1,32}$/;
const ATTRIBUTION_VALUE_MAX = 200;

// Merges a raw query string into an already-validated Amazon URL. Parse and re-serialise
// only, never string concatenation: `set` cannot touch scheme, host or port, it encodes
// "&" and "#" inside values, and it merges with an existing query string without guessing
// between "?" and "&". Any problem returns the untouched base URL, because a broken
// tracking tag must never cost a sale.
export function withAttribution(base, params, tokens = {}) {
  if (!params) return base;
  try {
    const url = new URL(base);
    const extra = new URLSearchParams(String(params).replace(/^[?&]+/, ""));
    for (const [key, raw] of extra) {
      if (!ATTRIBUTION_KEY_RE.test(key)) continue;
      const value = raw
        .replace(/\{sku\}/g, tokens.sku || "")
        .replace(/\{placement\}/g, tokens.placement || "");
      if (!value || value.length > ATTRIBUTION_VALUE_MAX) continue;
      url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    return base;
  }
}

// Returns the Amazon URL for a sku when every gate passes, otherwise undefined.
// Attribution is layered on only after the destination itself has been validated, and the
// result is re-validated, so the string handed to the DOM always matches AMAZON_URL_RE.
// Keep attribution values deterministic: this runs during SSR and again on hydration, so
// anything random or time-based would produce two different hrefs.
export function amazonUrlFor(sku, placement) {
  const p = config.products[sku];
  if (!p) return undefined;
  const base = p.amazonUrl || "";
  if (!config.linksReady || !p.linkReady || !AMAZON_URL_RE.test(base)) return undefined;
  const tagged = withAttribution(base, p.amazonAttribution || config.amazonAttribution, { sku, placement });
  return AMAZON_URL_RE.test(tagged) ? tagged : base;
}
