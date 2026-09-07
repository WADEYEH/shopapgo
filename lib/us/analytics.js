// Analytics for the US site: pushes to GTM's dataLayer and emits a DOM event so any
// tag manager or custom listener can pick events up.
// Events: us_referral_landing_view, fit_selector_answer {sku}, amazon_referral_click {sku, placement},
//         video_start {sku}, faq_expand {question}, scroll_depth {percent}
export function track(event, data = {}) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...data });
  window.dispatchEvent(new CustomEvent("apgo:analytics", { detail: { event, ...data } }));
}
