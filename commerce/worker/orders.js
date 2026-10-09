import { toMajor } from "./catalog.js";
import { maskEmail } from "./checkout.js";
import { getFulfillment, listAudit } from "./fulfillment.js";
import { listPaymentFailures } from "./payment-failures.js";
import { refundView } from './refunds.js';
import { amountsMatch, isUsableUsShipping } from "./paypal.js";
import { checkoutIdForPayment, markPayment, paymentBelongsTo, recordPayment } from "./checkouts.js";

// A checkout that a payment may still turn into an order (D36): pending, expired (a late payment still counts, M4-04),
// or closed before any payment. An order cancelled after payment (order_cancellations) never is.
const SETTLEABLE = `(status IN ('pending', 'expired') OR (status = 'cancelled' AND paid_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM order_cancellations c WHERE c.order_id = orders.id)))`;

// After a payment that succeeded did not settle the checkout: a redelivery of the payment that did (nothing to do), or
// a second payment for an order already paid (refunded by worker/checkouts.js refundDuplicate).
function alreadySettled(order, provider, ref, amountCents, currency, captureId = "") {
  const duplicate = order.payment_intent_id !== ref;
  return { status: order.status, changed: false, order, ...(duplicate ? { duplicate: { provider, ref, amountCents, currency, captureId } } : {}) };
}

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

export async function attachPaypalOrder(db, orderId, paypalOrderId) {
  const timestamp = now();
  await db
    .prepare("UPDATE orders SET payment_intent_id = ?, updated_at = ? WHERE id = ?")
    .bind(paypalOrderId, timestamp, orderId)
    .run();
  await db
    .prepare("INSERT OR IGNORE INTO order_payments (order_id, provider, provider_ref, created_at) VALUES (?, 'paypal', ?, ?)")
    .bind(orderId, paypalOrderId, timestamp)
    .run();
}

// The provider of the order's current payment object (the one that paid, once paid): from checkout_payments, else
// order_payments (PayPal orders made before checkouts were reused). null = Airwallex.
export async function getOrderPayment(db, orderId) {
  const current = await db
    .prepare(
      `SELECT p.provider, p.ref AS provider_ref, p.created_at FROM orders o
         JOIN checkout_payments p ON p.checkout_id = o.id AND p.ref = o.payment_intent_id
        WHERE o.id = ?`,
    )
    .bind(orderId)
    .first();
  if (current) return current;
  return db.prepare("SELECT provider, provider_ref, created_at FROM order_payments WHERE order_id = ?").bind(orderId).first();
}

