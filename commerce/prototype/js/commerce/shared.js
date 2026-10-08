// Helpers for the store pages that are still plain HTML: the v3 landing page (Add to cart buttons, landing-cart.js),
// the policy pages (cart count) and the back office (admin.js: el, money, notice, priceRows). The cart, checkout and
// product pages are Next.js pages (D41) with their own copy of the cart rules in lib/shop/cart.js: same key, same rules.

// The back office imports this module too, so the admin host must serve product-data.js (worker/hosts.js).
import { SKUS as PRODUCT_SKUS } from "./product-data.js";

const STORAGE_KEY = "apgo_us_cart_v1";
const MAX_QTY = 10;
// A line for anything that is not a product is dropped.
const SKUS = new Set(PRODUCT_SKUS);
let memory = null;

function readItems() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((i) => SKUS.has(i?.sku) && Number.isInteger(i.qty) && i.qty > 0) : [];
  } catch {
    return [];
  }
}

function writeItems(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage blocked (private mode): the cart still works for this page view.
  }
  memory = items;
  window.dispatchEvent(new CustomEvent("apgo:cart-updated", { detail: { items } }));
}

export const cart = {
  items() {
    return memory ?? (memory = readItems());
  },
  count() {
    return cart.items().reduce((sum, i) => sum + i.qty, 0);
  },
  add(sku, qty = 1, extra = {}) {
    if (!SKUS.has(sku)) return;
    const items = cart.items().map((i) => ({ ...i }));
    const line = items.find((i) => i.sku === sku);
    if (line) line.qty = Math.min(MAX_QTY, line.qty + qty);
    else items.push({ sku, qty: Math.min(MAX_QTY, qty) });
    writeItems(items);
    track("add_to_cart", { sku, quantity: qty, ...extra });
  },
};

export const money = (cents) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export function track(eventName, parameters = {}) {
  const payload = { event: eventName, ...parameters };
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
  window.dispatchEvent(new CustomEvent("apgo:analytics", { detail: payload }));
}

// Small DOM builder: text is always set via textContent, never parsed as HTML.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// rows: [{ label, value, free? }]
export function priceRows(rows, total, totalLabel = "Total") {
  const dl = el("dl", { class: "price-rows" });
  for (const row of rows) {
    dl.append(el("div", { class: `price-row${row.free ? " price-row--free" : ""}` }, el("dt", {}, row.label), el("dd", {}, row.value)));
  }
  if (total) dl.append(el("div", { class: "price-row price-row--total" }, el("dt", {}, totalLabel), el("dd", {}, total)));
  return dl;
}

for (const node of document.querySelectorAll("[data-year]")) node.textContent = String(new Date().getFullYear());

export function notice(tone, title, body) {
  return el(
    "div",
    { class: `notice notice--${tone}`, role: tone === "warning" ? "alert" : "status" },
    title && el("span", { class: "notice__title" }, title),
    el("span", { class: "notice__body" }, body),
  );
}

export function renderCartCount() {
  for (const node of document.querySelectorAll("[data-cart-count]")) node.textContent = String(cart.count());
}

// Any page can add products with <button data-add-to-cart="d204">.
document.addEventListener("click", (event) => {
  const trigger = event.target.closest?.("[data-add-to-cart]");
  if (!trigger) return;
  event.preventDefault();
  cart.add(trigger.getAttribute("data-add-to-cart"), 1, trigger.dataset.placement ? { placement: trigger.dataset.placement } : {});
  if (trigger.hasAttribute("data-go-to-cart")) window.location.href = "/cart";
});

window.addEventListener("apgo:cart-updated", renderCartCount);
window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY) return;
  memory = null;
  renderCartCount();
  window.dispatchEvent(new CustomEvent("apgo:cart-updated", { detail: { items: cart.items() } }));
});
