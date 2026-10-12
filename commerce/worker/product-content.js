// Owners change a product's price, words and photos from the back office (D52; decided 10/12: D61–D64; M9-26, M9-27).
//
//   * What is live is kept as "what changed" (product_content); everything else is the site's own product data, so a
//     restore to the original is simply nothing changed. Every publish is a numbered version (product_versions) and any
//     of them, or the original (version 0), can be put back (D63). Two owners at once: the second publish is refused
//     ("changed meanwhile") instead of silently overwriting.
//   * Live at once: the price through livePricing (worker/products.js: product pages, cart, checkout and the order all
//     read it), the words and photos through /api/store/config and the page HTML the Worker sends
//     (worker/site-content.js). Paid orders keep what they were sold at.
//   * Photos (D61, D62): resized in the owner's browser, uploaded here into R2 (binding PRODUCT_IMAGES) under a new name
//     each time, and served at /media/products/<sku>/<id>.<ext> for a year (a new photo is a new address).
//   * Every change is in the activity log with what it was before and after (owners only).
import { TEXT_FIELDS, MAX_IMAGES, defaultContent, defaultImages, productContent } from "../../lib/shop/product-content.mjs";
import { PRODUCTS } from "../../lib/shop/product-data.mjs";
import { resolvePricing } from "./pricing.js";
import { recordAdminAudit } from "./activity.js";

const MIN_PRICE_CENTS = 100;
const MAX_PRICE_CENTS = 100_000;
const MAX_ALT = 150;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
const AUTOMATIC = new Set(["seoTitle", "seoDescription"]);
export const MEDIA_PATH = /^\/media\/(products\/([a-z0-9]{2,10})\/[a-f0-9-]{36}\.(?:webp|jpg|png))$/;
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const controlChars = /[\u0000-\u0008\u000b-\u001f\u007f]/;

