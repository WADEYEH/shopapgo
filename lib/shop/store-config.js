// What the Worker says about the store (GET /api/store/config): prices, currency, quantity limit, which products are on
// sale, whether pricing is approved, and for checkout the states, shipping methods and payment methods. Asked once per
// page; every component that needs it shares the answer.
import { useEffect, useState } from "react";
import { api } from "@/lib/shop/api";

let request = null;

// Throws ApiError (with the Worker's message) when there is no config.
export const fetchStoreConfig = () => api("/api/store/config");

export function loadStoreConfig() {
  request ??= fetchStoreConfig()
    .catch(() => null)
    .then((config) => {
      if (!config) request = null; // no answer: the next page view asks again
      return config;
    });
  return request;
}

// { status: "loading" | "ready" | "unavailable", config }
export function useStoreConfig() {
  const [state, setState] = useState({ status: "loading", config: null });
  useEffect(() => {
    let current = true;
    loadStoreConfig().then((config) => {
      if (current) setState({ status: config ? "ready" : "unavailable", config });
    });
    return () => {
      current = false;
    };
  }, []);
  return state;
}

// Shipping and tax terms are placeholders until the owner approves pricing (PRICING_APPROVED): the cart and checkout
// mark them "[TO CONFIRM]" while this is true.
export const isEstimate = (config) => config?.estimate === true;

// Whether the product can be bought now: false when the Worker says an owner stopped selling it
// (commerce/worker/products.js) or it is out of stock at Amazon (commerce/worker/inventory.js); while the config loads,
// or without one, the page offers the product and the Worker's quote decides.
export const onSale = (config, sku) => config?.products?.[sku]?.onSale !== false && config?.products?.[sku]?.inStock !== false;

// Out of stock at Amazon (fewer than 5), and not stopped by an owner: the pages say "Out of stock" rather than "Not
// available right now".
export const outOfStock = (config, sku) => config?.products?.[sku]?.onSale !== false && config?.products?.[sku]?.inStock === false;

export const priceCents = (config, sku) => {
  const cents = config?.products?.[sku]?.priceCents;
  return typeof cents === "number" ? cents : null;
};

export const money = (cents, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

export const priceText = (cents, currency) => (typeof cents === "number" ? money(cents, currency) : "—");
