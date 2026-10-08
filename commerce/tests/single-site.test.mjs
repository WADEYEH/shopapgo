// The single site (D41, docs/commerce-plan.md §6 step 7): the Worker serves the Next.js export (../out) as it is, with no
// combining step. scripts/build-site.mjs builds it with the test-site settings and checks it has what the Worker needs;
// the brand host's redirect rules are safe on the Worker too; the old store folder and its duplicate images are gone; and URLs that
// moved (/us, /v3, /product, /products/d204|d215, /cart.html, /checkout.html, /assets/*) answer 301 (worker/redirects.js).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { REQUIRED_FILES, TEST_SITE_ENV, checkSite, unsafeRedirectRules } from "../scripts/build-site.mjs";
import worker from "../worker/index.js";
import { siteRedirect } from "../worker/redirects.js";

const repo = (file) => new URL(`../../${file}`, import.meta.url);
const read = (file) => readFile(repo(file), "utf8");

async function tree(root, files) {
  for (const [file, body] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), body);
  }
}

async function withDir(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "apgo-site-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function files(root, base = root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? files(full, base) : [path.relative(base, full).split(path.sep).join("/")];
  }));
  return nested.flat();
}

test("the export check passes with everything the Worker needs and names what is missing", () => withDir(async (dir) => {
  const complete = Object.fromEntries(REQUIRED_FILES.map((file) => [file, "x"]));
  await tree(dir, complete);
  await checkSite(dir);

  await rm(path.join(dir, "admin", "index.html"));
  await rm(path.join(dir, "js", "meta-pixel.js"));
  await assert.rejects(checkSite(dir), /missing: admin\/index\.html, js\/meta-pixel\.js/);

  await tree(dir, { "admin/index.html": "x", "js/meta-pixel.js": "x", "_redirects": "/us / 301\n/admin/* / 302\n" });
  await assert.rejects(checkSite(dir), /\/admin\/\* \/ 302/, "a rule the Worker would apply to its own back office");
}));

test("the export checked: the back office, the pixel, the 404 page and the store pages are all site files", () => {
  for (const file of ["index.html", "404.html", "products.html", "cart.html", "checkout.html", "contact.html", "admin/index.html", "js/meta-pixel.js", ".assetsignore"]) {
    assert.ok(REQUIRED_FILES.includes(file), file);
  }
  for (const file of ["admin/index.html", "admin/admin.js", "admin/ui.js", "admin/admin.css", "admin/commerce.css", "js/meta-pixel.js", "apple-pay/README.txt", ".assetsignore"]) {
    assert.ok(existsSync(repo(`public/${file}`)), `public/${file}`);
  }
});

test("the brand host's redirect rules are ones the Worker answers itself, so they cannot loop it; the admin page leaves the brand host", async () => {
  // The Worker's asset server applies public/_redirects too: an /admin rule once sent the back office round in circles.
  assert.deepEqual(unsafeRedirectRules(await read("public/_redirects")), []);
  assert.deepEqual(unsafeRedirectRules("# note\n/us / 301\n/us/ / 301\n/v3 / 301\n"), []);
  assert.deepEqual(unsafeRedirectRules("/admin / 302\n/admin/* / 302\n/us/guides/* / 301"), ["/admin / 302", "/admin/* / 302", "/us/guides/* / 301"]);
  const admin = await read("public/admin/admin.js");
  assert.ok(admin.includes('if (["www.shopapgo.com", "shopapgo.com"].includes(location.hostname)) location.replace("/");'));
});

test("test-site builds force GA4, GTM and the Meta Pixel off and turn on the single-site links", () => {
  assert.deepEqual(TEST_SITE_ENV, {
    NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "false",
    NEXT_PUBLIC_APGO_US_GTM_ID: "",
    NEXT_PUBLIC_APGO_US_META_PIXEL_ID: "",
    NEXT_PUBLIC_APGO_US_SINGLE_SITE: "true",
  });
});

test("one copy of everything: the old store folder is gone and no two site files are the same file", async () => {
  assert.equal(existsSync(repo("commerce/prototype")), false, "the store's plain HTML pages and their files are gone");
  assert.equal(existsSync(repo("commerce/site")), false);
  const root = fileURLToPath(repo("public"));
  const seen = new Map();
  for (const file of await files(root)) {
    const hash = createHash("sha256").update(await readFile(path.join(root, file))).digest("hex");
    assert.ok(!seen.has(hash), `${file} is the same file as ${seen.get(hash)}`);
    seen.set(hash, file);
  }
});

