// What happens once an order turns paid (M4 T1, and T5 when a review order is confirmed): the team's new-order
// notification, the customer's confirmation email, the Meta Purchase event and the cooling-off queue for Amazon. Each
// step happens once per order (claim rows), never throws, and never touches the payment.
//
// A payment whose amount did not match (review, T2) instead tells the team once, and nothing else happens until
// someone confirms or cancels it in the back office.
//
// Checkouts (worker/checkouts.js): once a checkout is paid, its other payment objects are voided; a payment that
// arrives after the checkout expired still makes the order and the team is told (M4-04); a second successful payment
// for an order already paid is refunded in full (C11, M5-08).
import { claimNotification, finishNotification, getOrder } from "./orders.js";
import { notifyOrderPaid } from "./notify.js";
import { processConfirmationJob } from "./customer-email.js";
import { metaEnabled, sendMetaEvent } from "./meta-capi.js";
import { applyRefundsToOrder, coolingOffMinutes, queueForAmazon } from "./order-core.js";
import { alertTeam } from "./team-alerts.js";
import { submitDueOrders } from "./mcf.js";
import { refundDuplicate, voidPayments } from "./checkouts.js";

// Meta CAPI event for one order, once. Reads the order fresh; never throws.
export async function runMetaEvent(env, orderId, eventName) {
  if (!metaEnabled(env)) return;
  try {
    await sendMetaEvent(env, await getOrder(env.DB, orderId), eventName);
  } catch (error) {
    console.error("meta_capi_error", { eventName, reason: error?.name });
  }
}

// The one-time "new paid order" notification. The claim row makes it fire at most once per order.
async function runNotification(env, order, adminOrigin) {
  try {
    if (!(await claimNotification(env.DB, order.id))) return;
    const results = await notifyOrderPaid(env, order, { adminUrl: `${adminOrigin}/admin/` });
    await finishNotification(env.DB, order.id, results);
  } catch (error) {
    console.error("order_notification_error", { orderId: order.id, reason: error?.message });
  }
}

// Amazon MCF: queued for the end of the cooling-off period (worker/order-core.js); the cron sends it. With no
// cooling-off (ORDER_COOLING_OFF_MINUTES = "0") it goes right away.
async function runAmazonQueue(env, order) {
  try {
    await queueForAmazon(env, order); // already queued (a confirmed review order) counts too
    if (coolingOffMinutes(env) === 0) await submitDueOrders(env, { orderId: order.id });
  } catch (error) {
    console.error("mcf_queue_error", { orderId: order.id, reason: error?.message });
  }
}

export function runAfterPaid(env, order, { adminOrigin }) {
  return Promise.all([
    runNotification(env, order, adminOrigin),
    processConfirmationJob(env, order),
    runAmazonQueue(env, order),
    runMetaEvent(env, order.id, "Purchase"),
  ]);
}

// After a settle attempt (webhook, return page, PayPal capture). Only the call that changed the order does anything.
export async function settleFollowUps(settled, { env, adminOrigin }) {
  const adminUrl = `${adminOrigin}/admin/`;
  if (settled?.duplicate && settled.order) {
    await refundDuplicate(env, { order: settled.order, ...settled.duplicate, adminUrl });
    return;
  }
  if (!settled?.changed) return;
  const order = settled.order;
  try {
    await voidPayments(env, order.id, { keep: settled.payment?.ref });
  } catch (error) {
    console.error("checkout_void_failed", { orderId: order.id, reason: error?.message });
  }
  if (settled.lateAfterExpiry) {
    await alertTeam(env, {
      key: `late-payment:${order.id}`,
      kind: "late_payment",
      orderId: order.id,
      adminUrl,
      subject: `Order ${order.id} was paid after its checkout expired`,
      lines: [`The checkout for ${order.id} had expired (no payment within 24 hours), then a payment succeeded. The order was created as usual; check that the items are still right to send.`],
    });
  }
  if (settled.status === "paid") {
    await runAfterPaid(env, order, { adminOrigin });
    // A refund that arrived before the payment (events out of order, M4-13) applies now.
    await applyRefundsToOrder(env, order.id, { adminUrl: `${adminOrigin}/admin/` });
  } else if (settled.status === "review") {
    await alertTeam(env, {
      key: `review:${order.id}`,
      kind: "review",
      orderId: order.id,
      adminUrl: `${adminOrigin}/admin/`,
      subject: `Order ${order.id} needs review: the payment did not match`,
      lines: [
        `The payment for order ${order.id} succeeded, but its amount, currency or shipping address did not match the order.`,
        "It will not be sent to Amazon. In the back office, confirm it (with a reason) or cancel it and refund the payment.",
      ],
    });
  }
}
