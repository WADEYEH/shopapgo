// Checkouts (D36, M3 §5, PR 3-4): an order exists only once it is paid. Until then the row in orders is a checkout —
// status pending, or expired after 24 hours — one per purchase: the page sends back the checkout id it got, and
// retries, refreshes, a second tab or another payment method all reuse it (M3-13). Its id becomes the order number.
//
// Every payment object made for a checkout (Airwallex PaymentIntent, PayPal order) is recorded in checkout_payments:
//   * a new PaymentIntent replaces older ones of the checkout (they are cancelled at Airwallex);
//   * a new PayPal order replaces older ones (PayPal cannot cancel an unapproved order, so they are marked voided here
//     and their capture is refused);
//   * when the checkout is paid, every other open payment object is voided the same way;
//   * a payment that succeeds anyway on a checkout that is already paid is refunded in full automatically and the team
//     is told (C11, M5-08). That refund is the only refund the system makes by itself; ordinary refunds stay in the
//     payment dashboards (D24).
//
// Housekeeping (worker/checkout-jobs.js): a checkout unpaid after 24 hours expires once the providers confirm nothing
// was paid or is still processing (M3-18); its personal details are deleted 30 days after it was created.
import { cancelPaymentIntent, refundDuplicatePayment } from "./airwallex.js";
import { refundDuplicateCapture } from "./paypal.js";
import { toMajor } from "./catalog.js";
import { recordAudit } from "./fulfillment.js";
import { alertTeam } from "./team-alerts.js";

export const CHECKOUT_TTL_MS = 24 * 60 * 60_000;
export const PURGE_AFTER_MS = 30 * 24 * 60 * 60_000;
const CHECKOUT_ID = /^APGO-US-[0-9A-HJKMNP-TV-Z]{12}$/;
const iso = (ms) => new Date(ms).toISOString();
const clip = (value, max) => String(value ?? "").slice(0, max);

// ---------- the checkout row ----------

// The checkout this browser started, when it can still be paid: pending and less than 24 hours old.
export async function reusableCheckout(db, checkoutId, nowMs = Date.now()) {
  if (!CHECKOUT_ID.test(String(checkoutId ?? ""))) return null;
  const row = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(checkoutId).first();
  if (!row || row.status !== "pending" || Date.parse(row.created_at) <= nowMs - CHECKOUT_TTL_MS) return null;
  return row;
}

