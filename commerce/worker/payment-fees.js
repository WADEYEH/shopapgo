// The fee and the net of each payment (C20, M15): what PayPal or Airwallex kept, and what they pay out. Stored in
// payment_fees; the payment report and payments.csv show them next to the amount, so the month can be matched line by
// line with the providers' own reports (docs/ops/runbook.md section 18).
//
//   * PayPal: the capture's seller_receivable_breakdown (paypal_fee, net_amount), known as soon as it is captured.
//   * Airwallex: the financial transactions of the payment attempt that paid (fee, net); "pending" until Airwallex
//     settles it, then read again. Nothing found: no row, so the report shows the fee as not known yet, never a guess.
//
// Cron job "fees": every run, a few payments of the last 60 days whose fee is missing or not final, each read at most
// every 6 hours. Not found yet, or a provider error: the row says "unknown" (amounts 0, never shown) until a later read.
import { AirwallexError, listFinancialTransactions, retrievePaymentIntent } from "./airwallex.js";
import { PaypalError, retrievePaypalOrder } from "./paypal.js";

const WINDOW_DAYS = 60;
const PER_RUN = 5;
const REREAD_MS = 6 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const iso = (ms) => new Date(ms).toISOString();
const cents = (value) => Math.round(Number(value) * 100);
const PROVIDER = `COALESCE((SELECT p.provider FROM checkout_payments p WHERE p.checkout_id = o.id AND p.ref = o.payment_intent_id),
  (SELECT op.provider FROM order_payments op WHERE op.order_id = o.id), 'airwallex')`;

// PayPal: the completed capture of the order. null while it has none (or no breakdown yet).
export function paypalFee(paypalOrder) {
  const captures = paypalOrder?.purchase_units?.[0]?.payments?.captures ?? [];
  const capture = captures.find((item) => item?.status === "COMPLETED");
  const breakdown = capture?.seller_receivable_breakdown;
  if (!breakdown?.net_amount || !breakdown?.paypal_fee) return null;
  return {
    providerRef: String(capture.id ?? ""),
    grossCents: cents(breakdown.gross_amount?.value ?? capture.amount?.value),
    feeCents: cents(breakdown.paypal_fee.value),
    netCents: cents(breakdown.net_amount.value),
    currency: String(breakdown.net_amount.currency_code ?? capture.amount?.currency_code ?? ""),
    status: "final",
  };
}

// Airwallex: the payment entries of one attempt. null when there are none (yet).
export function airwallexFee(attemptId, listing) {
  const items = (listing?.items ?? []).filter((item) => item?.source_id === attemptId && String(item.transaction_type ?? "PAYMENT") === "PAYMENT");
  if (!items.length || items.some((item) => !Number.isFinite(Number(item.fee)) || !Number.isFinite(Number(item.net)))) return null;
  const sum = (key) => items.reduce((total, item) => total + cents(item[key]), 0);
  return {
    providerRef: attemptId,
    grossCents: sum("amount"),
    feeCents: sum("fee"),
    netCents: sum("net"),
    currency: String(items[0].currency ?? ""),
    status: items.every((item) => item.status === "SETTLED") ? "final" : "pending",
  };
}

async function readFee(env, payment) {
  if (payment.provider === "paypal") return paypalFee(await retrievePaypalOrder(env, payment.ref));
  const intent = await retrievePaymentIntent(env, payment.ref);
  const attemptId = intent?.latest_payment_attempt?.id;
  if (intent?.status !== "SUCCEEDED" || !attemptId) return null;
  return airwallexFee(attemptId, await listFinancialTransactions(env, attemptId));
}

// Returns { read, stored }.
export async function scheduledPaymentFees(env, { nowMs = Date.now(), limit = PER_RUN } = {}) {
  const db = env.DB;
  if (!db) return { read: 0, stored: 0 };
  const { results } = await db.prepare(
    `SELECT * FROM (SELECT o.id AS order_id, o.payment_intent_id AS ref, o.paid_at, ${PROVIDER} AS provider FROM orders o
       WHERE o.paid_at IS NOT NULL AND o.paid_at >= ? AND o.payment_intent_id IS NOT NULL AND o.payment_intent_id != '') x
     WHERE NOT EXISTS (SELECT 1 FROM payment_fees f WHERE f.provider = x.provider AND f.ref = x.ref AND (f.status = 'final' OR f.fetched_at > ?))
     ORDER BY x.paid_at LIMIT ?`,
  ).bind(iso(nowMs - WINDOW_DAYS * DAY_MS), iso(nowMs - REREAD_MS), limit).all();
  let stored = 0;
  for (const payment of results) {
    const configured = payment.provider === "paypal" ? env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET : env.AIRWALLEX_CLIENT_ID && env.AIRWALLEX_API_KEY;
    if (!configured) continue;
    let fee;
    try {
      fee = await readFee(env, payment);
    } catch (error) {
      if (!(error instanceof PaypalError) && !(error instanceof AirwallexError)) throw error;
      console.error("payment_fee_unread", { provider: payment.provider, orderId: payment.order_id, status: error.status, code: error.code });
    }
    fee ??= { providerRef: "", grossCents: 0, feeCents: 0, netCents: 0, currency: "", status: "unknown" };
    await db.prepare(
      `INSERT INTO payment_fees (provider, ref, order_id, provider_ref, gross_cents, fee_cents, net_cents, currency, status, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider, ref) DO UPDATE SET provider_ref = excluded.provider_ref, gross_cents = excluded.gross_cents,
         fee_cents = excluded.fee_cents, net_cents = excluded.net_cents, currency = excluded.currency, status = excluded.status,
         fetched_at = excluded.fetched_at`,
    ).bind(payment.provider, payment.ref, payment.order_id, fee.providerRef, fee.grossCents, fee.feeCents, fee.netCents, fee.currency, fee.status, iso(nowMs)).run();
    if (fee.status !== "unknown") stored += 1;
  }
  return { read: results.length, stored };
}
