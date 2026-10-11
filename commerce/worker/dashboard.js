// The back office's first page (M9 首页, I5, I8, D50; M9-04, M9-12): four numbers, what needs someone, where the
// orders are on their way to the customer, the latest orders and whether the store's connections work.
// GET /admin/api/dashboard (worker/admin.js). Everything is data; the page words it in Chinese or English.
//
// Money: an order counts on the day it was paid (orders.paid_at, the team's calendar, worker/business-time.js), at its
// full total, also when it was refunded later; refunds count on the day the provider made them. Unpaid checkouts never
// count (D36).
import { mcfReadiness } from "./amazon-mcf.js";
import { calendar, DAY } from "./business-time.js";
import { cronHealth } from "./cron.js";
import { customerEmailConfig } from "./customer-email.js";
import { coolingOffMinutes } from "./order-core.js";
import { listOrders } from "./orders.js";
import { listProducts } from "./products.js";
import { waitingLists } from "./team-digest.js";

const ATTENTION_MAX = 20;
const iso = (ms) => new Date(ms).toISOString();
const first = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).first()) ?? {};
const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;

async function paidBetween(db, fromMs, toMs) {
  const row = await first(db, "SELECT COUNT(*) AS n, COALESCE(SUM(total_cents), 0) AS cents FROM orders WHERE paid_at IS NOT NULL AND paid_at >= ? AND paid_at < ?", iso(fromMs), iso(toMs));
  return { orders: row.n ?? 0, cents: row.cents ?? 0 };
}

// The four numbers and the counts the order list shows above itself.
export async function salesNumbers(env, { nowMs = Date.now() } = {}) {
  const db = env.DB;
  const cal = calendar(env, nowMs);
  const today = await paidBetween(db, cal.today, nowMs + 1);
  const month = await paidBetween(db, cal.month, nowMs + 1);
  const refunds = await first(db,
    "SELECT COUNT(DISTINCT order_id) AS n, COALESCE(SUM(amount_cents), 0) AS cents FROM order_refunds WHERE status != 'FAILED' AND provider_created_at >= ?",
    iso(cal.month));
  // Paid, not shipped, not cancelled: in the cooling-off period, waiting for Amazon or with Amazon.
  const toShip = await first(db,
    `SELECT COUNT(*) AS n FROM orders o WHERE o.status = 'paid'
       AND NOT EXISTS (SELECT 1 FROM order_fulfillments f WHERE f.order_id = o.id)`);
  // Paid to shipped, for shipments in the last 30 days.
  const shipTime = await first(db,
    `SELECT AVG((julianday(f.shipped_at) - julianday(o.paid_at))) AS days, COUNT(*) AS n
       FROM order_fulfillments f JOIN orders o ON o.id = f.order_id
      WHERE o.paid_at IS NOT NULL AND f.shipped_at >= ?`, iso(nowMs - 30 * DAY));
  return {
    timeZone: cal.zone,
    today: { revenueCents: today.cents, orders: today.orders },
    month: { revenueCents: month.cents, orders: month.orders, averageCents: month.orders ? Math.round(month.cents / month.orders) : 0 },
    refunds: { monthCents: refunds.cents ?? 0, monthOrders: refunds.n ?? 0 },
    toShip: toShip.n ?? 0,
    averageDaysToShip: shipTime.n ? Math.round(shipTime.days * 10) / 10 : null,
  };
}

// Where paid orders are on their way: cooling-off, waiting to go to Amazon, with Amazon (and how many of those Amazon
// cannot fill), shipped since Monday.
async function pipeline(env, nowMs) {
  const db = env.DB;
  const cal = calendar(env, nowMs);
  const coolingEnds = iso(nowMs - coolingOffMinutes(env) * 60_000);
  const notShipped = `o.status = 'paid' AND NOT EXISTS (SELECT 1 FROM order_fulfillments f WHERE f.order_id = o.id)`;
  const row = await first(db,
    `SELECT
       SUM(CASE WHEN m.order_id IS NULL AND o.paid_at > ? THEN 1 ELSE 0 END) AS cooling,
       SUM(CASE WHEN (m.order_id IS NULL AND o.paid_at <= ?) OR m.status = 'failed' THEN 1 ELSE 0 END) AS waiting,
       SUM(CASE WHEN m.status IN ('submitting', 'submitted') OR (m.status = 'rejected' AND m.mcf_status = 'UNFULFILLABLE') THEN 1 ELSE 0 END) AS amazon,
       SUM(CASE WHEN m.status = 'rejected' AND m.mcf_status = 'UNFULFILLABLE' THEN 1 ELSE 0 END) AS stockout
     FROM orders o LEFT JOIN order_mcf m ON m.order_id = o.id WHERE ${notShipped}`,
    coolingEnds, coolingEnds);
  const shipped = await first(db, "SELECT COUNT(*) AS n FROM order_fulfillments WHERE shipped_at >= ?", iso(cal.week));
  return {
    coolingOff: row.cooling ?? 0,
    waiting: row.waiting ?? 0,
    withAmazon: row.amazon ?? 0,
    outOfStock: row.stockout ?? 0,
    shippedThisWeek: shipped.n ?? 0,
    coolingOffMinutes: coolingOffMinutes(env),
  };
}

