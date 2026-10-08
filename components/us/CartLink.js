"use client";

import { useCartCount } from "@/lib/shop/cart";
import { routes } from "@/lib/us/routes";

// The cart in the site header and menu. The count comes from the store's own cart (lib/shop/cart.js) and follows it
// live: an add on this page, another tab, or a page restored from the back/forward cache.
// Used only on the single site (routes.singleSite), where the cart is on the same host.

// Header: cart icon, "Cart" (hidden on phones) and the count (hidden while the cart is empty).
export default function CartLink() {
  const count = useCartCount();
  return (
    <a href={routes.cart} className="us-cart-link" aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`} data-cart-link>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 4h2.5l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.1a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.2" />
        <circle cx="9.5" cy="19.5" r="1.3" />
        <circle cx="17" cy="19.5" r="1.3" />
      </svg>
      <span className="us-cart-label">Cart</span>
      <span className="us-cart-count" data-cart-count hidden={count === 0}>{count}</span>
    </a>
  );
}

// Mobile menu row: "Cart · 2 →".
export function CartRow({ onClick }) {
  const count = useCartCount();
  return (
    <a className="us-drawer-home" href={routes.cart} onClick={onClick}>
      Cart · {count} <span aria-hidden="true">→</span>
    </a>
  );
}
