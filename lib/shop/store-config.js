// What the Worker says about the store (GET /api/store/config): prices, currency, quantity limit, which products are on
// sale, whether pricing is approved. Asked once per page; every component that needs it shares the answer.
import { useEffect, useState } from "react";

let request = null;

export function loadStoreConfig() {
  request ??= fetch("/api/store/config")
    .then((response) => (response.ok ? response.json() : null))
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

export const priceCents = (config, sku) => {
  const cents = config?.products?.[sku]?.priceCents;
  return typeof cents === "number" ? cents : null;
};

export const money = (cents, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

export const priceText = (cents, currency) => (typeof cents === "number" ? money(cents, currency) : "—");
