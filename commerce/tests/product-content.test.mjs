// PR 3-12: owners change a product's price, words and photos in the back office (D52; D61–D64; M9-26, M9-27). The
// database is the real migrations in memory; R2 is a local fake; the site's pages are small copies shaped like the
// Next.js export (the browser test product-content.spec.mjs runs the real built pages).
import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.js";
import { quote, publicConfig } from "../worker/catalog.js";
import { livePricing } from "../worker/products.js";
import { publishContent, readOverrides, restoreContent } from "../worker/product-content.js";
import { forgetLiveContent, rewritePageData, rewriteSiteHtml } from "../worker/site-content.js";
import { adminHostAllows } from "../worker/hosts.js";
import { SEO } from "../../lib/shop/product-data.mjs";
import { productContent } from "../../lib/shop/product-content.mjs";
import { createD1, sqliteAvailable } from "./helpers/d1.mjs";

globalThis.fetch = async (url) => { throw new Error(`unexpected real network call: ${url}`); };
const skip = (await sqliteAvailable()) ? false : "node:sqlite unavailable";

const OWNER = "owner@apgo.example";
const LOGIN = { email: OWNER, password: "owner-password-123" };
const ownerLogin = { Authorization: `Basic ${Buffer.from(`${LOGIN.email}:${LOGIN.password}`).toString("base64")}` };
const OWNER_ACTOR = { id: OWNER, email: OWNER, role: "owner", via: "password" };
const MEMBER = { id: "member@apgo.example", email: "member@apgo.example", role: "member", via: "access" };
const PAGE = "/products/atomic-colored-glaze";

// A product page shaped like the export: the head Next.js writes, its copy of the head in the page data, and the
// elements the product page marks (components/shop/ProductPage.js).
const payloadRow = (title, description) => `19:${JSON.stringify({ metadata: [["$", "title", "0", { children: title }], ["$", "meta", "1", { name: "description", content: description }]] })}\n`;
function pageHtml() {
  const seo = SEO.d204;
  const image = `https://www.shopapgo.com${seo.image}`;
  return [
    `<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><link rel="preload" as="image" href="${seo.image}"/>`,
    `<title>${seo.title}</title><meta name="description" content="${seo.description}"/>`,
    `<meta property="og:title" content="${seo.title}"/><meta property="og:description" content="${seo.description}"/><meta property="og:image" content="${image}"/>`,
    `<meta name="twitter:title" content="${seo.title}"/><meta name="twitter:image" content="${image}"/></head><body>`,
    `<script type="application/ld+json" id="pdp-jsonld">{"name":"Atomic Colored Glaze (DRY)"}</script>`,
    `<h1 class="heading-guide-h1 pdp-title" id="pdp-title" data-name="" data-content="name" data-content-sku="d204">Atomic Colored Glaze</h1>`,
    `<p class="body pdp-promise" data-promise="" data-content="promise" data-content-sku="d204">${seo.description.split(" 300 mL")[0]}</p>`,
    `<img class="pdp-stage__img" data-gallery-main="" data-content-img="0" data-content-sku="d204" data-fit="contain" src="${seo.image}" alt="APGO Atomic Colored Glaze 300 mL" width="1400" height="1400"/>`,
    `<img src="${seo.image}" alt="" width="44" height="44" data-sticky-img="" data-content-img="0" data-content-sku="d204"/>`,
    `<span class="pdp-more__title" data-content="name" data-content-sku="d215">Atomic Glaze Coating</span>`,
    `<script>self.__next_f.push([1,${JSON.stringify(payloadRow(seo.title, seo.description))}])</script>`,
    `</body></html>`,
  ].join("");
}

function fakeR2() {
  const objects = new Map();
  return {
    objects,
    async put(key, value, options = {}) { objects.set(key, { bytes: new Uint8Array(value), httpMetadata: options.httpMetadata }); },
    async get(key) {
      const object = objects.get(key);
      return object ? { body: object.bytes, httpMetadata: object.httpMetadata, httpEtag: '"etag-1"' } : null;
    },
  };
}

