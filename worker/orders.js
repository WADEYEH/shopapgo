import { toMajor } from "./catalog.js";
import { maskEmail } from "./checkout.js";
import { getFulfillment, listAudit } from "./fulfillment.js";

const now = () => new Date().toISOString();

export async function insertOrder(db, { id, checkout, quote }) {
  const timestamp = now();
  await db
    .prepare(
      `INSERT INTO orders (id, status, email, marketing_opt_in, shipping_json, shipping_method, lines_json,
        currency, subtotal_cents, shipping_cents, tax_cents, total_cents, created_at, updated_at)
       VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      checkout.email,
      checkout.marketingOptIn ? 1 : 0,
      JSON.stringify(checkout.shipping),
      quote.shippingMethod,
      JSON.stringify(quote.lines),
      quote.currency,
      quote.subtotalCents,
      quote.shippingCents,
      quote.taxCents ?? 0,
      quote.totalCents,
      timestamp,
      timestamp,
    )
    .run();
}

export async function attachPaymentIntent(db, orderId, intentId) {
  await db
    .prepare("UPDATE orders SET payment_intent_id = ?, updated_at = ? WHERE id = ?")
    .bind(intentId, now(), orderId)
    .run();
}

export function getOrder(db, orderId) {
  return db.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();
}

export function getOrderByIntent(db, intentId) {
  return db.prepare("SELECT * FROM orders WHERE payment_intent_id = ?").bind(intentId).first();
}

// An order whose PaymentIntent could not be created can never be paid; close it so
// it does not sit in the admin list as "pending" forever.
export async function cancelUnpayableOrder(db, orderId) {
  await db
    .prepare("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'pending' AND payment_intent_id IS NULL")
    .bind(now(), orderId)
    .run();
}

// Applies a PaymentIntent snapshot (from a webhook or a Retrieve call) to its order.
// A succeeded intent whose amount or currency disagrees with the stored total is
// parked in "review" instead of being marked paid. `changed` is true only for the
// call that actually moved the order out of "pending" (the UPDATE is guarded by
// status = 'pending'), which is what makes "notify once" safe under races.
export async function settleIntent(db, intent) {
  const order = await getOrder(db, intent.merchant_order_id);
  if (!order || order.payment_intent_id !== intent.id) return { status: null, changed: false, order: null };
  if (order.status !== "pending") return { status: order.status, changed: false, order };

  let status = null;
  if (intent.status === "SUCCEEDED") {
    const matches = intent.currency === order.currency && Math.abs(Number(intent.amount) - toMajor(order.total_cents)) < 0.005;
    status = matches ? "paid" : "review";
  } else if (intent.status === "CANCELLED") {
    status = "cancelled";
  }
  if (!status) return { status: order.status, changed: false, order };

  const timestamp = now();
  const result = await db
    .prepare("UPDATE orders SET status = ?, paid_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
    .bind(status, status === "paid" ? timestamp : null, timestamp, order.id)
    .run();
  const changed = (result?.meta?.changes ?? 1) > 0;
  return { status: changed ? status : (await getOrder(db, order.id)).status, changed, order: changed ? await getOrder(db, order.id) : order };
}

export async function applyIntentStatus(db, intent) {
  return (await settleIntent(db, intent)).status;
}

// ---------- New-order notification bookkeeping ----------

export async function claimNotification(db, orderId) {
  const timestamp = now();
  const result = await db
    .prepare("INSERT OR IGNORE INTO order_notifications (order_id, status, detail_json, created_at, updated_at) VALUES (?, 'pending', '[]', ?, ?)")
    .bind(orderId, timestamp, timestamp)
    .run();
  return result.meta.changes > 0;
}

export async function finishNotification(db, orderId, results) {
  const sent = results.some((r) => r.status === "sent");
  const failed = results.some((r) => r.status === "failed");
  const status = sent ? "sent" : failed ? "failed" : "skipped";
  await db
    .prepare("UPDATE order_notifications SET status = ?, detail_json = ?, updated_at = ? WHERE order_id = ?")
    .bind(status, JSON.stringify(results), now(), orderId)
    .run();
  return status;
}

export function getNotification(db, orderId) {
  return db.prepare("SELECT status, detail_json, updated_at FROM order_notifications WHERE order_id = ?").bind(orderId).first();
}

// Audit log of delivered events; returns true the first time an event id is seen.
export async function recordWebhookEvent(db, event) {
  const result = await db
    .prepare("INSERT OR IGNORE INTO webhook_events (id, name, received_at) VALUES (?, ?, ?)")
    .bind(String(event.id), String(event.name), now())
    .run();
  return result.meta.changes > 0;
}

// What the confirmation page may see: no address, masked email.
export function publicOrder(order) {
  return {
    id: order.id,
    status: order.status,
    email: maskEmail(order.email),
    currency: order.currency,
    lines: JSON.parse(order.lines_json).map(({ id, sku, name, routine, size, qty, lineCents }) => ({
      id, sku, name, routine, size, qty, lineCents,
    })),
    shippingMethod: order.shipping_method,
    subtotalCents: order.subtotal_cents,
    shippingCents: order.shipping_cents,
    taxCents: order.tax_cents,
    totalCents: order.total_cents,
    createdAt: order.created_at,
  };
}

// ---------- Admin views (only ever returned behind ADMIN_TOKEN) ----------

export const ORDER_STATUSES = ["pending", "paid", "review", "cancelled"];

const ADMIN_LIST_LIMIT = 100;

function adminSummary(row) {
  const shipping = JSON.parse(row.shipping_json);
  const lines = JSON.parse(row.lines_json);
  return {
    id: row.id,
    status: row.status,
    email: row.email,
    name: `${shipping.firstName} ${shipping.lastName}`.trim(),
    state: shipping.state,
    itemCount: lines.reduce((sum, line) => sum + line.qty, 0),
    currency: row.currency,
    totalCents: row.total_cents,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    notification: row.notification_status ?? null,
    fulfillmentStatus: row.fulfillment_status ?? "unfulfilled",
    shippedAt: row.shipped_at ?? null,
  };
}

export async function listOrders(db, { status, fulfillment, q, limit = 50, before } = {}) {
  const clauses = [];
  const args = [];
  if (status && ORDER_STATUSES.includes(status)) {
    clauses.push("o.status = ?");
    args.push(status);
  }
  // "unfulfilled" = paid and not yet shipped (the to-ship queue); "shipped" = has a shipment row.
  if (fulfillment === "unfulfilled") clauses.push("o.status = 'paid' AND f.order_id IS NULL");
  else if (fulfillment === "shipped") clauses.push("f.order_id IS NOT NULL");
  if (q) {
    clauses.push("(instr(lower(o.id), ?) > 0 OR instr(lower(o.email), ?) > 0 OR instr(lower(o.shipping_json), ?) > 0)");
    const needle = String(q).trim().toLowerCase().slice(0, 100);
    args.push(needle, needle, needle);
  }
  if (before) {
    clauses.push("o.created_at < ?");
    args.push(String(before));
  }
  const pageSize = Math.max(1, Math.min(ADMIN_LIST_LIMIT, Number(limit) || 50));
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const { results } = await db
    .prepare(
      `SELECT o.*, n.status AS notification_status,
              COALESCE(f.fulfillment_status, 'unfulfilled') AS fulfillment_status, f.shipped_at AS shipped_at
         FROM orders o LEFT JOIN order_notifications n ON n.order_id = o.id
         LEFT JOIN order_fulfillments f ON f.order_id = o.id
         ${where} ORDER BY o.created_at DESC LIMIT ?`,
    )
    .bind(...args, pageSize + 1)
    .all();
  const page = results.slice(0, pageSize);
  return {
    orders: page.map(adminSummary),
    nextBefore: results.length > pageSize ? page.at(-1).created_at : null,
  };
}

export async function orderCounts(db) {
  const { results } = await db.prepare("SELECT status, COUNT(*) AS n FROM orders GROUP BY status").all();
  const counts = Object.fromEntries(ORDER_STATUSES.map((status) => [status, 0]));
  for (const row of results) counts[row.status] = row.n;
  return counts;
}

export const FULFILLMENT_FILTERS = ["unfulfilled", "shipped"];

// Counts for the fulfilment tabs: "unfulfilled" only counts paid orders (the to-ship queue).
export async function fulfillmentCounts(db) {
  const row = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN o.status = 'paid' AND f.order_id IS NULL THEN 1 ELSE 0 END) AS unfulfilled,
         SUM(CASE WHEN f.order_id IS NOT NULL THEN 1 ELSE 0 END) AS shipped
       FROM orders o LEFT JOIN order_fulfillments f ON f.order_id = o.id`,
    )
    .first();
  return { unfulfilled: row?.unfulfilled ?? 0, shipped: row?.shipped ?? 0 };
}

