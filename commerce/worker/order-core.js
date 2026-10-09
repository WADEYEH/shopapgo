// Order core (M4, PR 3-3): where an order stands, what may happen to it next, and the people-driven changes (confirm a
// review order, cancel, change the address in the cooling-off period). Every change goes through the transition
// table below; anything else is refused, logged and the team is told (M4-11).
//
// Stages (M4 §3.1). orders.status keeps its values (pending / paid / review / cancelled; D45 additive only), and the
// stage is read from it together with the MCF and shipment records, so nothing has to be kept in step by hand:
//
//   checkout    status pending: not an order yet (D36; PR 3-4 moves these to their own table)
//   review      status review: paid, but the amount or currency did not match
//   paid        status paid, not with Amazon (in the cooling-off period, waiting, held, or a send that failed)
//   fulfilling  status paid and an MCF order is being sent or was sent (order_mcf submitting / submitted)
//   shipped     a shipment is recorded (order_fulfillments)
//   cancelled   status cancelled
//
// Cooling-off (M4 §3.6, D23): ORDER_COOLING_OFF_MINUTES after payment (default 60) before an order goes to Amazon.
// Holds (M4 §3.5): review, a registered refund (failed ones excepted); disputes join in PR 3-5.
import { cancelFulfillmentOrder, McfError, mcfReadiness } from "./amazon-mcf.js";
import { getFulfillment, recordAudit } from "./fulfillment.js";
import { getOrder, getOrderPayment } from "./orders.js";
import { refundView } from "./refunds.js";
import { computeTax, resolvePricing } from "./pricing.js";
import { checkShipping } from "../../lib/shop/address-rules.mjs";
import { enforceAddress } from "./address-check.js";
import { QuoteError } from "./catalog.js";
import { alertTeam } from "./team-alerts.js";

export const SYSTEM = { id: "system", via: "system", role: "member" };
const DEFAULT_COOLING_OFF_MINUTES = 60;
const NOTE_MAX = 300;
const iso = (ms) => new Date(ms).toISOString();
const clip = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);

export class OrderError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

// ---------- stages, transitions, holds ----------

export const STAGE_LABEL = { checkout: "awaiting payment", review: "needs review", paid: "paid", fulfilling: "with Amazon", shipped: "shipped", cancelled: "cancelled" };

// Every allowed change (M4 §3.3). T1, T2, T7 and T9 happen in the payment and MCF code; T5, T6, T8 and T10 here.
export const TRANSITIONS = [
  { id: "T1", from: "checkout", to: "paid", by: "payment succeeded, amount matches" },
  { id: "T2", from: "checkout", to: "review", by: "payment succeeded, amount does not match" },
  { id: "T5", from: "review", to: "paid", by: "confirmed in the back office" },
  { id: "T6", from: "review", to: "cancelled", by: "cancelled in the back office" },
  { id: "T7", from: "paid", to: "fulfilling", by: "sent to Amazon after the cooling-off period" },
  { id: "T8", from: "paid", to: "cancelled", by: "cancelled (customer, full refund, out of stock, chargeback)" },
  { id: "T9", from: "fulfilling", to: "shipped", by: "Amazon reported a tracking number" },
  { id: "T10", from: "fulfilling", to: "cancelled", by: "Amazon cancelled the shipment" },
];
export const transitionFor = (from, to) => TRANSITIONS.find((t) => t.from === from && t.to === to) ?? null;

export function orderStage(order, { fulfillment = null, mcf = null } = {}) {
  if (!order) return null;
  if (order.status === "cancelled") return "cancelled";
  if (order.status === "pending") return "checkout";
  if (order.status === "review") return "review";
  if (fulfillment) return "shipped";
  if (mcf && ["submitting", "submitted", "shipped"].includes(mcf.status)) return "fulfilling";
  return "paid";
}

export function coolingOffMinutes(env = {}) {
  const raw = env.ORDER_COOLING_OFF_MINUTES;
  const value = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(value) && value >= 0 ? value : DEFAULT_COOLING_OFF_MINUTES;
}

