// Payment events after the payment itself (M5 §4–5, PR 3-5): PayPal refunds and reversals (PAYMENT.CAPTURE.REFUNDED /
// REVERSED, M5-10), a PayPal capture denied after it was pending (PAYMENT.CAPTURE.DENIED), and disputes from both
// providers (Airwallex payment_dispute.*, PayPal CUSTOMER.DISPUTE.*; M5-12). Every event is read back from the provider
// (its current state) and matched to our order through the payment it belongs to; anything that does not match one of
// our orders is ignored. Refunds then go through the same path as Airwallex ones (worker/refunds.js recordRefund):
// customer notices, and a hold or cancellation of an order not shipped yet (worker/order-core.js).
import { AirwallexError, retrievePaymentDispute } from "./airwallex.js";
import { PaypalError, retrievePaypalCapture, retrievePaypalDispute, retrievePaypalRefund } from "./paypal.js";
import { getOrder } from "./orders.js";
import { paymentBelongsTo } from "./checkouts.js";
import { recordRefund } from "./refunds.js";
import { applyRefundsToOrder } from "./order-core.js";
import { processMessageJob } from "./customer-email.js";
import { airwallexDisputeState, paypalDisputeState, recordDispute } from "./disputes.js";
import { recordAudit } from "./fulfillment.js";
import { alertTeam } from "./team-alerts.js";

export const PAYPAL_REFUND_EVENTS = new Set(["PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED"]);
export const PAYPAL_DISPUTE_EVENTS = new Set(["CUSTOMER.DISPUTE.CREATED", "CUSTOMER.DISPUTE.UPDATED", "CUSTOMER.DISPUTE.RESOLVED"]);
export const PAYPAL_EVENTS = new Set([...PAYPAL_REFUND_EVENTS, ...PAYPAL_DISPUTE_EVENTS, "PAYMENT.CAPTURE.DENIED"]);
export const isAirwallexDisputeEvent = (name) => String(name ?? "").startsWith("payment_dispute.");

// PayPal refund statuses -> ours: COMPLETED = money returned.
const REFUND_STATUS = { COMPLETED: "SETTLED", PENDING: "RECEIVED", FAILED: "FAILED", CANCELLED: "FAILED" };
const cents = (value) => Math.round(Number(value) * 100);
const validId = (value) => typeof value === "string" && /^[\w-]{1,120}$/.test(value);

// A provider object that does not exist (404) is not ours to act on: null. Any other failure throws, so the webhook
// answers 502 and the provider sends the event again later.
async function unlessMissing(read) {
  try {
    return await read();
  } catch (error) {
    if ((error instanceof PaypalError || error instanceof AirwallexError) && error.status === 404) return null;
    throw error;
  }
}