const env0 = (db, extra = {}) => ({
  DB: db,
  ADMIN_TOKEN: "test-admin-token-0123456789", ADMIN_OWNER_EMAIL: OWNER, ADMIN_LOGIN_EMAIL: LOGIN.email, ADMIN_LOGIN_PASSWORD: LOGIN.password,
  PRODUCT_IMAGES: fakeR2(),
  ASSETS: {
    seen: [],
    async fetch(request) {
      this.seen.push(request);
      const { pathname } = new URL(request.url);
      if (pathname === PAGE) return new Response(pageHtml(), { headers: { "Content-Type": "text/html; charset=utf-8", ETag: '"page-1"', "Content-Length": "1" } });
      if (pathname === `${PAGE}.txt`) return new Response(payloadRow(SEO.d204.title, SEO.d204.description), { headers: { "Content-Type": "text/plain" } });
      if (pathname === "/us/assets/products/d204-packshot.webp") return new Response("image", { headers: { "Content-Type": "image/webp" } });
      return new Response("not found", { status: 404 });
    },
  },
  ...extra,
});
const call = async (env, path, init = {}) => worker.fetch(new Request(`https://www.shopapgo.com${path}`, init), env, { waitUntil() {} });
const post = (env, path, body) => call(env, path, { method: "POST", headers: { ...ownerLogin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
const rows = (db, sql, ...args) => db.raw.prepare(sql).all(...args).map((r) => ({ ...r }));

// Every field as the editor sends it, starting from what the site shows now.
const editorFields = (overrides = {}) => {
  const live = productContent("d204", {});
  return { name: live.name, promise: live.promise, when: live.when, lasts: live.lasts, scope: live.scope, seoTitle: "", seoDescription: "", priceCents: 5999, images: live.images.map(({ src }) => ({ src, alt: "" })), ...overrides };
};
// A real WebP header (RIFF....WEBP) and a JPEG one.
const WEBP = new Uint8Array([...Buffer.from("RIFF"), 40, 0, 0, 0, ...Buffer.from("WEBPVP8 "), ...new Array(32).fill(1)]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(32).fill(2)]);
const upload = (env, bytes, { type = "image/webp", width = "1200", height = "1200", headers = {} } = {}) =>
  call(env, "/admin/api/products/d204/images", { method: "POST", headers: { ...ownerLogin, "Content-Type": type, "X-Image-Width": width, "X-Image-Height": height, ...headers }, body: bytes });

test("M9-26: an owner reviews, then publishes a new price and words; checkout, the store config and the log follow", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  const content = editorFields({ name: "Atomic Colored Glaze Plus", priceCents: 6499, promise: "Spray, spread and buff after drying." });

  // The review: what would change, nothing saved.
  const review = await post(env, "/admin/api/products/d204/content", { content, expectedVersion: 0, dryRun: true });
  assert.equal(review.status, 200);
  const { changes } = await review.json();
  assert.deepEqual(Object.keys(changes).sort(), ["name", "priceCents", "promise", "seoDescription"]);
  assert.deepEqual(changes.priceCents, { before: 5999, after: 6499 });
  assert.match(changes.seoDescription.after, /^Spray, spread and buff after drying\. 300 mL/, "the search description follows the words");
  assert.deepEqual(await readOverrides(db), {});

  const published = await post(env, "/admin/api/products/d204/content", { content, expectedVersion: 0 });
  assert.equal(published.status, 200);
  const result = await published.json();
  assert.equal(result.version, 1);
  assert.equal(result.product.name, "Atomic Colored Glaze Plus");
  assert.equal(result.product.priceCents, 6499);
  assert.equal(result.product.content.version, 1);
  assert.deepEqual(result.product.content.versions.map((v) => [v.version, v.changed.sort()]), [[1, ["name", "priceCents", "promise", "seoDescription"]]]);
  // Only what differs from the site's own is kept.
  assert.deepEqual(await readOverrides(db), { d204: { name: "Atomic Colored Glaze Plus", promise: "Spray, spread and buff after drying.", priceCents: 6499 } });

  // Live at once: the quote and checkout price, the cart line's name, the store config the pages read.
  const pricing = await livePricing(env);
  const priced = quote([{ sku: "d204", qty: 2 }], {}, pricing);
  assert.equal(priced.lines[0].unitCents, 6499);
  assert.equal(priced.lines[0].name, "APGO Atomic Colored Glaze Plus");
  const config = publicConfig(env, pricing);
  assert.equal(config.products.d204.priceCents, 6499);
  assert.equal(config.products.d204.content.name, "Atomic Colored Glaze Plus");
  assert.deepEqual(config.products.d215.content, {});
  const quoteResponse = await call(env, "/api/cart/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [{ sku: "d204", qty: 1 }] }) });
  assert.equal((await quoteResponse.json()).subtotalCents, 6499);

  // In the activity log with before and after (owners only).
  const [audit] = rows(db, "SELECT actor, action, target, before_json, after_json FROM admin_audit WHERE action LIKE 'product.content%'");
  assert.equal(audit.action, "product.content_published");
  assert.equal(audit.target, "D204");
  assert.equal(JSON.parse(audit.before_json).priceCents, 5999);
  assert.equal(JSON.parse(audit.after_json).priceCents, 6499);
  assert.deepEqual(result.product.history.map((entry) => entry.action), ["product.content_published"]);

  // Publishing the same again changes nothing and makes no version.
  const again = await (await post(env, "/admin/api/products/d204/content", { content, expectedVersion: 1 })).json();
  assert.equal(again.changed, false);
  assert.equal(rows(db, "SELECT version FROM product_versions").length, 1);
});

test("M9-26: members change nothing; fields are checked; a second owner's stale edit is refused", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await assert.rejects(publishContent(env, MEMBER, "d204", { content: editorFields({ name: "X" }), expectedVersion: 0 }), { code: "owner_only", status: 403 });
  await assert.rejects(restoreContent(env, MEMBER, "d204", { version: 0, expectedVersion: 0 }), { code: "owner_only" });
  const refused = async (content, code, field) => {
    const response = await post(env, "/admin/api/products/d204/content", { content: editorFields(content), expectedVersion: 0 });
    assert.equal(response.status, 400, code);
    const { error } = await response.json();
    assert.equal(error.code, code);
    if (field) assert.equal(error.field, field);
  };
  await refused({ name: "" }, "empty_text", "name");
  await refused({ name: "x".repeat(61) }, "text_too_long", "name");
  await refused({ promise: "Best <script>" }, "invalid_text", "promise");
  await refused({ priceCents: 50 }, "invalid_price", "priceCents");
  await refused({ priceCents: 12.5 }, "invalid_price", "priceCents");
  await refused({ images: [] }, "invalid_images", "images");
  await refused({ images: [{ src: "https://evil.example/x.webp" }] }, "unknown_image", "images");
  await refused({ images: [{ src: SEO.d204.image }, { src: SEO.d204.image }] }, "duplicate_image", "images");
  await refused({ images: [{ src: SEO.d215.image }] }, "unknown_image", "images");
  assert.equal((await call(env, "/admin/api/products/nope/content", { method: "POST", headers: { ...ownerLogin, "Content-Type": "application/json" }, body: JSON.stringify({ content: editorFields(), expectedVersion: 0 }) })).status, 404);
  // Not JSON from a page elsewhere: refused before anything is read.
  const crossSite = await call(env, "/admin/api/products/d204/content", { method: "POST", headers: { ...ownerLogin, "Content-Type": "text/plain", "Sec-Fetch-Site": "cross-site" }, body: "{}" });
  assert.equal(crossSite.status, 403);

  // Two owners open the editor at version 0; the first publishes; the second is told instead of overwriting.
  assert.equal((await post(env, "/admin/api/products/d204/content", { content: editorFields({ when: "After drying" }), expectedVersion: 0 })).status, 200);
  const stale = await post(env, "/admin/api/products/d204/content", { content: editorFields({ when: "Any time" }), expectedVersion: 0 });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, "changed_meanwhile");
  assert.deepEqual(await readOverrides(db), { d204: { when: "After drying" } });
  assert.deepEqual(rows(db, "SELECT COUNT(*) AS n FROM admin_audit WHERE action LIKE 'product.content%'"), [{ n: 1 }]);
});

