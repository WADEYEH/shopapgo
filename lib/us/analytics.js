// Analytics for the US site (M10): every event is pushed to GTM's dataLayer and dispatched as an "apgo:analytics" DOM
// event, which public/js/meta-pixel.js translates into Meta events.
//
// GA4 is configured inside the GTM container (D40: GTM-TD5NTFH9 → G-YM10YMKE30), not here. The event names and the
// ecommerce object are a contract with that container: renaming one silently breaks its tag, with no build error.
//
// Ecommerce events use GA4's recommended names and also carry `ecommerce` = { currency, value, items[] } (plus
// transaction_id, shipping and tax on purchase), the shape GTM's GA4 tag sends as e-commerce data. The previous
// ecommerce object is cleared first ({ ecommerce: null }), as Google asks, so one event's items never leak into the next.
// Items: { item_id: "D204", item_name, item_category, price, quantity }.
//
// Other events: us_referral_landing_view, fit_selector_answer {sku}, video_start / video_play {sku}, faq_expand
// {question}, scroll_depth {percent}, checkout_session_created {order_id, …} (Meta's InitiateCheckout once the order
// exists), pdp_pair_added. There is no Amazon event any more: the product buttons stay on this site (M10 §1).
export const ECOMMERCE_EVENTS = [
  "view_item", "select_item", "view_cart", "add_to_cart", "remove_from_cart",
  "begin_checkout", "add_shipping_info", "add_payment_info", "purchase",
];
const ECOMMERCE_FIELDS = ["transaction_id", "shipping", "tax", "shipping_tier", "payment_type", "item_list_name"];

const finite = (value) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const money = (value) => (value === undefined ? undefined : Math.round(value * 100) / 100);
const compact = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== ""));

// GA4 items from what the page sent: its items[], or else the one product it named (sku, quantity, value).
export function ga4Items(data = {}) {
  if (Array.isArray(data.items)) {
    return data.items
      .filter((item) => item && (item.item_id || item.sku))
      .map((item) => compact({
        item_id: String(item.item_id ?? item.sku).toUpperCase(),
        item_name: item.item_name,
        item_category: item.item_category,
        price: money(finite(item.price)),
        quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
      }));
  }
  if (!data.sku) return [];
  const quantity = Number(data.quantity) > 0 ? Number(data.quantity) : 1;
  const value = finite(data.value);
  return [compact({ item_id: String(data.sku).toUpperCase(), quantity, price: value === undefined ? undefined : money(value / quantity) })];
}

export function ecommerceOf(data = {}) {
  return compact({
    currency: data.currency,
    value: money(finite(data.value)),
    ...Object.fromEntries(ECOMMERCE_FIELDS.map((key) => [key, data[key]])),
    items: ga4Items(data),
  });
}

// The lines of a Worker quote or order (unitCents, or lineCents and qty) as items.
export const quoteItems = (lines = []) =>
  lines.map((line) => compact({
    item_id: String(line.sku).toUpperCase(),
    item_name: line.name,
    price: money(finite(line.unitCents) !== undefined ? line.unitCents / 100 : finite(line.lineCents) !== undefined && line.qty ? line.lineCents / line.qty / 100 : undefined),
    quantity: line.qty,
  }));

export function track(event, data = {}) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  if (ECOMMERCE_EVENTS.includes(event)) {
    window.dataLayer.push({ ecommerce: null });
    window.dataLayer.push({ event, ...data, ecommerce: ecommerceOf(data) });
  } else {
    window.dataLayer.push({ event, ...data });
  }
  window.dispatchEvent(new CustomEvent("apgo:analytics", { detail: { event, ...data } }));
}
