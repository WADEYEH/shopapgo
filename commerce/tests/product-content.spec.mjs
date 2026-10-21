// PR 3-12 (D52, D61–D64; M9-26, M9-27): what an owner changes in the back office is what shoppers see.
//   * The store: the built pages go through the Worker's own rewrite (worker/site-content.js) on their way to the
//     browser, the store config comes from the real Worker modules (store-mock, content option); React must take the
//     page over without a difference (no hydration error) and show the same live words, photos and price.
//   * The back office: the product page against the real Worker (worker/index.js on an in-memory database built from
//     the migrations, R2 faked): edit, review before and after, publish, upload a photo, put a version back.
import { deflateSync } from "node:zlib";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import worker from "../worker/index.js";
import { rewritePageData, rewriteSiteHtml } from "../worker/site-content.js";
import { SEO } from "../../lib/shop/product-data.mjs";
import { mockStore } from "./helpers/store-mock.mjs";
import { mockAdminApi } from "./helpers/admin-mock.mjs";
import { createD1 } from "./helpers/d1.mjs";

const PRICES = { PRICING_JSON: JSON.stringify({ products: { d204: { priceCents: 5999 }, d215: { priceCents: 2999 } } }) };
const STEP2 = "/us/assets/application/d204-step-2.webp";
const CONTENT = {
  d204: {
    name: "Colored Glaze Pro",
    promise: "One more finishing step after drying.",
    lasts: "8 months",
    priceCents: 6499,
    seoTitle: "Colored Glaze Pro (D204) | APGO",
    images: [{ src: STEP2, alt: "Spreading the glaze" }, { src: SEO.d204.image }],
  },
};

// The page and its Next.js data as the Worker sends them with these changes.
async function throughWorker(page, overrides) {
  await page.route(/\/products(\/[a-z-]+)?(\.txt)?(\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const { pathname } = new URL(route.request().url());
    const text = await response.text();
    const html = /text\/html/.test(response.headers()["content-type"] ?? "");
    await route.fulfill({ response, body: html ? rewriteSiteHtml(text, { pathname, overrides }) : rewritePageData(text, { pathname, overrides }) });
  });
}
function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/Failed to load resource|fonts\.g/.test(message.text())) errors.push(message.text());
  });
  return errors;
}

test("a changed product: the page the Worker sends and React's first render agree, with the live words, photos and price", async ({ page }) => {
  const errors = watchErrors(page);
  await mockStore(page, { env: PRICES, content: CONTENT });
  await throughWorker(page, CONTENT);
  await page.goto("/products/atomic-colored-glaze");
  await page.locator("html[data-pdp-ready='true']").waitFor();

  await expect(page).toHaveTitle("Colored Glaze Pro (D204) | APGO");
  await expect(page.locator("h1")).toHaveText("Colored Glaze Pro");
  await expect(page.locator("[data-promise]")).toHaveText("One more finishing step after drying.");
  await expect(page.locator("[data-crumb]")).toHaveText("Dry · Colored Glaze Pro");
  await expect(page.locator("[data-price]")).toHaveText("$64.99");
  await expect(page.locator("[data-gallery-main]")).toHaveAttribute("src", STEP2);
  await expect(page.locator("[data-gallery-main]")).toHaveAttribute("alt", "Spreading the glaze");
  await expect(page.locator("[data-thumb]")).toHaveCount(2);
  await expect(page.locator(".pdp-benefit").first()).toContainText("8mo");
  await expect(page.locator(".pdp-benefit").first()).toContainText("Lasts up to 8 months");
  await expect(page.locator('[data-compare] td[data-col="d204"][data-content="name"]')).toHaveText("Colored Glaze Pro");
  await expect(page.locator('[data-compare] td[data-col="d215"][data-content="name"]')).toHaveText("Atomic Glaze Coating");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", `https://www.shopapgo.com${STEP2}`);
  const jsonLd = JSON.parse(await page.locator("#pdp-jsonld").textContent());
  expect(jsonLd.name).toBe("Colored Glaze Pro (DRY)");
  expect(jsonLd.image).toEqual([`https://www.shopapgo.com${STEP2}`]);

  // The thumbnails switch the main photo; the second is the pack shot.
  await page.locator('[data-thumb="1"]').click();
  await expect(page.locator("[data-gallery-main]")).toHaveAttribute("src", SEO.d204.image);
  // Added to the cart under its new name.
  await page.locator('[data-pdp-add][data-placement="buybox"]').click();
  await expect(page.locator("[data-added]")).toContainText("Dry · Colored Glaze Pro × 1");
  expect(errors, "React took the page over without a difference").toEqual([]);
});