export async function adminOrder(db, orderId) {
  const order = await getOrder(db, orderId);
  if (!order) return null;
  const notification = await getNotification(db, orderId);
  const fulfillment = await getFulfillment(db, orderId);
  const emails = await getOrderEmails(db, orderId);
  const audit = await listAudit(db, orderId);
  return {
    id: order.id,
    status: order.status,
    email: order.email,
    marketingOptIn: order.marketing_opt_in === 1,
    shipping: JSON.parse(order.shipping_json),
    shippingMethod: order.shipping_method,
    lines: JSON.parse(order.lines_json),
    currency: order.currency,
    subtotalCents: order.subtotal_cents,
    shippingCents: order.shipping_cents,
    taxCents: order.tax_cents,
    totalCents: order.total_cents,
    paymentIntentId: order.payment_intent_id,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    paidAt: order.paid_at,
    notification: notification
      ? { status: notification.status, updatedAt: notification.updated_at, channels: JSON.parse(notification.detail_json) }
      : null,
    fulfillmentStatus: fulfillment?.status ?? "unfulfilled",
    fulfillment,
    emails,
    audit,
  };
}

// ---------- Customer email bookkeeping (idempotency claim per order + kind) ----------

export const EMAIL_KINDS = ["confirmation", "shipment"];

export async function claimOrderEmail(db, orderId, kind) {
  const timestamp = now();
  const result = await db
    .prepare("INSERT OR IGNORE INTO order_emails (order_id, kind, status, detail, created_at, updated_at) VALUES (?, ?, 'pending', '', ?, ?)")
    .bind(orderId, kind, timestamp, timestamp)
    .run();
  return result.meta.changes > 0;
}

export async function finishOrderEmail(db, orderId, kind, { status, detail = "" }) {
  await db
    .prepare("UPDATE order_emails SET status = ?, detail = ?, updated_at = ? WHERE order_id = ? AND kind = ?")
    .bind(status, String(detail).slice(0, 200), now(), orderId, kind)
    .run();
}

export async function getOrderEmails(db, orderId) {
  const { results } = await db
    .prepare("SELECT kind, status, detail, updated_at FROM order_emails WHERE order_id = ? ORDER BY created_at, kind")
    .bind(orderId)
    .all();
  return results.map((row) => ({ kind: row.kind, status: row.status, detail: row.detail, updatedAt: row.updated_at }));
}
