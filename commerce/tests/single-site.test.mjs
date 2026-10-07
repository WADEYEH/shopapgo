// The single site (scripts/build-site.mjs + worker/root-page.js): the brand export and the store pages share one asset
// directory without overriding each other, Pages-only files stay out, test-site builds never load analytics and turn
// on the single-site links, and URLs that moved (/us, /v3, /products/d204|d215) answer 301.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { BRAND_SKIP, TEST_SITE_BRAND_ENV, buildSite } from "../scripts/build-site.mjs";
import worker from "../worker/index.js";
import { siteRedirect } from "../worker/root-page.js";

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

test("brand export and store pages land in one directory; Pages-only files are left out", () => withDir(async (dir) => {
  await tree(path.join(dir, "out"), {
    "index.html": "brand home",
    "us/guides.html": "guides",
    "_next/static/app.js": "js",
    "_redirects": "/us https://www.shopapgo.com/ 301",
  });
  await tree(path.join(dir, "store"), { "cart.html": "cart", "products/atomic-colored-glaze.html": "d204", "css/commerce.css": "css" });
  const counts = await buildSite({ brand: path.join(dir, "out"), store: path.join(dir, "store"), out: path.join(dir, "site") });
  assert.deepEqual(counts, { brand: 3, store: 3 });
  const read = (file) => readFile(path.join(dir, "site", file), "utf8");
  assert.equal(await read("index.html"), "brand home");
  assert.equal(await read("us/guides.html"), "guides");
  assert.equal(await read("_next/static/app.js"), "js");
  assert.equal(await read("products/atomic-colored-glaze.html"), "d204");
  await assert.rejects(read("_redirects"), "the Worker answers /us; the Pages redirect file must not ship");
}));

test("a path present in both trees stops the build instead of silently replacing a page", () => withDir(async (dir) => {
  await tree(path.join(dir, "out"), { "index.html": "brand", "css/commerce.css": "brand css" });
  await tree(path.join(dir, "store"), { "css/commerce.css": "store css" });
  await assert.rejects(
    buildSite({ brand: path.join(dir, "out"), store: path.join(dir, "store"), out: path.join(dir, "site") }),
    /both contain: css\/commerce\.css/,
  );
}));

test("a missing brand export fails with a clear message", () => withDir(async (dir) => {
  await tree(path.join(dir, "store"), { "cart.html": "cart" });
  await assert.rejects(buildSite({ brand: path.join(dir, "out"), store: path.join(dir, "store"), out: path.join(dir, "site") }), /brand export not found/);
}));

test("test-site builds force GA4, GTM and the Meta Pixel off and turn on the single-site links", () => {
  assert.deepEqual(TEST_SITE_BRAND_ENV, {
    NEXT_PUBLIC_APGO_US_ANALYTICS_READY: "false",
    NEXT_PUBLIC_APGO_US_GTM_ID: "",
    NEXT_PUBLIC_APGO_US_META_PIXEL_ID: "",
    NEXT_PUBLIC_APGO_US_SINGLE_SITE: "true",
  });
  assert.ok(BRAND_SKIP.has("_redirects"));
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

test("the old product URLs and the old store home answer 301 to their new URL, query string kept", async () => {
  const moved = {
    "/products/d204": "/products/atomic-colored-glaze",
    "/products/d204.html": "/products/atomic-colored-glaze",
    "/products/D204/": "/products/atomic-colored-glaze",
    "/products/d215": "/products/atomic-glaze-coating",
    "/products/d215.html": "/products/atomic-glaze-coating",
    "/v3": "/",
    "/v3.html": "/",
  };
  for (const [from, to] of Object.entries(moved)) {
    const response = siteRedirect(new Request(`https://shop.example${from}?utm_source=ads&fbclid=X`, { method: "HEAD" }));
    assert.equal(response?.status, 301, from);
    assert.equal(response.headers.get("Location"), `https://shop.example${to}?utm_source=ads&fbclid=X`, from);
  }
  for (const pathname of ["/products", "/products.html", "/products/atomic-colored-glaze", "/products/d204x", "/product.html", "/v3-style.html"]) {
    assert.equal(siteRedirect(new Request(`https://shop.example${pathname}`)), null, pathname);
  }
  assert.equal(siteRedirect(new Request("https://shop.example/products/d204", { method: "POST" })), null);

  // "/" still shows the old store home where ROOT_PAGE asks for it (production until the cutover): no redirect loop.
  const seen = [];
  const env = { ROOT_PAGE: "/v3", ASSETS: { fetch: async (request) => (seen.push(new URL(request.url).pathname), new Response("v3")) } };
  assert.equal((await worker.fetch(new Request("https://shop.example/"), env, {})).status, 200);
  assert.deepEqual(seen, ["/v3"]);
});