test("the overview and moving to the product inside the site show the live product too", async ({ page }) => {
  const errors = watchErrors(page);
  await mockStore(page, { env: PRICES, content: CONTENT });
  await throughWorker(page, CONTENT);
  await page.goto("/products");
  const card = page.locator('[data-shop-card="d204"]');
  await expect(card.locator(".catalog-card__name")).toHaveText("Colored Glaze Pro");
  await expect(card).toContainText("One more finishing step after drying.");
  await expect(card).toContainText("Lasts up to 8 months");
  await expect(card.locator("img").first()).toHaveAttribute("src", STEP2);
  await expect(card.locator("[data-price-sku]")).toHaveText("$64.99");
  await expect(page.locator('[data-shop-card="d215"] .catalog-card__name')).toHaveText("Atomic Glaze Coating");

  await card.locator(".catalog-card__name a").click();
  await expect(page).toHaveURL(/\/products\/atomic-colored-glaze$/);
  await expect(page.locator("h1")).toHaveText("Colored Glaze Pro");
  await expect(page).toHaveTitle("Colored Glaze Pro (D204) | APGO");
  expect(errors).toEqual([]);
});

// C6: the home page and the product card beside a guide follow the name, when to apply and how long it lasts; their
// photos and the guides' own text do not (owner, 10/19).
async function throughWorkerPages(page, overrides) {
  await page.route(/^https?:\/\/[^/]+\/(us\/guides\/[a-z0-9-]+)?(\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const { pathname } = new URL(route.request().url());
    await route.fulfill({ response, body: rewriteSiteHtml(await response.text(), { pathname, overrides }) });
  });
}

test("C6: the home page and the product card beside a guide show the live name, when to apply and how long it lasts", async ({ page }) => {
  const errors = watchErrors(page);
  const content = { d204: { name: "Colored Glaze Pro", when: "After the wash, once dry", lasts: "8 months" }, d215: { name: "Glaze Coating Plus" } };
  await mockStore(page, { env: PRICES, content });
  await throughWorkerPages(page, content);
  await page.goto("/");
  const live = (scope, sku, field) => page.locator(`${scope} [data-content="${field}"][data-content-sku="${sku}"]`);
  await expect(live("#top", "d204", "name")).toHaveText("Colored Glaze Pro");
  await expect(live("#top", "d204", "when")).toHaveText("After the wash, once dry");
  await expect(live("#final", "d204", "name")).toHaveText("Colored Glaze Pro");
  await expect(live("#final", "d215", "name")).toHaveText("Glaze Coating Plus");
  await expect(live("#final", "d215", "when")).toHaveText("While paint is still wet");
  await expect(live("body", "d204", "lasts").first()).toHaveText("8 months");
  await expect(page.locator('[data-routine-option="d204"]')).toContainText("After the wash, once dry");
  await expect(page.locator("#top img").first()).toHaveAttribute("src", /d204-packshot\.png$/, { message: "the photo stays" });

  await page.goto("/us/guides/how-to-apply-colored-glaze");
  await expect(page.locator('aside[aria-label="Product"] [data-content="name"]')).toHaveText("Colored Glaze Pro");
  expect(errors, "React took the pages over without a difference").toEqual([]);
});

// ---------- the back office, against the real Worker ----------

const OWNER = "owner@apgo.example";
const LOGIN = { email: OWNER, password: "owner-password-123" };

