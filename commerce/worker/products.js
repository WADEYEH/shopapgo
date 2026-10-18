// Products in the back office (M9 商品, D50) and the owners' stop-selling switch (A4, M2-04, M9-07).
//
// A stopped product is off sale everywhere at once: /api/store/config says onSale: false (the product page drops Add to
// cart), and every quote, card checkout and PayPal checkout refuses a cart that has it (catalog.js normalizeItems), so
// carts that already hold it cannot check out. Paid orders are not touched and still ship.
//
//   GET  /admin/api/products              every product with its sales, stock and switch
//   GET  /admin/api/products/:id          one product, with its changes
//   POST /admin/api/products/:id/sale     owners only: { onSale, reason }
//   Price, words and photos: worker/product-content.js (PR 3-12).
//   Amazon's stock and out of stock below 5: worker/inventory.js (D25, D76).
import { recordAdminAudit } from "./activity.js";
import { mcfConfig } from "./amazon-mcf.js";
import { calendar, DAY } from "./business-time.js";
import { STOCK_THRESHOLD, currentStock } from "./inventory.js";
import { resolvePricing } from "./pricing.js";
import { PRODUCTS as CONTENT, productPath } from "../../lib/shop/product-data.mjs";
import { applyContent, productContent } from "../../lib/shop/product-content.mjs";
import { contentView, readOverrides } from "./product-content.js";

// Below this many available at Amazon a product is out of stock (D25; worker/inventory.js).
export { STOCK_THRESHOLD };
const CHART_DAYS = 14;

export class ProductError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// { [id]: { onSale, by, at } } for products with a row; no row = on sale. A database without the table yet (before
// migration 0009) has nothing stopped.
export async function productSettings(db) {
  try {
    const { results } = await db.prepare("SELECT sku, on_sale, updated_by, updated_at FROM product_settings").all();
    return Object.fromEntries(results.map((row) => [row.sku, { onSale: row.on_sale !== 0, by: row.updated_by, at: row.updated_at }]));
  } catch {
    return {};
  }
}

// Amazon's stock on the products (worker/inventory.js): out of stock gets inStock: false; a product read from Amazon
// gets `available`, the most a cart may ask for (worker/catalog.js). Products not read are left as they are and sell.
export function withStock(pricing, stock) {
  const products = Object.fromEntries(Object.entries(pricing.products).map(([id, product]) => {
    const s = stock[id];
    if (!s?.connected) return [id, product];
    return [id, { ...product, available: s.available, ...(s.outOfStock ? { inStock: false } : {}) }];
  }));
  return { ...pricing, products };
}

// The pricing the storefront and checkout use: worker/pricing.js, what owners changed (price and name, with the words and
// photos for the pages: worker/product-content.js), each product's on-sale switch and Amazon's stock.
export async function livePricing(env) {
  const [settings, overrides, stock] = await Promise.all([productSettings(env.DB), readOverrides(env.DB), currentStock(env)]);
  const pricing = Object.keys(overrides).length ? applyContent(resolvePricing(env), overrides) : resolvePricing(env);
  const products = Object.fromEntries(
    Object.entries(pricing.products).map(([id, product]) => [id, settings[id]?.onSale === false ? { ...product, onSale: false } : product]),
  );
  return withStock({ ...pricing, products }, stock.products);
}

