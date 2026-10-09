// Checkout housekeeping on the cron (D36, M3 §5, M3-18):
//
//   expiry   a checkout still unpaid 24 hours after it was created expires, once each of its payment objects has been
//            asked: one that succeeded makes the order instead (a late payment, M4-04); one still processing (an
//            Airwallex payment pending, a PayPal capture pending) keeps the checkout open; the rest are cancelled
//            (Airwallex) or marked void (PayPal). Nothing is emailed. A provider that does not answer = try next run.
//   purge    30 days after creation, an unpaid checkout keeps only what statistics need (items, amounts, the state):
//            the email, name, address and phone go, and so does its ad attribution. The IP address and browser of every
//            order's ad attribution go after 30 days too (Meta stops accepting retries after 7).
//
// Production's 39 unpaid rows from the landing store expire the same way after the cutover (phase3-plan §3.3).
import { AirwallexError, cancelPaymentIntent, retrievePaymentIntent } from "./airwallex.js";
import { PaypalError, inspectPaypalOrder, retrievePaypalOrder } from "./paypal.js";
import { settleIntent, settlePaypalOrder } from "./orders.js";
import { settleFollowUps } from "./after-payment.js";
import { CHECKOUT_TTL_MS, PURGE_AFTER_MS, checkoutPayments, markPayment, recordPayment } from "./checkouts.js";
import { adminHost } from "./hosts.js";

const BATCH = 20;
const AIRWALLEX_PROCESSING = ["PENDING", "REQUIRES_CAPTURE"];
const iso = (ms) => new Date(ms).toISOString();
const adminOriginOf = (env) => (adminHost(env) ? `https://${adminHost(env)}` : "https://www.shopapgo.com");

async function voided(db, order, payment) {
  if (payment.legacy) await recordPayment(db, { provider: payment.provider, ref: payment.ref, checkoutId: order.id, amountCents: payment.amount_cents, currency: payment.currency });
  await markPayment(db, payment.provider, payment.ref, "voided");
}

// "expired" | "paid" | "processing" | "retry"
async function expireOne(env, order, nowMs) {
  const db = env.DB;
  const services = { env, adminOrigin: adminOriginOf(env) };
  for (const payment of (await checkoutPayments(db, order)).filter((p) => p.status === "open")) {
    if (payment.provider === "airwallex") {
      let intent;
      try {
        intent = await retrievePaymentIntent(env, payment.ref);
      } catch (error) {
        if (error instanceof AirwallexError && error.status === 404) {
          await voided(db, order, payment);
          continue;
        }
        return "retry";
      }
      if (intent.status === "SUCCEEDED") {
        await settleFollowUps(await settleIntent(db, intent), services);
        return "paid";
      }
      if (AIRWALLEX_PROCESSING.includes(intent.status)) return "processing";
      if (intent.status !== "CANCELLED") {
        try {
          await cancelPaymentIntent(env, payment.ref, `${payment.ref}-cancel`);
        } catch {
          return "retry";
        }
      }
      await voided(db, order, payment);
    } else {
      let snapshot;
      try {
        snapshot = await retrievePaypalOrder(env, payment.ref);
      } catch (error) {
        if (error instanceof PaypalError && error.status === 404) {
          await voided(db, order, payment);
          continue;
        }
        return "retry";
      }
      const inspected = inspectPaypalOrder(snapshot);
      if (inspected.status === "COMPLETED") {
        const settled = await settlePaypalOrder(db, {
          orderId: order.id, paypalOrderId: inspected.paypalOrderId, status: inspected.status, amountValue: inspected.amountValue,
          currency: inspected.currency, shipping: inspected.shipping, captureId: inspected.captureId,
        });
        await settleFollowUps(settled, services);
        return "paid";
      }
      if (inspected.captureStatus === "PENDING") return "processing";
      // Created or approved but never captured: no money moved. It can no longer be captured (worker/index.js).
      await voided(db, order, payment);
    }
  }
  const at = iso(nowMs);
  const result = await db.prepare("UPDATE orders SET status = 'expired', expired_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'").bind(at, at, order.id).run();
  return result.meta?.changes > 0 ? "expired" : "retry";
}

export async function expireCheckouts(env, { nowMs = Date.now() } = {}) {
  const summary = { checked: 0, expired: 0, paid: 0, processing: 0, retry: 0 };
  const { results } = await env.DB
    .prepare("SELECT * FROM orders WHERE status = 'pending' AND created_at <= ? ORDER BY created_at LIMIT ?")
    .bind(iso(nowMs - CHECKOUT_TTL_MS), BATCH)
    .all();
  for (const order of results) {
    summary.checked += 1;
    try {
      summary[await expireOne(env, order, nowMs)] += 1;
    } catch (error) {
      summary.retry += 1;
      console.error("checkout_expiry_failed", { checkoutId: order.id, reason: error?.message });
    }
  }
  return summary;
}

export async function purgeCheckouts(env, { nowMs = Date.now() } = {}) {
  const db = env.DB;
  const at = iso(nowMs);
  const before = iso(nowMs - PURGE_AFTER_MS);
  const purged = await db
    .prepare(
      `UPDATE orders SET email = '', marketing_opt_in = 0,
         shipping_json = json_object('state', json_extract(shipping_json, '$.state'), 'purged', 1),
         purged_at = ?, updated_at = ?
       WHERE purged_at IS NULL AND created_at <= ?
         AND (status = 'expired' OR (status = 'cancelled' AND paid_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM order_cancellations c WHERE c.order_id = orders.id)))`,
    )
    .bind(at, at, before)
    .run();
  const attribution = await db.prepare("DELETE FROM order_attribution WHERE order_id IN (SELECT id FROM orders WHERE purged_at IS NOT NULL)").run();
  const network = await db
    .prepare("UPDATE order_attribution SET client_ip = '', client_user_agent = '' WHERE created_at <= ? AND (client_ip != '' OR client_user_agent != '')")
    .bind(before)
    .run();
  return { checkouts: purged.meta?.changes ?? 0, attribution: attribution.meta?.changes ?? 0, ipAndBrowser: network.meta?.changes ?? 0 };
}

// Cron job (worker/cron.js).
export async function scheduledCheckouts(env) {
  return { expiry: await expireCheckouts(env), purge: await purgeCheckouts(env) };
}
