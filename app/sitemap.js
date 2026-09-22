import { routes } from "@/lib/us/routes";
import { SITE_URL } from "@/lib/site";

// Required for Next.js static export (output: "export").
export const dynamic = "force-static";

// Indexable pages only. "/" is left out on purpose: public/_redirects 301s it to /us,
// and a redirecting URL in a sitemap is a permanent "Page with redirect" row in
// Search Console.
//
// lastModified is the date the PROSE last changed. Bump it for copy edits, not for
// styling or component refactors, and never derive it from the build date: a sitemap
// that claims every page changed on every deploy teaches Google to ignore the field.
//
// Paths come from routes.js by key, not by iterating it, so the anchor-only entries
// (#compare, #faq, #final) and the "#" legal placeholders stay out.
// tests/us-sitemap.test.cjs fails if a page.js exists that is missing from this list.
const pages = [
  { path: routes.home, lastModified: "2026-09-07" },
  { path: routes.guides, lastModified: "2026-09-08" },
  { path: routes.afterWashing, lastModified: "2026-09-08" },
  { path: routes.wetOrDry, lastModified: "2026-09-08" },
  { path: routes.coloredGlaze, lastModified: "2026-09-08" },
  { path: routes.glazeCoating, lastModified: "2026-09-08" },
  { path: routes.waxVsSprayCoating, lastModified: "2026-09-22" },
  { path: routes.coatingOverWax, lastModified: "2026-09-22" },
  { path: routes.howOftenReapply, lastModified: "2026-09-23" },
];

export default function sitemap() {
  // new URL() rather than concatenation so promoting the US site to the domain root
  // (US_BASE = "") cannot produce a double slash.
  return pages.map(({ path, lastModified }) => ({
    url: new URL(path, SITE_URL).href,
    lastModified,
  }));
}