export async function getOrderByPaypalOrderId(db, paypalOrderId) {
  const checkoutId = await checkoutIdForPayment(db, "paypal", paypalOrderId);
  if (checkoutId) return getOrder(db, checkoutId);
  const viaTable = await db
    .prepare(
      `SELECT o.* FROM orders o
         JOIN order_payments p ON p.order_id = o.id
        WHERE p.provider = 'paypal' AND p.provider_ref = ?`,
    )
    .bind(paypalOrderId)
    .first();
  if (viaTable) return viaTable;
  return getOrderByIntent(db, paypalOrderId);
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
  // Any PaymentIntent the checkout ever had counts, not only the latest (worker/checkouts.js).
  if (!order || !(await paymentBelongsTo(db, "airwallex", intent.id, order.id))) return { status: null, changed: false, order: null };
  // A cancelled intent was replaced or voided: the checkout itself stays open until it is paid or expires.
  if (intent.status === "CANCELLED") {
    await markPayment(db, "airwallex", intent.id, "voided");
    return { status: order.status, changed: false, order };
  }
  if (intent.status !== "SUCCEEDED") return { status: order.status, changed: false, order };

  const amountCents = Math.round(Number(intent.amount) * 100);
  const matches = intent.currency === order.currency && Math.abs(Number(intent.amount) - toMajor(order.total_cents)) < 0.005;
  const status = matches ? "paid" : "review";
  const timestamp = now();
  const update = db
    .prepare(`UPDATE orders SET status = ?, paid_at = ?, payment_intent_id = ?, updated_at = ? WHERE id = ? AND ${SETTLEABLE}`)
    .bind(status, status === "paid" ? timestamp : null, intent.id, timestamp, order.id);
  // Commit payment and its confirmation instruction together. waitUntil is only
  // a latency optimization; a fresh Worker can recover the instruction via cron.
  // The timestamp guard excludes historic paid orders if a concurrent call won.
  const result = status === "paid" ? (await db.batch([
    update,
    db.prepare(`INSERT OR IGNORE INTO order_email_jobs (order_id, kind, status, created_at, updated_at)
      SELECT id, 'confirmation', 'pending', ?, ? FROM orders
      WHERE id = ? AND status = 'paid' AND paid_at = ? AND updated_at = ?`)
      .bind(timestamp, timestamp, order.id, timestamp, timestamp),
  ]))[0] : await update.run();
  const changed = (result?.meta?.changes ?? 1) > 0;
  if (!changed) return alreadySettled(await getOrder(db, order.id), "airwallex", intent.id, amountCents, intent.currency);
  await recordPayment(db, { provider: "airwallex", ref: intent.id, checkoutId: order.id, amountCents, currency: intent.currency });
  await markPayment(db, "airwallex", intent.id, "succeeded");
  return { status, changed, order: await getOrder(db, order.id), lateAfterExpiry: order.status === "expired", payment: { provider: "airwallex", ref: intent.id } };
}

export async function applyIntentStatus(db, intent) {
  return (await settleIntent(db, intent)).status;
}

// PayPal settle: a COMPLETED capture whose amount/currency matches and whose
// shipping is a usable US address becomes paid. A completed capture that is
// missing an address or whose amount disagrees is parked in review — never paid.
export async function settlePaypalOrder(db, { orderId, paypalOrderId, status, amountValue, currency, shipping, captureId = "" }) {
  const order = orderId ? await getOrder(db, orderId) : await getOrderByPaypalOrderId(db, paypalOrderId);
  if (!order || !(await paymentBelongsTo(db, "paypal", paypalOrderId, order.id))) return { status: null, changed: false, order: null };
  if (status !== "COMPLETED") return { status: order.status, changed: false, order };
  const amountCents = Math.round(Number(amountValue) * 100);

  const matches = currency === order.currency && amountsMatch(amountValue, order.total_cents);
  const addressOk = isUsableUsShipping(shipping);
  const nextStatus = matches && addressOk ? "paid" : "review";
  const timestamp = now();
  // The phone and the address check come from our checkout page; PayPal's address carries neither. The check only
  // still applies when PayPal ships to the very address that was checked.
  const stored = JSON.parse(order.shipping_json || "{}");
  const sameAddress = ["street", "street2", "city", "state", "zip"]
    .every((key) => String(stored[key] ?? "").trim().toLowerCase() === String(shipping?.[key] ?? "").trim().toLowerCase());
  const shippingJson = shipping ? JSON.stringify({
    firstName: shipping.firstName,
    lastName: shipping.lastName,
    street: shipping.street,
    street2: shipping.street2 || "",
    city: shipping.city,
    state: shipping.state,
    zip: shipping.zip,
    ...(stored.phone ? { phone: stored.phone } : {}),
    addressCheck: sameAddress && stored.addressCheck ? stored.addressCheck : { status: "unverified", reason: "paypal_address" },
  }) : order.shipping_json;

  const result = await db
    .prepare(`UPDATE orders SET status = ?, paid_at = ?, shipping_json = ?, payment_intent_id = ?, updated_at = ? WHERE id = ? AND ${SETTLEABLE}`)
    .bind(nextStatus, nextStatus === "paid" ? timestamp : null, shippingJson, paypalOrderId, timestamp, order.id)
    .run();
  const changed = (result?.meta?.changes ?? 1) > 0;
  if (!changed) return alreadySettled(await getOrder(db, order.id), "paypal", paypalOrderId, amountCents, currency, captureId);
  await recordPayment(db, { provider: "paypal", ref: paypalOrderId, checkoutId: order.id, amountCents, currency });
  await markPayment(db, "paypal", paypalOrderId, "succeeded");
  return { status: nextStatus, changed, order: await getOrder(db, order.id), lateAfterExpiry: order.status === "expired", payment: { provider: "paypal", ref: paypalOrderId } };
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
      unitCents: qty > 0 ? Math.round(lineCents / qty) : lineCents,
    })),
    shippingMethod: order.shipping_method,
    subtotalCents: order.subtotal_cents,
    shippingCents: order.shipping_cents,
    taxCents: order.tax_cents,
    totalCents: order.total_cents,
    createdAt: order.created_at,
  };
}

