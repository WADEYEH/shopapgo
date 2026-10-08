// The store's product data: names, routines, sizes, copy, product URLs, SEO. One source for every page and the Worker.
// No prices here: they come from /api/store/config (commerce/worker/pricing.js).
//
// The data itself is in product-data.mjs and product-reviews.mjs: plain ES modules (.mjs) with no React and no DOM, so
// the Worker and Node tests import the same files the pages do.
export * from "./product-data.mjs";
export { BEFORE_AFTER, MIN_VERIFIED_REVIEWS, REVIEWS } from "./product-reviews.mjs";