test("D63: any version or the original is put back with one press, and that is a new version too", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  const publish = async (fields, expectedVersion) => (await post(env, "/admin/api/products/d204/content", { content: editorFields(fields), expectedVersion })).json();
  await publish({ name: "Glaze One", priceCents: 6100 }, 0);
  await publish({ name: "Glaze Two", priceCents: 6100, seoTitle: "Glaze Two | APGO" }, 1);
  assert.deepEqual((await readOverrides(db)).d204, { name: "Glaze Two", priceCents: 6100, seoTitle: "Glaze Two | APGO" });

  // The review of a restore says what would change.
  const review = await (await post(env, "/admin/api/products/d204/restore", { version: 0, expectedVersion: 2, dryRun: true })).json();
  assert.deepEqual(Object.keys(review.changes).sort(), ["name", "priceCents", "seoTitle"]);
  assert.equal(review.changes.seoTitle.after, SEO.d204.title);

  const original = await (await post(env, "/admin/api/products/d204/restore", { version: 0, expectedVersion: 2 })).json();
  assert.equal(original.version, 3);
  assert.deepEqual(await readOverrides(db), {});
  assert.equal(original.product.priceCents, 5999);
  assert.equal(original.product.name, "Atomic Colored Glaze");

  const back = await (await post(env, "/admin/api/products/d204/restore", { version: 1, expectedVersion: 3 })).json();
  assert.equal(back.version, 4);
  assert.deepEqual((await readOverrides(db)).d204, { name: "Glaze One", priceCents: 6100 });
  assert.deepEqual(back.product.content.versions.map((v) => [v.version, v.restoredFrom]), [[4, 1], [3, 0], [2, null], [1, null]]);
  assert.deepEqual(back.product.content.versions[0].changed.sort(), ["name", "priceCents"]);
  assert.deepEqual(rows(db, "SELECT action FROM admin_audit WHERE action LIKE 'product.content%' ORDER BY id").map((r) => r.action),
    ["product.content_published", "product.content_published", "product.content_restored", "product.content_restored"]);
  assert.equal((await post(env, "/admin/api/products/d204/restore", { version: 9, expectedVersion: 4 })).status, 404);
});

