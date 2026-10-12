// MCF order flow: decides whether a paid order is sent to Amazon Multi-Channel Fulfillment, records the result in
// D1 (order_mcf), and syncs Amazon's shipment status back into the existing "mark as shipped" path.
//
//   * The Worker holds no Amazon credentials: worker/amazon-mcf.js calls the internal outbound endpoints of the
//     amazon-spapi-mcp Worker (AMAZON_OUTBOUND_BASE_URL + OUTBOUND_INTERNAL_TOKEN).
//   * OFF by default: nothing happens (and nothing is written) unless MCF_AUTO_SUBMIT=true AND the outbound connection
//     AND the SKU map are all present. The back office then shows "MCF not enabled / ship manually".
//   * A failure never touches the payment: it is stored on the order_mcf row (visible in /admin/) and can be
//     retried with the admin button. Nothing in this file throws to its callers.
//   * Duplicate shipments are prevented three ways: the order_mcf primary key (one automatic submission per
//     order), a conditional UPDATE claim for retries, and Amazon's own uniqueness of SellerFulfillmentOrderId.
//     A create that hit a network error is only ever repeated with the SAME id, after asking Amazon whether the
//     first attempt landed.
//   * Sync: COMPLETE + a tracking number -> markShipped() (idempotent INSERT) -> shipment email (claimed once).
//   * When (M4 §3.6, PR 3-3): never at payment. A paid order is queued (worker/order-core.js queueForAmazon) and the cron
//     sends it once its cooling-off period is over and nothing holds it (submitDueOrders). The back-office button
//     also waits for the end of the cooling-off period.
import { coolingOff, orderHolds, orderState } from "./order-core.js";
import { alertTeam } from "./team-alerts.js";

import {
  McfError,
  amazonAddress,
  cancelFulfillmentOrder,
  createFulfillmentOrder,
  getFulfillmentOrder,
  getFulfillmentPreview,
  getPackageTracking,
  listFulfillmentOrders,
  SHIPPED_STATUSES,
  connectionProblem,
  mcfReadiness,
  shipmentFromMcfOrder,
  packagesFromMcfOrder,
} from "./amazon-mcf.js";
import { savePackages } from "./package-tracking.js";
import { FulfillmentError, markShipped, recordAudit, validateShipment } from "./fulfillment.js";
import { processMessageJob, processNoticeJob, queueNotice } from "./customer-email.js";
import { getOrder } from "./orders.js";
import { PRODUCTS } from "./catalog.js";
import { adminHost } from "./hosts.js";

const now = () => new Date().toISOString();
const STALE_SUBMITTING_MS = 5 * 60_000;
const RETRYABLE = ["failed", "rejected"];
const SYNC_BATCH = 25;
const TERMINAL_BAD = ["CANCELLED", "UNFULFILLABLE", "INVALID"];
const clip = (value, max) => String(value ?? "").slice(0, max);
const adminUrlOf = (env) => `${adminHost(env) ? `https://${adminHost(env)}` : "https://www.shopapgo.com"}/admin/`;
const CANCEL_REQUESTED = "Cancellation requested; sync to confirm.";

export function getMcfRecord(db, orderId) {
  return db.prepare("SELECT * FROM order_mcf WHERE order_id = ?").bind(orderId).first();
}

function publicRecord(row) {
  if (!row) return null;
  return {
    status: row.status,
    mcfStatus: row.mcf_status || null,
    sellerOrderId: row.seller_order_id,
    attempts: row.attempts,
    serviceTier: row.service_tier || null,
    errorKind: row.error_kind || null,
    errorMessage: row.error_message || null,
    note: row.note || null,
    carrier: row.carrier || null,
    trackingNumber: row.tracking_number || null,
    submittedAt: row.submitted_at,
    lastSyncedAt: row.last_synced_at,
    updatedAt: row.updated_at,
    check: row.check_status ? { status: row.check_status, detail: row.check_detail || null, at: row.checked_at ?? null } : null,
    stockoutAt: row.stockout_at ?? null,
  };
}

const isStaleSubmitting = (row) => row.status === "submitting" && Date.now() - Date.parse(row.updated_at) > STALE_SUBMITTING_MS;

