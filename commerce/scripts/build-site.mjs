// Builds the site the Worker serves: the Next.js static export in ../out, as it is (D41). Every customer page is a
// Next.js page, and the back office page (public/admin/), the store's Meta Pixel script (public/js/) and the Apple Pay
// folder (public/apple-pay/) are files in public/, so there is nothing to combine.
//
//   node scripts/build-site.mjs              build ../out with the test-site settings (local, staging), then check it
//   node scripts/build-site.mjs --production build ../out for www.shopapgo.com (only the Deploy workflow's production job):
//                                            the analytics values must be given in the environment, never taken from
//                                            a developer's .env.local or left to chance
//   node scripts/build-site.mjs --check      only check an export that is already there (CI after `npm run build`)
import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { siteRedirect } from "../worker/redirects.js";

const COMMERCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SITE_DIR = path.join(COMMERCE, "..", "out");

// The build for a test site. NEXT_PUBLIC_* values are inlined at build time, and values already in the environment
// win over a developer's .env.local.
// - It must never report to the production GA4, GTM or Meta Pixel.
// - It turns on the single-site links (lib/us/routes.js): Shop, the cart, the policy pages and the named product
//   URLs, which only work where the Worker serves the whole site.
export const TEST_SITE_ENV = {
  NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "false",
  NEXT_PUBLIC_APGO_US_GTM_ID: "",
  NEXT_PUBLIC_APGO_US_META_PIXEL_ID: "",
  NEXT_PUBLIC_APGO_US_SINGLE_SITE: "true",
};

// The production build: the single site, with the analytics values the workflow passes in (repository variables).
export const PRODUCTION_SITE_ENV = { NEXT_PUBLIC_APGO_US_SINGLE_SITE: "true" };
export const PRODUCTION_REQUIRED = ["NEXT_PUBLIC_APGO_US_ANALYTICS_READY", "NEXT_PUBLIC_APGO_US_GTM_ID", "NEXT_PUBLIC_APGO_US_META_PIXEL_ID"];
// The same patterns as GTM_ID_RE / META_PIXEL_ID_RE in lib/us/config.js (tests/platform.test.mjs keeps them equal).
const GTM_ID = /^GTM-[A-Z0-9]{4,10}$/;
const META_PIXEL_ID = /^\d{8,20}$/;

// Why these settings must not build production ([] when fine). A value left out, or analytics switched on with an id the
// site would silently ignore, stops the deploy instead of shipping a site that measures nothing.
export function productionEnvProblems(env) {
  const problems = PRODUCTION_REQUIRED.filter((name) => env[name] === undefined).map((name) => `${name} is not set`);
  const ready = String(env.NEXT_PUBLIC_APGO_US_ANALYTICS_READY ?? "");
  if (env.NEXT_PUBLIC_APGO_US_ANALYTICS_READY !== undefined && !["true", "false"].includes(ready)) problems.push('NEXT_PUBLIC_APGO_US_ANALYTICS_READY must be "true" or "false"');
  if (ready === "true") {
    if (!GTM_ID.test(String(env.NEXT_PUBLIC_APGO_US_GTM_ID ?? "").trim())) problems.push("NEXT_PUBLIC_APGO_US_GTM_ID is not a GTM container id");
    if (!META_PIXEL_ID.test(String(env.NEXT_PUBLIC_APGO_US_META_PIXEL_ID ?? "").trim())) problems.push("NEXT_PUBLIC_APGO_US_META_PIXEL_ID is not a Meta Pixel id");
  }
  return problems;
}

// What the Worker needs from the export: the pages it serves, the back office page, the store's pixel script, the
// brand 404 page (not_found_handling) and the list of files it must not upload.
export const REQUIRED_FILES = [
  "index.html",
  "404.html",
  "products.html",
  "cart.html",
  "checkout.html",
  "contact.html",
  "admin/index.html",
  "admin/admin.js",
  "admin/team.js",
  "js/meta-pixel.js",
  ".assetsignore",
];

// The Worker's asset server applies _redirects (the brand host's file) too. A rule is safe there only when the Worker
// already answers that path itself before its assets (worker/redirects.js); returns the rules that are not.
export function unsafeRedirectRules(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .filter((line) => {
      const [source] = line.split(/\s+/);
      return !siteRedirect(new Request(new URL(source, "https://site.example")));
    });
}

// Throws when the export is missing a file the Worker needs, or carries a redirect rule the Worker host would trip on.
export async function checkSite(dir = SITE_DIR) {
  const missing = [];
  for (const file of REQUIRED_FILES) {
    const info = await stat(path.join(dir, file)).catch(() => null);
    if (!info?.isFile()) missing.push(file);
  }
  if (missing.length) throw new Error(`site export at ${dir} is missing: ${missing.join(", ")}`);
  const rules = await readFile(path.join(dir, "_redirects"), "utf8").catch(() => "");
  const unsafe = unsafeRedirectRules(rules);
  if (unsafe.length) throw new Error(`_redirects has rules the Worker does not answer first, which its assets would apply too: ${unsafe.join(" | ")}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes("--check")) {
    const production = process.argv.includes("--production");
    if (production) {
      const problems = productionEnvProblems(process.env);
      if (problems.length) {
        console.error(`production build refused: ${problems.join("; ")}`);
        process.exit(1);
      }
    }
    // A fixed command string (npm is a .cmd on Windows, so it needs a shell); nothing user-supplied is interpolated.
    const result = spawnSync("npm --prefix .. run build", {
      cwd: COMMERCE,
      env: { ...process.env, ...(production ? PRODUCTION_SITE_ENV : TEST_SITE_ENV) },
      stdio: "inherit",
      shell: true,
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  await checkSite();
  console.log(`site: ${SITE_DIR} has everything the Worker needs`);
}
