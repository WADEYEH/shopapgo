// Review and before/after content for the product pages. EMPTY ON PURPOSE.
//
// Nothing here may be invented. Add an entry only for a real, verified purchase review
// (FTC 16 CFR Part 465) or a real photo pair:
//
//   REVIEWS.d204.push({ rating: 5, author: "First L.", model: "2021 Civic", quote: "…", verified: true });
//   BEFORE_AFTER.d204 = { before: { src: "/assets/…", alt: "…" }, after: { src: "/assets/…", alt: "…" } };
//
// product.js shows the reviews section and the rating line only when a product has at least 3
// verified reviews; otherwise both stay hidden. Without a before/after pair the result section
// shows labelled placeholders only while the store is still in estimate mode (not PRICING_APPROVED).

export const MIN_VERIFIED_REVIEWS = 3;

export const REVIEWS = { d204: [], d215: [] };

export const BEFORE_AFTER = { d204: null, d215: null };
