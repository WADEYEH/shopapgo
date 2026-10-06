// Runtime configuration for the US site. All values come from NEXT_PUBLIC_* env vars
// so they can be set per-environment without a code change.
// See .env.example for the full list.

const bool = (v, fallback = false) => (v == null || v === "" ? fallback : v === "true" || v === "1");
const str = (v, fallback = "") => (v == null ? fallback : v);

// Container IDs are always GTM- followed by uppercase alphanumerics. This allowlist is
// what makes it safe to interpolate the value into the inline loader in
// components/us/GtmScripts.js: quotes and "</script" cannot be represented.
export const GTM_ID_RE = /^GTM-[A-Z0-9]{4,10}$/;
// Meta Pixel (dataset) IDs are plain digits. Same reason as above: digits only means the
// value is safe to interpolate into the inline loader in components/us/MetaPixel.js.
export const META_PIXEL_ID_RE = /^\d{8,20}$/;

export const config = {
  supportEmail: str(process.env.NEXT_PUBLIC_APGO_US_SUPPORT_EMAIL),
  videoReady: bool(process.env.NEXT_PUBLIC_APGO_US_VIDEO_READY, false),
  // Analytics is off everywhere by default. Set this true only in the production
  // environment, so local dev and preview deploys never reach GA4. NODE_ENV is no use
  // here: preview builds also run with NODE_ENV="production".
  analyticsReady: bool(process.env.NEXT_PUBLIC_APGO_US_ANALYTICS_READY, false),
  gtmId: str(process.env.NEXT_PUBLIC_APGO_US_GTM_ID).trim(),
  metaPixelId: str(process.env.NEXT_PUBLIC_APGO_US_META_PIXEL_ID).trim(),
  showOrigin: bool(process.env.NEXT_PUBLIC_APGO_US_SHOW_ORIGIN, true),
  rankSource: str(process.env.NEXT_PUBLIC_APGO_US_RANK_SOURCE, "By retail sales volume in Taiwan"),
  products: {
    d204: {
      washResistance: str(process.env.NEXT_PUBLIC_APGO_US_D204_WASH_RESISTANCE),
    },
    d215: {
      washResistance: str(process.env.NEXT_PUBLIC_APGO_US_D215_WASH_RESISTANCE),
    },
  },
};

// Returns the GTM container ID when every gate passes, otherwise undefined.
export function gtmContainerId() {
  return config.analyticsReady && GTM_ID_RE.test(config.gtmId) ? config.gtmId : undefined;
}

// Returns the Meta Pixel ID when every gate passes (same analyticsReady switch as GTM), otherwise undefined.
export function metaPixelId() {
  return config.analyticsReady && META_PIXEL_ID_RE.test(config.metaPixelId) ? config.metaPixelId : undefined;
}
