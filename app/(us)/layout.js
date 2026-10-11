import "./us.css";
import { barlow, barlowCondensed } from "./fonts";
import SiteChrome from "@/components/us/SiteChrome";
import SiteFooter from "@/components/us/SiteFooter";
import Script from "next/script";
import GtmScripts from "@/components/us/GtmScripts";
import { config } from "@/lib/us/config";
import { SITE_URL } from "@/lib/site";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "APGO Auto Care · US", template: "%s · APGO" },
  description: "APGO Atomic Colored Glaze and Atomic Glaze Coating. Professional finish care, made simple. Shop D204 and D215 on this site.",
  openGraph: { siteName: "APGO", type: "website", locale: "en_US" },
};

export default function USLayout({ children }) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`} data-honor-gpc={config.honorGpc ? "true" : "false"}>
      <body className="us-site">
        <SiteChrome footer={<SiteFooter />}>{children}</SiteChrome>
        <GtmScripts />
        {/* The one Meta Pixel for every page, brand and store (M10-07); it stays silent off the store hostnames. */}
        <Script src="/js/meta-pixel.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
