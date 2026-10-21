// The home page's and the guides' product words as an owner last set them in the back office (C6, D52): the name, when
// to apply and how long it lasts follow the product pages. Photos, sizes and the FTC-reviewed copy stay as the site
// ships them (owner, 10/19), and so does the guides' body text.
//
// Show each field in its own element with liveMark(sku, field) holding only that text: the Worker then puts the live
// words in the HTML it sends (commerce/worker/site-content.js) and React's first render agrees with it.
import { contentMark, useLiveCatalog } from "@/lib/shop/live-content";

export const liveMark = contentMark;

// { name, when, lasts } of one product.
export function useLiveProduct(sku) {
  const { name, when, lasts } = useLiveCatalog().content[sku];
  return { name, when, lasts };
}