export async function setOnSale(env, actor, productId, body, { now = () => new Date().toISOString() } = {}) {
  if (actor.role !== "owner") throw new ProductError(403, "owner_only", "Only an owner can stop or resume selling a product.");
  const product = resolvePricing(env).products[productId];
  if (!product) throw new ProductError(404, "not_found", "Product not found.");
  if (typeof body?.onSale !== "boolean") throw new ProductError(400, "invalid_on_sale", "Say whether the product is on sale (true or false).");
  const before = (await productSettings(env.DB))[productId]?.onSale ?? true;
  if (before === body.onSale) return { changed: false };
  const at = now();
  await env.DB
    .prepare(
      `INSERT INTO product_settings (sku, on_sale, updated_by, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(sku) DO UPDATE SET on_sale = excluded.on_sale, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    )
    .bind(productId, body.onSale ? 1 : 0, String(actor.email ?? actor.id), at)
    .run();
  await recordAdminAudit(env.DB, {
    actor,
    action: body.onSale ? "product.resumed" : "product.stopped",
    target: product.sku,
    before: { onSale: before },
    after: { onSale: body.onSale },
    reason: String(body.reason ?? "").trim(),
    at,
  });
  return { changed: true };
}

// Units, revenue and refunds per product from the orders' lines. Revenue is the product lines only (no shipping or tax).
async function salesByProduct(env, ids, nowMs) {
  const cal = calendar(env, nowMs);
  const since = Math.min(cal.month, cal.today - (CHART_DAYS - 1) * DAY);
  const { results } = await env.DB
    .prepare("SELECT id, lines_json, paid_at FROM orders WHERE paid_at IS NOT NULL AND paid_at >= ?")
    .bind(new Date(since).toISOString())
    .all();
  const refunded = new Set(
    (await env.DB
      .prepare("SELECT DISTINCT order_id FROM order_refunds WHERE status != 'FAILED' AND provider_created_at >= ?")
      .bind(new Date(nowMs - 30 * DAY).toISOString())
      .all()).results.map((row) => row.order_id),
  );
  const refundedLines = refunded.size
    ? (await env.DB.prepare(`SELECT id, lines_json FROM orders WHERE id IN (${[...refunded].map(() => "?").join(",")})`).bind(...refunded).all()).results
    : [];
  const days = Array.from({ length: CHART_DAYS }, (_, i) => cal.dayKey(cal.today - (CHART_DAYS - 1 - i) * DAY));
  const sales = Object.fromEntries(ids.map((id) => [id, { soldMonth: 0, revenueMonthCents: 0, monthOrders: 0, refunds30: 0, days: Object.fromEntries(days.map((d) => [d, 0])) }]));
  let monthOrders = 0;
  for (const row of results) {
    const paid = Date.parse(row.paid_at);
    const inMonth = paid >= cal.month;
    if (inMonth) monthOrders += 1;
    const key = cal.dayKey(paid);
    const seen = new Set();
    for (const line of JSON.parse(row.lines_json)) {
      const s = sales[line.id];
      if (!s) continue;
      if (inMonth) {
        s.soldMonth += line.qty;
        s.revenueMonthCents += line.lineCents;
        if (!seen.has(line.id)) s.monthOrders += 1;
      }
      if (key in s.days) s.days[key] += line.qty;
      seen.add(line.id);
    }
  }
  for (const row of refundedLines) {
    for (const id of new Set(JSON.parse(row.lines_json).map((line) => line.id))) if (sales[id]) sales[id].refunds30 += 1;
  }
  return Object.fromEntries(
    Object.entries(sales).map(([id, s]) => [id, {
      soldMonth: s.soldMonth,
      revenueMonthCents: s.revenueMonthCents,
      refunds30: s.refunds30,
      // Share of this month's orders that have the product, 0–100.
      monthOrderShare: monthOrders ? Math.round((s.monthOrders / monthOrders) * 100) : 0,
      days: Object.entries(s.days).map(([day, qty]) => ({ day, qty })),
    }]),
  );
}

function amazonSkuOf(env, sku) {
  try {
    return mcfConfig(env).skuMap[sku] ?? null;
  } catch {
    return null;
  }
}

async function history(db, sku) {
  const { results } = await db
    .prepare("SELECT at, actor, action, reason FROM admin_audit WHERE target = ? AND action LIKE 'product.%' ORDER BY id DESC LIMIT 20")
    .bind(sku)
    .all();
  return results.map((row) => ({ at: row.at, actor: row.actor, action: row.action, reason: row.reason || null }));
}

// Every product for the back office: what it is, its price, the switch, sales and stock.
export async function listProducts(env, { nowMs = Date.now() } = {}) {
  const pricing = resolvePricing(env);
  const ids = Object.keys(pricing.products);
  const [settings, sales, overrides, stock] = await Promise.all([productSettings(env.DB), salesByProduct(env, ids, nowMs), readOverrides(env.DB), currentStock(env, { nowMs })]);
  return ids.map((id) => {
    const product = pricing.products[id];
    const changed = overrides[id] ?? {};
    // What the shop shows now: an owner's changes on top of the site's own words.
    const content = CONTENT[id] ? { ...CONTENT[id], ...productContent(id, changed) } : {};
    const setting = settings[id];
    return {
      id,
      sku: product.sku,
      name: content.name ?? product.name,
      routine: product.routine,
      size: content.size ?? product.size,
      oz: content.oz ?? null,
      priceCents: Number.isSafeInteger(changed.priceCents) ? changed.priceCents : product.priceCents,
      image: content.image ?? null,
      edited: Object.keys(changed).length > 0,
      onSale: setting?.onSale ?? true,
      changedBy: setting?.by ?? null,
      changedAt: setting?.at ?? null,
      page: CONTENT[id] ? productPath(id) : null,
      amazonSku: amazonSkuOf(env, product.sku),
      details: { promise: content.promise ?? null, when: content.when ?? null, lasts: content.lasts ?? null, scope: content.scope ?? null },
      stock: stock.products[id],
      sales: sales[id],
    };
  });
}

export async function getProduct(env, id, { nowMs = Date.now() } = {}) {
  const product = (await listProducts(env, { nowMs })).find((p) => p.id === id);
  if (!product) return null;
  return {
    ...product,
    history: await history(env.DB, product.sku),
    content: CONTENT[id] ? await contentView(env, id) : null,
    // When the stock was last read and whether reads fail (worker/inventory.js).
    stockStatus: (await currentStock(env, { nowMs })).status,
  };
}
