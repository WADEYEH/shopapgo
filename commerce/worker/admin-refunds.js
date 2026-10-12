// Refunds from the order page (D51, M9-25, I16): an owner gives money back through Airwallex or PayPal without leaving
// the back office. Decided 10/12 (D55):
//
//   * Shipped or cancelled orders: refund in full or in part, up to what is left to refund.
//   * Orders that have not shipped (review, paid, with Amazon): only what is left, in full. "Cancel the order first" is
//     ticked by default: the order is cancelled (Amazon is asked first when it has the order, worker/order-core.js) and
//     the money only goes back when that worked. Unticked, the money goes back at once; a full refund then cancels the
//     order by the usual rule (applyRefundsToOrder), and when Amazon can no longer stop it, it ships.
//     A part refund before shipping is not offered: a registered refund holds shipping (M4 §3.5).
//   * Not while a dispute is open: the bank may take the money back as well.
//   * One request per press, keyed by the id the page made when the panel opened (refund-<key>): pressed twice, the
//     second press finds the first one, and the provider gets the same request id, so it never refunds twice. Two
//     panels at once cannot refund more than is left either: the amount is checked in the same statement that claims it.
//   * "Don't email the customer" (notify = 0): no refund notice and no cancellation notice for it; the provider's later
//     refund events for the same refund do not email either (refundNoticeMuted). The team's failure alert still goes.
import { createRefund } from "./airwallex.js";
import { inspectPaypalOrder, refundCapture, retrievePaypalOrder } from "./paypal.js";
import { getOrder, getOrderPayment } from "./orders.js";
import { OrderError, applyRefundsToOrder, cancelOrder, orderState } from "./order-core.js";
import { recordRefund, saveRefund } from "./refunds.js";
export { refundNoticeMuted } from "./refunds.js";
import { processMessageJob } from "./customer-email.js";
import { recordAudit } from "./fulfillment.js";
import { toMajor } from "./catalog.js";

export const REFUND_REASONS = ["customer_request", "returned", "damaged", "not_received", "out_of_stock", "goodwill", "other"];
// The cancellation reason a refund reason becomes when the order is cancelled first.
const CANCEL_REASON_FOR = { customer_request: "customer_request", out_of_stock: "out_of_stock" };
const NOT_SHIPPED = ["review", "paid", "fulfilling"];
const KEY = /^[A-Za-z0-9-]{8,64}$/;
const NOTE_MAX = 300;
const STALE_MS = 5 * 60_000;
const PAYPAL_REFUND_STATUS = { COMPLETED: "SETTLED", PENDING: "RECEIVED", FAILED: "FAILED", CANCELLED: "FAILED" };
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const clip = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);

// Money asked for but not yet seen in order_refunds (the provider's events record it later): from this panel and from
// "Cancel and refund" (worker/order-refunds.js). Counted against what is left, so nothing is refunded twice.
const IN_FLIGHT = (table) => `COALESCE((SELECT SUM(q.amount_cents) FROM ${table} q WHERE q.order_id = o.id
  AND (q.status = 'requesting' OR (q.status = 'requested' AND NOT EXISTS (SELECT 1 FROM order_refunds r WHERE r.id = q.refund_id)))), 0)`;
const REFUNDABLE_SQL = `o.total_cents
  - COALESCE((SELECT SUM(r.amount_cents) FROM order_refunds r WHERE r.order_id = o.id AND r.status != 'FAILED'), 0)
  - ${IN_FLIGHT("admin_refunds")} - ${IN_FLIGHT("order_refund_requests")}`;

export async function refundableCents(db, orderId) {
  const row = await db.prepare(`SELECT ${REFUNDABLE_SQL} AS left_cents FROM orders o WHERE o.id = ?`).bind(orderId).first();
  return Math.max(0, row?.left_cents ?? 0);
}

async function openDispute(db, orderId) {
  return Boolean(await db.prepare("SELECT 1 AS x FROM order_disputes WHERE order_id = ? AND status = 'open' LIMIT 1").bind(orderId).first());
}

// What the order page offers (adminOrderView): who may refund, how much, and whether only in full.
export async function refundPanel(env, order, actor) {
  const db = env.DB;
  const requests = await listAdminRefunds(db, order.id);
  const base = { requests, reasons: REFUND_REASONS };
  if (actor?.role !== "owner") return { ...base, allowed: false, why: "owner_only" };
  if (!order.paid_at || !order.payment_intent_id) return { ...base, allowed: false, why: "not_paid" };
  if (await openDispute(db, order.id)) return { ...base, allowed: false, why: "dispute_open" };
  const state = await orderState(env, order.id);
  const left = await refundableCents(db, order.id);
  if (left <= 0) return { ...base, allowed: false, why: "nothing_left", refundableCents: 0 };
  const unshipped = NOT_SHIPPED.includes(state?.stage);
  return { ...base, allowed: true, refundableCents: left, fullOnly: unshipped, canCancelFirst: unshipped, stage: state?.stage ?? null };
}

