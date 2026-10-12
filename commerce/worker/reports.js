// Reports and exports (I4, I8, M9-06, M9-15, M9-16, M5-14; D56: days and months are the team's, Taiwan time unless
// ADMIN_TIME_ZONE says otherwise, the same calendar as the dashboard).
//
// Counted the way the dashboard counts (worker/dashboard.js): an order on the day it was paid, at its full total, also
// when it was refunded or cancelled later; a refund on the day the provider made it (failed ones never). Unpaid
// checkouts never count (D36). Net = paid − refunded.
//
//   GET /admin/api/reports/sales?preset=&from=&to=          the numbers, per product, per payment method, per day,
//                                                            shipping charged vs Amazon's fee estimate
//   GET /admin/api/exports/orders.csv?from=&to=             one row per order paid in the period
//   GET /admin/api/exports/payments.csv?from=&to=           every payment and refund in the period (bookkeeping: matches
//                                                            the Airwallex and PayPal reports, M9-06)
// Any member may read and download them (D54); each download is in the activity log.
import { calendar, dayStart, localTime, DAY } from "./business-time.js";
import { recordAdminAudit } from "./activity.js";

export const PRESETS = ["today", "7d", "30d", "month", "last_month", "year", "custom"];
const MAX_DAYS = 400;
const iso = (ms) => new Date(ms).toISOString();
const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;
const PROVIDER = `COALESCE((SELECT p.provider FROM checkout_payments p WHERE p.checkout_id = o.id AND p.ref = o.payment_intent_id),
  (SELECT op.provider FROM order_payments op WHERE op.order_id = o.id), 'airwallex')`;

export class ReportError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = "invalid_period";
  }
}

// { preset, from, to (both "YYYY-MM-DD", to included), fromMs, toMs (excluded), zone }.
export function periodOf(env, { preset = "month", from, to } = {}, nowMs = Date.now()) {
  const cal = calendar(env, nowMs);
  const name = PRESETS.includes(preset) ? preset : "month";
  const tomorrow = cal.today + DAY + 2 * 60 * 60_000; // past any daylight-saving hour; dayStart rounds to the day
  const end = dayStart(env, cal.dayKey(tomorrow));
  let fromMs;
  let toMs = end;
  if (name === "custom") {
    fromMs = dayStart(env, from);
    const last = dayStart(env, to);
    if (fromMs === null || last === null) throw new ReportError("Choose a start and an end day.");
    if (last < fromMs) throw new ReportError("The end day is before the start day.");
    toMs = dayStart(env, cal.dayKey(last + DAY + 2 * 60 * 60_000));
    if ((toMs - fromMs) / DAY > MAX_DAYS) throw new ReportError(`Choose ${MAX_DAYS} days or fewer.`);
  } else if (name === "today") fromMs = cal.today;
  else if (name === "7d") fromMs = dayStart(env, cal.dayKey(cal.today - 6 * DAY));
  else if (name === "30d") fromMs = dayStart(env, cal.dayKey(cal.today - 29 * DAY));
  else if (name === "month") fromMs = cal.month;
  else if (name === "year") fromMs = dayStart(env, `${cal.dayKey(cal.today).slice(0, 4)}-01-01`);
  else {
    toMs = cal.month;
    fromMs = dayStart(env, `${cal.dayKey(cal.month - DAY).slice(0, 7)}-01`);
  }
  return { preset: name, from: cal.dayKey(fromMs), to: cal.dayKey(toMs - 1), fromMs, toMs, zone: cal.zone };
}

const paidIn = (period) => [iso(period.fromMs), iso(period.toMs)];

