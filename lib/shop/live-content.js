// The products' live words and photos for the store pages (D52, M9-27): the site's own product data with what an owner
// changed in the back office (lib/shop/product-content.mjs).
//
// The first render reads what the Worker put in the page (window.__APGO_CONTENT, commerce/worker/site-content.js), so
// it matches the HTML the Worker sent and React hydrates without a difference; once /api/store/config answers, its
// copy is used (fresher, and the one that counts when moving between pages inside the site).
import { PRODUCTS, SKUS } from "./product-data.mjs";
import { productContent } from "./product-content.mjs";
import { useStoreConfig } from "./store-config";

const fromPage = () => (typeof window !== "undefined" && window.__APGO_CONTENT && typeof window.__APGO_CONTENT === "object" ? window.__APGO_CONTENT : {});

export function liveOverrides(config, sku) {
  const live = config?.products?.[sku]?.content;
  return live && typeof live === "object" ? live : fromPage()[sku] ?? {};
}

// { [sku]: content } for every product, with { status, config } from the shared store config.
export function useLiveCatalog() {
  const store = useStoreConfig();
  const content = Object.fromEntries(SKUS.map((sku) => [sku, { ...PRODUCTS[sku], ...productContent(sku, liveOverrides(store.config, sku)) }]));
  return { ...store, content };
}

// Marks an element whose whole text is one product field, so the Worker can put the live text in the HTML it sends.
export const contentMark = (sku, field) => ({ "data-content": field, "data-content-sku": sku });
// The same for a photo (its src and alt): index 0 is the main photo.
export const imageMark = (sku, index = 0) => ({ "data-content-img": String(index), "data-content-sku": sku });
