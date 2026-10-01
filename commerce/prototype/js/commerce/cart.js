import {
  MAX_LINE_QTY,
  PRODUCT_IMAGES,
  api,
  cart,
  el,
  money,
  notice,
  priceRows,
  productTitle,
  renderCartCount,
  track,
  isEstimate,
  withEstimate,
} from "./shared.js";
import { configureExpress, expressPending, syncExpress } from "./cart-wallets.js";

const $ = (selector) => document.querySelector(selector);
let quoteSeq = 0;
let viewTracked = false;
let estimate = false; // /api/store/config `estimate`: shipping/tax terms are placeholders
let lastQuote = null;

function consumeAddParam() {
  const url = new URL(window.location.href);
  const sku = url.searchParams.get("add");
  if (!sku) return;
  cart.add(sku.toLowerCase());
  url.searchParams.delete("add");
  history.replaceState(null, "", url);
}

function setCheckoutEnabled(enabled) {
  for (const link of document.querySelectorAll("[data-checkout-button], [data-checkout-link]")) {
    if (enabled) {
      link.removeAttribute("aria-disabled");
      link.removeAttribute("tabindex");
    } else {
      link.setAttribute("aria-disabled", "true");
      link.setAttribute("tabindex", "-1");
    }
  }
}

function quantityStepper(line) {
  const change = (delta) => cart.setQty(line.id, line.qty + delta);
  return el(
    "div",
    { class: "qty", role: "group", "aria-label": `Quantity, ${line.name}` },
    el("button", { type: "button", "aria-label": "Decrease quantity", disabled: line.qty <= 1, onclick: () => change(-1) }, "−"),
    el("output", { "aria-live": "polite" }, line.qty),
    el("button", { type: "button", "aria-label": "Increase quantity", disabled: line.qty >= MAX_LINE_QTY, onclick: () => change(1) }, "+"),
  );
}

function lineItem(line) {
  return el(
    "li",
    { class: "line-item", "data-line": line.id },
    el("img", { src: PRODUCT_IMAGES[line.id], alt: "", width: 88, height: 88 }),
    el(
      "div",
      { class: "line-item__body" },
      productTitle(line),
      el("span", { class: "line-item__meta" }, line.size),
      el(
        "div",
        { class: "line-item__controls" },
        quantityStepper(line),
        el("button", { type: "button", class: "line-item__remove", onclick: () => cart.remove(line.id) }, "Remove"),
      ),
    ),
    el("span", { class: "line-item__price" }, money(line.lineCents)),
  );
}

function renderEmpty() {
  lastQuote = null;
  $("[data-cart-title]").textContent = "Your cart is empty.";
  $("[data-cart-lines]").replaceChildren();
  $("[data-cart-empty]").hidden = false;
  $("[data-cart-summary]").replaceChildren(priceRows([{ label: "Subtotal", value: money(0) }]));
  setCheckoutEnabled(false);
  syncExpress(null);
}

function renderSummary(quote) {
  $("[data-cart-summary]").replaceChildren(
    priceRows([
      { label: "Subtotal", value: money(quote.subtotalCents) },
      { label: "Shipping", value: withEstimate(quote.shippingCents ? money(quote.shippingCents) : "Free", estimate), free: !quote.shippingCents },
      { label: "Tax", value: withEstimate("Calculated at checkout", estimate) },
    ], money(quote.subtotalCents + quote.shippingCents), "Estimated total"),
  );
}

function renderQuote(quote) {
  lastQuote = quote;
  $("[data-cart-title]").textContent = "Ready when you are.";
  $("[data-cart-empty]").hidden = true;
  $("[data-cart-lines]").replaceChildren(...quote.lines.map(lineItem));
  renderSummary(quote);
  setCheckoutEnabled(true);
  syncExpress(quote);
}

async function refresh() {
  renderCartCount();
  const message = $("[data-cart-message]");
  const items = cart.items();
  if (items.length === 0) {
    message.replaceChildren();
    renderEmpty();
    return;
  }

  const seq = ++quoteSeq;
  expressPending();
  try {
    const quote = await api("/api/cart/quote", { method: "POST", body: { items } });
    if (seq !== quoteSeq) return;
    message.replaceChildren();
    renderQuote(quote);
    if (!viewTracked) {
      viewTracked = true;
      track("view_cart", { value: quote.subtotalCents / 100, currency: quote.currency, items: items.length });
    }
  } catch (error) {
    if (seq !== quoteSeq) return;
    message.replaceChildren(notice("warning", "Cart unavailable", error.message));
    setCheckoutEnabled(false);
    syncExpress(null);
  }
}

// Store config: read the optional `expressCheckout` flag (default OFF). The lede stays the
// neutral "Shipping and tax are calculated at checkout." because shipping terms are not
// decided yet; no promise ("free", delivery days) is ever written from the front end.
async function loadStoreConfig() {
  try {
    const config = await api("/api/store/config");
    estimate = isEstimate(config);
    if (estimate && lastQuote) renderSummary(lastQuote);
    configureExpress(config);
  } catch {
    // No config: express checkout stays off and the neutral copy stays.
  }
}

for (const link of document.querySelectorAll("[data-checkout-button], [data-checkout-link]")) {
  link.addEventListener("click", (event) => {
    if (link.getAttribute("aria-disabled") === "true") event.preventDefault();
  });
}

consumeAddParam();
window.addEventListener("apgo:cart-updated", refresh);
refresh();
loadStoreConfig();