test("the shared store code lives in lib/shop and nothing imports the old folder", async () => {
  for (const file of ["product-data", "product-reviews", "address-rules", "checkout-draft", "wallets", "paypal", "airwallex-pay", "contact-rules"]) {
    assert.ok(existsSync(repo(`lib/shop/${file}.mjs`)), file);
  }
  const worker = await readdir(repo("commerce/worker"));
  for (const file of worker.filter((name) => name.endsWith(".js"))) {
    assert.doesNotMatch(await read(`commerce/worker/${file}`), /prototype\//, file);
  }
});

test("/us and /us/ answer 301 to the brand home with the query string; nothing below /us moves", async () => {
  const redirect = siteRedirect(new Request("https://staging.shop.example/us?utm_source=ads"));
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get("Location"), "https://staging.shop.example/?utm_source=ads");
  assert.equal(siteRedirect(new Request("https://shop.example/us/")).headers.get("Location"), "https://shop.example/");
  for (const pathname of ["/us/guides", "/us/guides/what-is-car-glaze", "/us/assets/logo.png", "/usa", "/"]) {
    assert.equal(siteRedirect(new Request(`https://shop.example${pathname}`)), null, pathname);
  }
  assert.equal(siteRedirect(new Request("https://shop.example/us", { method: "POST" })), null);

  // Through the Worker, before any static asset is looked up.
  const env = { ASSETS: { fetch: async () => assert.fail("assets must not be asked for /us") } };
  const response = await worker.fetch(new Request("https://shop.example/us"), env, {});
  assert.equal(response.status, 301);
  assert.equal(response.headers.get("Location"), "https://shop.example/");
});

test("the old product URLs, store home, cart, checkout and images answer 301 to their new URL, query string kept", async () => {
  const moved = {
    "/products/d204": "/products/atomic-colored-glaze",
    "/products/d204.html": "/products/atomic-colored-glaze",
    "/products/D204/": "/products/atomic-colored-glaze",
    "/products/d215": "/products/atomic-glaze-coating",
    "/products/d215.html": "/products/atomic-glaze-coating",
    "/v3": "/",
    "/v3.html": "/",
    // The one-page-for-both product page (?sku=, #dry / #wet) is gone with the Next.js pages (D41): the overview.
    "/product": "/products",
    "/product.html": "/products",
    "/Product/": "/products",
    // The plain HTML cart and checkout became /cart and /checkout; payment returns keep their order and PayPal flags.
    "/cart.html": "/cart",
    "/checkout.html": "/checkout",
    // The old store pages' images (links in sent emails, ads, feeds) are the site's files now.
    "/assets/products/d204-packshot.webp": "/us/assets/products/d204-packshot.webp",
    "/assets/brand/apgo-logo.png": "/us/assets/brand/apgo-logo.png",
    "/assets/video/d215-application.mp4": "/us/assets/video/d215-application.mp4",
  };
  for (const [from, to] of Object.entries(moved)) {
    const response = siteRedirect(new Request(`https://shop.example${from}?utm_source=ads&fbclid=X`, { method: "HEAD" }));
    assert.equal(response?.status, 301, from);
    assert.equal(response.headers.get("Location"), `https://shop.example${to}?utm_source=ads&fbclid=X`, from);
  }
  for (const pathname of ["/products", "/products.html", "/products/atomic-colored-glaze", "/products/d204x", "/productx", "/product/d204", "/cart", "/checkout", "/v3-style.html", "/assets", "/assets/", "/us/assets/brand/apgo-logo.png", "/assets/a%20b.png"]) {
    assert.equal(siteRedirect(new Request(`https://shop.example${pathname}`)), null, pathname);
  }
  assert.equal(siteRedirect(new Request("https://shop.example/products/d204", { method: "POST" })), null);
});

test("'/' is the site's home page from the export: the v3 home override is gone", async () => {
  const seen = [];
  const env = { ROOT_PAGE: "/v3", ASSETS: { fetch: async (request) => (seen.push(new URL(request.url).pathname), new Response("home")) } };
  assert.equal((await worker.fetch(new Request("https://shop.example/"), env, {})).status, 200);
  assert.deepEqual(seen, ["/"]);
});
