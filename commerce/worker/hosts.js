// Host split between the storefront and the order back office.
//
// With the plain var ADMIN_HOST set (e.g. "admin-staging.shopapgo.com"; prod plan: "admin.shopapgo.com"):
//   * requests whose Host is ADMIN_HOST only get /admin, /admin/* (admin-auth, see admin.js), /robots.txt and the few
//     static files the back office page loads; everything else is 404. Every response there carries X-Robots-Tag noindex.
//   * every other host (the store domain, workers.dev) answers 404 for /admin and /admin/* - the back office is not
//     served there any more.
// With ADMIN_HOST unset (local `npm run dev`, tests) nothing changes: one host serves both, as before.

const ADMIN_HOST_ASSETS = new Set([
  "/css/commerce.css",
  "/css/admin.css",
  "/js/admin.js",
  "/js/commerce/shared.js",
  "/js/commerce/product-data.js", // imported by shared.js
  "/assets/brand/apgo-logo.png",
]);

export const ADMIN_ROBOTS_TAG = "noindex, nofollow";

export const adminHost = (env = {}) => String(env.ADMIN_HOST || "").trim().toLowerCase();

// True when the request arrived on the dedicated back-office hostname.
export function isAdminHost(request, env) {
  const configured = adminHost(env);
  return Boolean(configured) && new URL(request.url).hostname.toLowerCase() === configured;
}

export const isAdminPathname = (pathname) => pathname === "/admin" || pathname.startsWith("/admin/");

// Paths the back-office hostname may serve at all (before admin auth is checked).
export const adminHostAllows = (pathname) => isAdminPathname(pathname) || ADMIN_HOST_ASSETS.has(pathname) || pathname === "/robots.txt";

export function notFound(headers = {}) {
  return new Response(JSON.stringify({ error: { code: "not_found", message: "Not found." } }), {
    status: 404,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

export function withNoindex(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", ADMIN_ROBOTS_TAG);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// Returns a Response when the host split decides the request, otherwise null (carry on with normal routing).
export function hostSplit(request, env) {
  if (!adminHost(env)) return null;
  const { pathname } = new URL(request.url);
  if (!isAdminHost(request, env)) return isAdminPathname(pathname) ? notFound() : null;
  if (pathname === "/robots.txt" && (request.method === "GET" || request.method === "HEAD")) {
    return new Response(request.method === "HEAD" ? null : "User-agent: *\nDisallow: /\n", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": ADMIN_ROBOTS_TAG },
    });
  }
  return adminHostAllows(pathname) ? null : notFound({ "X-Robots-Tag": ADMIN_ROBOTS_TAG });
}