test("D61, D62: photos are uploaded to R2, checked, served for a year, and used in the gallery order the owner sets", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  // Checked before anything is stored.
  assert.equal((await upload(env, WEBP, { type: "image/gif" })).status, 415);
  assert.equal((await upload(env, JPEG, { type: "image/webp" })).status, 400, "the bytes must be the type it says");
  assert.equal((await upload(env, WEBP, { width: "120" })).status, 400, "too small");
  assert.equal((await upload(env, new Uint8Array(2 * 1024 * 1024 + 1).fill(1), { type: "image/jpeg" })).status, 413);
  assert.equal((await upload(env, WEBP, { headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
  assert.equal(env.PRODUCT_IMAGES.objects.size, 0);
  // The editor's fields as they are: nothing to publish.
  assert.equal((await publishContent(env, OWNER_ACTOR, "d204", { content: editorFields(), expectedVersion: 0 })).changed, false);

  const response = await upload(env, WEBP);
  assert.equal(response.status, 200);
  const { image } = await response.json();
  assert.match(image.src, /^\/media\/products\/d204\/[a-f0-9-]{36}\.webp$/);
  assert.deepEqual({ width: image.width, height: image.height, bytes: image.bytes }, { width: 1200, height: 1200, bytes: WEBP.length });
  assert.equal(env.PRODUCT_IMAGES.objects.size, 1);
  assert.equal(rows(db, "SELECT sku, content_type, uploaded_by FROM product_images")[0].uploaded_by, OWNER);

  // Served by the Worker, cached for a year (a new photo is a new address).
  const served = await call(env, image.src);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("Content-Type"), "image/webp");
  assert.equal(served.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  assert.deepEqual(new Uint8Array(await served.arrayBuffer()), WEBP);
  assert.equal((await call(env, "/media/products/d204/00000000-0000-0000-0000-000000000000.webp")).status, 404);
  assert.equal((await call(env, "/media/../wrangler.toml")).status, 404);

  // Uploaded photo first, two of the site's own after it; descriptions where the owner wrote one.
  const defaults = productContent("d204", {}).images;
  const images = [{ src: image.src, alt: "New bottle, front" }, { src: defaults[2].src, alt: "" }, { src: defaults[0].src, alt: "" }];
  const published = await (await post(env, "/admin/api/products/d204/content", { content: editorFields({ images }), expectedVersion: 0 })).json();
  assert.equal(published.version, 1);
  const live = published.product.content.live.images;
  assert.deepEqual(live.map((i) => i.src), [image.src, defaults[2].src, defaults[0].src]);
  assert.equal(live[0].alt, "New bottle, front");
  assert.equal(live[1].alt, defaults[2].alt, "the site's own photo keeps its own description");
  assert.equal(published.product.image, image.src);
  assert.deepEqual(published.product.content.uploads.map((u) => u.src), [image.src]);
  // The site's own photos in their own order is no change.
  const reset = await (await post(env, "/admin/api/products/d204/content", { content: editorFields(), expectedVersion: 1, dryRun: true })).json();
  assert.deepEqual(Object.keys(reset.changes), ["images"]);

  // Without the storage binding: said plainly.
  const unconfigured = env0(db, { PRODUCT_IMAGES: undefined });
  assert.equal((await upload(unconfigured, WEBP)).status, 503);
});

test("M9-27: the Worker sends the pages with the live words, photos, search title and data; untouched without changes", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  // Nothing changed: the file as it is, the browser's copy still valid.
  const plain = await call(env, PAGE, { headers: { "If-None-Match": '"page-1"' } });
  assert.equal(await plain.text(), pageHtml());
  assert.equal(plain.headers.get("ETag"), '"page-1"');
  assert.equal(env.ASSETS.seen.at(-1).headers.get("If-None-Match"), '"page-1"');

  const images = [{ src: "/us/assets/application/d204-step-2.webp", alt: "" }, { src: SEO.d204.image, alt: "" }];
  await publishContent(env, OWNER_ACTOR, "d204", { content: editorFields({ name: "Glaze & Shine", seoTitle: "Glaze & Shine (D204) | APGO", promise: "A new promise.", images }), expectedVersion: 0 });
  forgetLiveContent(env);
  const response = await call(env, PAGE, { headers: { "If-None-Match": '"page-1"' } });
  const html = await response.text();
  assert.equal(env.ASSETS.seen.at(-1).headers.get("If-None-Match"), null, "the whole page is asked for again");
  assert.equal(response.headers.get("ETag"), null);
  assert.equal(response.headers.get("Content-Length"), null);
  assert.match(html, /<title>Glaze &amp; Shine \(D204\) \| APGO<\/title>/);
  assert.match(html, /<meta property="og:title" content="Glaze &amp; Shine \(D204\) \| APGO"\/>/);
  assert.match(html, /<meta name="description" content="A new promise\. 300 mL/);
  assert.match(html, /data-content="name" data-content-sku="d204">Glaze &amp; Shine<\/h1>/);
  assert.match(html, /data-content="promise" data-content-sku="d204">A new promise\.<\/p>/);
  assert.match(html, /data-content-sku="d215">Atomic Glaze Coating<\/span>/, "the other product is left alone");
  assert.match(html, /data-fit="cover" src="\/us\/assets\/application\/d204-step-2\.webp" alt="APGO Glaze &amp; Shine 300 mL"/);
  assert.match(html, /<meta property="og:image" content="https:\/\/www\.shopapgo\.com\/us\/assets\/application\/d204-step-2\.webp"\/>/);
  assert.match(html, /<link rel="preload" as="image" href="\/us\/assets\/application\/d204-step-2\.webp"\/>/);
  assert.doesNotMatch(html, /Atomic Colored Glaze \(D204\)/, "the old title is gone everywhere, Next.js's copy too");
  const jsonLd = JSON.parse(/id="pdp-jsonld">([^<]*)</.exec(html)[1]);
  assert.equal(jsonLd.name, "Glaze & Shine (DRY)");
  assert.equal(jsonLd.offers, undefined, "never a price before pricing is approved");
  // The changes for the page's own first render, right after the charset.
  const injected = /<meta charSet="utf-8"\/><script>window\.__APGO_CONTENT=(.*?)<\/script>/.exec(html);
  assert.ok(injected);
  assert.equal(JSON.parse(injected[1]).d204.name, "Glaze & Shine");
  // Next.js's copy in the HTML still parses and has the new title.
  const pushed = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/.exec(html)[1];
  assert.equal(JSON.parse(JSON.parse(pushed).slice(3)).metadata[0][3].children, "Glaze & Shine (D204) | APGO");

  // The page data Next.js loads when a shopper moves to the product inside the site.
  const data = await (await call(env, `${PAGE}.txt`)).text();
  assert.equal(JSON.parse(data.slice(3)).metadata[0][3].children, "Glaze & Shine (D204) | APGO");
  // Other files go out untouched.
  assert.equal(await (await call(env, "/us/assets/products/d204-packshot.webp")).text(), "image");
});

test("the page rewrite leaves pages without markers alone and never lets owner text out of its element", () => {
  const overrides = { d204: { name: "Plain" } };
  const other = "<html><head><meta charSet=\"utf-8\"/></head><body><p>Hello</p></body></html>";
  assert.equal(rewriteSiteHtml(other, { pathname: "/about", overrides }).replace(/<script>window\.__APGO_CONTENT=.*?<\/script>/, ""), other);
  assert.equal(rewriteSiteHtml(other, { pathname: "/about", overrides: {} }), other);
  // Text owners cannot normally save (the Worker refuses < and >) is escaped anyway.
  const marked = '<html><head></head><body><h1 data-content="name" data-content-sku="d204">Old</h1></body></html>';
  const out = rewriteSiteHtml(marked, { pathname: "/x", overrides: { d204: { name: "</h1><script>alert(1)</script>" } } });
  assert.doesNotMatch(out.replace(/<script>window\.__APGO_CONTENT=.*?<\/script>/, ""), /<script>alert/);
  assert.match(out, /window\.__APGO_CONTENT=\{"d204":\{"name":"\\u003c\/h1>\\u003cscript>alert\(1\)\\u003c\/script>"\}\}/);
  assert.equal(rewritePageData("19:{}\n", { pathname: "/products", overrides }), "19:{}\n");
});

test("the back-office host serves the product photos it shows, nothing else of the site", () => {
  assert.equal(adminHostAllows("/media/products/d204/0b0e9c3e-6f6d-4e43-9c1c-1f3f1b1f6a11.webp"), true);
  assert.equal(adminHostAllows("/us/assets/products/d204-packshot.webp"), true);
  assert.equal(adminHostAllows("/us/assets/application/d204-step-1.webp"), true);
  assert.equal(adminHostAllows("/us/assets/video/d204-application.mp4"), false);
  assert.equal(adminHostAllows("/products/atomic-colored-glaze"), false);
});

test("before migration 0013 the shop works as before", async () => {
  const empty = { prepare: () => ({ all: async () => { throw new Error("no such table: product_content"); } }) };
  assert.deepEqual(await readOverrides(empty), {});
});
