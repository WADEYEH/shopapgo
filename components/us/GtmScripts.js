import Script from "next/script";
import { gtmContainerId } from "@/lib/us/config";

// Loads the Google Tag Manager container, and only when the runtime gates pass
// (see gtmContainerId in lib/us/config.js). GA4 is configured inside the container,
// so no measurement ID appears anywhere in this repo.
//
// One inline snippet rather than two <Script> tags: Next does not guarantee ordering
// between two afterInteractive scripts, and the gtm.start push has to land before
// gtm.js initialises or the container's Initialization trigger may not fire. Writing
// it as a single IIFE makes that ordering structural. Interpolating the ID into a JS
// string is safe because GTM_ID_RE allows only [A-Z0-9-].
//
// afterInteractive, not beforeInteractive: the container is ~100 KB and belongs behind
// LCP. Nothing is lost by loading late, because lib/us/analytics.js initialises
// window.dataLayer itself, so events fired before the container arrives sit in the
// array and GTM replays them in order.
//
// No <noscript> iframe. The GA4 tag does not run in it, and with JavaScript disabled
// every event on this site is dead anyway — they are all client component handlers.
export default function GtmScripts() {
  const id = gtmContainerId();
  if (!id) return null;
  return (
    <Script
      id="gtm-loader"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html:
          "(function(w,d,s,l,i){w[l]=w[l]||[];" +
          "w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});" +
          "var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;" +
          "j.src='https://www.googletagmanager.com/gtm.js?id='+i;" +
          "f.parentNode.insertBefore(j,f);" +
          "})(window,document,'script','dataLayer'," + JSON.stringify(id) + ");",
      }}
    />
  );
}
