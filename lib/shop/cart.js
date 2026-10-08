// The cart (M3 §2): the shopper's browser keeps only { sku, qty } lines, under one key, no account needed. Every price
// is quoted by the Worker. The key is the one the old plain HTML store pages used, so a cart from before the move
// carries over.
import { useMemo, useSyncExternalStore } from "react";
import { PRODUCTS } from "@/lib/shop/catalog";
import { track } from "@/lib/us/analytics";

export const CART_KEY = "apgo_us_cart_v1";
export const MAX_QTY = 10;
export const CART_UPDATED = "apgo:cart-updated";

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

// The stored text, unparsed: the same string while nothing changes (useSyncExternalStore compares snapshots).
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
  window.dispatchEvent(new CustomEvent(CART_UPDATED, { detail: { items } }));
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

export function setCartQty(sku, qty) {
  const clamped = Math.max(1, Math.min(MAX_QTY, qty));
  write(cartItems().map((line) => (line.sku === sku ? { ...line, qty: clamped } : line)));
}

export function removeFromCart(sku) {
  write(cartItems().filter((line) => line.sku !== sku));
  track("remove_from_cart", { sku });
}

export const clearCart = () => write([]);

export function subscribeCart(onChange) {
  const onStorage = (event) => {
    if (event.key === null || event.key === CART_KEY) onChange();
  };
  window.addEventListener(CART_UPDATED, onChange); // this page changed it
  window.addEventListener("storage", onStorage); // another tab did
  window.addEventListener("pageshow", onChange); // back from another page through the back/forward cache
  return () => {
    window.removeEventListener(CART_UPDATED, onChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pageshow", onChange);
  };
}

// 0 on the server and in the first client render (no hydration mismatch), then the real numbers.
export const useCartCount = () => useSyncExternalStore(subscribeCart, () => cartCount(), () => 0);
export const useCartQty = (sku) =>
  useSyncExternalStore(subscribeCart, () => cartItems().find((line) => line.sku === sku)?.qty ?? 0, () => 0);

// The cart's lines, following every change; null until the browser has been read (the server and the first render).
export function useCartItems() {
  const raw = useSyncExternalStore(subscribeCart, readRaw, () => null);
  return useMemo(() => (raw === null ? null : parseCart(raw)), [raw]);
}
