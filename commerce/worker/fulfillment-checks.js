// Fulfilment follow-ups on the cron (M6 §4, §6; PR 3-6). Cron job "fulfillment", every run:
//
//   * out of stock at Amazon (M6-06): an order Amazon could not fill is sent again once a day while it is paid and not
//     held; after 3 days the team is reminded once to decide (Cancel and refund in the back office, worker/order-refunds.js);
//   * no tracking (M6-08): an order with Amazon for 2 working days without shipping is reported to the team once (the
//     customer is not told, D18).
//
// Only orders already sent to Amazon (order_mcf rows) are looked at. Never throws.
import { alertTeam } from "./team-alerts.js";
import { submitOrderToMcf } from "./mcf.js";
import { orderState } from "./order-core.js";
import { adminHost } from "./hosts.js";

const DAY_MS = 24 * 60 * 60_000;
const DECIDE_AFTER_MS = 3 * DAY_MS;
const NO_TRACKING_WORKING_DAYS = 2;
const BATCH = 20;
const iso = (ms) => new Date(ms).toISOString();
const adminUrlOf = (env) => `${adminHost(env) ? `https://${adminHost(env)}` : "https://www.shopapgo.com"}/admin/`;

// `days` working days (Monday to Friday, UTC) after `ms`.
export function addWorkingDays(ms, days) {
  let at = ms;
  let left = days;
  while (left > 0) {
    at += DAY_MS;
    const weekday = new Date(at).getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return at;
}

async function retryStockouts(env, nowMs) {
  const summary = { retried: 0, sent: 0 };
  const { results } = await env.DB
    .prepare("SELECT order_id FROM order_mcf WHERE status = 'rejected' AND mcf_status = 'UNFULFILLABLE' AND stockout_at IS NOT NULL AND updated_at <= ? ORDER BY updated_at LIMIT ?")
    .bind(iso(nowMs - DAY_MS), BATCH)
    .all();
  for (const { order_id: orderId } of results) {
    const state = await orderState(env, orderId, nowMs);
    if (!state || state.stage !== "paid" || state.holds.length) continue;
    summary.retried += 1;
    const result = await submitOrderToMcf(env, state.order, { actor: "mcf-retry", nowMs });
    if (result.outcome === "submitted") summary.sent += 1;
    if (result.outcome === "failed") {
      await alertTeam(env, {
        key: `mcf-retry-failed:${orderId}`, kind: "mcf_failed", orderId, adminUrl: adminUrlOf(env),
        subject: `Order ${orderId}: sending it to Amazon again failed`,
        lines: [`Order ${orderId} was out of stock at Amazon; sending it again failed: ${result.record?.errorMessage ?? result.reason ?? "unknown error"}`, "Use Retry send, or Cancel and refund, in the back office."],
      });
    }
  }
  return summary;
}

async function remindStockouts(env, nowMs) {
  const { results } = await env.DB
    .prepare(
      `SELECT m.order_id, m.stockout_at FROM order_mcf m JOIN orders o ON o.id = m.order_id
        WHERE m.stockout_at IS NOT NULL AND m.stockout_at <= ? AND m.status = 'rejected' AND o.status = 'paid'
        ORDER BY m.stockout_at LIMIT ?`,
    )
    .bind(iso(nowMs - DECIDE_AFTER_MS), BATCH)
    .all();
  let reminded = 0;
  for (const row of results) {
    const sent = await alertTeam(env, {
      key: `stockout-day3:${row.order_id}`, kind: "stockout_decide", orderId: row.order_id, adminUrl: adminUrlOf(env),
      subject: `Order ${row.order_id}: still out of stock after 3 days`,
      lines: [
        `Amazon has not been able to fill order ${row.order_id} since ${new Date(row.stockout_at).toUTCString()}.`,
        "The customer was told it would be cancelled and refunded after 3 days. Use Cancel and refund in the back office, or keep waiting if the customer agreed.",
      ],
    });
    if (sent.status !== "duplicate") reminded += 1;
  }
  return reminded;
}

async function reportNoTracking(env, nowMs) {
  // Two working days are at least two calendar days: a cheap first filter.
  const { results } = await env.DB
    .prepare("SELECT order_id, seller_order_id, submitted_at FROM order_mcf WHERE status = 'submitted' AND submitted_at IS NOT NULL AND submitted_at <= ? ORDER BY submitted_at LIMIT ?")
    .bind(iso(nowMs - 2 * DAY_MS), BATCH * 5)
    .all();
  let reported = 0;
  for (const row of results) {
    if (addWorkingDays(Date.parse(row.submitted_at), NO_TRACKING_WORKING_DAYS) > nowMs) continue;
    const sent = await alertTeam(env, {
      key: `no-tracking:${row.seller_order_id}`, kind: "no_tracking", orderId: row.order_id, adminUrl: adminUrlOf(env),
      subject: `Order ${row.order_id}: with Amazon for 2 working days without shipping`,
      lines: [
        `Order ${row.order_id} was sent to Amazon on ${new Date(row.submitted_at).toUTCString()} and has no tracking number yet.`,
        "The customer has not been told. Check the order in Seller Central (Multi-Channel Fulfillment orders).",
      ],
    });
    if (sent.status !== "duplicate") reported += 1;
  }
  return reported;
}

export async function scheduledFulfillmentChecks(env, { nowMs = Date.now() } = {}) {
  const summary = { retried: 0, sent: 0, reminded: 0, noTracking: 0 };
  try {
    // The reminder looks at the last attempt (still closed as out of stock), so it runs before today's new attempt.
    summary.reminded = await remindStockouts(env, nowMs);
    Object.assign(summary, await retryStockouts(env, nowMs));
    summary.noTracking = await reportNoTracking(env, nowMs);
  } catch (error) {
    console.error("fulfillment_checks_failed", { reason: error?.message });
  }
  return summary;
}