// A plain 480 × 360 PNG (one colour), made here so the test needs no image files.
function png(width, height) {
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x5a)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// /admin/api/products* and /media/* answered by the real Worker, signed in as the owner; the rest of the back office is
// the usual stub.
async function realProducts(page, { role = "owner" } = {}) {
  const db = await createD1();
  const objects = new Map();
  const env = {
    DB: db,
    ADMIN_TOKEN: "test-admin-token-0123456789", ADMIN_OWNER_EMAIL: OWNER, ADMIN_LOGIN_EMAIL: LOGIN.email, ADMIN_LOGIN_PASSWORD: LOGIN.password,
    PRODUCT_IMAGES: {
      async put(key, value, options = {}) { objects.set(key, { bytes: new Uint8Array(value), httpMetadata: options.httpMetadata }); },
      async get(key) { const o = objects.get(key); return o ? { body: o.bytes, httpMetadata: o.httpMetadata } : null; },
    },
    ASSETS: { fetch: async () => new Response("not found", { status: 404 }) },
  };
  const sent = [];
  await mockAdminApi(page, role === "owner" ? {} : { team: { role } });
  const forward = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { Authorization: `Basic ${Buffer.from(`${LOGIN.email}:${LOGIN.password}`).toString("base64")}` };
    for (const name of ["content-type", "x-image-width", "x-image-height"]) if (request.headers()[name]) headers[name] = request.headers()[name];
    const body = request.method() === "POST" ? request.postDataBuffer() : undefined;
    if (request.method() === "POST") sent.push({ path: url.pathname, type: headers["content-type"], json: /json/.test(headers["content-type"] ?? "") ? JSON.parse(body.toString()) : null, bytes: body.length });
    const response = await worker.fetch(new Request(`https://www.shopapgo.com${url.pathname}${url.search}`, { method: request.method(), headers, body }), env, { waitUntil() {} });
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  };
  await page.route("**/admin/api/products**", forward);
  await page.route("**/media/products/**", forward);
  return { db, objects, sent };
}

test("an owner edits the words and price, reviews before and after, publishes, and puts the original back", async ({ page }) => {
  const { db, sent } = await realProducts(page);
  await page.goto("/admin/index.html#/products/d204");
  await expect(page.locator("h1")).toHaveText("Atomic Colored Glaze");
  await expect(page.locator("[data-product-versions]")).toContainText("Original");
  await page.getByRole("button", { name: "Edit price, text and photos" }).click();
  const editor = page.locator("[data-product-editor]");
  await expect(editor).toContainText("FTC rules");
  await expect(editor.locator("[data-photo]")).toHaveCount(4);

  // Nothing changed yet: said so, nothing published.
  await editor.getByRole("button", { name: "Review changes" }).click();
  await expect(editor.locator("[data-edit-message]")).toContainText("nothing to change");

  await editor.getByLabel("Name").fill("Atomic Colored Glaze Plus");
  await editor.getByLabel("Price").fill("64.99");
  await editor.getByLabel("Search title").fill("Atomic Colored Glaze Plus (D204) | APGO");
  // A field the Worker refuses: its message, nothing saved.
  await editor.getByLabel("One-line description").fill("Better <b>shine</b>");
  await editor.getByRole("button", { name: "Review changes" }).click();
  await expect(editor.locator("[data-edit-message]")).toContainText("plain text");
  await editor.getByLabel("One-line description").fill("Spray, spread and buff after drying.");
  await editor.getByRole("button", { name: "Review changes" }).click();

  const review = editor.locator("[data-edit-review]");
  await expect(review.locator("[data-content-diff] tr[data-change]")).toHaveCount(5);
  await expect(review.locator('[data-change="priceCents"]')).toContainText("$59.99");
  await expect(review.locator('[data-change="priceCents"]')).toContainText("$64.99");
  await expect(review.locator('[data-change="name"] .diff-after')).toHaveText("Atomic Colored Glaze Plus");
  await expect(review.locator("[data-price-change]")).toBeVisible();
  expect(db.raw.prepare("SELECT COUNT(*) AS n FROM product_versions").get().n, "the review saves nothing").toBe(0);
  expect((await new AxeBuilder({ page }).include("[data-product-editor]").analyze()).violations.map((v) => v.id)).toEqual([]);

  await review.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator("[data-product-outcome]")).toContainText("Version 1 is live");
  await expect(page.locator("h1")).toHaveText("Atomic Colored Glaze Plus");
  await expect(page.locator(".page-sub")).toContainText("$64.99");
  await expect(page.locator("[data-product-details]")).toContainText("Spray, spread and buff after drying.");
  await expect(page.locator("[data-product-history]")).toContainText("Product content published");
  await expect(page.locator('[data-product-versions] [data-version="1"]')).toContainText("Live");
  expect(sent.filter((s) => s.path.endsWith("/content")).map((s) => s.json.dryRun)).toEqual([true, true, true, false]);

  // Put the original back: what would change first, then one press.
  await page.locator('[data-product-versions] [data-restore="0"]').click();
  const box = page.locator("[data-restore-box]");
  await expect(box.locator("[data-content-diff] tr[data-change]")).toHaveCount(5);
  await box.getByRole("button", { name: "Put it back" }).click();
  await expect(page.locator("[data-product-outcome]")).toContainText("The original is live again");
  await expect(page.locator("h1")).toHaveText("Atomic Colored Glaze");
  await expect(page.locator('[data-product-versions] [data-version="2"]')).toContainText("Version 2 (put back version 0)");
  // Version 1 can come back too.
  await expect(page.locator('[data-product-versions] [data-restore="1"]')).toBeVisible();
});