export async function listAdminRefunds(db, orderId) {
  const { results } = await db
    .prepare("SELECT * FROM admin_refunds WHERE order_id = ? ORDER BY created_at DESC, id")
    .bind(orderId)
    .all();
  return results.map((row) => ({
    id: row.id, amountCents: row.amount_cents, currency: row.currency, provider: row.provider, reason: row.reason_code,
    note: row.note || null, notify: row.notify === 1, cancelFirst: row.cancel_first === 1, status: row.status,
    refundId: row.refund_id || null, error: row.error || null, by: row.actor, at: row.created_at, updatedAt: row.updated_at,
  }));
}

function checkInput(body) {
  const key = String(body?.key ?? "");
  if (!KEY.test(key)) throw new OrderError(400, "invalid_key", "Open the refund panel again and retry.");
  const reason = String(body?.reason ?? "");
  if (!REFUND_REASONS.includes(reason)) throw new OrderError(400, "invalid_reason", "Choose why you are refunding.", { field: "reason" });
  const note = clip(body?.note, NOTE_MAX);
  if (reason === "other" && !note) throw new OrderError(400, "note_required", "Write why you are refunding.", { field: "note" });
  const amountCents = Number(body?.amountCents);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new OrderError(400, "invalid_amount", "Enter an amount above $0.", { field: "amount" });
  return { key, reason, note, amountCents, notify: body?.notify !== false, cancelFirst: body?.cancelFirst === true };
}

const outcomeOf = (row) => (row.status === "requested" ? "already_requested" : row.status === "failed" ? "failed" : "in_progress");

