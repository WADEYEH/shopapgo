// The cart (M3 §2): the shopper's browser keeps only { sku, qty } lines, under one key, no account needed. Every price
// is quoted by the Worker. The cart and checkout pages that are still plain HTML (commerce/prototype/js/commerce/shared.js)
// read and write the same key with the same rules, so a product added here is in their cart too.
import { useSyncExternalStore } from "react";
import { PRODUCTS } from "@/lib/shop/catalog";
import { track } from "@/lib/us/analytics";

export const CART_KEY = "apgo_us_cart_v1";
export const MAX_QTY = 10;
const UPDATED = "apgo:cart-updated";

let memory = "[]"; // storage blocked (private mode): the cart still works for this page view

const validLine = (line) => Boolean(PRODUCTS[line?.sku]) && Number.isInteger(line.qty) && line.qty > 0;

export function parseCart(raw) {
  try {
    const items = JSON.parse(raw || "[]");
    return Array.isArray(items) ? items.filter(validLine) : [];
  } catch {
    return [];
  }
}

function readRaw() {
  try {
    return window.localStorage.getItem(CART_KEY) ?? memory;
  } catch {
    return memory;
  }
}

export const cartItems = () => parseCart(readRaw());
export const cartCount = (items = cartItems()) => items.reduce((sum, line) => sum + line.qty, 0);

function write(items) {
  memory = JSON.stringify(items);
  try {
    window.localStorage.setItem(CART_KEY, memory);
  } catch {
    // Private mode: kept in memory for this page view.
  }
  window.dispatchEvent(new CustomEvent(UPDATED, { detail: { items } }));
}

// extra: analytics fields for add_to_cart (placement, value, currency, items); the Meta Pixel listens to it.
export function addToCart(sku, qty = 1, extra = {}) {
  if (!PRODUCTS[sku]) return;
  const items = cartItems().map((line) => ({ ...line }));
  const line = items.find((item) => item.sku === sku);
  if (line) line.qty = Math.min(MAX_QTY, line.qty + qty);
  else items.push({ sku, qty: Math.min(MAX_QTY, qty) });
  write(items);
  track("add_to_cart", { sku, quantity: qty, ...extra });
}

export function subscribeCart(onChange) {
  const onStorage = (event) => {
    if (event.key === null || event.key === CART_KEY) onChange();
  };
  window.addEventListener(UPDATED, onChange); // this page added something
  window.addEventListener("storage", onStorage); // another tab did
  window.addEventListener("pageshow", onChange); // back from another page through the back/forward cache
  return () => {
    window.removeEventListener(UPDATED, onChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pageshow", onChange);
  };
}

// 0 on the server and in the first client render (no hydration mismatch), then the real numbers.
export const useCartCount = () => useSyncExternalStore(subscribeCart, () => cartCount(), () => 0);
export const useCartQty = (sku) =>
  useSyncExternalStore(subscribeCart, () => cartItems().find((line) => line.sku === sku)?.qty ?? 0, () => 0);