// The capture a refund belongs to: its "up" link.
function captureIdOf(refund) {
  const up = (Array.isArray(refund?.links) ? refund.links : []).find((link) => link?.rel === "up" && /\/captures\//.test(link?.href ?? ""));
  return up ? decodeURIComponent(up.href.split("/captures/")[1].split(/[/?]/)[0]) : null;
}

// Our order for a PayPal capture: its custom_id is our order number, and the PayPal order it belongs to must be one of
// that checkout's payment objects.
async function orderForCapture(env, captureId) {
  if (!validId(captureId)) return null;
  const capture = await unlessMissing(() => retrievePaypalCapture(env, captureId));
  const orderId = capture?.custom_id || capture?.invoice_id;
  const paypalOrderId = capture?.supplementary_data?.related_ids?.order_id;
  if (!orderId || !paypalOrderId) return null;
  const order = await getOrder(env.DB, orderId);
  if (!order || !(await paymentBelongsTo(env.DB, "paypal", paypalOrderId, order.id))) return null;
  return { order, capture, paypalOrderId };
}

// Sends the customer / team refund messages a new observation created (as the Airwallex path does).
async function refundMessages(env, order, kind) {
  if (!kind) return;
  const kinds = kind.startsWith("refund:failed:") ? [kind, kind.replace("refund:failed:", "refund:team-failed:")] : [kind];
  await Promise.all(kinds.map((item) => processMessageJob(env, order, item)));
}

async function paypalRefundEvent(env, event, { adminUrl }) {
  const resource = event.resource ?? {};
  const refund = validId(resource.id) ? await unlessMissing(() => retrievePaypalRefund(env, resource.id)) : null;
  let captureId = refund ? captureIdOf(refund) : null;
  // A reversal PayPal reports on the capture itself (no refund object): the whole capture went back.
  if (!refund && event.event_type === "PAYMENT.CAPTURE.REVERSED" && validId(resource.id)) {
    captureId = resource.id;
  }
  const found = captureId ? await orderForCapture(env, captureId) : null;
  if (!found) return { outcome: "ignored" };
  const { order, capture, paypalOrderId } = found;
  const observed = refund
    ? { id: refund.id, amount: refund.amount, status: refund.status, created: refund.create_time, updated: refund.update_time }
    : { id: `rev-${capture.id}`, amount: capture.amount, status: "COMPLETED", created: capture.update_time ?? capture.create_time, updated: capture.update_time ?? capture.create_time };
  const kind = await recordRefund(env.DB, order, {
    id: observed.id, provider: "paypal", ref: paypalOrderId, amountCents: cents(observed.amount?.value), currency: String(observed.amount?.currency_code ?? ""),
    status: REFUND_STATUS[String(observed.status).toUpperCase()] ?? "RECEIVED", failureCode: "", createdAt: observed.created, updatedAt: observed.updated ?? observed.created,
  });
  if (event.event_type === "PAYMENT.CAPTURE.REVERSED") {
    await recordAudit(env.DB, { orderId: order.id, action: "order.payment_reversed", actor: "system", detail: { provider: "paypal", refundId: observed.id } });
    await alertTeam(env, {
      key: `reversed:paypal:${observed.id}`, kind: "payment_reversed", orderId: order.id, adminUrl,
      subject: `Order ${order.id}: PayPal reversed the payment`,
      lines: [`PayPal took back ${(cents(observed.amount?.value) / 100).toFixed(2)} ${observed.amount?.currency_code ?? ""} from this order's payment (a reversal, often after a dispute).`, "If the order has not shipped it is held or cancelled like any refund; check the PayPal dashboard for the reason."],
    });
  }
  await refundMessages(env, (await getOrder(env.DB, order.id)) ?? order, kind);
  await applyRefundsToOrder(env, order.id, { adminUrl });
  return { outcome: "recorded" };
}

// A capture that was pending and then denied: if it ever made an order paid, the team must look; otherwise nothing was
// taken and the checkout simply stays unpaid.
async function paypalDeniedEvent(env, event, { adminUrl }) {
  const found = await orderForCapture(env, event.resource?.id);
  if (!found || !["paid", "review"].includes(found.order.status) || found.order.payment_intent_id !== found.paypalOrderId) return { outcome: "ignored" };
  await recordAudit(env.DB, { orderId: found.order.id, action: "order.payment_denied", actor: "system", detail: { provider: "paypal", captureId: found.capture.id } });
  await alertTeam(env, {
    key: `denied:paypal:${found.capture.id}`, kind: "payment_denied", orderId: found.order.id, adminUrl,
    subject: `Order ${found.order.id}: PayPal denied the payment`,
    lines: ["PayPal reports the payment for this order as denied, so the money did not arrive. Do not ship it; check the PayPal dashboard and contact the customer."],
  });
  return { outcome: "alerted" };
}

async function paypalDisputeEvent(env, event, { adminUrl }) {
  const disputeId = event.resource?.dispute_id;
  if (!validId(disputeId)) return { outcome: "ignored" };
  const dispute = await unlessMissing(() => retrievePaypalDispute(env, disputeId));
  if (!dispute) return { outcome: "ignored" };
  const captureId = (Array.isArray(dispute?.disputed_transactions) ? dispute.disputed_transactions : [])[0]?.seller_transaction_id;
  const found = await orderForCapture(env, captureId);
  if (!found) return { outcome: "ignored" };
  const result = await recordDispute(env, { provider: "paypal", disputeId, orderId: found.order.id, state: paypalDisputeState(dispute) }, { adminUrl });
  return { outcome: "recorded", ...result };
}

export async function handlePaypalPaymentEvent(env, event, { adminUrl = null } = {}) {
  const type = String(event?.event_type ?? "");
  if (PAYPAL_REFUND_EVENTS.has(type)) return paypalRefundEvent(env, event, { adminUrl });
  if (type === "PAYMENT.CAPTURE.DENIED") return paypalDeniedEvent(env, event, { adminUrl });
  if (PAYPAL_DISPUTE_EVENTS.has(type)) return paypalDisputeEvent(env, event, { adminUrl });
  return { outcome: "ignored" };
}

// Airwallex payment_dispute.* (any stage): the dispute as Airwallex has it now, matched by its PaymentIntent.
export async function handleAirwallexDisputeEvent(env, event, { adminUrl = null } = {}) {
  const disputeId = event?.data?.object?.id;
  if (!validId(disputeId)) return { outcome: "ignored" };
  const dispute = await unlessMissing(() => retrievePaymentDispute(env, disputeId));
  const order = dispute?.merchant_order_id ? await getOrder(env.DB, dispute.merchant_order_id) : null;
  if (!order || !validId(dispute.payment_intent_id) || !(await paymentBelongsTo(env.DB, "airwallex", dispute.payment_intent_id, order.id))) return { outcome: "ignored" };
  const result = await recordDispute(env, { provider: "airwallex", disputeId, orderId: order.id, state: airwallexDisputeState(dispute) }, { adminUrl });
  return { outcome: "recorded", ...result };
}