// The shopper changed the cart, the address or the details: the same checkout, priced again (M3 §5).
export async function updateCheckout(db, id, { checkout, quote }) {
  const result = await db
    .prepare(
      `UPDATE orders SET email = ?, marketing_opt_in = ?, shipping_json = ?, shipping_method = ?, lines_json = ?, currency = ?,
         subtotal_cents = ?, shipping_cents = ?, tax_cents = ?, total_cents = ?, updated_at = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(
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
      new Date().toISOString(),
      id,
    )
    .run();
  return result.meta?.changes > 0;
}

// A row of orders that never became an order: a checkout (pending / expired), or one closed before any payment.
export const isCheckoutRow = (row) => row && (row.status === "pending" || row.status === "expired" || (row.status === "cancelled" && !row.paid_at));

// ---------- payment objects ----------

export async function recordPayment(db, { provider, ref, checkoutId, amountCents, currency }) {
  const at = new Date().toISOString();
  await db
    .prepare(
      `INSERT OR IGNORE INTO checkout_payments (provider, ref, checkout_id, amount_cents, currency, status, detail, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'open', '', ?, ?)`,
    )
    .bind(provider, ref, checkoutId, amountCents, currency, at, at)
    .run();
}

export async function markPayment(db, provider, ref, status, detail = "") {
  await db.prepare("UPDATE checkout_payments SET status = ?, detail = ?, updated_at = ? WHERE provider = ? AND ref = ?").bind(status, clip(detail, 300), new Date().toISOString(), provider, ref).run();
}

// The provider of a checkout's legacy single payment object (before checkout_payments existed).
async function legacyProvider(db, orderId) {
  const row = await db.prepare("SELECT provider FROM order_payments WHERE order_id = ?").bind(orderId).first().catch(() => null);
  return row?.provider ?? "airwallex";
}

// Every payment object of a checkout, newest first. A checkout from before checkout_payments has one, in
// orders.payment_intent_id.
export async function checkoutPayments(db, order) {
  const { results } = await db.prepare("SELECT * FROM checkout_payments WHERE checkout_id = ? ORDER BY created_at DESC, rowid DESC").bind(order.id).all();
  if (results.length || !order.payment_intent_id) return results;
  return [{ provider: await legacyProvider(db, order.id), ref: order.payment_intent_id, checkout_id: order.id, amount_cents: order.total_cents, currency: order.currency, status: "open", legacy: true }];
}

// The checkout a payment object belongs to (by provider and id), or null.
export async function checkoutIdForPayment(db, provider, ref) {
  const row = await db.prepare("SELECT checkout_id FROM checkout_payments WHERE provider = ? AND ref = ?").bind(provider, ref).first();
  if (row) return row.checkout_id;
  const legacy = await db.prepare("SELECT id FROM orders WHERE payment_intent_id = ?").bind(ref).first();
  return legacy?.id ?? null;
}

// Whether a payment object is one of this checkout's (recorded, or the legacy single one in orders.payment_intent_id).
export async function paymentBelongsTo(db, provider, ref, checkoutId) {
  const row = await db.prepare("SELECT 1 AS x FROM checkout_payments WHERE provider = ? AND ref = ? AND checkout_id = ?").bind(provider, ref, checkoutId).first();
  if (row) return true;
  return Boolean(await db.prepare("SELECT 1 AS x FROM orders WHERE id = ? AND payment_intent_id = ?").bind(checkoutId, ref).first());
}

// The idempotency key for the next payment object of a provider: the checkout id for the first (as before checkouts
// were reused), then "-2", "-3"... A retried create therefore returns the same object instead of a second one.
export async function nextRequestId(db, checkoutId, provider) {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM checkout_payments WHERE checkout_id = ? AND provider = ?").bind(checkoutId, provider).first();
  const n = (row?.n ?? 0) + 1;
  return n === 1 ? checkoutId : `${checkoutId}-${n}`;
}

// Voids open payment objects of a checkout (all, or one provider's), except `keep`. Airwallex intents are cancelled at
// Airwallex; when that fails the intent is left open (it may be paying right now; a success is then settled or
// refunded as a duplicate). Returns the refs that were voided.
export async function voidPayments(env, checkoutId, { provider = null, keep = null } = {}) {
  const db = env.DB;
  const order = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(checkoutId).first();
  if (!order) return [];
  const voided = [];
  for (const payment of await checkoutPayments(db, order)) {
    if (payment.status !== "open" || payment.ref === keep || (provider && payment.provider !== provider)) continue;
    if (payment.legacy) await recordPayment(db, { provider: payment.provider, ref: payment.ref, checkoutId, amountCents: payment.amount_cents, currency: payment.currency });
    if (payment.provider === "airwallex") {
      try {
        await cancelPaymentIntent(env, payment.ref, `${payment.ref}-cancel`);
      } catch (error) {
        console.error("checkout_payment_cancel_failed", { checkoutId, status: error?.status, code: error?.code });
        continue;
      }
    }
    await markPayment(db, payment.provider, payment.ref, "voided");
    voided.push(payment.ref);
  }
  return voided;
}

// ---------- the Unfinished checkouts list (M9-22, I14) ----------

const CHECKOUT_ROWS = `(o.status IN ('pending', 'expired') OR (o.status = 'cancelled' AND o.paid_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM order_cancellations c WHERE c.order_id = o.id)))`;
const LIST_MAX = 100;

// Unpaid checkouts, newest first: { checkouts, nextBefore, counts }. status: open | expired | all. q: part of an email.
// No reminder emails are sent from here (I14).
export async function listCheckouts(db, { status = "all", q = "", before = null, limit = 50 } = {}) {
  const clauses = [CHECKOUT_ROWS];
  const args = [];
  if (status === "open") clauses.push("o.status = 'pending'");
  else if (status === "expired") clauses.push("o.status != 'pending'");
  const needle = String(q ?? "").trim().toLowerCase().slice(0, 100);
  if (needle) {
    clauses.push("instr(lower(o.email), ?) > 0");
    args.push(needle);
  }
  if (before) {
    clauses.push("o.created_at < ?");
    args.push(String(before));
  }
  const size = Math.max(1, Math.min(LIST_MAX, Number(limit) || 50));
  const { results } = await db
    .prepare(
      `SELECT o.*,
         (SELECT f.failure_code FROM order_payment_failures f WHERE f.order_id = o.id ORDER BY f.occurred_at DESC LIMIT 1) AS failure_code,
         (SELECT f.message FROM order_payment_failures f WHERE f.order_id = o.id ORDER BY f.occurred_at DESC LIMIT 1) AS failure_message,
         (SELECT COUNT(*) FROM order_payment_failures f WHERE f.order_id = o.id) AS failures
       FROM orders o WHERE ${clauses.join(" AND ")} ORDER BY o.created_at DESC LIMIT ?`,
    )
    .bind(...args, size + 1)
    .all();
  const page = results.slice(0, size);
  const counts = await db.prepare(`SELECT SUM(CASE WHEN o.status = 'pending' THEN 1 ELSE 0 END) AS open, SUM(CASE WHEN o.status != 'pending' THEN 1 ELSE 0 END) AS expired FROM orders o WHERE ${CHECKOUT_ROWS}`).first();
  return {
    checkouts: page.map((row) => {
      const lines = JSON.parse(row.lines_json || "[]");
      return {
        id: row.id,
        status: row.status === "pending" ? "open" : "expired",
        email: row.purged_at ? null : row.email,
        state: JSON.parse(row.shipping_json || "{}").state ?? null,
        items: lines.map((line) => ({ sku: line.sku, name: line.name, qty: line.qty })),
        currency: row.currency,
        totalCents: row.total_cents,
        createdAt: row.created_at,
        expiredAt: row.expired_at ?? null,
        purged: Boolean(row.purged_at),
        lastFailure: row.failures ? { code: row.failure_code || null, message: row.failure_message || null, count: row.failures } : null,
      };
    }),
    nextBefore: results.length > size ? page.at(-1).created_at : null,
    counts: { open: counts?.open ?? 0, expired: counts?.expired ?? 0 },
  };
}

// ---------- a second successful payment (C11, M5-08) ----------

// Refunds in full a payment that succeeded on a checkout that is already paid with another one. Claimed once per
// payment object; tells the team; never throws. `captureId` is needed for PayPal.
export async function refundDuplicate(env, { order, provider, ref, amountCents, currency, captureId = "", adminUrl = null }) {
  const db = env.DB;
  try {
    await recordPayment(db, { provider, ref, checkoutId: order.id, amountCents, currency });
    const claimed = await db
      .prepare("UPDATE checkout_payments SET status = 'duplicate_refunding', updated_at = ? WHERE provider = ? AND ref = ? AND status NOT IN ('duplicate_refunding', 'duplicate_refunded')")
      .bind(new Date().toISOString(), provider, ref)
      .run();
    if (!(claimed.meta?.changes > 0)) return { outcome: "duplicate_already_handled" };
    let outcome = "refunded";
    let detail = "";
    try {
      if (provider === "airwallex") await refundDuplicatePayment(env, { intentId: ref, amount: toMajor(amountCents), requestId: `dup-${ref}` });
      else if (captureId) await refundDuplicateCapture(env, captureId, `dup-${ref}`);
      else throw new Error("No PayPal capture id to refund.");
    } catch (error) {
      outcome = "refund_failed";
      detail = clip(error?.message ?? error, 200);
      console.error("duplicate_payment_refund_failed", { orderId: order.id, provider, status: error?.status, code: error?.code });
    }
    await markPayment(db, provider, ref, outcome === "refunded" ? "duplicate_refunded" : "duplicate_refund_failed", detail);
    await recordAudit(db, { orderId: order.id, action: outcome === "refunded" ? "order.duplicate_payment_refunded" : "order.duplicate_payment_refund_failed", actor: "system", detail: { provider, ref, amountCents, ...(detail ? { error: detail } : {}) } });
    const money = `${(amountCents / 100).toFixed(2)} ${currency}`;
    await alertTeam(env, {
      key: `duplicate:${provider}:${ref}`,
      kind: outcome === "refunded" ? "duplicate_refunded" : "duplicate_refund_failed",
      orderId: order.id,
      adminUrl,
      subject: outcome === "refunded" ? `Order ${order.id} was paid twice: the second payment was refunded` : `Order ${order.id} was paid twice: refund the second payment by hand`,
      lines: [
        `Order ${order.id} was already paid when a second payment of ${money} succeeded (${provider === "paypal" ? "PayPal" : "Airwallex"} ${ref}).`,
        outcome === "refunded"
          ? "It was refunded in full automatically. The order itself is unchanged and ships once."
          : `The automatic refund did not go through (${detail}). Refund it in ${provider === "paypal" ? "PayPal" : "Airwallex"} by hand.`,
      ],
    });
    return { outcome };
  } catch (error) {
    console.error("duplicate_payment_error", { orderId: order?.id, reason: error?.message });
    return { outcome: "failed" };
  }
}