// Returns { outcome: "requested" | "already_requested" | "in_progress" | "failed" | "not_cancelled", refundId?, error?,
// cancelled? }. Throws OrderError for anything the owner has to change first.
export async function requestAdminRefund(env, orderId, body, { actor, adminUrl = null, nowMs = Date.now() } = {}) {
  if (actor?.role !== "owner") throw new OrderError(403, "owner_only", "Only an owner can refund.");
  const input = checkInput(body);
  const db = env.DB;
  const id = `refund-${input.key}`;
  const known = await db.prepare("SELECT * FROM admin_refunds WHERE id = ?").bind(id).first();
  if (known && known.order_id !== orderId) throw new OrderError(409, "key_in_use", "Open the refund panel again and retry.");
  // Pressed again: the same request. Only one that never got an answer for 5 minutes is asked again (same request id).
  const stale = known?.status === "requesting" && nowMs - Date.parse(known.updated_at) > STALE_MS;
  if (known && !stale) return { outcome: outcomeOf(known), refundId: known.refund_id || null, error: known.error || null };

  let order = await getOrder(db, orderId);
  if (!order) throw new OrderError(404, "not_found", "Order not found.");
  if (!order.paid_at || !order.payment_intent_id) throw new OrderError(409, "not_paid", "This order was never paid, so there is nothing to refund.");
  if (await openDispute(db, orderId)) throw new OrderError(409, "dispute_open", "A dispute is open for this order. Answer it in the provider's dashboard; do not refund now.");
  const state = await orderState(env, orderId, nowMs);
  const unshipped = NOT_SHIPPED.includes(state.stage);
  const left = await refundableCents(db, orderId);
  if (!known) {
    if (left <= 0) throw new OrderError(409, "nothing_left", "Everything paid for this order has been refunded.");
    if (input.amountCents > left) throw new OrderError(409, "more_than_left", `You can refund up to ${(left / 100).toFixed(2)} on this order.`, { field: "amount" });
    if (unshipped && input.amountCents !== left) throw new OrderError(409, "full_only", "This order has not shipped: refund it in full, or wait until it ships for a part refund.", { field: "amount" });
  }

  // Cancel first (D55): only an order that has not shipped; nothing is refunded when the cancellation does not happen.
  let cancelled = false;
  if (!known && input.cancelFirst && unshipped) {
    try {
      const reasonCode = CANCEL_REASON_FOR[input.reason] ?? "full_refund";
      const result = await cancelOrder(env, orderId, { actor, reasonCode, note: input.note }, { nowMs, adminUrl, notify: input.notify });
      cancelled = result.changed;
    } catch (error) {
      if (!(error instanceof OrderError) || error.code === "already_cancelled") throw error;
      return { outcome: "not_cancelled", error: error.message };
    }
    order = await getOrder(db, orderId);
  }

  const provider = (await getOrderPayment(db, orderId))?.provider ?? "airwallex";
  const at = iso(nowMs);
  const claimed = known
    ? await db.prepare("UPDATE admin_refunds SET updated_at = ?, actor = ? WHERE id = ? AND status = 'requesting' AND updated_at = ?")
      .bind(at, actor.id, id, known.updated_at).run()
    : await db.prepare(
      `INSERT OR IGNORE INTO admin_refunds (id, order_id, provider, ref, amount_cents, currency, reason_code, note, notify, cancel_first, status, actor, created_at, updated_at)
       SELECT ?, o.id, ?, o.payment_intent_id, ?, o.currency, ?, ?, ?, ?, 'requesting', ?, ?, ? FROM orders o
       WHERE o.id = ? AND ? <= (${REFUNDABLE_SQL})`,
    ).bind(id, provider, input.amountCents, input.reason, input.note, input.notify ? 1 : 0, input.cancelFirst ? 1 : 0, actor.id, at, at, orderId, input.amountCents).run();
  if (!(claimed.meta?.changes > 0)) {
    const row = await db.prepare("SELECT * FROM admin_refunds WHERE id = ?").bind(id).first();
    if (row) return { outcome: outcomeOf(row), refundId: row.refund_id || null, cancelled };
    throw new OrderError(409, "more_than_left", "Someone refunded this order meanwhile. Reload it.", { field: "amount" });
  }
  const amountCents = known ? known.amount_cents : input.amountCents;
  const full = amountCents === order.total_cents;

  let refund;
  try {
    if (provider === "paypal") {
      const captureId = inspectPaypalOrder(await retrievePaypalOrder(env, order.payment_intent_id)).captureId;
      if (!captureId) throw new Error("PayPal shows no captured payment for this order.");
      refund = await refundCapture(env, captureId, {
        requestId: id, note: `Refund for your APGO order ${order.id}.`,
        amount: full ? null : { value: toMajor(amountCents).toFixed(2), currency_code: order.currency },
      });
    } else {
      refund = await createRefund(env, { intentId: order.payment_intent_id, amount: toMajor(amountCents), requestId: id, reason: `Refund from the back office (${input.reason})` });
    }
  } catch (error) {
    const message = clip(error?.message ?? "The payment provider did not accept the refund.", 200);
    await db.prepare("UPDATE admin_refunds SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").bind(message, iso(), id).run();
    await recordAudit(db, { orderId, action: "order.refund_failed", actor: actor.id, detail: { provider, amountCents, error: message } });
    return { outcome: "failed", error: message, cancelled };
  }

  const refundId = clip(refund?.id, 120);
  await db.prepare("UPDATE admin_refunds SET status = 'requested', refund_id = ?, updated_at = ? WHERE id = ?").bind(refundId, iso(), id).run();
  await recordAudit(db, {
    orderId, action: "order.refund_requested", actor: actor.id,
    detail: { provider, refundId, amountCents, reason: input.reason, note: input.note || undefined, notify: input.notify, cancelFirst: input.cancelFirst || undefined },
  });
  // Recorded now; the provider's refund events update the same record later. The notice goes unless muted.
  try {
    const kind = provider === "paypal"
      ? await recordRefund(db, order, {
        id: refundId, provider: "paypal", ref: order.payment_intent_id, amountCents, currency: order.currency,
        status: PAYPAL_REFUND_STATUS[String(refund?.status ?? "").toUpperCase()] ?? "RECEIVED", failureCode: "", createdAt: at, updatedAt: at,
      })
      : await saveRefund(db, order, refund);
    if (kind) {
      const fresh = (await getOrder(db, orderId)) ?? order;
      const kinds = kind.startsWith("refund:failed:") ? [kind, kind.replace("refund:failed:", "refund:team-failed:")] : [kind];
      await Promise.all(kinds.map((item) => processMessageJob(env, fresh, item)));
    }
  } catch (error) {
    console.error("admin_refund_record_failed", { orderId, provider, reason: error?.message });
  }
  // A full refund of an order that has not shipped cancels it (M4 §3.5); otherwise nothing changes.
  if (unshipped && !cancelled) await applyRefundsToOrder(env, orderId, { adminUrl, nowMs });
  return { outcome: "requested", refundId, cancelled };
}

