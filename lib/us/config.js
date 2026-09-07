// Runtime configuration for the US site. All values come from NEXT_PUBLIC_* env vars
// so they can be set per-environment on Vercel without a code change.
// See .env.example for the full list.

const bool = (v, fallback = false) => (v == null || v === "" ? fallback : v === "true" || v === "1");
const str = (v, fallback = "") => (v == null ? fallback : v);

export const AMAZON_URL_RE = /^https:\/\/([a-z0-9-]+\.)*amazon\.com\//i;

export const config = {
  supportEmail: str(process.env.NEXT_PUBLIC_APGO_US_SUPPORT_EMAIL),
  // Master switch: CTAs stay disabled until this is true AND the product's own linkReady is true.
  linksReady: bool(process.env.NEXT_PUBLIC_APGO_US_LINKS_READY, false),
  videoReady: bool(process.env.NEXT_PUBLIC_APGO_US_VIDEO_READY, false),
  showOrigin: bool(process.env.NEXT_PUBLIC_APGO_US_SHOW_ORIGIN, true),
  rankSource: str(process.env.NEXT_PUBLIC_APGO_US_RANK_SOURCE, "By retail sales volume in Taiwan"),
  products: {
    d204: {
      amazonUrl: str(process.env.NEXT_PUBLIC_APGO_US_D204_AMAZON_URL),
      linkReady: bool(process.env.NEXT_PUBLIC_APGO_US_D204_LINK_READY, false),
      washResistance: str(process.env.NEXT_PUBLIC_APGO_US_D204_WASH_RESISTANCE),
    },
    d215: {
      amazonUrl: str(process.env.NEXT_PUBLIC_APGO_US_D215_AMAZON_URL),
      linkReady: bool(process.env.NEXT_PUBLIC_APGO_US_D215_LINK_READY, false),
      washResistance: str(process.env.NEXT_PUBLIC_APGO_US_D215_WASH_RESISTANCE),
    },
  },
};

// Returns the Amazon URL for a sku when every gate passes, otherwise undefined.
export function amazonUrlFor(sku) {
  const p = config.products[sku];
  if (!p) return undefined;
  const ok = config.linksReady && p.linkReady && AMAZON_URL_RE.test(p.amazonUrl || "");
  return ok ? p.amazonUrl : undefined;
}
