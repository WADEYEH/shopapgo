// Canonical production origin. www is the production host; the apex 308s to it at the
// DNS/Vercel layer. Shared by metadataBase, the JSON-LD absolute URLs, app/sitemap.js
// and the Sitemap directive in app/robots.js, so the domain lives in exactly one place.
// Deliberately a literal: deriving it from VERCEL_URL leaks preview hostnames into
// production canonical tags.
export const SITE_URL = "https://www.shopapgo.com";
