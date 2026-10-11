import "./shop.css";

// The store's pages on the one site (D41): the site's header and footer come from app/(us)/layout.js, which also loads
// the one Meta Pixel and GTM for every page (M10); this wraps the page in .shop for the store styles (shop.css, scoped
// so they never reach the brand pages).
export default function ShopLayout({ children }) {
  return <div className="shop">{children}</div>;
}
