// Amazon stock for the store (D25, D76; M6-09, M9-17, A3, B3, I9). The cron reads, every 15 minutes, what Amazon can
// ship of each product through the Amazon gateway (worker/amazon-mcf.js getInventory) and keeps it in product_stock.
//
//   - Fewer than STOCK_THRESHOLD sellable: the product is out of stock. The site shows Out of stock and every quote and
//     checkout refuses it (worker/products.js livePricing, worker/catalog.js); the team gets one email. At the threshold
//     or above it sells again by itself. An owner's stop-selling switch (worker/products.js) is separate and wins.
//   - A cart asking for more than Amazon can ship is refused too (worker/catalog.js).
//   - Amazon cannot be read (D76): the store keeps selling on the last numbers it read. After an hour without a read the
//     team gets one email and the back office shows since when. A product never read sells (nothing to go on).
//   - Only products mapped to an Amazon seller SKU (MCF_SKU_MAP_JSON) are read; nothing is read without the connection.
//
// Staging reads the real Amazon stock (read-only) although its orders go to the fake Amazon. To try a stock-out there,
// set product_stock.simulated_available (docs/ops/runbook.md section 26); production ignores that column.
//
//   POST /admin/api/products/stock/refresh   read now (the back office's Refresh button; worker/admin.js)
import { getInventory, mcfConfig } from "./amazon-mcf.js";
import { adminHost } from "./hosts.js";
import { resolvePricing } from "./pricing.js";
import { isStaging } from "./staging.js";
import { alertTeam } from "./team-alerts.js";

export const STOCK_THRESHOLD = 5;
export const READ_EVERY_MS = 15 * 60_000;
export const STALE_AFTER_MS = 60 * 60_000;
// The Refresh button reads again only when the last read is older than this.
const REFRESH_GAP_MS = 30_000;
// A cron tick a little early still reads (the cron runs every 5 minutes in production, 2 on staging).
const EARLY_MS = 60_000;
const STATE_KEY = "stock.read";

const iso = (ms) => new Date(ms).toISOString();
const clip = (value, max = 300) => String(value ?? "").slice(0, max);
const adminUrlOf = (env) => `${adminHost(env) ? `https://${adminHost(env)}` : "https://www.shopapgo.com"}/admin/`;

// The products to read: [{ id, sku, name, sellerSku }], only those mapped to an Amazon seller SKU.
export function stockTargets(env) {
  let config;
  try {
    config = mcfConfig(env);
  } catch {
    return [];
  }
  if (config.fake === "blocked" || !config.connectionOk || config.skuError) return [];
  return Object.entries(resolvePricing(env).products)
    .map(([id, product]) => ({ id, sku: product.sku, name: product.name, sellerSku: config.skuMap[String(product.sku).toUpperCase()] ?? null }))
    .filter((target) => target.sellerSku);
}

async function readRows(db) {
  try {
    const { results } = await db.prepare("SELECT * FROM product_stock").all();
    return Object.fromEntries(results.map((row) => [row.sku, row]));
  } catch {
    return {}; // before migration 0014: nothing read yet
  }
}

// { attemptAt, okAt, failingSince, error }: the last read tried, the last one that worked, since when reads fail.
async function readState(db) {
  try {
    const row = await db.prepare("SELECT value FROM ops_state WHERE key = ?").bind(STATE_KEY).first();
    return row?.value ? JSON.parse(row.value) : {};
  } catch {
    return {};
  }
}

async function writeState(db, state, nowMs) {
  await db
    .prepare(`INSERT INTO ops_state (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .bind(STATE_KEY, JSON.stringify(state), iso(nowMs))
    .run();
}

// What the store goes by for one product: Amazon's number, or on staging the simulated one.
const effective = (env, row) => (isStaging(env) && Number.isInteger(row?.simulated_available) ? row.simulated_available : row?.available);

const view = (env, row) => {
  const available = effective(env, row);
  return {
    connected: true,
    available,
    inbound: row.inbound,
    reserved: row.reserved,
    threshold: STOCK_THRESHOLD,
    outOfStock: available < STOCK_THRESHOLD,
    outSince: row.out_since ?? null,
    amazonUpdatedAt: row.amazon_updated_at ?? null,
    readAt: row.read_at,
    simulated: available !== row.available,
    // Staging's simulated number replaces Amazon's: what Amazon really has, for the back office.
    ...(available !== row.available ? { amazonAvailable: row.available } : {}),
  };
};

const notRead = () => ({ connected: false, available: null, inbound: null, reserved: null, threshold: STOCK_THRESHOLD, outOfStock: false, outSince: null, amazonUpdatedAt: null, readAt: null, simulated: false });

// The stock as the store uses it: { products: { [id]: view }, status: { configured, lastReadAt, lastAttemptAt, error,
// failingSince, stale } }. Products not read yet are "not connected" and sell.
export async function currentStock(env, { nowMs = Date.now() } = {}) {
  const targets = stockTargets(env);
  const [rows, state] = await Promise.all([readRows(env.DB), readState(env.DB)]);
  const products = Object.fromEntries(Object.keys(resolvePricing(env).products).map((id) => {
    const row = rows[id];
    const mapped = targets.some((target) => target.id === id);
    return [id, mapped && row ? view(env, row) : notRead()];
  }));
  const since = state.okAt ?? state.failingSince ?? null;
  return {
    products,
    status: {
      configured: targets.length > 0,
      lastReadAt: state.okAt ?? null,
      lastAttemptAt: state.attemptAt ?? null,
      error: state.error ?? null,
      failingSince: state.failingSince ?? null,
      stale: targets.length > 0 && Boolean(state.error) && Boolean(since) && nowMs - Date.parse(since) >= STALE_AFTER_MS,
    },
  };
}

// Product ids an owner stopped selling (product_settings; worker/products.js): their stock-outs need no email or reminder.
export async function stoppedProducts(db) {
  try {
    const { results } = await db.prepare("SELECT sku FROM product_settings WHERE on_sale = 0").all();
    return new Set(results.map((row) => row.sku));
  } catch {
    return new Set();
  }
}

async function alertOut(env, target, row) {
  await alertTeam(env, {
    key: `stock-out:${target.id}:${row.out_since}`,
    kind: "stock_out",
    subject: `Out of stock on the website: ${target.name}`,
    lines: [
      `Amazon can ship ${row.available} of ${target.name} (${target.sku}, Amazon SKU ${target.sellerSku}), fewer than ${STOCK_THRESHOLD}.`,
      "The website now shows it as Out of stock and no one can check out with it. Paid orders are not affected.",
      `It sells again by itself once Amazon has ${STOCK_THRESHOLD} or more (the store checks every 15 minutes).`,
      `Back office, Products: ${adminUrlOf(env)}#/products/${target.id}`,
    ],
  });
}

