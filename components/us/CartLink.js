"use client";

import { useEffect, useState } from "react";
import { routes } from "@/lib/us/routes";

// The cart belongs to the store pages (commerce/prototype/js/commerce/shared.js): same localStorage key and the same
// rule for a valid line. The brand pages only read it to show the count; products are added on the store pages.
// Used only on the single site (routes.singleSite), where the cart is on the same host.
export const CART_KEY = "apgo_us_cart_v1";
const SKUS = ["d204", "d215"];

export function cartCount(raw) {
  try {
    const items = JSON.parse(raw || "[]");
    if (!Array.isArray(items)) return 0;
    return items
      .filter((item) => SKUS.includes(item?.sku) && Number.isInteger(item.qty) && item.qty > 0)
      .reduce((sum, item) => sum + item.qty, 0);
  } catch {
    return 0;
  }
}

function readCount() {
  try {
    return cartCount(window.localStorage.getItem(CART_KEY));
  } catch {
    return 0; // storage blocked: same as an empty cart
  }
}

// 0 on the server and on the first client render (no hydration mismatch), then the real count.
export function useCartCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => setCount(readCount());
    const onStorage = (event) => {
      if (event.key === null || event.key === CART_KEY) update();
    };
    update();
    window.addEventListener("storage", onStorage); // the cart changed in another tab
    window.addEventListener("pageshow", update); // back from a store page through the back/forward cache
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", update);
    };
  }, []);
  return count;
}

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