// GET /admin/api/reports/sales
export async function salesReport(env, period) {
  const db = env.DB;
  const orders = await all(db,
    `SELECT o.id, o.paid_at, o.lines_json, o.subtotal_cents, o.shipping_cents, o.tax_cents, o.total_cents, ${PROVIDER} AS provider,
       f.fee_cents AS fee_cents
     FROM orders o LEFT JOIN order_mcf_fees f ON f.order_id = o.id
     WHERE o.paid_at IS NOT NULL AND o.paid_at >= ? AND o.paid_at < ?`, ...paidIn(period));
  const refunds = await all(db,
    "SELECT order_id, amount_cents, provider, provider_created_at FROM order_refunds WHERE status != 'FAILED' AND provider_created_at >= ? AND provider_created_at < ?",
    ...paidIn(period));
  const cal = calendar(env);
  const sum = (list, key) => list.reduce((total, item) => total + (item[key] ?? 0), 0);

  const products = new Map();
  for (const order of orders) {
    for (const line of JSON.parse(order.lines_json || "[]")) {
      const sku = String(line.sku).toUpperCase();
      const item = products.get(sku) ?? { sku, name: line.name, units: 0, salesCents: 0 };
      item.units += line.qty;
      item.salesCents += line.lineCents ?? 0;
      products.set(sku, item);
    }
  }
  const payments = new Map();
  for (const order of orders) {
    const item = payments.get(order.provider) ?? { provider: order.provider, orders: 0, paidCents: 0, refundedCents: 0 };
    item.orders += 1;
    item.paidCents += order.total_cents;
    payments.set(order.provider, item);
  }
  for (const refund of refunds) {
    const item = payments.get(refund.provider) ?? { provider: refund.provider, orders: 0, paidCents: 0, refundedCents: 0 };
    item.refundedCents += refund.amount_cents;
    payments.set(refund.provider, item);
  }
  const days = new Map();
  for (let ms = period.fromMs; ms < period.toMs; ms += DAY) days.set(cal.dayKey(ms + 2 * 60 * 60_000), { day: cal.dayKey(ms + 2 * 60 * 60_000), orders: 0, paidCents: 0, refundedCents: 0 });
  for (const order of orders) {
    const day = days.get(cal.dayKey(Date.parse(order.paid_at)));
    if (day) {
      day.orders += 1;
      day.paidCents += order.total_cents;
    }
  }
  for (const refund of refunds) {
    const day = days.get(cal.dayKey(Date.parse(refund.provider_created_at)));
    if (day) day.refundedCents += refund.amount_cents;
  }
  const withFee = orders.filter((order) => order.fee_cents !== null && order.fee_cents !== undefined);
  const grossCents = sum(orders, "total_cents");
  const refundedCents = sum(refunds, "amount_cents");
  return {
    period: { preset: period.preset, from: period.from, to: period.to, timeZone: period.zone },
    orders: orders.length,
    productsCents: sum(orders, "subtotal_cents"),
    shippingCents: sum(orders, "shipping_cents"),
    taxCents: sum(orders, "tax_cents"),
    grossCents,
    refunds: { cents: refundedCents, count: refunds.length, orders: new Set(refunds.map((refund) => refund.order_id)).size },
    netCents: grossCents - refundedCents,
    averageCents: orders.length ? Math.round(grossCents / orders.length) : 0,
    products: [...products.values()].sort((a, b) => b.salesCents - a.salesCents || a.sku.localeCompare(b.sku)),
    payments: [...payments.values()].sort((a, b) => b.paidCents - a.paidCents),
    days: (period.toMs - period.fromMs) / DAY <= 92 ? [...days.values()] : null,
    // Only orders with an estimate are compared (it is read when the order goes to Amazon).
    shippingVsAmazon: {
      orders: withFee.length,
      withoutEstimate: orders.length - withFee.length,
      chargedCents: sum(withFee, "shipping_cents"),
      feeCents: sum(withFee, "fee_cents"),
      differenceCents: sum(withFee, "shipping_cents") - sum(withFee, "fee_cents"),
    },
  };
}

// ---------- CSV ----------

// A text cell: quoted, and a leading = + - @ (a spreadsheet formula) defused with an apostrophe.
const text = (value) => {
  const raw = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
};
const amount = (cents) => (cents / 100).toFixed(2);
const csv = (header, rows) => `﻿${[header.join(","), ...rows.map((row) => row.join(","))].join("\r\n")}\r\n`;