// Reads Amazon now and stores the numbers. Never throws: { ran, ok, read?, out?, error? }.
export async function refreshStock(env, { nowMs = Date.now() } = {}) {
  const db = env.DB;
  const targets = stockTargets(env);
  if (!targets.length) return { ran: false };
  const state = await readState(db);
  let items;
  try {
    items = await getInventory(env, targets.map((target) => target.sellerSku));
  } catch (error) {
    const message = clip(error?.message ?? error, 200);
    await writeState(db, { ...state, attemptAt: iso(nowMs), error: message, failingSince: state.failingSince ?? iso(nowMs) }, nowMs);
    console.error("stock_read_failed", { message });
    return { ran: true, ok: false, error: message };
  }
  const bySeller = new Map(items.map((item) => [item.sellerSku, item]));
  const before = await readRows(db);
  const wentOut = [];
  for (const target of targets) {
    // A seller SKU Amazon left out of the reply has no stock there.
    const item = bySeller.get(target.sellerSku) ?? { fulfillable: 0, inbound: 0, reserved: 0, updatedAt: null };
    const old = before[target.id];
    const next = { ...old, sku: target.id, seller_sku: target.sellerSku, available: item.fulfillable, inbound: item.inbound, reserved: item.reserved, amazon_updated_at: item.updatedAt, read_at: iso(nowMs) };
    const out = effective(env, next) < STOCK_THRESHOLD;
    next.out_since = out ? (old?.out_since ?? iso(nowMs)) : null;
    await db
      .prepare(`INSERT INTO product_stock (sku, seller_sku, available, inbound, reserved, amazon_updated_at, read_at, out_since)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(sku) DO UPDATE SET seller_sku = excluded.seller_sku, available = excluded.available, inbound = excluded.inbound,
          reserved = excluded.reserved, amazon_updated_at = excluded.amazon_updated_at, read_at = excluded.read_at, out_since = excluded.out_since`)
      .bind(next.sku, next.seller_sku, next.available, next.inbound, next.reserved, next.amazon_updated_at, next.read_at, next.out_since)
      .run();
    if (out && !old?.out_since) wentOut.push({ target, row: { ...next, available: effective(env, next) } });
  }
  await writeState(db, { attemptAt: iso(nowMs), okAt: iso(nowMs) }, nowMs);
  const stopped = wentOut.length ? await stoppedProducts(db) : new Set();
  for (const { target, row } of wentOut) if (!stopped.has(target.id)) await alertOut(env, target, row);
  return { ran: true, ok: true, read: targets.length, out: wentOut.map(({ target }) => target.id) };
}

// Cron job "stock": reads every 15 minutes; after an hour of failed reads, one email to the team. Never throws.
export async function scheduledStock(env, { nowMs = Date.now() } = {}) {
  try {
    if (!stockTargets(env).length) return { ran: false };
    const state = await readState(env.DB);
    if (state.attemptAt && nowMs - Date.parse(state.attemptAt) < READ_EVERY_MS - EARLY_MS) return { ran: false, reason: "not_due" };
    const outcome = await refreshStock(env, { nowMs });
    if (!outcome.ok) {
      const { status } = await currentStock(env, { nowMs });
      if (status.stale) {
        await alertTeam(env, {
          key: `stock-stale:${status.failingSince}`,
          kind: "stock_stale",
          subject: "Amazon stock has not been read for an hour",
          lines: [
            `The store could not read the stock at Amazon since ${status.lastReadAt ?? status.failingSince} (last error: ${status.error}).`,
            "The website keeps selling on the last numbers it read, so it may sell something Amazon has run out of (the out-of-stock steps on the order page then apply).",
            "Check the Amazon gateway (docs/ops/runbook.md sections 25 and 26). This email comes once; the back office shows the problem until reads work again.",
          ],
        });
      }
    }
    return outcome;
  } catch (error) {
    console.error("stock_job_failed", { message: clip(error?.message ?? error, 200) });
    return { ran: false, error: clip(error?.message ?? error, 200) };
  }
}

// The back office's Refresh button: reads now unless the last read is under 30 seconds old.
export async function refreshStockNow(env, { nowMs = Date.now() } = {}) {
  if (!stockTargets(env).length) return { ran: false, reason: "not_configured" };
  const state = await readState(env.DB);
  if (state.attemptAt && nowMs - Date.parse(state.attemptAt) < REFRESH_GAP_MS) return { ran: false, reason: "just_read" };
  return refreshStock(env, { nowMs });
}
