import Script from "next/script";
import "./shop.css";

// The store's pages on the one site (D41): the site's header and footer come from app/(us)/layout.js; this wraps the
// page in .shop for the store styles (shop.css, scoped so they never reach the brand pages) and loads the store's Meta
// Pixel script, which only runs on the store hostnames (public/js/meta-pixel.js). Unifying it with the brand
// pixel is M10's job, before the cutover.
export default function ShopLayout({ children }) {
  return (
    <div className="shop">
      {children}
      <Script src="/js/meta-pixel.js" strategy="afterInteractive" />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img height="1" width="1" style={{ display: "none" }} alt="" src="https://www.facebook.com/tr?id=2606879866471418&ev=PageView&noscript=1" />
      </noscript>
    </div>
  );
}
