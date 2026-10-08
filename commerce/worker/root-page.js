import { PRODUCT_SLUGS } from "../prototype/js/commerce/product-data.js";

// Optional "home page" override: with the plain var ROOT_PAGE (e.g. "/v3") set, GET/HEAD "/" serves that static page
// (the URL stays "/"). Used where the assets are the store pages only (production until the cutover): they have no
// index.html. Unset where the assets include the brand site (staging, the single site): "/" is the brand home.

export const rootPageOverride = (request, env = {}) => {
  const page = String(env.ROOT_PAGE || "").trim();
  if (!/^\/[A-Za-z0-9._-]+$/.test(page)) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  if (url.pathname !== "/") return null;
  url.pathname = page;
  return new Request(url, request);
};

// Old URLs that moved answer 301 to the new one on the same host, keeping the query string (ad tags):
// - /us and /us/ -> /: the brand home moved from /us to / (main #26). The guides keep their /us/guides/* URLs, so
//   nothing below /us is redirected. On Cloudflare Pages public/_redirects did this; the single site leaves that
//   file out (commerce/scripts/build-site.mjs).
// - /products/d204 and /products/d215 (also with .html or a trailing slash) -> the named product URLs (D39).
// - /v3 (the old store home, also /v3.html) -> /, the brand home (D39). Where ROOT_PAGE is "/v3" (production until
//   the cutover), "/" still shows that page, so nothing changes for shoppers there.
// - /product (the old one-page-for-both product page, also /product.html) -> /products, the overview (D41).
// - /cart.html and /checkout.html (the plain HTML pages) -> /cart and /checkout, the Next.js pages (D41). The query
//   string matters here: payment returns (Airwallex, PayPal) registered before the move land on
//   /checkout.html?order=…, and the v3 and policy pages still link to cart.html until they move too.
const MOVED = new Map([
  ["/cart.html", "/cart"],
  ["/checkout.html", "/checkout"],
  ["/us", "/"],
  ["/us/", "/"],
  ["/v3", "/"],
  ["/v3.html", "/"],
  ["/v3/", "/"],
  ["/product", "/products"],
  ["/product.html", "/products"],
  ["/product/", "/products"],
  ...Object.entries(PRODUCT_SLUGS).flatMap(([sku, slug]) =>
    ["", ".html", "/"].map((suffix) => [`/products/${sku}${suffix}`, `/products/${slug}`]),
  ),
]);

export const siteRedirect = (request) => {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  const target = MOVED.get(url.pathname.toLowerCase());
  if (!target) return null;
  return Response.redirect(new URL(`${target}${url.search}`, url).href, 301);
};