export class ContentError extends Error {
  constructor(status, code, message, field = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

const parse = (json) => {
  try {
    const value = JSON.parse(json || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};

// { [sku]: what changed } for every product with a change. Never throws (an empty store before migration 0013).
export async function readOverrides(db) {
  try {
    const { results } = await db.prepare("SELECT sku, content_json FROM product_content").all();
    return Object.fromEntries(results.map((row) => [row.sku, parse(row.content_json)]).filter(([, value]) => Object.keys(value).length));
  } catch {
    return {};
  }
}

async function current(db, sku) {
  const row = await db.prepare("SELECT * FROM product_content WHERE sku = ?").bind(sku).first();
  return row ? { overrides: parse(row.content_json), version: row.version, by: row.updated_by, at: row.updated_at } : { overrides: {}, version: 0, by: null, at: null };
}

const basePrice = (env, sku) => resolvePricing(env).products[sku]?.priceCents ?? null;

// The comparable form of one product's live state: price, every shown field, and the photos with the descriptions an
// owner wrote (null = the automatic one, which follows the name and is not a change of its own).
function shown(env, sku, overrides) {
  const live = productContent(sku, overrides);
  const listed = Array.isArray(overrides.images) && overrides.images.length ? overrides.images : [];
  return {
    priceCents: Number.isSafeInteger(overrides.priceCents) ? overrides.priceCents : basePrice(env, sku),
    ...Object.fromEntries(Object.keys(TEXT_FIELDS).map((key) => [key, live[key]])),
    images: live.images.map(({ src }, index) => ({ src, alt: listed[index]?.alt || null })),
  };
}

// What differs between two live states: { field: { before, after } }.
export function contentDiff(before, after) {
  const changes = {};
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changes[key] = { before: before[key], after: after[key] };
  }
  return changes;
}

// GET /admin/api/products/:id → `content`: what is live, the originals, the versions and the uploaded photos.
export async function contentView(env, sku) {
  const db = env.DB;
  const now = await current(db, sku);
  let versions = [];
  let uploads = [];
  try {
    // The last 30, each with what it changed from the one before (one more row is read for the oldest's "before").
    const rows = (await db.prepare("SELECT version, published_by, published_at, restored_from, content_json FROM product_versions WHERE sku = ? ORDER BY version DESC LIMIT 31").bind(sku).all()).results;
    const states = rows.map((row) => shown(env, sku, parse(row.content_json)));
    versions = rows.slice(0, 30).map((row, i) => ({
      version: row.version, by: row.published_by, at: row.published_at, restoredFrom: row.restored_from,
      changed: Object.keys(contentDiff(states[i + 1] ?? shown(env, sku, {}), states[i])),
    }));
    uploads = (await db.prepare("SELECT key, width, height, bytes, uploaded_by, uploaded_at FROM product_images WHERE sku = ? ORDER BY uploaded_at DESC LIMIT 50").bind(sku).all()).results
      .map((row) => ({ src: `/media/${row.key}`, width: row.width, height: row.height, bytes: row.bytes, by: row.uploaded_by, at: row.uploaded_at }));
  } catch {
    // before migration 0013
  }
  return {
    version: now.version, updatedBy: now.by, updatedAt: now.at,
    overrides: now.overrides,
    // As the site shows them, each photo with the description it has (the owner's or the automatic one).
    live: { ...shown(env, sku, now.overrides), images: productContent(sku, now.overrides).images.map(({ src, alt }) => ({ src, alt })) },
    original: shown(env, sku, {}),
    defaults: { ...defaultContent(sku), priceCents: basePrice(env, sku) },
    limits: { ...TEXT_FIELDS, images: MAX_IMAGES, alt: MAX_ALT, minPriceCents: MIN_PRICE_CENTS, maxPriceCents: MAX_PRICE_CENTS },
    versions,
    uploads,
  };
}

// What an owner sent, checked, as "what changed" (fields equal to the original are left out).
async function checkContent(env, sku, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ContentError(400, "invalid_content", "Send the product's fields.");
  const original = shown(env, sku, {});
  const overrides = {};
  for (const [key, max] of Object.entries(TEXT_FIELDS)) {
    if (input[key] === undefined || input[key] === null) continue;
    if (typeof input[key] !== "string") throw new ContentError(400, "invalid_text", `${key} must be text.`, key);
    const value = input[key].replace(/\s+/g, " ").trim();
    // The search title and description may be left empty: the site's own then (the description follows the words).
    if (!value && AUTOMATIC.has(key)) continue;
    if (!value) throw new ContentError(400, "empty_text", "This field cannot be empty.", key);
    if (value.length > max) throw new ContentError(400, "text_too_long", `Up to ${max} characters.`, key);
    if (controlChars.test(value) || /[<>]/.test(value)) throw new ContentError(400, "invalid_text", "Use plain text (no < or >).", key);
    if (value !== original[key]) overrides[key] = value;
  }
  if (input.priceCents !== undefined && input.priceCents !== null) {
    const cents = Number(input.priceCents);
    if (!Number.isSafeInteger(cents) || cents < MIN_PRICE_CENTS || cents > MAX_PRICE_CENTS) {
      throw new ContentError(400, "invalid_price", `Enter a price between $${MIN_PRICE_CENTS / 100} and $${MAX_PRICE_CENTS / 100}.`, "priceCents");
    }
    if (cents !== original.priceCents) overrides.priceCents = cents;
  }
  if (input.images !== undefined && input.images !== null) {
    if (!Array.isArray(input.images) || input.images.length < 1 || input.images.length > MAX_IMAGES) {
      throw new ContentError(400, "invalid_images", `Keep between 1 and ${MAX_IMAGES} photos.`, "images");
    }
    const builtIn = new Set(defaultImages(sku).map((image) => image.src));
    const { results } = await env.DB.prepare("SELECT key FROM product_images WHERE sku = ?").bind(sku).all();
    const uploaded = new Set(results.map((row) => `/media/${row.key}`));
    const images = input.images.map((image) => {
      const src = String(image?.src ?? "");
      if (!builtIn.has(src) && !uploaded.has(src)) throw new ContentError(400, "unknown_image", "One of the photos is not this product's.", "images");
      const alt = String(image?.alt ?? "").replace(/\s+/g, " ").trim();
      if (alt.length > MAX_ALT || controlChars.test(alt) || /[<>]/.test(alt)) throw new ContentError(400, "invalid_alt", `Photo descriptions are plain text, up to ${MAX_ALT} characters.`, "images");
      return { src, ...(alt ? { alt } : {}) };
    });
    if (new Set(images.map((image) => image.src)).size !== images.length) throw new ContentError(400, "duplicate_image", "Each photo once.", "images");
    // The original photos in their order with their own descriptions is no change.
    const asShown = productContent(sku, { ...overrides, images }).images.map(({ src, alt }) => ({ src, alt }));
    const originalImages = productContent(sku, overrides).images.map(({ src, alt }) => ({ src, alt }));
    if (JSON.stringify(asShown) !== JSON.stringify(originalImages)) overrides.images = images;
  }
  return overrides;
}

// dryRun: only say what would change (the owner's review before publishing, D63).
async function save(env, actor, sku, overrides, { expectedVersion, restoredFrom = null, dryRun = false, nowMs = Date.now() }) {
  const db = env.DB;
  const now = await current(db, sku);
  if (expectedVersion !== now.version) throw new ContentError(409, "changed_meanwhile", "Someone changed this product meanwhile. Reload it to see the latest.");
  const before = shown(env, sku, now.overrides);
  const after = shown(env, sku, overrides);
  const changes = contentDiff(before, after);
  if (!Object.keys(changes).length || dryRun) return { changed: false, version: now.version, changes, ...(dryRun ? { dryRun: true } : {}) };
  const at = iso(nowMs);
  const version = now.version + 1;
  const json = JSON.stringify(overrides);
  const claimed = await db
    .prepare(`INSERT INTO product_content (sku, content_json, version, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(sku) DO UPDATE SET content_json = excluded.content_json, version = excluded.version, updated_by = excluded.updated_by, updated_at = excluded.updated_at
      WHERE product_content.version = ?`)
    .bind(sku, json, version, actor.email ?? actor.id, at, now.version)
    .run();
  if (!(claimed.meta?.changes > 0)) throw new ContentError(409, "changed_meanwhile", "Someone changed this product meanwhile. Reload it to see the latest.");
  await db.prepare("INSERT INTO product_versions (sku, version, content_json, published_by, published_at, restored_from) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(sku, version, json, actor.email ?? actor.id, at, restoredFrom).run();
  const target = PRODUCTS[sku]?.sku ?? sku.toUpperCase();
  await recordAdminAudit(db, {
    actor, action: restoredFrom === null ? "product.content_published" : "product.content_restored", target,
    before: Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value.before])),
    after: Object.fromEntries(Object.entries(changes).map(([key, value]) => [key, value.after])),
    detail: { version, ...(restoredFrom !== null ? { restoredFrom } : {}), fields: Object.keys(changes) },
  });
  return { changed: true, version, changes };
}

const ownerOnly = (actor) => {
  if (actor?.role !== "owner") throw new ContentError(403, "owner_only", "Only an owner can change a product.");
};

// POST /admin/api/products/:id/content { content, expectedVersion, dryRun }: content has every field the owner sees
// (an empty search title or description = the site's own). dryRun: true answers what would change without saving.
export async function publishContent(env, actor, sku, body, { nowMs = Date.now() } = {}) {
  ownerOnly(actor);
  if (!PRODUCTS[sku]) throw new ContentError(404, "not_found", "Product not found.");
  const overrides = await checkContent(env, sku, body?.content);
  return save(env, actor, sku, overrides, { expectedVersion: Number(body?.expectedVersion), dryRun: body?.dryRun === true, nowMs });
}

// POST /admin/api/products/:id/restore { version (0 = the original), expectedVersion, dryRun }
export async function restoreContent(env, actor, sku, body, { nowMs = Date.now() } = {}) {
  ownerOnly(actor);
  if (!PRODUCTS[sku]) throw new ContentError(404, "not_found", "Product not found.");
  const version = Number(body?.version);
  if (!Number.isSafeInteger(version) || version < 0) throw new ContentError(400, "invalid_version", "Choose a version.");
  let overrides = {};
  if (version > 0) {
    const row = await env.DB.prepare("SELECT content_json FROM product_versions WHERE sku = ? AND version = ?").bind(sku, version).first();
    if (!row) throw new ContentError(404, "not_found", "That version does not exist.");
    overrides = parse(row.content_json);
  }
  return save(env, actor, sku, overrides, { expectedVersion: Number(body?.expectedVersion), restoredFrom: version, dryRun: body?.dryRun === true, nowMs });
}

const magic = (bytes) => (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg"
  : bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 ? "image/png"
  : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" ? "image/webp"
  : null);

// POST /admin/api/products/:id/images, the photo as the body (image/webp, image/jpeg or image/png) with its size in
// X-Image-Width / X-Image-Height. Returns { src, width, height, bytes }.
export async function uploadProductImage(env, actor, sku, request, { nowMs = Date.now() } = {}) {
  ownerOnly(actor);
  if (!PRODUCTS[sku]) throw new ContentError(404, "not_found", "Product not found.");
  if (!env.PRODUCT_IMAGES) throw new ContentError(503, "images_not_configured", "Photo storage is not set up for this site.");
  const type = String(request.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_TYPES[type]) throw new ContentError(415, "invalid_image_type", "Upload a WebP, JPEG or PNG photo.");
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) throw new ContentError(413, "image_too_large", "The photo is larger than 2 MB.");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length) throw new ContentError(400, "empty_image", "The photo is empty.");
  if (bytes.length > MAX_IMAGE_BYTES) throw new ContentError(413, "image_too_large", "The photo is larger than 2 MB.");
  if (magic(bytes) !== type) throw new ContentError(400, "invalid_image", "That file is not the photo type it says.");
  const width = Number(request.headers.get("X-Image-Width"));
  const height = Number(request.headers.get("X-Image-Height"));
  if (![width, height].every((n) => Number.isSafeInteger(n) && n >= 200 && n <= 4000)) throw new ContentError(400, "invalid_image_size", "Photos must be between 200 and 4000 pixels on each side.");
  const key = `products/${sku}/${crypto.randomUUID()}.${IMAGE_TYPES[type]}`;
  await env.PRODUCT_IMAGES.put(key, bytes, { httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" } });
  const at = iso(nowMs);
  await env.DB.prepare("INSERT INTO product_images (key, sku, content_type, bytes, width, height, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(key, sku, type, bytes.length, width, height, actor.email ?? actor.id, at).run();
  await recordAdminAudit(env.DB, { actor, action: "product.image_uploaded", target: PRODUCTS[sku].sku, detail: { src: `/media/${key}`, width, height, bytes: bytes.length } });
  return { src: `/media/${key}`, width, height, bytes: bytes.length };
}

// GET /media/products/<sku>/<id>.<ext>: a product photo from R2. Never changes, so cached for a year.
export async function serveProductImage(request, env) {
  const match = MEDIA_PATH.exec(new URL(request.url).pathname);
  if (!match || !env.PRODUCT_IMAGES || !["GET", "HEAD"].includes(request.method)) return null;
  const object = await env.PRODUCT_IMAGES.get(match[1]);
  if (!object) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(request.method === "HEAD" ? null : object.body, {
    status: 200,
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      ...(object.httpEtag ? { ETag: object.httpEtag } : {}),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