// ---------- Admin views (only ever returned behind admin auth) ----------

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
    refundHold: Boolean(row.refund_hold),
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
  if (fulfillment === "unfulfilled") clauses.push("o.status = 'paid' AND f.order_id IS NULL AND NOT EXISTS (SELECT 1 FROM order_refunds r WHERE r.order_id=o.id AND r.status!='FAILED')");
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
              COALESCE(f.fulfillment_status, 'unfulfilled') AS fulfillment_status, f.shipped_at AS shipped_at,
              EXISTS(SELECT 1 FROM order_refunds r WHERE r.order_id=o.id AND r.status!='FAILED') AS refund_hold
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
         SUM(CASE WHEN o.status = 'paid' AND f.order_id IS NULL AND NOT EXISTS (SELECT 1 FROM order_refunds r WHERE r.order_id=o.id AND r.status!='FAILED') THEN 1 ELSE 0 END) AS unfulfilled,
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
    paymentFailures: await listPaymentFailures(db, orderId),
    refunds: await refundView(db, order),
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
    .prepare(`SELECT e.kind, e.status, e.detail, e.updated_at, d.status AS delivery_status, d.provider_id, d.attempts, d.next_attempt_at, d.first_attempt_at,
      CASE WHEN e.kind NOT LIKE 'refund:%' OR EXISTS (SELECT 1 FROM order_refunds r WHERE r.order_id=e.order_id AND (
        ('refund:'||r.id=e.kind AND r.status IN ('ACCEPTED','SETTLED')) OR
        (e.kind IN ('refund:failed:'||r.id,'refund:team-failed:'||r.id) AND r.status='FAILED'))) THEN 1 ELSE 0 END AS retry_valid
      FROM order_emails e LEFT JOIN order_email_delivery d ON d.order_id=e.order_id AND d.kind=e.kind WHERE e.order_id=?
      UNION ALL SELECT j.kind,'pending','Saved notification task; awaiting handoff.',j.updated_at,NULL,NULL,0,j.next_attempt_at,NULL,0
      FROM order_message_jobs j WHERE j.order_id=? AND j.status='pending'
        AND NOT EXISTS (SELECT 1 FROM order_emails e WHERE e.order_id=j.order_id AND e.kind=j.kind)
      ORDER BY updated_at,kind`)
    .bind(orderId,orderId)
    .all();
  return results.map((row) => ({ kind: row.kind, status: row.status, detail: row.detail, updatedAt: row.updated_at, deliveryStatus: row.delivery_status || null, providerId: row.provider_id || null, attempts: row.attempts || 0, nextAttemptAt: row.next_attempt_at || null,
    canRetry: Boolean(row.retry_valid) && (row.status === 'skipped' || (['retry', 'failed'].includes(row.delivery_status) && !row.provider_id && row.attempts < 6 && Date.now() - Date.parse(row.first_attempt_at) < 23 * 60 * 60_000)) }));
}
