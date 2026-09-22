import { SITE_URL } from "@/lib/site";

// Required for Next.js static export (output: "export").
export const dynamic = "force-static";

// Must live at app/ root. Next anchors the robots convention to the app directory,
// so app/(us)/robots.js would silently produce no route at all.
//
// Nothing is disallowed: there is no API, no admin, no query-parameter page. In
// particular /us/assets/** stays crawlable, because blocking it would stop Google
// rendering the pages it is judging and kill image indexing.
//
// There is deliberately no environment branch here. Vercel already sends
// X-Robots-Tag: noindex on preview deployments, and a bug in hand-rolled env logic
// would deindex production.
export default function robots() {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: new URL("/sitemap.xml", SITE_URL).href,
  };
}
