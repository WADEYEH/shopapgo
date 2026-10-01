const FALLBACK = "https://www.shopapgo.com/us";

export function siteLinks(env = {}) {
  let home = FALLBACK;
  try {
    const url = new URL(env.SITE_HOME_URL);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol === "https:" || (local && url.protocol === "http:")) && !url.username && !url.password && !url.search && !url.hash) {
      home = url.href.replace(/\/$/, "");
    }
  } catch { /* The brand site remains reachable without configuration. */ }
  return { home, guides: `${home}/guides` };
}