// { endsAt, active } for a paid order; endsAt is null when the order is not paid.
export function coolingOff(env, order, nowMs = Date.now()) {
  if (order?.status !== "paid" || !order.paid_at) return { endsAt: null, active: false };
  const ends = Date.parse(order.paid_at) + coolingOffMinutes(env) * 60_000;
  return { endsAt: iso(ends), active: nowMs < ends };
}

// Why this order may not go to Amazon or be shipped now: [{ code, message }].
export async function orderHolds(db, order) {
  const holds = [];
  if (order.status === "review") holds.push({ code: "review", message: "The amount paid did not match the order. Confirm or cancel it." });
  const refund = await db.prepare("SELECT id FROM order_refunds WHERE order_id = ? AND status != 'FAILED' LIMIT 1").bind(order.id).first();
  if (refund) holds.push({ code: "refund", message: "A refund is registered. Review before shipping." });
  return holds;
}

// async: a database without the order_mcf table yet reads as "never sent" instead of failing.
const mcfRow = async (db, orderId) => db.prepare("SELECT * FROM order_mcf WHERE order_id = ?").bind(orderId).first();

// Everything about one order the rules need.
export async function orderState(env, orderId, nowMs = Date.now()) {
  const db = env.DB;
  const order = await getOrder(db, orderId);
  if (!order) return null;
  const [fulfillment, mcf] = await Promise.all([getFulfillment(db, orderId), mcfRow(db, orderId).catch(() => null)]);
  const stage = orderStage(order, { fulfillment, mcf });
  return { order, fulfillment, mcf, stage, cooling: coolingOff(env, order, nowMs), holds: await orderHolds(db, order) };
}

// What the back office shows and offers for one order.
export async function orderCoreView(env, orderId, nowMs = Date.now()) {
  const state = await orderState(env, orderId, nowMs);
  if (!state) return null;
  const { order, stage, cooling, holds } = state;
  const cancellation = await env.DB.prepare("SELECT * FROM order_cancellations WHERE order_id = ?").bind(orderId).first();
  return {
    stage,
    coolingOff: cooling,
    holds,
    cancellation: cancellation
      ? { fromStage: cancellation.from_stage, reason: cancellation.reason_code, note: cancellation.note || null, by: cancellation.actor, at: cancellation.created_at, amazonCancel: cancellation.amazon_cancel || null }
      : null,
    actions: {
      confirm: stage === "review",
      cancel: ["review", "paid", "fulfilling"].includes(stage),
      changeAddress: stage === "paid" && cooling.active,
    },
    payment: await paymentFacts(env, order),
    cancelReasons: CANCEL_REASONS,
  };
}

async function paymentFacts(env, order) {
  const payment = await getOrderPayment(env.DB, order.id).catch(() => null);
  const refunds = await refundView(env.DB, order);
  return { provider: payment?.provider ?? (order.payment_intent_id ? "airwallex" : null), paidCents: order.total_cents, refundedCents: refunds.refundedCents, refundStatus: refunds.status };
}

// A change outside the table: refused, logged on the order and the team told once (M4-11).
async function refuse(env, { orderId, from, to, actor, message }) {
  try {
    await recordAudit(env.DB, { orderId, action: "order.transition_refused", actor: actor.id, detail: { from, to } });
  } catch (error) {
    console.error("order_audit_failed", { orderId, reason: error?.message });
  }
  await alertTeam(env, {
    key: `refused:${orderId}:${from}:${to}`,
    kind: "transition_refused",
    orderId,
    subject: `Order ${orderId}: a change was refused (${STAGE_LABEL[from] ?? from} → ${STAGE_LABEL[to] ?? to})`,
    lines: [`Someone or something tried to move order ${orderId} from "${STAGE_LABEL[from] ?? from}" to "${STAGE_LABEL[to] ?? to}". That change is not allowed, so nothing was changed.`, `By: ${actor.id}`],
  });
  throw new OrderError(409, "not_allowed", message);
}

// ---------- T5: confirm a review order ----------

