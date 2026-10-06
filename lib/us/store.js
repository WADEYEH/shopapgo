// Build-time destination for the separate commerce Worker. No credentials or
// prices belong in the Next.js bundle; cart.html owns its own origin's cart.
export function validatedStoreUrl(raw) {
  try {
    const url = new URL(raw);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return undefined;
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

const destination = validatedStoreUrl(process.env.NEXT_PUBLIC_APGO_US_STORE_URL);
export const storeEnabled = process.env.NEXT_PUBLIC_APGO_US_STORE_READY === "true" && Boolean(destination);
export const storeUrl = storeEnabled ? destination : undefined;
export const cartUrl = storeEnabled ? `${destination}/cart.html` : undefined;

export function addToCartUrl(sku) {
  return storeEnabled && ["d204", "d215"].includes(sku) ? `${cartUrl}?add=${sku}` : undefined;
}
