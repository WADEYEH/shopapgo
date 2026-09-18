// No <GtmScripts /> here on purpose. "/" is 308-redirected to /us by next.config.mjs,
// so this layout never loads today. When the Taiwan storefront takes over "/", mount
// the same component behind its own NEXT_PUBLIC_APGO_TW_* pair rather than reusing the
// US container: the two markets want separate GA4 properties.
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
