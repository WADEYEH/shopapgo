import "./us.css";
import { barlow, barlowCondensed } from "./fonts";
import SiteChrome from "@/components/us/SiteChrome";
import SiteFooter from "@/components/us/SiteFooter";
import GtmScripts from "@/components/us/GtmScripts";
import MetaPixel from "@/components/us/MetaPixel";
import { SITE_URL } from "@/lib/site";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "APGO Auto Care · US", template: "%s · APGO" },
  description: "APGO Atomic Colored Glaze and Atomic Glaze Coating. Professional finish care, made simple. Shop D204 and D215 on this site.",
  openGraph: { siteName: "APGO", type: "website", locale: "en_US" },
};

export default function USLayout({ children }) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <body className="us-site">
        <SiteChrome footer={<SiteFooter />}>{children}</SiteChrome>
        <GtmScripts />
        <MetaPixel />
      </body>
    </html>
  );
}