export async function confirmOrder(env, orderId, { actor, reason }, { nowMs = Date.now() } = {}) {
  const why = clip(reason, NOTE_MAX);
  if (!why) throw new OrderError(400, "reason_required", "Write why the payment is fine to confirm this order.");
  const state = await orderState(env, orderId, nowMs);
  if (!state) throw new OrderError(404, "not_found", "Order not found.");
  if (state.stage !== "review") return refuse(env, { orderId, from: state.stage, to: "paid", actor, message: `This order is ${STAGE_LABEL[state.stage]}; only an order that needs review can be confirmed.` });
  const db = env.DB;
  const at = iso(nowMs);
  const due = iso(nowMs + coolingOffMinutes(env) * 60_000);
  const queue = mcfReadiness(env, { ...state.order, status: "paid" }).ok;
  const results = await db.batch([
    db.prepare("UPDATE orders SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ? AND status = 'review'").bind(at, at, orderId),
    // The same follow-ups as a payment that matched (T1), once: the confirmation email and the cooling-off queue.
    db.prepare(`INSERT OR IGNORE INTO order_email_jobs (order_id, kind, status, created_at, updated_at)
      SELECT id, 'confirmation', 'pending', ?, ? FROM orders WHERE id = ? AND status = 'paid' AND paid_at = ?`).bind(at, at, orderId, at),
    db.prepare(`INSERT OR IGNORE INTO mcf_submission_queue (order_id, due_at, created_at)
      SELECT id, ?, ? FROM orders WHERE id = ? AND status = 'paid' AND paid_at = ? AND ? = 1`).bind(due, at, orderId, at, queue ? 1 : 0),
  ]);
  if (!(results[0].meta?.changes > 0)) {
    const now = await orderState(env, orderId, nowMs);
    if (now?.stage === "paid" || now?.stage === "fulfilling" || now?.stage === "shipped") return { changed: false, order: now.order };
    return refuse(env, { orderId, from: now?.stage ?? "unknown", to: "paid", actor, message: "This order changed meanwhile. Reload it." });
  }
  await recordAudit(db, { orderId, action: "order.confirmed", actor: actor.id, detail: { transition: "T5", reason: why } });
  return { changed: true, order: await getOrder(db, orderId) };
}

// ---------- T6, T8, T10: cancel ----------

export const CANCEL_REASONS = {
  customer_request: "Customer asked to cancel",
  out_of_stock: "Out of stock",
  full_refund: "Fully refunded",
  chargeback: "Chargeback lost",
  review_rejected: "Payment did not match (review)",
  other: "Other",
};

