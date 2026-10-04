import Script from "next/script";
import { metaPixelId } from "@/lib/us/config";

// Loads the Meta (Facebook) Pixel, and only when the runtime gates pass (see
// metaPixelId in lib/us/config.js: the same analyticsReady switch as GTM plus a
// well-formed numeric dataset ID). The Pixel ID is public, but it still comes from
// NEXT_PUBLIC_APGO_US_META_PIXEL_ID so previews and local dev never reach Meta.
//
// This is Meta's standard base code in one inline snippet (same reasoning as
// GtmScripts: fbq must exist and be queued before init/track run). The guard on
// window.fbq means a pixel that something else already installed is never
// initialised twice. The GTM container does not contain a Meta tag, so a direct
// install does not duplicate anything.
//
// Only PageView is sent from here. Conversion events for the store (ViewContent,
// AddToCart, InitiateCheckout, Purchase) live in the cart site, not on this one.
// The one custom event is AmazonClick, sent by lib/us/analytics.js.
//
// Interpolating the ID into the snippet is safe because META_PIXEL_ID_RE allows only digits.
export default function MetaPixel() {
  const id = metaPixelId();
  if (!id) return null;
  return (
    <Script
      id="meta-pixel-loader"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html:
          "(function(f,b,e,v){if(f.fbq)return;" +
          "var n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};" +
          "if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];" +
          "var t=b.createElement(e);t.async=!0;t.src=v;" +
          "var s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s);" +
          "f.fbq('init'," + JSON.stringify(id) + ");f.fbq('track','PageView');" +
          "})(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');",
      }}
    />
  );
}
