// Cancel and refund from the back office (M6-06, F2; owner decision 10/9): an order Amazon cannot fill is cancelled and
// the payment refunded in full through the provider, by a person pressing the button (automatic refunds come after the
// cutover). This is the only refund, besides the duplicate payment (worker/checkouts.js), that the store makes itself;
// every other refund is made in the provider's dashboard (D24).
//
//   * The order is cancelled first (worker/order-core.js cancelOrder: asks Amazon first when it is with Amazon), then the
//     money. A refund that failed can be asked again with the same button; the order stays cancelled.
//   * One request per order (order_refund_requests) with a fixed request id (`cancel-<order>`): the provider never
//     refunds twice for it, even when the button is pressed twice or the reply was lost.
//   * The refund is recorded at once (worker/refunds.js recordRefund) and the customer gets the refund notice; the
//     provider's refund events then update the same record.
import { createRefund } from "./airwallex.js";
import { inspectPaypalOrder, refundCapture, retrievePaypalOrder } from "./paypal.js";
import { getOrder, getOrderPayment } from "./orders.js";
import { OrderError, cancelOrder, orderState } from "./order-core.js";
import { recordRefund, refundView, saveRefund } from "./refunds.js";
import { processMessageJob } from "./customer-email.js";
import { recordAudit } from "./fulfillment.js";
import { alertTeam } from "./team-alerts.js";
import { toMajor } from "./catalog.js";

export const CANCEL_REFUND_REASONS = ["out_of_stock"];
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const clip = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
const PAYPAL_REFUND_STATUS = { COMPLETED: "SETTLED", PENDING: "RECEIVED", FAILED: "FAILED", CANCELLED: "FAILED" };
const STALE_MS = 5 * 60_000;
const REFUND_NOTE = "Your APGO order was cancelled because the item is out of stock. This is a full refund.";

export async function refundRequestOf(db, orderId) {
  const row = await db.prepare("SELECT * FROM order_refund_requests WHERE order_id = ?").bind(orderId).first();
  return row ? { provider: row.provider, amountCents: row.amount_cents, currency: row.currency, status: row.status, refundId: row.refund_id || null, error: row.error || null, by: row.actor, at: row.updated_at } : null;
}

// Returns { cancelled, refund: "requested" | "already_requested" | "nothing_to_refund" | "failed", error? }.
// Throws OrderError when the order cannot be cancelled.
export async function cancelAndRefund(env, orderId, { actor, reasonCode, note = "" }, { adminUrl = null, nowMs = Date.now() } = {}) {
  if (!CANCEL_REFUND_REASONS.includes(reasonCode)) throw new OrderError(400, "invalid_reason", "This button cancels orders that are out of stock.");
  const state = await orderState(env, orderId, nowMs);
  if (!state) throw new OrderError(404, "not_found", "Order not found.");
  let cancelled = false;
  if (state.stage !== "cancelled") {
    await cancelOrder(env, orderId, { actor, reasonCode, note }, { nowMs, adminUrl });
    cancelled = true;
  }
  const order = await getOrder(env.DB, orderId);
  if (!order.paid_at || !order.payment_intent_id) throw new OrderError(409, "not_paid", "This order was never paid, so there is nothing to refund.");
  return { cancelled, ...(await refundOrder(env, order, { actor, adminUrl })) };
}

