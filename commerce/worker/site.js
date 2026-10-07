// Where the store's "Home" and "Guides" links go. SITE_HOME_URL names the brand site (only its origin is used): the
// brand home is "/" since main #26 (exact /us redirects there) and the guides stay at /us/guides. On the single site
// (staging today) that is the store's own origin; where the store runs on its own host it is www.shopapgo.com.
const FALLBACK = "https://www.shopapgo.com";

export function siteLinks(env = {}) {
  let origin = FALLBACK;
  try {
    const url = new URL(env.SITE_HOME_URL);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol === "https:" || (local && url.protocol === "http:")) && !url.username && !url.password && !url.search && !url.hash) {
      origin = url.origin;
    }
  } catch { /* The brand site remains reachable without configuration. */ }
  return { home: `${origin}/`, guides: `${origin}/us/guides` };
}
