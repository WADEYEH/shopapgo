// Shared cart state and helpers for cart.html and checkout.html.
// The cart in localStorage holds only { sku, qty }; every price shown comes from
// the Worker's /api/cart/quote response.

// The admin page imports this module too, so the admin host must serve product-data.js (worker/hosts.js).
import { PRODUCT_SLUGS } from "./product-data.js";

const STORAGE_KEY = "apgo_us_cart_v1";
const MAX_QTY = 10;
let memory = null;

export const PRODUCT_IMAGES = {
  d204: "assets/products/d204-packshot.webp",
  d215: "assets/products/d215-packshot.webp",
};

function readItems() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((i) => PRODUCT_IMAGES[i?.sku] && Number.isInteger(i.qty) && i.qty > 0)
      : [];
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
    if (!PRODUCT_IMAGES[sku]) return;
    const items = cart.items().map((i) => ({ ...i }));
    const line = items.find((i) => i.sku === sku);
    if (line) line.qty = Math.min(MAX_QTY, line.qty + qty);
    else items.push({ sku, qty: Math.min(MAX_QTY, qty) });
    writeItems(items);
    track("add_to_cart", { sku, quantity: qty, ...extra });
  },
  setQty(sku, qty) {
    const clamped = Math.max(1, Math.min(MAX_QTY, qty));
    writeItems(cart.items().map((i) => (i.sku === sku ? { ...i, qty: clamped } : i)));
  },
  remove(sku) {
    writeItems(cart.items().filter((i) => i.sku !== sku));
    track("remove_from_cart", { sku });
  },
  clear() {
    writeItems([]);
  },
};

export const MAX_LINE_QTY = MAX_QTY;

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network_error", "We couldn't reach the store. Check your connection and try again.");
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON response (e.g. static server without the Worker).
  }
  if (!response.ok || !data) {
    throw new ApiError(
      response.status,
      data?.error?.code ?? "unavailable",
      data?.error?.message ?? "The store is unavailable right now. Please try again shortly.",
    );
  }
  return data;
}

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

export function routineWord(routine) {
  return el("span", { class: `routine routine--${routine}` }, routine === "dry" ? "DRY" : "WET");
}

// Product page for a cart line (products/atomic-colored-glaze.html; Cloudflare serves it without ".html").
export const productUrl = (id) => (PRODUCT_IMAGES[id] && PRODUCT_SLUGS[id] ? `products/${PRODUCT_SLUGS[id]}.html` : null);

// The product name links to its product page. `newTab` keeps a shopper who is mid-checkout on this page.
export function productName(line, { newTab = false } = {}) {
  const text = line.name.replace(/^APGO /, "");
  const href = productUrl(line.id);
  if (!href) return el("span", { class: "product-name" }, text);
  return el("a", { class: "product-name product-link", href, ...(newTab ? { target: "_blank", rel: "noopener" } : {}) }, text);
}

export function productTitle(line, options) {
  return el(
    "span",
    { class: "line-item__title" },
    routineWord(line.routine),
    productName(line, options),
    el("span", { class: "sku-tag" }, line.sku),
  );
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

// "[TO CONFIRM]" marker for placeholder business terms (same look as the policy pages).
// Shown only while /api/store/config says `estimate: true`, i.e. PRICING_APPROVED is not set.
export const isEstimate = (config) => config?.estimate === true;

export function toConfirm(label = "TO CONFIRM") {
  const mark = el("mark", { "data-to-confirm": "" }, `[${label}]`);
  mark.setAttribute("data-estimate-mark", "");
  return mark;
}

// A value followed by the marker when `estimate` is on; plain text otherwise.
export function withEstimate(value, estimate) {
  return estimate ? el("span", {}, value, " ", toConfirm()) : value;
}

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
  if (trigger.hasAttribute("data-go-to-cart")) window.location.href = "cart.html";
});

window.addEventListener("apgo:cart-updated", renderCartCount);
window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY) return;
  memory = null;
  renderCartCount();
  window.dispatchEvent(new CustomEvent("apgo:cart-updated", { detail: { items: cart.items() } }));
});
