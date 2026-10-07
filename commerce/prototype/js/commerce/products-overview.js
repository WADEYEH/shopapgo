// The /products overview (products.html, written by scripts/build-product-pages.mjs; owner decision D39).
// - Prices: only from /api/store/config, like the product pages. Nothing here knows a price.
// - A product the store no longer sells (missing from the config) is hidden.
// - Adding to the cart is shared.js's [data-add-to-cart] handler; this file only confirms it next to the button.
import { api, cart, el, money, renderCartCount } from "./shared.js";

function syncCart() {
  renderCartCount();
  const count = cart.count();
  for (const link of document.querySelectorAll("[data-cart-link]")) {
    link.setAttribute("aria-label", `Cart, ${count} ${count === 1 ? "item" : "items"}`);
  }
}

// shared.js registered its click listener first, so the product is already in the cart here.
document.addEventListener("click", (event) => {
  const trigger = event.target.closest?.("[data-add-to-cart]");
  const sku = trigger?.getAttribute("data-add-to-cart");
  const status = sku && document.querySelector(`[data-shop-added="${sku}"]`);
  if (!status) return;
  const inCart = cart.items().find((item) => item.sku === sku)?.qty ?? 0;
  status.replaceChildren(el("span", {}, `Added · ${inCart} in cart`), " ", el("a", { href: "/cart.html" }, "View cart →"));
});

async function showPrices() {
  let config = null;
  try {
    config = await api("/api/store/config");
  } catch {
    // Prices stay "—"; adding still works and the cart quotes the order.
  }
  for (const node of document.querySelectorAll("[data-price-sku]")) {
    const cents = config?.products?.[node.dataset.priceSku]?.priceCents;
    node.textContent = typeof cents === "number" ? money(cents) : "—";
  }
  if (!config?.products) return;
  for (const card of document.querySelectorAll("[data-shop-card]")) card.hidden = !config.products[card.dataset.shopCard];
}

window.addEventListener("apgo:cart-updated", syncCart);
syncCart();
showPrices().then(() => {
  document.documentElement.dataset.shopReady = "true";
});
