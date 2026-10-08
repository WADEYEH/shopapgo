// The store's product data: names, routines, sizes, copy, product URLs, SEO. One source for every page and the Worker.
// No prices here: they come from /api/store/config (commerce/worker/pricing.js).
//
// The data still lives in commerce/prototype/js/commerce/ because the cart and checkout pages are plain HTML pages that
// load it in the browser. It moves into this folder when they become Next.js pages (D41, docs/commerce-plan.md §6);
// everything imports this file, so nothing else changes then.
export * from "../../commerce/prototype/js/commerce/product-data.js";
export { BEFORE_AFTER, MIN_VERIFIED_REVIEWS, REVIEWS } from "../../commerce/prototype/js/commerce/product-reviews.js";