// The waiting lists (the daily summary's) as one list of orders, most urgent kinds first, with the customer's name.
async function attention(env, nowMs) {
  const lists = await waitingLists(env, { nowMs });
  const items = lists.flatMap(({ key, rows }) => rows.map((row) => ({
    kind: key,
    orderId: row.order_id,
    detail: Object.fromEntries(Object.entries(row).filter(([name]) => !["order_id", "shipping_json"].includes(name))),
  })));
  const shown = items.slice(0, ATTENTION_MAX);
  const ids = [...new Set(shown.map((item) => item.orderId))];
  const orders = ids.length
    ? Object.fromEntries((await all(env.DB, `SELECT id, shipping_json, total_cents FROM orders WHERE id IN (${ids.map(() => "?").join(",")})`, ...ids))
      .map((row) => {
        let shipping = {};
        try {
          shipping = JSON.parse(row.shipping_json);
        } catch {
          // shown without a name
        }
        return [row.id, { name: `${shipping.firstName ?? ""} ${shipping.lastName ?? ""}`.trim(), totalCents: row.total_cents }];
      }))
    : {};
  return {
    items: shown.map((item) => ({ ...item, name: orders[item.orderId]?.name ?? "", totalCents: orders[item.orderId]?.totalCents ?? null })),
    total: items.length,
    // Kinds with nothing waiting, for the "all clear" line.
    clear: lists.filter((list) => !list.rows.length).map((list) => list.key),
  };
}

// Whether each connection the store needs is set up and working. Names of settings only, never their values.
async function health(env, nowMs) {
  const db = env.DB;
  const cron = await cronHealth(env, { now: () => new Date(nowMs) });
  let mcf;
  try {
    mcf = mcfReadiness(env);
  } catch {
    mcf = { mode: "not_configured" };
  }
  const lastSync = await first(db, "SELECT last_ok_at FROM cron_runs WHERE job = 'mcf_sync'").catch(() => ({}));
  const digest = await first(db, "SELECT value, updated_at FROM ops_state WHERE key = 'digest.date'").catch(() => ({}));
  const unchecked = await first(db, "SELECT COUNT(*) AS n FROM orders WHERE status = 'paid' AND paid_at >= ? AND shipping_json LIKE '%\"reason\":\"unavailable\"%'", iso(nowMs - DAY)).catch(() => ({}));
  const set = (...names) => names.every((name) => String(env[name] ?? "").trim());
  return [
    { key: "airwallex", status: set("AIRWALLEX_CLIENT_ID", "AIRWALLEX_API_KEY") ? "ok" : "off", detail: { env: env.AIRWALLEX_ENV === "prod" ? "prod" : "demo" } },
    { key: "paypal", status: set("PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET") ? (set("PAYPAL_WEBHOOK_ID") ? "ok" : "warn") : "off", detail: { env: String(env.PAYPAL_ENV ?? "").toLowerCase() === "live" ? "live" : "sandbox", webhook: set("PAYPAL_WEBHOOK_ID") } },
    { key: "email", status: customerEmailConfig(env) ? "ok" : "off", detail: { from: customerEmailConfig(env)?.from ?? null } },
    { key: "amazon", status: mcf.mode === "ready" ? "ok" : mcf.mode === "off" ? "off" : "warn", detail: { mode: mcf.mode, lastSyncAt: lastSync.last_ok_at ?? null } },
    { key: "address", status: !set("GOOGLE_ADDRESS_VALIDATION_KEY") ? "off" : unchecked.n ? "warn" : "ok", detail: { uncheckedToday: unchecked.n ?? 0 } },
    { key: "schedule", status: cron.ok ? "ok" : "warn", detail: { lastRunAt: cron.cron.lastRunAt } },
    { key: "digest", status: digest.value ? "ok" : "off", detail: { lastDate: digest.value ?? null, at: digest.updated_at ?? null } },
  ];
}

export async function dashboard(env, { nowMs = Date.now() } = {}) {
  const [numbers, ship, waiting, connections, products, latest] = await Promise.all([
    salesNumbers(env, { nowMs }),
    pipeline(env, nowMs),
    attention(env, nowMs),
    health(env, nowMs),
    listProducts(env, { nowMs }),
    listOrders(env.DB, { limit: 5, coolingMinutes: coolingOffMinutes(env), nowMs }),
  ]);
  return {
    generatedAt: iso(nowMs),
    numbers,
    pipeline: ship,
    attention: waiting,
    health: connections,
    products: products.map(({ id, sku, name, routine, size, priceCents, onSale, stock }) => ({ id, sku, name, routine, size, priceCents, onSale, stock })),
    latest: latest.orders,
  };
}
