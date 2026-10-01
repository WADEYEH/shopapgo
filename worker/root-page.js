// Optional "home page" override: with the plain var ROOT_PAGE (e.g. "/v3") set, GET/HEAD "/" serves that static page
// (the URL stays "/"). Unset (local dev, the old tests, production for now) = the normal static prototype/index.html.
// Used on staging because prototype/index.html is the older Amazon-referral landing (no cart), while /v3 is the store entry.

export const rootPageOverride = (request, env = {}) => {
  const page = String(env.ROOT_PAGE || "").trim();
  if (!/^\/[A-Za-z0-9._-]+$/.test(page)) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  if (url.pathname !== "/") return null;
  url.pathname = page;
  return new Request(url, request);
};
