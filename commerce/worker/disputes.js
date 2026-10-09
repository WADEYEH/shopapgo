// Disputes and chargebacks (M5 §5, D10, D18; M5-12), from Airwallex (payment_dispute.* events) and PayPal
// (CUSTOMER.DISPUTE.*). Every event is read back from the provider before anything changes, so a late or repeated
// event never moves a dispute backwards.
//
//   open   recorded; the order is held (not sent to Amazon, not shippable: worker/order-core.js orderHolds); the team is
//          told, with the deadline, and reminded 3 days before it. The response itself is made in the provider's
//          dashboard.
//   won    the hold is released (the cooling-off queue then sends it as usual).
//   lost   counts as a full refund: an order not shipped yet is cancelled (asking Amazon first when it is with Amazon);
//          a shipped one is left as it is (the money is gone, the parcel too: the team decides).
import { recordAudit } from "./fulfillment.js";
import { alertTeam } from "./team-alerts.js";
import { SYSTEM, cancelOrder, orderState, OrderError } from "./order-core.js";

const REMIND_BEFORE_MS = 3 * 24 * 60 * 60_000;
const iso = (ms) => new Date(ms).toISOString();
const clip = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
const cents = (value) => Math.round(Number(value) * 100);
const isoOrNull = (value) => (value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null);
const PROVIDER_NAME = { airwallex: "Airwallex", paypal: "PayPal" };

// Airwallex dispute object -> { status, providerStatus, stage, reason, amountCents, currency, dueAt, updatedAt }.
// WON / REVERSED (the bank withdrew it) are won; LOST, PENDING_CLOSURE (auto-accepted pre-arbitration) and ACCEPTED
// outside a request for information are lost; everything else still needs attention.
export function airwallexDisputeState(dispute) {
  const providerStatus = String(dispute?.status ?? "").toUpperCase();
  const stage = String(dispute?.stage ?? "").toUpperCase();
  let status = "open";
  if (["WON", "REVERSED"].includes(providerStatus)) status = "won";
  else if (["LOST", "PENDING_CLOSURE"].includes(providerStatus) || (providerStatus === "ACCEPTED" && stage !== "RFI")) status = "lost";
  const reason = dispute?.reason;
  return {
    status,
    providerStatus,
    stage,
    reason: clip(typeof reason === "object" ? reason?.description || reason?.type || reason?.original_code : reason, 200),
    amountCents: cents(dispute?.amount),
    currency: String(dispute?.currency ?? "").toUpperCase(),
    dueAt: isoOrNull(dispute?.due_at),
    updatedAt: isoOrNull(dispute?.updated_at) ?? isoOrNull(dispute?.created_at) ?? new Date().toISOString(),
  };
}

// PayPal dispute -> the same shape. RESOLVED is won or lost by dispute_outcome.outcome_code; an outcome we do not know
// stays open (the team is told to look) rather than releasing the hold.
const PAYPAL_WON = ["RESOLVED_SELLER_FAVOUR", "CANCELED_BY_BUYER", "DENIED"];
const PAYPAL_LOST = ["RESOLVED_BUYER_FAVOUR", "RESOLVED_WITH_PAYOUT", "ACCEPTED", "REFUNDED"];
export function paypalDisputeState(dispute) {
  const providerStatus = String(dispute?.status ?? "").toUpperCase();
  const outcome = String(dispute?.dispute_outcome?.outcome_code ?? "").toUpperCase();
  let status = "open";
  if (providerStatus === "RESOLVED" && PAYPAL_WON.includes(outcome)) status = "won";
  else if (providerStatus === "RESOLVED" && PAYPAL_LOST.includes(outcome)) status = "lost";
  return {
    status,
    providerStatus: outcome ? `${providerStatus}:${outcome}` : providerStatus,
    stage: String(dispute?.dispute_life_cycle_stage ?? "").toUpperCase(),
    reason: clip(dispute?.reason, 200),
    amountCents: cents(dispute?.dispute_amount?.value),
    currency: String(dispute?.dispute_amount?.currency_code ?? "").toUpperCase(),
    dueAt: isoOrNull(dispute?.seller_response_due_date),
    updatedAt: isoOrNull(dispute?.update_time) ?? isoOrNull(dispute?.create_time) ?? new Date().toISOString(),
  };
}

const getDispute = (db, provider, id) => db.prepare("SELECT * FROM order_disputes WHERE provider = ? AND dispute_id = ?").bind(provider, id).first();

const dueText = (dueAt) => (dueAt ? `Respond before ${new Date(dueAt).toUTCString()}.` : "Check the response deadline in the dashboard.");