// What the back office shows and which buttons it may offer. `order` is a D1 row; `fulfillment` its shipment (or null).
export async function mcfView(env, order, fulfillment) {
  // A database that has not run the latest migrations yet simply reads as "never sent" instead of breaking the page.
  let row = null;
  try {
    row = await getMcfRecord(env.DB, order.id);
  } catch (error) {
    console.error("mcf_record_unreadable", { orderId: order.id, reason: error?.message });
  }
  const readiness = mcfReadiness(env, order);
  const holds = await orderHolds(env.DB, order);
  const cooling = coolingOff(env, order);
  const eligible = order.status === "paid" && !fulfillment && !holds.length;
  const retryable = !row || RETRYABLE.includes(row.status) || isStaleSubmitting(row);
  const stockout = row && isStockout(row) && order.status === "paid" && !fulfillment;
  return {
    mode: readiness.mode, // off | not_configured | ready
    reason: holds.find((hold) => hold.code === "refund") ? "Refund registered; review fulfillment before submitting to Amazon." : holds[0]?.message ?? readiness.reason,
    coolingOffEndsAt: cooling.active ? cooling.endsAt : null,
    canSubmit: readiness.ok && eligible && retryable && !cooling.active,
    canSync: Boolean(row) && ["submitted", "submitting"].includes(row.status) && readiness.config.connectionOk,
    // Stop the Amazon order only (the order stays paid and can be sent again), e.g. after a failed read-back check.
    canCancelAtAmazon: Boolean(row) && row.status === "submitted" && readiness.config.connectionOk && row.note !== CANCEL_REQUESTED,
    // Out of stock at Amazon (M6-06): since when; the order can be cancelled and refunded from here.
    stockout: stockout ? { since: row.stockout_at, days: Math.floor((Date.now() - Date.parse(row.stockout_at)) / 86_400_000), canCancelAndRefund: true } : null,
    record: publicRecord(row),
  };
}

// Amazon said it could not fill the order (the latest attempt is closed as UNFULFILLABLE).
export const isStockout = (row) => Boolean(row?.stockout_at) && row.status === "rejected" && row.mcf_status === "UNFULFILLABLE";

// ---------- building the Amazon request from an order ----------

export function buildMcfInput(order, config) {
  const lines = JSON.parse(order.lines_json);
  const shipping = JSON.parse(order.shipping_json);
  const bySku = new Map();
  for (const line of lines) {
    const sku = config.skuMap[String(line.sku).toUpperCase()];
    bySku.set(sku, (bySku.get(sku) ?? 0) + Number(line.qty));
  }
  return {
    tier: config.shippingMap[String(order.shipping_method).toUpperCase()],
    address: {
      name: `${shipping.firstName} ${shipping.lastName}`.trim(),
      addressLine1: shipping.street,
      addressLine2: shipping.street2 || undefined,
      city: shipping.city,
      stateOrRegion: shipping.state,
      postalCode: shipping.zip,
      phone: shipping.phone || undefined, // the checkout does not collect one today; passed on when an order has it
    },
    items: [...bySku].map(([sku, qty]) => ({ sku, qty })),
    displayableOrderDate: order.paid_at || order.created_at || undefined,
    // Amazon only emails the shopper when MCF_NOTIFY_AMAZON_EMAIL=true (default off: our own emails are the only ones).
    notificationEmails: config.notifyAmazonEmail && order.email ? [order.email] : [],
  };
}

// ---------- the read-back check (D26, M6-16) ----------

const norm = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const ADDRESS_FIELDS = [["name", "name"], ["addressLine1", "street"], ["addressLine2", "street line 2"], ["city", "city"], ["stateOrRegion", "state"]];

// What was sent ({ address, items: [{ sku, qty }] }) against Amazon's copy (normalizeMcfOrder). Returns the differences
// in words, [] when they agree, or null when Amazon's copy has no items or address to compare.
export function compareAmazonCopy(input, amazonOrder) {
  if (!amazonOrder?.address || !amazonOrder.items?.length) return null;
  const sent = amazonAddress(input.address);
  const differences = [];
  const count = (items) => items.reduce((map, item) => map.set(item.sku, (map.get(item.sku) ?? 0) + Number(item.qty)), new Map());
  const ours = count(input.items);
  const theirs = count(amazonOrder.items);
  for (const sku of new Set([...ours.keys(), ...theirs.keys()])) {
    if ((ours.get(sku) ?? 0) !== (theirs.get(sku) ?? 0)) differences.push(`${sku}: sent ${ours.get(sku) ?? 0}, Amazon has ${theirs.get(sku) ?? 0}`);
  }
  for (const [key, label] of ADDRESS_FIELDS) {
    if (norm(sent[key]) !== norm(amazonOrder.address[key])) differences.push(`${label}: sent "${sent[key] ?? ""}", Amazon has "${amazonOrder.address[key] ?? ""}"`);
  }
  const zip = (value) => String(value ?? "").trim().slice(0, 5);
  if (zip(sent.postalCode) !== zip(amazonOrder.address.postalCode)) differences.push(`ZIP: sent "${sent.postalCode}", Amazon has "${amazonOrder.address.postalCode}"`);
  return differences;
}