async function refundOrder(env, order, { actor, adminUrl }) {
  const db = env.DB;
  const refunds = await refundView(db, order);
  const remaining = order.total_cents - refunds.refundedCents - refunds.pendingCents;
  const existing = await db.prepare("SELECT * FROM order_refund_requests WHERE order_id = ?").bind(order.id).first();
  // A request interrupted mid-way (no reply recorded for 5 minutes) may be asked again: the request id stays the same.
  const stale = existing?.status === "requesting" && Date.now() - Date.parse(existing.updated_at) > STALE_MS;
  if (existing && existing.status !== "failed" && !stale) return { refund: "already_requested" };
  if (remaining <= 0) return { refund: "nothing_to_refund" };
  const provider = (await getOrderPayment(db, order.id))?.provider ?? "airwallex";
  const requestId = `cancel-${order.id}`;
  const at = iso();
  const claimed = existing
    ? await db.prepare("UPDATE order_refund_requests SET status = 'requesting', amount_cents = ?, error = '', actor = ?, updated_at = ? WHERE order_id = ? AND status = ? AND updated_at = ?")
      .bind(remaining, actor.id, at, order.id, existing.status, existing.updated_at).run()
    : await db.prepare(
      `INSERT OR IGNORE INTO order_refund_requests (order_id, provider, ref, amount_cents, currency, request_id, status, actor, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'requesting', ?, ?, ?)`,
    ).bind(order.id, provider, order.payment_intent_id, remaining, order.currency, requestId, actor.id, at, at).run();
  if (!(claimed.meta?.changes > 0)) return { refund: "already_requested" };

  let refund;
  try {
    if (provider === "paypal") {
      const captureId = inspectPaypalOrder(await retrievePaypalOrder(env, order.payment_intent_id)).captureId;
      if (!captureId) throw new Error("PayPal shows no captured payment for this order.");
      const amount = remaining === order.total_cents ? null : { value: toMajor(remaining).toFixed(2), currency_code: order.currency };
      refund = await refundCapture(env, captureId, { requestId, note: REFUND_NOTE, amount });
    } else {
      refund = await createRefund(env, { intentId: order.payment_intent_id, amount: toMajor(remaining), requestId, reason: "Order cancelled: out of stock" });
    }
  } catch (error) {
    const message = clip(error?.message ?? "The payment provider did not accept the refund.", 200);
    await db.prepare("UPDATE order_refund_requests SET status = 'failed', error = ?, updated_at = ? WHERE order_id = ?").bind(message, iso(), order.id).run();
    await recordAudit(db, { orderId: order.id, action: "order.refund_failed", actor: actor.id, detail: { provider, error: message } });
    await alertTeam(env, {
      key: `cancel-refund-failed:${order.id}:${at}`, kind: "refund_request_failed", orderId: order.id, adminUrl,
      subject: `Order ${order.id}: the refund did not go through`,
      lines: [`The order was cancelled, but ${provider === "paypal" ? "PayPal" : "Airwallex"} did not accept the refund: ${message}`, "Press Cancel and refund again later, or refund it in the provider's dashboard."],
    });
    return { refund: "failed", error: message };
  }

  // The provider accepted it. Record it now (the refund events update the same record later) and send the notice.
  const refundId = clip(refund?.id, 120);
  await db.prepare("UPDATE order_refund_requests SET status = 'requested', refund_id = ?, updated_at = ? WHERE order_id = ?").bind(refundId, iso(), order.id).run();
  await recordAudit(db, { orderId: order.id, action: "order.refund_requested", actor: actor.id, detail: { provider, refundId, amountCents: remaining } });
  try {
    const kind = provider === "paypal"
      ? await recordRefund(db, order, {
        id: refundId, provider: "paypal", ref: order.payment_intent_id, amountCents: remaining, currency: order.currency,
        status: PAYPAL_REFUND_STATUS[String(refund?.status ?? "").toUpperCase()] ?? "RECEIVED", failureCode: "", createdAt: at, updatedAt: at,
      })
      : await saveRefund(db, order, refund);
    if (kind) {
      const fresh = (await getOrder(db, order.id)) ?? order;
      const kinds = kind.startsWith("refund:failed:") ? [kind, kind.replace("refund:failed:", "refund:team-failed:")] : [kind];
      await Promise.all(kinds.map((item) => processMessageJob(env, fresh, item)));
    }
  } catch (error) {
    // An incomplete reply: the provider's refund events record it.
    console.error("cancel_refund_record_failed", { orderId: order.id, provider, reason: error?.message });
  }
  return { refund: "requested", refundId };
}