// Records the dispute's current state and acts on a change. Returns { changed, from, to }. Never throws.
export async function recordDispute(env, { provider, disputeId, orderId, state }, { adminUrl = null, nowMs = Date.now() } = {}) {
  const db = env.DB;
  try {
    const before = await getDispute(db, provider, disputeId);
    if (before && Date.parse(before.provider_updated_at) > Date.parse(state.updatedAt)) return { changed: false, from: before.status, to: before.status };
    const at = iso(nowMs);
    await db
      .prepare(
        `INSERT INTO order_disputes (provider, dispute_id, order_id, status, provider_status, stage, reason, amount_cents, currency, due_at, provider_updated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(provider, dispute_id) DO UPDATE SET status = excluded.status, provider_status = excluded.provider_status, stage = excluded.stage,
           reason = excluded.reason, amount_cents = excluded.amount_cents, currency = excluded.currency, due_at = excluded.due_at,
           provider_updated_at = excluded.provider_updated_at, updated_at = excluded.updated_at`,
      )
      .bind(provider, disputeId, orderId, state.status, state.providerStatus, state.stage, state.reason, state.amountCents, state.currency, state.dueAt, state.updatedAt, at, at)
      .run();
    const from = before?.status ?? null;
    const to = state.status;
    if (from === to) return { changed: false, from, to };

    const name = PROVIDER_NAME[provider] ?? provider;
    const money = `${(state.amountCents / 100).toFixed(2)} ${state.currency}`;
    const base = { orderId, adminUrl };
    await recordAudit(db, { orderId, action: `order.dispute_${to === "open" ? "opened" : to}`, actor: "system", detail: { provider, disputeId, providerStatus: state.providerStatus, amountCents: state.amountCents, dueAt: state.dueAt } });
    if (to === "open") {
      await alertTeam(env, {
        ...base, key: `dispute-open:${provider}:${disputeId}`, kind: "dispute_open",
        subject: `Order ${orderId}: a ${name} dispute was opened`,
        lines: [`The customer disputed ${money} with ${name} (${state.reason || "no reason given"}).`, dueText(state.dueAt), "The order is on hold: it will not be sent to Amazon or shipped until the dispute is won. Respond with the order, payment and tracking details in the dashboard."],
      });
    } else if (to === "won") {
      await alertTeam(env, { ...base, key: `dispute-won:${provider}:${disputeId}`, kind: "dispute_won", subject: `Order ${orderId}: the ${name} dispute was won`, lines: ["The hold is released; the order continues as usual."] });
    } else if (to === "lost") {
      let effect = "The order had already shipped, so nothing else changes: check it with the team.";
      const current = await orderState(env, orderId, nowMs);
      if (current && ["review", "paid", "fulfilling"].includes(current.stage)) {
        try {
          await cancelOrder(env, orderId, { actor: SYSTEM, reasonCode: "chargeback", note: `${name} dispute ${disputeId} lost` }, { nowMs, adminUrl });
          effect = "The order was not shipped yet, so it was cancelled (as with a full refund).";
        } catch (error) {
          effect = error instanceof OrderError ? `The order could not be cancelled: ${error.message}` : "The order could not be cancelled; check it.";
        }
      }
      await alertTeam(env, { ...base, key: `dispute-lost:${provider}:${disputeId}`, kind: "dispute_lost", subject: `Order ${orderId}: the ${name} dispute was lost`, lines: [`${money} went back to the customer.`, effect] });
    }
    return { changed: true, from, to };
  } catch (error) {
    console.error("dispute_record_failed", { provider, disputeId, reason: error?.message });
    return { changed: false, error: true };
  }
}

// Open disputes of an order (for the hold and the order page).
export async function disputesForOrder(db, orderId) {
  const { results } = await db.prepare("SELECT * FROM order_disputes WHERE order_id = ? ORDER BY created_at").bind(orderId).all();
  return results.map((row) => ({
    provider: row.provider, id: row.dispute_id, status: row.status, providerStatus: row.provider_status, stage: row.stage, reason: row.reason || null,
    amountCents: row.amount_cents, currency: row.currency, dueAt: row.due_at, updatedAt: row.updated_at,
  }));
}

export async function openDispute(db, orderId) {
  return db.prepare("SELECT provider, due_at FROM order_disputes WHERE order_id = ? AND status = 'open' ORDER BY due_at LIMIT 1").bind(orderId).first();
}

// Cron: tells the team again 3 days before an open dispute's deadline (once per dispute).
export async function remindDisputes(env, { nowMs = Date.now() } = {}) {
  const db = env.DB;
  const { results } = await db
    .prepare("SELECT * FROM order_disputes WHERE status = 'open' AND reminded_at IS NULL AND due_at IS NOT NULL AND due_at <= ? ORDER BY due_at LIMIT 20")
    .bind(iso(nowMs + REMIND_BEFORE_MS))
    .all();
  for (const row of results) {
    const name = PROVIDER_NAME[row.provider] ?? row.provider;
    await alertTeam(env, {
      key: `dispute-reminder:${row.provider}:${row.dispute_id}`, kind: "dispute_reminder", orderId: row.order_id,
      subject: `Order ${row.order_id}: the ${name} dispute is due soon`,
      lines: [`The response to the ${name} dispute (${(row.amount_cents / 100).toFixed(2)} ${row.currency}) is due soon.`, dueText(row.due_at)],
    });
    await db.prepare("UPDATE order_disputes SET reminded_at = ? WHERE provider = ? AND dispute_id = ?").bind(iso(nowMs), row.provider, row.dispute_id).run();
  }
  return { reminded: results.length };
}

// Orders with an open dispute, earliest deadline first (the back office's Disputes tab, I13).
export async function disputedOrderIds(db) {
  const { results } = await db
    .prepare("SELECT order_id, MIN(due_at) AS due_at FROM order_disputes WHERE status = 'open' GROUP BY order_id ORDER BY CASE WHEN MIN(due_at) IS NULL THEN 1 ELSE 0 END, MIN(due_at) LIMIT 100")
    .all();
  return results.map((row) => ({ orderId: row.order_id, dueAt: row.due_at }));
}