// Reads Amazon's copy of the order just sent and compares it with what was sent; a mismatch is recorded and the team
// told (cancel it at Amazon from the back office while it has not been picked). An unreadable copy is checked again on
// the next sync. Never throws.
async function verifyAmazonCopy(env, orderId, { input, sellerOrderId, actor, amazonOrder }) {
  try {
    const copy = amazonOrder === undefined ? await getFulfillmentOrder(env, sellerOrderId).catch(() => null) : amazonOrder;
    const differences = copy ? compareAmazonCopy(input, copy) : null;
    const at = now();
    if (!differences) {
      await env.DB.prepare("UPDATE order_mcf SET check_status = 'unreadable', check_detail = ?, checked_at = ? WHERE order_id = ?")
        .bind("Amazon's copy could not be read yet; it is checked again at the next sync.", at, orderId).run();
      return "unreadable";
    }
    const status = differences.length ? "mismatch" : "ok";
    await env.DB.prepare("UPDATE order_mcf SET check_status = ?, check_detail = ?, checked_at = ? WHERE order_id = ?")
      .bind(status, clip(differences.join("; "), 500), at, orderId).run();
    if (status === "mismatch") {
      await audit(env.DB, orderId, "mcf.mismatch", actor, { sellerOrderId, differences: differences.slice(0, 10) });
      await alertTeam(env, {
        key: `mcf-mismatch:${sellerOrderId}`, kind: "mcf_mismatch", orderId, adminUrl: adminUrlOf(env),
        subject: `Order ${orderId}: Amazon's copy does not match what was sent`,
        lines: ["Amazon's copy of this shipment differs from the order:", ...differences.map((line) => `- ${line}`), "If Amazon has not started picking it, use \"Cancel at Amazon\" in the back office, check the order, then send it again."],
      });
    }
    return status;
  } catch (error) {
    console.error("mcf_check_failed", { orderId, reason: error?.message });
    return "unreadable";
  }
}

// ---------- bookkeeping ----------

async function audit(db, orderId, action, actor, detail) {
  try {
    await recordAudit(db, { orderId, action, actor, detail });
  } catch (error) {
    console.error("order_audit_failed", { orderId, reason: error?.message });
  }
}

