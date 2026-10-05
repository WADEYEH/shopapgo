// Reserved for a future Taiwan storefront. The domain root "/" now serves the US
// homepage (app/(us)/page.js). Do not add a competing page.js here without moving
// the US landing off "/".
import { SITE_URL } from "@/lib/site";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Shop APGO",
  description: "APGO 汽車護理 官方商城",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-Hant">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>{children}</body>
    </html>
  );
}
