// Builds the site the Worker serves: the Next.js static export in ../out, as it is (D41). Every customer page is a
// Next.js page, and the back office page (public/admin/), the store's Meta Pixel script (public/js/) and the Apple Pay
// folder (public/apple-pay/) are files in public/, so there is nothing to combine.
//
//   node scripts/build-site.mjs           build ../out with the test-site settings (local, staging), then check it
//   node scripts/build-site.mjs --check   only check an export that is already there (CI after `npm run build`)
import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

// What the Worker needs from the export: the pages it serves, the back office page, the store's pixel script, the
// brand 404 page (not_found_handling) and the list of Pages-only files it must not upload.
export const REQUIRED_FILES = [
  "index.html",
  "404.html",
  "products.html",
  "cart.html",
  "checkout.html",
  "contact.html",
  "admin/index.html",
  "admin/admin.js",
  "js/meta-pixel.js",
  ".assetsignore",
];

// Throws when the export is missing a file the Worker needs, or would upload _redirects.
export async function checkSite(dir = SITE_DIR) {
  const missing = [];
  for (const file of REQUIRED_FILES) {
    const info = await stat(path.join(dir, file)).catch(() => null);
    if (!info?.isFile()) missing.push(file);
  }
  if (missing.length) throw new Error(`site export at ${dir} is missing: ${missing.join(", ")}`);
  const ignored = (await readFile(path.join(dir, ".assetsignore"), "utf8")).split(/\r?\n/).map((line) => line.trim());
  if (!ignored.includes("_redirects")) throw new Error(".assetsignore must keep _redirects out of the Worker's assets");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv.includes("--check")) {
    // A fixed command string (npm is a .cmd on Windows, so it needs a shell); nothing user-supplied is interpolated.
    const result = spawnSync("npm --prefix .. run build", {
      cwd: COMMERCE,
      env: { ...process.env, ...TEST_SITE_ENV },
      stdio: "inherit",
      shell: true,
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  await checkSite();
  console.log(`site: ${SITE_DIR} has everything the Worker needs`);
}