// Returns { claimed, row, sellerOrderId, attempts } — claimed only for the single caller that may talk to Amazon.
async function claim(db, orderId, tier) {
  const timestamp = now();
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO order_mcf (order_id, seller_order_id, status, attempts, service_tier, created_at, updated_at)
       SELECT ?, ?, 'submitting', 1, ?, ?, ? WHERE NOT EXISTS
         (SELECT 1 FROM order_refunds WHERE order_id = ? AND status != 'FAILED')
         AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'paid')`,
    )
    .bind(orderId, orderId, tier, timestamp, timestamp, orderId, orderId)
    .run();
  if (inserted.meta.changes > 0) return { claimed: true, row: null, sellerOrderId: orderId, attempts: 1 };

  const row = await getMcfRecord(db, orderId);
  if (!row || !(RETRYABLE.includes(row.status) || isStaleSubmitting(row))) return { claimed: false, row };
  // Amazon closed the previous MCF order itself (cancelled/unfulfillable/invalid): that id is spent, use a new suffix.
  const fresh = row.status === "rejected";
  const attempts = fresh ? row.attempts + 1 : row.attempts;
  const sellerOrderId = fresh ? `${orderId}-R${attempts}` : row.seller_order_id;
  const result = await db
    .prepare(
      `UPDATE order_mcf SET status = 'submitting', seller_order_id = ?, attempts = ?, service_tier = ?, mcf_status = '',
         error_kind = '', error_message = '', note = '', check_status = '', check_detail = '', checked_at = NULL, updated_at = ?
       WHERE order_id = ? AND status = ? AND updated_at = ?
         AND NOT EXISTS (SELECT 1 FROM order_refunds r WHERE r.order_id=order_mcf.order_id AND r.status!='FAILED')
         AND EXISTS (SELECT 1 FROM orders o WHERE o.id = order_mcf.order_id AND o.status = 'paid')`,
    )
    .bind(sellerOrderId, attempts, tier, now(), orderId, row.status, row.updated_at)
    .run();
  return result.meta.changes > 0 ? { claimed: true, row, sellerOrderId, attempts } : { claimed: false, row };
}

async function saveState(db, orderId, patch) {
  const columns = { status: "status", mcfStatus: "mcf_status", errorKind: "error_kind", errorMessage: "error_message", note: "note", carrier: "carrier", trackingNumber: "tracking_number", submittedAt: "submitted_at", lastSyncedAt: "last_synced_at" };
  const sets = [];
  const args = [];
  for (const [key, column] of Object.entries(columns)) {
    if (patch[key] !== undefined) {
      sets.push(`${column} = ?`);
      args.push(patch[key]);
    }
  }
  await db.prepare(`UPDATE order_mcf SET ${sets.join(", ")}, updated_at = ? WHERE order_id = ?`).bind(...args, now(), orderId).run();
}

const failure = (error) => ({
  status: "failed",
  errorKind: error instanceof McfError ? error.kind : "unexpected",
  errorMessage: clip(error?.message ?? "Unknown error", 300),
});

// ---------- submit ----------

// Sends one paid order to MCF. Never throws. Returns { outcome, ... }:
//   skipped (off / not configured / not eligible) | duplicate (someone else holds the claim) | submitted | failed
export async function submitOrderToMcf(env, order, { actor = "mcf-auto", nowMs = Date.now() } = {}) {
  const orderId = order.id;
  try {
    const readiness = mcfReadiness(env, order);
    if (!readiness.ok) {
      console.log("mcf_skipped", { orderId, mode: readiness.mode, reason: readiness.reason });
      return { outcome: "skipped", mode: readiness.mode, reason: readiness.reason };
    }
    const fresh = (await getOrder(env.DB, orderId)) ?? order;
    const holds = await orderHolds(env.DB, fresh);
    if (holds.some((hold) => hold.code === "refund")) return { outcome:'skipped', mode:readiness.mode, reason:'Refund registered; review fulfillment before submitting to Amazon.' };
    if (fresh.status !== "paid") return { outcome: "skipped", mode: "ready", reason: "Only paid orders are sent to MCF." };
    if (holds.length) return { outcome: "skipped", mode: readiness.mode, reason: holds[0].message };
    const cooling = coolingOff(env, fresh, nowMs);
    if (cooling.active) return { outcome: "skipped", mode: readiness.mode, reason: `The cooling-off period ends at ${cooling.endsAt}; the order is sent to Amazon after that.` };
    const shipped = await env.DB.prepare("SELECT 1 AS x FROM order_fulfillments WHERE order_id = ?").bind(orderId).first();
    if (shipped) return { outcome: "skipped", mode: "ready", reason: "The order is already marked shipped." };

    const input = buildMcfInput(fresh, readiness.config);
    const claimed = await claim(env.DB, orderId, input.tier);
    if (!claimed.claimed) return { outcome: "duplicate", record: publicRecord(claimed.row ?? (await getMcfRecord(env.DB, orderId))) };
    const { sellerOrderId, attempts } = claimed;

    // A retry first asks Amazon whether an earlier attempt with this same id actually landed (e.g. a timeout).
    if (claimed.row) {
      const existing = await getFulfillmentOrder(env, sellerOrderId).catch(() => undefined);
      if (existing) return adopt(env, orderId, sellerOrderId, existing, actor, attempts, input);
    }

    try {
      const created = await createFulfillmentOrder(env, { orderId: sellerOrderId, address: input.address, items: input.items, tier: input.tier, displayableOrderDate: input.displayableOrderDate, notificationEmails: input.notificationEmails });
      // The endpoint never re-creates a known id: Amazon already had this order (an earlier request landed).
      if (created.alreadyExists) {
        const existing = created.existing ?? (await getFulfillmentOrder(env, sellerOrderId).catch(() => null));
        if (existing) return adopt(env, orderId, sellerOrderId, existing, actor, attempts, input);
      }
      await saveState(env.DB, orderId, { status: "submitted", mcfStatus: created.status, submittedAt: now(), errorKind: "", errorMessage: "", note: "" });
      await audit(env.DB, orderId, "mcf.submitted", actor, { sellerOrderId, tier: input.tier, attempts, items: input.items });
      console.log("mcf_submitted", { orderId, sellerOrderId, tier: input.tier });
      await verifyAmazonCopy(env, orderId, { input, sellerOrderId, actor });
      await saveFeeEstimate(env, orderId, input);
      return { outcome: "submitted", record: publicRecord(await getMcfRecord(env.DB, orderId)) };
    } catch (error) {
      // Timeout / network / 5xx: the order may exist at Amazon. Reconcile by id before calling it a failure.
      if (error instanceof McfError && error.ambiguous) {
        const existing = await getFulfillmentOrder(env, sellerOrderId).catch(() => undefined);
        if (existing) return adopt(env, orderId, sellerOrderId, existing, actor, attempts, input);
      }
      const state = failure(error);
      await saveState(env.DB, orderId, state);
      await audit(env.DB, orderId, "mcf.failed", actor, { sellerOrderId, kind: state.errorKind, message: state.errorMessage, attempts });
      console.error("mcf_failed", { orderId, sellerOrderId, kind: state.errorKind, code: error?.code, status: error?.status, message: state.errorMessage });
      return { outcome: "failed", record: publicRecord(await getMcfRecord(env.DB, orderId)) };
    }
  } catch (error) {
    // Even bookkeeping problems must not reach the payment flow.
    console.error("mcf_error", { orderId, reason: error?.message });
    return { outcome: "failed", reason: clip(error?.message, 200) };
  }
}

// Amazon's fee estimate for the order just sent (read-only preview), for the report's "shipping charged vs Amazon's fee"
// (I8, M9-16). Kept once; a failure only means the report has no estimate for this order.
async function saveFeeEstimate(env, orderId, input) {
  try {
    const preview = await getFulfillmentPreview(env, { address: input.address, items: input.items, tier: input.tier });
    const fee = preview?.offer?.feeCents;
    if (!Number.isSafeInteger(fee) || fee < 0) return;
    await env.DB.prepare("INSERT OR IGNORE INTO order_mcf_fees (order_id, fee_cents, currency, tier, captured_at) VALUES (?, ?, 'USD', ?, ?)")
      .bind(orderId, fee, input.tier ?? "", now()).run();
  } catch (error) {
    console.error("mcf_fee_estimate_failed", { orderId, reason: error?.message });
  }
}

// Amazon already has this order id (our earlier request landed): record it and apply its current status.
async function adopt(env, orderId, sellerOrderId, amazonOrder, actor, attempts, input) {
  await saveState(env.DB, orderId, { status: "submitted", mcfStatus: amazonOrder.status, submittedAt: now(), errorKind: "", errorMessage: "", note: "Found at Amazon after an unconfirmed attempt." });
  await audit(env.DB, orderId, "mcf.submitted", actor, { sellerOrderId, recovered: true, attempts });
  if (input) await verifyAmazonCopy(env, orderId, { input, sellerOrderId, actor, amazonOrder });
  if (input) await saveFeeEstimate(env, orderId, input);
  const synced = await applyAmazonOrder(env, orderId, amazonOrder, actor);
  if (!synced.shipped && !TERMINAL_BAD.includes(amazonOrder.status)) {
    const current = await getMcfRecord(env.DB, orderId);
    if (current && current.status === "submitted" && !current.note) await saveState(env.DB, orderId, { note: "Found at Amazon after an unconfirmed attempt." });
  }
  return { outcome: "submitted", record: publicRecord(await getMcfRecord(env.DB, orderId)), ...synced };
}

// ---------- sync ----------

// COMPLETE but the order lists no tracking number on its packages: ask the tracking endpoint per package (read-only).
// Returns Amazon's order with those numbers filled in, or null.
async function withPackageTracking(env, amazonOrder) {
  const packages = amazonOrder.shipments.flatMap((s) => s.packages).filter((p) => !p.trackingNumber && /^\d+$/.test(p.packageId));
  if (!packages.length) return null;
  const filled = { ...amazonOrder, shipments: [{ status: "", shipTime: null, packages: [] }] };
  for (const pkg of packages.slice(0, 5)) {
    const tracking = await getPackageTracking(env, pkg.packageId).catch(() => null);
    if (tracking?.trackingNumber) filled.shipments[0].packages.push({ ...pkg, carrierCode: tracking.carrierCode || pkg.carrierCode, trackingNumber: tracking.trackingNumber, trackingUrl: tracking.trackingUrl });
  }
  return filled;
}

// Applies Amazon's order state to our row and, when Amazon reports shipped with tracking, to the order's fulfilment.
async function applyAmazonOrder(env, orderId, amazonOrder, actor) {
  const timestamp = now();
  const base = { mcfStatus: amazonOrder.status, lastSyncedAt: timestamp };

  if (TERMINAL_BAD.includes(amazonOrder.status)) {
    const before = await getMcfRecord(env.DB, orderId);
    await saveState(env.DB, orderId, { ...base, status: "rejected", errorKind: "amazon", errorMessage: `Amazon closed the MCF order as ${amazonOrder.status}.`, note: "" });
    await audit(env.DB, orderId, "mcf.closed", actor, { mcfStatus: amazonOrder.status });
    if (amazonOrder.status === "UNFULFILLABLE") await onStockout(env, orderId);
    else if (before?.note !== CANCEL_REQUESTED && (await getOrder(env.DB, orderId))?.status === "paid") {
      // Amazon closed it without being asked: the order is paid and not on its way.
      await alertTeam(env, {
        key: `mcf-closed:${before?.seller_order_id ?? orderId}`, kind: "mcf_closed", orderId, adminUrl: adminUrlOf(env),
        subject: `Order ${orderId}: Amazon closed the shipment (${amazonOrder.status})`,
        lines: [`Amazon closed the MCF order for ${orderId} as ${amazonOrder.status}; nothing will ship.`, "Check the address and the items, then use Retry send in the back office, or cancel and refund the order."],
      });
    }
    return { changed: true, shipped: false, email: null };
  }

  let shipped = amazonOrder;
  let shipment = shipmentFromMcfOrder(amazonOrder);
  if (!shipment && SHIPPED_STATUSES.includes(amazonOrder.status)) {
    shipped = (await withPackageTracking(env, amazonOrder)) ?? amazonOrder;
    shipment = shipmentFromMcfOrder(shipped);
  }
  if (!shipment) {
    const done = SHIPPED_STATUSES.includes(amazonOrder.status);
    await saveState(env.DB, orderId, { ...base, note: done ? "Amazon shipped; waiting for a tracking number." : "" });
    return { changed: false, shipped: false, email: null };
  }

  let checked;
  try {
    checked = validateShipment(shipment);
  } catch (error) {
    await saveState(env.DB, orderId, { ...base, errorKind: "invalid", errorMessage: `Amazon tracking data was rejected: ${clip(error.message, 120)}`, note: "Mark the order shipped by hand." });
    return { changed: false, shipped: false, email: null };
  }

  try {
    const order = await markShipped(env.DB, orderId, checked, { actor: "mcf" });
    // Every package first, so the shipment email lists them all (F6, M8-05).
    await savePackages(env.DB, orderId, packagesFromMcfOrder(shipped));
    await saveState(env.DB, orderId, { ...base, status: "shipped", carrier: checked.carrier, trackingNumber: checked.trackingNumber, errorKind: "", errorMessage: "", note: "" });
    await audit(env.DB, orderId, "mcf.shipped", actor, { carrier: checked.carrier, trackingNumber: checked.trackingNumber });
    // The shipment row is saved; the email is claimed once per order (order_emails), so nothing can send it twice.
    const email = await processMessageJob(env, (await getOrder(env.DB, orderId)) ?? order, 'shipment');
    return { changed: true, shipped: true, email: email.status };
  } catch (error) {
    if (error instanceof FulfillmentError && error.code === "already_shipped") {
      // Shipped by hand (or by a parallel sync) first: no second record, no second email.
      await savePackages(env.DB, orderId, packagesFromMcfOrder(shipped));
      await saveState(env.DB, orderId, { ...base, status: "shipped", carrier: checked.carrier, trackingNumber: checked.trackingNumber, note: "Order was already marked shipped." });
      return { changed: false, shipped: false, email: null };
    }
    if (error instanceof FulfillmentError) {
      await saveState(env.DB, orderId, { ...base, errorKind: "order", errorMessage: clip(error.message, 200) });
      return { changed: false, shipped: false, email: null };
    }
    throw error;
  }
}

// Amazon could not fill the order (M6-06, F2): the first time, record when, tell the team and send the customer one delay
// notice. The order is sent again once a day (worker/fulfillment-checks.js); on day 3 the team decides (cancel and refund
// from the back office, 10/9 decision).
async function onStockout(env, orderId) {
  const at = now();
  const first = await env.DB.prepare("UPDATE order_mcf SET stockout_at = ? WHERE order_id = ? AND stockout_at IS NULL").bind(at, orderId).run();
  if (!(first.meta?.changes > 0)) return;
  await audit(env.DB, orderId, "mcf.stockout", "mcf", {});
  await alertTeam(env, {
    key: `stockout:${orderId}`, kind: "stockout", orderId, adminUrl: adminUrlOf(env),
    subject: `Order ${orderId}: out of stock at Amazon`,
    lines: [
      `Amazon could not fill order ${orderId} (UNFULFILLABLE, usually out of stock). The customer was told it is delayed.`,
      "It is sent to Amazon again once a day. If it still cannot ship after 3 days, cancel and refund it from the back office (you will be reminded).",
    ],
  });
  const order = await getOrder(env.DB, orderId);
  if (order?.status === "paid" && (await queueNotice(env.DB, orderId, "delay:stockout"))) await processNoticeJob(env, order, "delay:stockout");
}

// Asks Amazon about one order. Never throws. Returns { outcome: "synced" | "skipped" | "failed", ... }.
export async function syncMcfOrder(env, orderId, { actor = "admin" } = {}) {
  try {
    const row = await getMcfRecord(env.DB, orderId);
    if (!row) return { outcome: "skipped", reason: "This order was never sent to MCF." };
    if (!["submitted", "submitting"].includes(row.status)) return { outcome: "skipped", reason: `Nothing to sync (${row.status}).`, record: publicRecord(row) };
    const readiness = mcfReadiness(env, null);
    if (!readiness.config.connectionOk) return { outcome: "skipped", reason: `Outbound service not configured: ${connectionProblem(readiness.config)}.`, record: publicRecord(row) };

    const amazonOrder = await getFulfillmentOrder(env, row.seller_order_id);
    if (!amazonOrder) {
      // A row still "submitting" with no order at Amazon is an interrupted attempt: let the retry button take over.
      if (row.status === "submitting" && isStaleSubmitting(row)) {
        await saveState(env.DB, orderId, { status: "failed", errorKind: "transient", errorMessage: "The submission was interrupted and Amazon has no such order. Retry it." });
      } else {
        await saveState(env.DB, orderId, { lastSyncedAt: now(), note: "Amazon does not know this order id yet." });
      }
      return { outcome: "synced", shipped: false, record: publicRecord(await getMcfRecord(env.DB, orderId)) };
    }
    // The read-back check could not run right after sending (or the row predates it): do it now.
    if (["", "unreadable"].includes(row.check_status ?? "") && !TERMINAL_BAD.includes(amazonOrder.status)) {
      const order = await getOrder(env.DB, orderId);
      if (order) await verifyAmazonCopy(env, orderId, { input: buildMcfInput(order, readiness.config), sellerOrderId: row.seller_order_id, actor, amazonOrder });
    }
    const applied = await applyAmazonOrder(env, orderId, amazonOrder, actor);
    return { outcome: "synced", ...applied, record: publicRecord(await getMcfRecord(env.DB, orderId)) };
  } catch (error) {
    const state = failure(error);
    console.error("mcf_sync_failed", { orderId, kind: state.errorKind, message: state.errorMessage });
    // A failed poll is not a failed shipment: keep the row as it is, only note the problem.
    try {
      await saveState(env.DB, orderId, { lastSyncedAt: now(), note: `Last sync failed: ${state.errorMessage}` });
    } catch {
      // ignore
    }
    return { outcome: "failed", reason: state.errorMessage, record: publicRecord(await getMcfRecord(env.DB, orderId).catch(() => null)) };
  }
}

// Syncs every order that is waiting on Amazon (oldest first, a bounded batch). Used by the admin button and the
// optional cron trigger. Never throws.
export async function syncAllMcf(env, { actor = "admin" } = {}) {
  const summary = { checked: 0, shipped: 0, failed: 0, skipped: 0 };
  try {
    const { results } = await env.DB
      .prepare("SELECT order_id FROM order_mcf WHERE status IN ('submitted','submitting') ORDER BY updated_at LIMIT ?")
      .bind(SYNC_BATCH)
      .all();
    for (const { order_id: orderId } of results) {
      const result = await syncMcfOrder(env, orderId, { actor });
      summary.checked += 1;
      if (result.shipped) summary.shipped += 1;
      else if (result.outcome === "failed") summary.failed += 1;
      else if (result.outcome === "skipped") summary.skipped += 1;
    }
  } catch (error) {
    console.error("mcf_sync_all_failed", { reason: error?.message });
  }
  return summary;
}

// ---------- the cooling-off queue (M4 §3.6) ----------

const SUBMIT_BATCH = 10;
const dropQueued = (db, orderId) => db.prepare("DELETE FROM mcf_submission_queue WHERE order_id = ?").bind(orderId).run();

// Sends the queued orders whose cooling-off period is over (oldest first, a bounded batch). An order that was
// cancelled, shipped or already sent leaves the queue; a held one waits. When automatic submission was switched off
// or is not configured any more, the order leaves the queue and the team is told to send it by hand. Never throws.
export async function submitDueOrders(env, { nowMs = Date.now(), orderId = null, adminUrl = null } = {}) {
  const summary = { checked: 0, submitted: 0, failed: 0, held: 0, dropped: 0 };
  try {
    const { results } = await env.DB
      .prepare(`SELECT order_id FROM mcf_submission_queue WHERE due_at <= ? ${orderId ? "AND order_id = ?" : ""} ORDER BY due_at LIMIT ?`)
      .bind(...[new Date(nowMs).toISOString(), ...(orderId ? [orderId] : []), SUBMIT_BATCH])
      .all();
    for (const { order_id: id } of results) {
      summary.checked += 1;
      const state = await orderState(env, id, nowMs);
      if (!state || state.stage !== "paid" || state.mcf) {
        await dropQueued(env.DB, id);
        summary.dropped += 1;
        continue;
      }
      if (state.holds.length || state.cooling.active) {
        summary.held += 1;
        continue;
      }
      const result = await submitOrderToMcf(env, state.order, { actor: "mcf-auto", nowMs });
      if (result.outcome === "skipped" && result.mode !== "ready") {
        await dropQueued(env.DB, id);
        summary.dropped += 1;
        await alertTeam(env, {
          key: `not-sent:${id}`, kind: "mcf_not_sent", orderId: id, adminUrl,
          subject: `Order ${id} was not sent to Amazon`,
          lines: [`Order ${id} was due to go to Amazon, but automatic sending is off or not set up: ${result.reason}`, "Ship it by hand, or send it from the back office once Amazon is set up."],
        });
        continue;
      }
      if (result.outcome === "skipped") {
        summary.held += 1;
        continue;
      }
      await dropQueued(env.DB, id);
      if (result.outcome === "failed") {
        summary.failed += 1;
        await alertTeam(env, {
          key: `mcf-failed:${id}`, kind: "mcf_failed", orderId: id, adminUrl,
          subject: `Order ${id}: sending to Amazon failed`,
          lines: [`Amazon did not accept order ${id}: ${result.record?.errorMessage ?? result.reason ?? "unknown error"}`, "Fix the cause, then use Retry send in the back office."],
        });
      } else summary.submitted += 1;
    }
  } catch (error) {
    console.error("mcf_submit_due_failed", { reason: error?.message });
  }
  return summary;
}

// Cron job: always on (the queue only holds orders paid while automatic submission was ready).
export async function scheduledMcfSubmissions(env) {
  return submitDueOrders(env);
}

// Optional cron (wrangler [triggers] crons): only does anything when MCF_SYNC_CRON=true.
export async function scheduledMcfSync(env) {
  if (String(env.MCF_SYNC_CRON ?? "").trim().toLowerCase() !== "true") return { ran: false };
  return { ran: true, ...(await syncAllMcf(env, { actor: "mcf-cron" })) };
}

// ---------- read-only helpers for admins ----------

export async function previewOrderForMcf(env, order) {
  const readiness = mcfReadiness(env, order);
  if (!readiness.config.connectionOk) throw new McfError("config", `Outbound service not configured: ${connectionProblem(readiness.config)}.`, { code: "missing_connection" });
  if (readiness.mode === "not_configured" && /SKU|shipping method/.test(readiness.reason)) throw new McfError("config", readiness.reason, { code: "not_mapped" });
  const input = buildMcfInput(order, readiness.config);
  return getFulfillmentPreview(env, input);
}

// Asks Amazon to stop an MCF order (only possible before picking) while the order itself stays paid: the back office's
// "Cancel at Amazon" (e.g. after a failed read-back check). The next sync sees CANCELLED, the row becomes "rejected" and
// Retry send creates a new Amazon order. Cancelling the whole order goes through worker/order-core.js cancelOrder.
export async function cancelMcfOrder(env, orderId, { actor = "admin" } = {}) {
  const row = await getMcfRecord(env.DB, orderId);
  if (!row || !["submitted", "submitting"].includes(row.status)) return { outcome: "skipped", reason: "There is no open Amazon order to cancel." };
  try {
    await cancelFulfillmentOrder(env, row.seller_order_id);
    await saveState(env.DB, orderId, { note: CANCEL_REQUESTED });
    await audit(env.DB, orderId, "mcf.cancel_requested", actor, { sellerOrderId: row.seller_order_id });
    // Amazon usually confirms at once: read it back so the back office shows the result.
    await syncMcfOrder(env, orderId, { actor });
    return { outcome: "requested", record: publicRecord(await getMcfRecord(env.DB, orderId)) };
  } catch (error) {
    return { outcome: "failed", reason: clip(error?.message, 200) };
  }
}

// Read-only connection check for admins (GET /admin/api/mcf/check): lists orders and previews one unit of each store SKU to a
// sample Seattle address. Creates and cancels nothing, and works whether or not MCF_AUTO_SUBMIT is on.
export async function checkMcfConnection(env) {
  const config = mcfReadiness(env, null).config;
  const problem = connectionProblem(config);
  if (problem) return { ok: false, step: "config", error: problem };
  const result = { ok: false, autoSubmit: config.enabled };
  try {
    const listed = await listFulfillmentOrders(env);
    result.list = { ok: true, count: listed.orders.length, complete: listed.complete };
  } catch (error) {
    return { ...result, step: "list", error: clip(error?.message, 200), kind: error?.kind ?? "unexpected" };
  }
  const skus = Object.values(PRODUCTS).map((product) => product.sku);
  const missing = skus.filter((sku) => !config.skuMap[sku]);
  if (missing.length) return { ...result, step: "preview", error: `Missing Amazon SKU mapping: ${missing.join(", ")}` };
  result.previews = [];
  try {
    const address = { name: "Connection Check", addressLine1: "400 Broad St", city: "Seattle", stateOrRegion: "WA", postalCode: "98109" };
    for (const sku of skus) {
      const preview = await getFulfillmentPreview(env, { address, items: [{ sku: config.skuMap[sku], qty: 1 }], tier: "STANDARD" });
      result.previews.push({ sku, tier: "STANDARD", fulfillable: preview.fulfillable, feeCents: preview.offer?.feeCents ?? null, deliveryStart: preview.offer?.deliveryStart ?? null, deliveryEnd: preview.offer?.deliveryEnd ?? null });
    }
    result.preview = result.previews[0]; // retain the previous API field for existing clients
    result.ok = true;
  } catch (error) {
    return { ...result, step: "preview", error: clip(error?.message, 200), kind: error?.kind ?? "unexpected" };
  }
  return result;
}
