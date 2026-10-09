// The daily payment check (M5 §7, D11, D15; M5-13) and the dispute deadline reminders, on the cron.
//
// Once a day the payments of the last 3 days are compared both ways:
//   * every payment object we made (worker/checkouts.js) that is not recorded as paid is asked again: one the provider
//     shows as paid goes through the normal path now (it becomes the order, or is refunded as a second payment) — the
//     case where a payment succeeded but our system missed the notification;
//   * every order marked paid in that time is checked against its provider: one the provider does not show as paid is
//     reported (never changed automatically).
// Anything found is emailed to the owners in one message. A provider that does not answer is counted, not alerted.
import { retrievePaymentIntent } from "./airwallex.js";
import { inspectPaypalOrder, retrievePaypalOrder } from "./paypal.js";
import { getOrderPayment, settleIntent, settlePaypalOrder } from "./orders.js";
import { settleFollowUps } from "./after-payment.js";
import { alertTeam } from "./team-alerts.js";
import { remindDisputes } from "./disputes.js";
import { adminHost } from "./hosts.js";

const WINDOW_MS = 3 * 24 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const LIMIT = 200;
const STATE_KEY = "payments.reconciled_at";
const iso = (ms) => new Date(ms).toISOString();
const adminOriginOf = (env) => (adminHost(env) ? `https://${adminHost(env)}` : "https://www.shopapgo.com");

async function providerState(env, provider, ref) {
  if (provider === "paypal") {
    const snapshot = await retrievePaypalOrder(env, ref);
    return { paid: inspectPaypalOrder(snapshot).status === "COMPLETED", status: String(snapshot?.status ?? ""), snapshot };
  }
  const intent = await retrievePaymentIntent(env, ref);
  return { paid: intent?.status === "SUCCEEDED", status: String(intent?.status ?? ""), intent };
}

export async function reconcilePayments(env, { nowMs = Date.now() } = {}) {
  const db = env.DB;
  const since = iso(nowMs - WINDOW_MS);
  const services = { env, adminOrigin: adminOriginOf(env) };
  const findings = [];
  const summary = { checked: 0, unreachable: 0 };

  // 1) Paid at the provider, not known as paid here.
  const { results: payments } = await db
    .prepare("SELECT * FROM checkout_payments WHERE created_at >= ? AND status IN ('open', 'voided') ORDER BY created_at LIMIT ?")
    .bind(since, LIMIT)
    .all();
  for (const payment of payments) {
    summary.checked += 1;
    let state;
    try {
      state = await providerState(env, payment.provider, payment.ref);
    } catch {
      summary.unreachable += 1;
      continue;
    }
    if (!state.paid) continue;
    let settled;
    if (payment.provider === "paypal") {
      const inspected = inspectPaypalOrder(state.snapshot);
      settled = await settlePaypalOrder(db, {
        orderId: payment.checkout_id, paypalOrderId: payment.ref, status: inspected.status, amountValue: inspected.amountValue,
        currency: inspected.currency, shipping: inspected.shipping, captureId: inspected.captureId,
      });
    } else {
      settled = await settleIntent(db, state.intent);
    }
    await settleFollowUps(settled, services);
    if (settled.changed) findings.push(`${payment.checkout_id}: paid at ${payment.provider === "paypal" ? "PayPal" : "Airwallex"} but not recorded here; it is an order now.`);
    else if (settled.duplicate) findings.push(`${payment.checkout_id}: a second payment was found and refunded.`);
  }

  // 2) Recorded as paid here, not paid at the provider.
  const { results: orders } = await db.prepare("SELECT * FROM orders WHERE status = 'paid' AND paid_at >= ? ORDER BY paid_at LIMIT ?").bind(since, LIMIT).all();
  for (const order of orders) {
    if (!order.payment_intent_id) continue;
    summary.checked += 1;
    const provider = (await getOrderPayment(db, order.id))?.provider ?? "airwallex";
    let state;
    try {
      state = await providerState(env, provider, order.payment_intent_id);
    } catch {
      summary.unreachable += 1;
      continue;
    }
    if (!state.paid) findings.push(`${order.id}: marked paid here, but ${provider === "paypal" ? "PayPal" : "Airwallex"} shows ${state.status || "no payment"}. Do not ship it before checking.`);
  }

  if (findings.length) {
    await alertTeam(env, {
      key: `reconcile:${iso(nowMs).slice(0, 10)}`, kind: "reconcile",
      subject: `Daily payment check: ${findings.length} thing${findings.length === 1 ? "" : "s"} to look at`,
      lines: [...findings, "", `Checked ${summary.checked} payments of the last 3 days${summary.unreachable ? `; ${summary.unreachable} could not be checked (the provider did not answer)` : ""}.`],
    });
  }
  return { ...summary, findings: findings.length };
}

// Cron job: dispute reminders every run; the payment check once a day (the first run claims it).
export async function scheduledPaymentChecks(env, { nowMs = Date.now() } = {}) {
  const db = env.DB;
  const reminders = await remindDisputes(env, { nowMs });
  const last = (await db.prepare("SELECT value FROM ops_state WHERE key = ?").bind(STATE_KEY).first())?.value ?? null;
  if (last && nowMs - Date.parse(last) < DAY_MS) return { reminders, reconcile: "not_due" };
  const at = iso(nowMs);
  const claimed = await db
    .prepare(
      `INSERT INTO ops_state (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE ops_state.value IS ?`,
    )
    .bind(STATE_KEY, at, at, last)
    .run();
  if (!(claimed.meta?.changes > 0)) return { reminders, reconcile: "claimed_elsewhere" };
  return { reminders, reconcile: await reconcilePayments(env, { nowMs }) };
}