export async function ordersCsv(env, actor, period) {
  const db = env.DB;
  const rows = await all(db,
    `SELECT o.*, ${PROVIDER} AS provider, f.shipped_at, f.carrier, f.tracking_number, m.fee_cents,
       COALESCE((SELECT SUM(r.amount_cents) FROM order_refunds r WHERE r.order_id = o.id AND r.status != 'FAILED'), 0) AS refunded_cents
     FROM orders o LEFT JOIN order_fulfillments f ON f.order_id = o.id LEFT JOIN order_mcf_fees m ON m.order_id = o.id
     WHERE o.paid_at IS NOT NULL AND o.paid_at >= ? AND o.paid_at < ? ORDER BY o.paid_at`, ...paidIn(period));
  const header = ["order", `paid (${period.zone})`, "status", "customer", "email", "ship to state", "items", "products", "shipping", "tax", "total",
    "refunded", "net", "currency", "payment", "payment reference", `shipped (${period.zone})`, "carrier", "tracking", "amazon fee estimate"];
  const body = rows.map((row) => {
    const s = JSON.parse(row.shipping_json || "{}");
    const items = JSON.parse(row.lines_json || "[]").map((line) => `${String(line.sku).toUpperCase()} x${line.qty}`).join("; ");
    return [
      text(row.id), text(localTime(env, Date.parse(row.paid_at))), text(row.status),
      text(s.erased ? "(deleted)" : `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim()), text(row.email), text(s.state), text(items),
      amount(row.subtotal_cents), amount(row.shipping_cents), amount(row.tax_cents), amount(row.total_cents),
      amount(row.refunded_cents), amount(row.total_cents - row.refunded_cents), text(row.currency),
      text(row.provider === "paypal" ? "PayPal" : "Airwallex"), text(row.payment_intent_id),
      text(row.shipped_at ? localTime(env, Date.parse(row.shipped_at)) : ""), text(row.carrier), text(row.tracking_number),
      row.fee_cents === null || row.fee_cents === undefined ? "" : amount(row.fee_cents),
    ];
  });
  await recordAdminAudit(db, { actor, action: "export.orders", target: `${period.from}..${period.to}`, detail: { rows: body.length } });
  return { filename: `apgo-orders-${period.from}-to-${period.to}.csv`, body: csv(header, body) };
}

// Money in and out, one line each: payments (by the day paid), refunds (by the day the provider made them), and the
// second payments of a checkout that the store refunded at once (worker/checkouts.js), which the providers list too.
export async function paymentsCsv(env, actor, period) {
  const db = env.DB;
  const [from, to] = paidIn(period);
  const payments = await all(db,
    `SELECT o.id, o.paid_at AS at, o.total_cents AS cents, o.currency, o.payment_intent_id AS ref, ${PROVIDER} AS provider
     FROM orders o WHERE o.paid_at IS NOT NULL AND o.paid_at >= ? AND o.paid_at < ?`, from, to);
  const refunds = await all(db,
    `SELECT order_id AS id, provider_created_at AS at, amount_cents AS cents, currency, id AS ref, provider, status
     FROM order_refunds WHERE status != 'FAILED' AND provider_created_at >= ? AND provider_created_at < ?`, from, to);
  const duplicates = await all(db,
    `SELECT checkout_id AS id, created_at, updated_at, amount_cents AS cents, currency, ref, provider, status FROM checkout_payments
     WHERE status IN ('duplicate_refunded', 'duplicate_refund_failed', 'duplicate_refunding') AND created_at >= ? AND created_at < ?`, from, to);
  const lines = [
    ...payments.map((row) => ({ at: row.at, type: "payment", order: row.id, provider: row.provider, ref: row.ref, cents: row.cents, currency: row.currency, status: "paid" })),
    ...refunds.map((row) => ({ at: row.at, type: "refund", order: row.id, provider: row.provider, ref: row.ref, cents: -row.cents, currency: row.currency, status: row.status.toLowerCase() })),
    ...duplicates.flatMap((row) => [
      { at: row.created_at, type: "second payment", order: row.id, provider: row.provider, ref: row.ref, cents: row.cents, currency: row.currency, status: "paid" },
      ...(row.status === "duplicate_refunded" ? [{ at: row.updated_at, type: "second payment refund", order: row.id, provider: row.provider, ref: row.ref, cents: -row.cents, currency: row.currency, status: "refunded" }] : []),
    ]),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)) || a.order.localeCompare(b.order));
  const header = [`date (${period.zone})`, "date (UTC)", "type", "order", "provider", "reference", "amount", "currency", "status"];
  const body = lines.map((line) => [
    text(localTime(env, Date.parse(line.at))), text(line.at), text(line.type), text(line.order), text(line.provider === "paypal" ? "PayPal" : "Airwallex"),
    text(line.ref), amount(line.cents), text(line.currency), text(line.status),
  ]);
  await recordAdminAudit(db, { actor, action: "export.payments", target: `${period.from}..${period.to}`, detail: { rows: body.length } });
  return { filename: `apgo-payments-${period.from}-to-${period.to}.csv`, body: csv(header, body) };
}