test("an owner uploads a photo (made smaller here), makes it the main photo and publishes", async ({ page }) => {
  const { objects, sent } = await realProducts(page);
  await page.goto("/admin/index.html#/products/d204");
  await page.getByRole("button", { name: "Edit price, text and photos" }).click();
  const editor = page.locator("[data-product-editor]");
  await editor.locator("[data-photo-upload]").setInputFiles({ name: "bottle.png", mimeType: "image/png", buffer: png(2400, 1800) });
  await expect(editor).toContainText("Photo uploaded");
  await expect(editor.locator("[data-photo]")).toHaveCount(5);
  const upload = sent.find((s) => s.path.endsWith("/images"));
  expect(upload.type).toBe("image/webp");
  expect(objects.size).toBe(1);
  const [key] = objects.keys();
  expect(key).toMatch(/^products\/d204\/[a-f0-9-]{36}\.webp$/);

  // Move it to the front, describe it, drop one of the site's photos.
  for (let i = 4; i > 0; i -= 1) await editor.locator(`[data-photo-up="${i}"]`).click();
  await expect(editor.locator("[data-photo]").first()).toHaveAttribute("data-photo", `/media/${key}`);
  await editor.locator('[data-photo-alt="0"]').fill("The new bottle, front");
  await editor.locator('[data-photo-remove="4"]').click();
  await expect(editor.locator("[data-photo]")).toHaveCount(4);
  await editor.getByRole("button", { name: "Review changes" }).click();
  await expect(editor.locator('[data-change="images"] .diff-after img').first()).toHaveAttribute("src", `/media/${key}`);
  await editor.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator("[data-product-outcome]")).toContainText("Version 1 is live");
  await expect(page.locator("[data-product-photos] img").first()).toHaveAttribute("src", `/media/${key}`);
  await expect(page.locator("[data-product-photos] img").first()).toHaveAttribute("alt", "The new bottle, front");
  // The photo is served (through the Worker) and was made smaller: 1600 pixels on the longer side.
  const size = await page.locator("[data-product-photos] img").first().evaluate(async (img) => {
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  });
  expect(size).toEqual([1600, 1200]);
});

test("members see the content and its versions but no editing", async ({ page }) => {
  await realProducts(page, { role: "member" });
  await page.goto("/admin/index.html#/products/d204");
  await expect(page.locator("[data-product-details]")).toContainText("Only owners can change the price, text and photos.");
  await expect(page.getByRole("button", { name: "Edit price, text and photos" })).toHaveCount(0);
  await expect(page.locator("[data-restore]")).toHaveCount(0);
});
