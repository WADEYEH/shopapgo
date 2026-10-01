// Cart entry points on the v3 landing page: adds to the shared cart (localStorage,
// only { sku, qty }), keeps the header badge in sync, and confirms each add inline
// next to the button that was used. Prices are never shown here; they live on cart.html.
import { cart, el, renderCartCount } from "./shared.js";

const SKU_NAME = { d204: "Atomic Colored Glaze", d215: "Atomic Glaze Coating" };

function syncBadge() {
  renderCartCount();
  const count = cart.count();
  for (const badge of document.querySelectorAll("[data-cart-count]")) badge.hidden = count === 0;
  for (const link of document.querySelectorAll("[data-cart-link]")) {
    link.setAttribute("aria-label", `Cart, ${count} ${count === 1 ? "item" : "items"}`);
  }
}

function confirmAdd(trigger) {
  const sku = trigger.getAttribute("data-add-to-cart");
  const placement = trigger.dataset.placement;
  const status = document.querySelector(`[data-cart-status][data-sku="${sku}"][data-placement="${placement}"]`);
  const inCart = cart.items().find((item) => item.sku === sku)?.qty ?? 0;
  if (!status) return;
  if (status.classList.contains("v3-sr-only")) {
    status.textContent = `${SKU_NAME[sku]} added to cart. ${cart.count()} in cart.`;
    return;
  }
  status.replaceChildren(
    el("span", {}, `Added · ${inCart} in cart`),
    " ",
    el("a", { href: "cart.html" }, "View cart →"),
  );
}

// shared.js adds the product first (its listener is registered earlier); this
// listener then confirms it. Both run on the same click.
document.addEventListener("click", (event) => {
  const trigger = event.target.closest?.("[data-add-to-cart]");
  if (trigger) confirmAdd(trigger);
});

window.addEventListener("apgo:cart-updated", syncBadge);
syncBadge();
