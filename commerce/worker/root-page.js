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

// The brand home moved from /us to / (main #26): exact /us and /us/ answer 301 to / on the same host, keeping the
// query string (ad tags). The guides keep their /us/guides/* URLs, so nothing below /us is redirected. On Cloudflare
// Pages public/_redirects did this; the single site leaves that file out (commerce/scripts/build-site.mjs).
export const brandRedirect = (request) => {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  if (url.pathname !== "/us" && url.pathname !== "/us/") return null;
  return Response.redirect(new URL(`/${url.search}`, url).href, 301);
};