export async function cancelOrder(env, orderId, { actor, reasonCode, note = "" }, { nowMs = Date.now(), adminUrl = null } = {}) {
  if (!Object.hasOwn(CANCEL_REASONS, reasonCode)) throw new OrderError(400, "invalid_reason", "Choose why the order is cancelled.");
  const detail = clip(note, NOTE_MAX);
  if (reasonCode === "other" && !detail) throw new OrderError(400, "note_required", "Write why the order is cancelled.");
  const db = env.DB;
  const state = await orderState(env, orderId, nowMs);
  if (!state) throw new OrderError(404, "not_found", "Order not found.");
  const { stage } = state;
  if (stage === "cancelled") throw new OrderError(409, "already_cancelled", "This order is already cancelled.");
  if (stage === "checkout") throw new OrderError(409, "not_an_order", "This checkout was never paid, so there is no order to cancel.");
  if (stage === "shipped") return refuse(env, { orderId, from: stage, to: "cancelled", actor, message: "This order has shipped, so it cannot be cancelled. Handle it as a return." });

  // With Amazon already: ask Amazon first; the order is only cancelled when Amazon agrees (M4-06).
  let amazonCancel = "";
  if (stage === "fulfilling") {
    try {
      await cancelFulfillmentOrder(env, state.mcf.seller_order_id);
      amazonCancel = "requested";
      await db.prepare("UPDATE order_mcf SET note = ?, updated_at = ? WHERE order_id = ?").bind("Cancellation requested with the order.", iso(nowMs), orderId).run();
    } catch (error) {
      const why = error instanceof McfError ? error.message : "Amazon could not be reached.";
      await recordAudit(db, { orderId, action: "order.cancel_failed", actor: actor.id, detail: { reason: reasonCode, amazon: clip(why, 200) } });
      await alertTeam(env, {
        key: `amazon-cancel-failed:${orderId}`,
        kind: "amazon_cancel_failed",
        orderId,
        adminUrl,
        subject: `Order ${orderId}: Amazon could not cancel the shipment`,
        lines: [`The order was asked to be cancelled (${CANCEL_REASONS[reasonCode]}), but Amazon refused or did not answer: ${clip(why, 200)}`, "The order is still with Amazon and may ship. Check it in the back office and with Amazon."],
      });
      throw new OrderError(502, "amazon_cancel_failed", `Amazon could not cancel this shipment (${clip(why, 160)}). The order stays with Amazon; the team was told.`);
    }
  }

  const at = iso(nowMs);
  const from = state.order.status;
  // One guarded change: the status still being what was read, no shipment, and (for a paid order) no MCF send that
  // started meanwhile. The cancellation record is only written when the status change happened.
  const results = await db.batch([
    db.prepare(
      `UPDATE orders SET status = 'cancelled', updated_at = ?
       WHERE id = ? AND status = ?
         AND NOT EXISTS (SELECT 1 FROM order_fulfillments f WHERE f.order_id = orders.id)
         AND (? = 'fulfilling' OR NOT EXISTS (SELECT 1 FROM order_mcf m WHERE m.order_id = orders.id AND m.status IN ('submitting', 'submitted', 'shipped')))`,
    ).bind(at, orderId, from, stage),
    db.prepare(
      `INSERT OR IGNORE INTO order_cancellations (order_id, from_stage, reason_code, note, actor, amazon_cancel, created_at)
       SELECT id, ?, ?, ?, ?, ?, ? FROM orders WHERE id = ? AND status = 'cancelled' AND updated_at = ?`,
    ).bind(stage, reasonCode, detail, actor.id, amazonCancel, at, orderId, at),
    db.prepare("DELETE FROM mcf_submission_queue WHERE order_id = ? AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'cancelled')").bind(orderId, orderId),
  ]);
  if (!(results[0].meta?.changes > 0)) {
    const now = await orderState(env, orderId, nowMs);
    if (now?.stage === "cancelled") return { changed: false, order: now.order };
    return refuse(env, { orderId, from: now?.stage ?? "unknown", to: "cancelled", actor, message: "This order changed meanwhile (it may have been sent to Amazon or shipped). Reload it." });
  }
  const transition = transitionFor(stage, "cancelled");
  await recordAudit(db, { orderId, action: "order.cancelled", actor: actor.id, detail: { transition: transition.id, from: stage, reason: reasonCode, note: detail || undefined, amazonCancel: amazonCancel || undefined } });
  const order = await getOrder(db, orderId);
  return { changed: true, order, payment: await paymentFacts(env, order) };
}

// ---------- address change in the cooling-off period (M4 §3.7) ----------

const ADDRESS_KEYS = ["firstName", "lastName", "street", "street2", "city", "state", "zip"];
const pickAddress = (shipping) => Object.fromEntries(ADDRESS_KEYS.map((key) => [key, shipping?.[key] ?? ""]));

