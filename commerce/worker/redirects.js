import { PRODUCT_SLUGS } from "../../lib/shop/product-data.mjs";

// Old URLs that moved answer 301 to the new one on the same host, keeping the query string (ad tags, payment returns):
// - /us and /us/ -> /: the brand home moved from /us to / (main #26). The guides keep their /us/guides/* URLs, so
//   nothing below /us is redirected. Cloudflare Pages and Vercel do this with public/_redirects and vercel.json. The
//   Worker answers here, before its assets; its asset server reads public/_redirects too, so that file may only hold
//   rules this map already answers (scripts/build-site.mjs checks it).
// - /products/d204 and /products/d215 (also with .html or a trailing slash) -> the named product URLs (D39).
// - /v3 (the old store home, also /v3.html) -> /, the brand home (D39).
// - /product (the old one-page-for-both product page, also /product.html) -> /products, the overview (D41).
// - /cart.html and /checkout.html (the old plain HTML pages) -> /cart and /checkout (D41). The query string matters
//   here: payment returns (Airwallex, PayPal) registered before the move land on /checkout.html?order=….
// - /assets/* (the old store pages' images and videos) -> the same file under /us/assets/*, where the site keeps
//   them (D41 step 7). A file that was dropped then answers 404 there.
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

const OLD_ASSETS = /^\/assets\/[A-Za-z0-9._/-]+$/;

export const siteRedirect = (request) => {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  const target = MOVED.get(url.pathname.toLowerCase()) || (OLD_ASSETS.test(url.pathname) && !url.pathname.includes("..") ? `/us${url.pathname}` : null);
  if (!target) return null;
  return Response.redirect(new URL(`${target}${url.search}`, url).href, 301);
};