export async function changeAddress(env, orderId, { actor, shipping, reason, noUnit = false }, { nowMs = Date.now(), checkOptions } = {}) {
  const why = clip(reason, NOTE_MAX);
  if (!why) throw new OrderError(400, "reason_required", "Write why the address changes (for example: customer emailed a new apartment number).");
  const state = await orderState(env, orderId, nowMs);
  if (!state) throw new OrderError(404, "not_found", "Order not found.");
  if (state.stage !== "paid" || !state.cooling.active) {
    throw new OrderError(409, "address_locked", state.stage === "paid"
      ? "The cooling-off period is over, so the address can no longer change here. Cancel and reorder instead, or ask Amazon."
      : `This order is ${STAGE_LABEL[state.stage]}; its address can only change while it is paid and in the cooling-off period.`);
  }
  const { value, errors } = checkShipping(shipping ?? {});
  const [field, message] = Object.entries(errors)[0] ?? [];
  if (field) throw new OrderError(400, "invalid_address", message, { field });
  const before = JSON.parse(state.order.shipping_json || "{}");
  // A new state can change the sales tax, and the amount paid never changes (M4-15): only when the tax stays the same.
  if (value.state !== before.state) {
    let tax = null;
    try {
      tax = computeTax(resolvePricing(env), { state: value.state, subtotalCents: state.order.subtotal_cents, shippingCents: state.order.shipping_cents });
    } catch {
      tax = null;
    }
    if (tax !== state.order.tax_cents) throw new OrderError(409, "state_changes_tax", "Shipping to that state changes the sales tax. Cancel and place a new order instead.", { field: "state" });
  }
  let addressCheck;
  try {
    addressCheck = await enforceAddress(env, value, { noUnit: noUnit === true }, checkOptions);
  } catch (error) {
    if (error instanceof QuoteError) throw new OrderError(400, error.code, error.message, { field: error.field });
    throw error;
  }
  const after = { ...before, ...value, addressCheck };
  const at = iso(nowMs);
  const result = await env.DB.prepare(
    `UPDATE orders SET shipping_json = ?, updated_at = ?
     WHERE id = ? AND status = 'paid' AND paid_at = ?
       AND NOT EXISTS (SELECT 1 FROM order_mcf m WHERE m.order_id = orders.id)
       AND NOT EXISTS (SELECT 1 FROM order_fulfillments f WHERE f.order_id = orders.id)`,
  ).bind(JSON.stringify(after), at, orderId, state.order.paid_at).run();
  if (!(result.meta?.changes > 0)) throw new OrderError(409, "address_locked", "This order changed meanwhile (it may have been sent to Amazon). Reload it.");
  await recordAudit(env.DB, { orderId, action: "order.address_changed", actor: actor.id, detail: { reason: why, before: pickAddress(before), after: pickAddress(after), addressCheck: addressCheck.status } });
  return { changed: true, order: await getOrder(env.DB, orderId) };
}

// ---------- the cooling-off queue ----------

// Queues a paid order for Amazon, due when its cooling-off period ends, only while automatic submission is ready.
export async function queueForAmazon(env, order) {
  if (order?.status !== "paid" || !order.paid_at || !mcfReadiness(env, order).ok) return false;
  const due = iso(Date.parse(order.paid_at) + coolingOffMinutes(env) * 60_000);
  const result = await env.DB.prepare("INSERT OR IGNORE INTO mcf_submission_queue (order_id, due_at, created_at) VALUES (?, ?, ?)").bind(order.id, due, new Date().toISOString()).run();
  return result.meta?.changes > 0;
}

// ---------- refunds and the order (M4 §3.4) ----------

// After a refund was recorded (or a payment arrived after one): a full refund before shipping cancels the order (T8,
// T10 through Amazon); any other refund before shipping holds it and tells the team once. Never throws.
export async function applyRefundsToOrder(env, orderId, { adminUrl = null, nowMs = Date.now() } = {}) {
  try {
    const state = await orderState(env, orderId, nowMs);
    if (!state || !["review", "paid", "fulfilling"].includes(state.stage)) return { outcome: "none" };
    const refunds = await refundView(env.DB, state.order);
    if (refunds.status === "fully_refunded") {
      try {
        const result = await cancelOrder(env, orderId, { actor: SYSTEM, reasonCode: "full_refund" }, { nowMs, adminUrl });
        return { outcome: result.changed ? "cancelled" : "none" };
      } catch (error) {
        if (error instanceof OrderError) return { outcome: "cancel_failed", reason: error.message };
        throw error;
      }
    }
    if (refunds.hold) {
      await alertTeam(env, {
        key: `refund-hold:${orderId}`,
        kind: "refund_hold",
        orderId,
        adminUrl,
        subject: `Order ${orderId}: a refund put shipping on hold`,
        lines: [
          `A refund was registered for order ${orderId} before it shipped${state.stage === "fulfilling" ? " (the order is already with Amazon)" : ""}.`,
          state.stage === "fulfilling" ? "Amazon may still ship it: decide whether to cancel it with Amazon." : "It will not be sent to Amazon until someone reviews it.",
        ],
      });
      return { outcome: "held" };
    }
    return { outcome: "none" };
  } catch (error) {
    console.error("order_refund_apply_failed", { orderId, reason: error?.message });
    return { outcome: "failed" };
  }
}
