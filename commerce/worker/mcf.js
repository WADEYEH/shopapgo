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

import {
  McfError,
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
} from "./amazon-mcf.js";
import { FulfillmentError, markShipped, recordAudit, validateShipment } from "./fulfillment.js";
import { sendCustomerEmail } from "./customer-email.js";
import { getOrder } from "./orders.js";

const now = () => new Date().toISOString();
const STALE_SUBMITTING_MS = 5 * 60_000;
const RETRYABLE = ["failed", "rejected"];
const SYNC_BATCH = 25;
const TERMINAL_BAD = ["CANCELLED", "UNFULFILLABLE", "INVALID"];
const clip = (value, max) => String(value ?? "").slice(0, max);

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
  };
}

const isStaleSubmitting = (row) => row.status === "submitting" && Date.now() - Date.parse(row.updated_at) > STALE_SUBMITTING_MS;

// What the back office shows and which buttons it may offer. `order` is a D1 row; `fulfillment` its shipment (or null).
export async function mcfView(env, order, fulfillment) {
  // A database that has not run the latest schema.sql yet simply reads as "never sent" instead of breaking the page.
  let row = null;
  try {
    row = await getMcfRecord(env.DB, order.id);
  } catch (error) {
    console.error("mcf_record_unreadable", { orderId: order.id, reason: error?.message });
  }
  const readiness = mcfReadiness(env, order);
  const eligible = order.status === "paid" && !fulfillment;
  const retryable = !row || RETRYABLE.includes(row.status) || isStaleSubmitting(row);
  return {
    mode: readiness.mode, // off | not_configured | ready
    reason: readiness.reason,
    canSubmit: readiness.ok && eligible && retryable,
    canSync: Boolean(row) && ["submitted", "submitting"].includes(row.status) && readiness.config.connectionOk,
    record: publicRecord(row),
  };
}

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
       VALUES (?, ?, 'submitting', 1, ?, ?, ?)`,
    )
    .bind(orderId, orderId, tier, timestamp, timestamp)
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
         error_kind = '', error_message = '', note = '', updated_at = ?
       WHERE order_id = ? AND status = ? AND updated_at = ?`,
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
export async function submitOrderToMcf(env, order, { actor = "mcf-auto" } = {}) {
  const orderId = order.id;
  try {
    const readiness = mcfReadiness(env, order);
    if (!readiness.ok) {
      console.log("mcf_skipped", { orderId, mode: readiness.mode, reason: readiness.reason });
      return { outcome: "skipped", mode: readiness.mode, reason: readiness.reason };
    }
    const fresh = (await getOrder(env.DB, orderId)) ?? order;
    if (fresh.status !== "paid") return { outcome: "skipped", mode: "ready", reason: "Only paid orders are sent to MCF." };
    const shipped = await env.DB.prepare("SELECT 1 AS x FROM order_fulfillments WHERE order_id = ?").bind(orderId).first();
    if (shipped) return { outcome: "skipped", mode: "ready", reason: "The order is already marked shipped." };

    const input = buildMcfInput(fresh, readiness.config);
    const claimed = await claim(env.DB, orderId, input.tier);
    if (!claimed.claimed) return { outcome: "duplicate", record: publicRecord(claimed.row ?? (await getMcfRecord(env.DB, orderId))) };
    const { sellerOrderId, attempts } = claimed;

    // A retry first asks Amazon whether an earlier attempt with this same id actually landed (e.g. a timeout).
    if (claimed.row) {
      const existing = await getFulfillmentOrder(env, sellerOrderId).catch(() => undefined);
      if (existing) return adopt(env, orderId, sellerOrderId, existing, actor, attempts);
    }

    try {
      const created = await createFulfillmentOrder(env, { orderId: sellerOrderId, address: input.address, items: input.items, tier: input.tier, displayableOrderDate: input.displayableOrderDate, notificationEmails: input.notificationEmails });
      // The endpoint never re-creates a known id: Amazon already had this order (an earlier request landed).
      if (created.alreadyExists) {
        const existing = created.existing ?? (await getFulfillmentOrder(env, sellerOrderId).catch(() => null));
        if (existing) return adopt(env, orderId, sellerOrderId, existing, actor, attempts);
      }
      await saveState(env.DB, orderId, { status: "submitted", mcfStatus: created.status, submittedAt: now(), errorKind: "", errorMessage: "", note: "" });
      await audit(env.DB, orderId, "mcf.submitted", actor, { sellerOrderId, tier: input.tier, attempts, items: input.items });
      console.log("mcf_submitted", { orderId, sellerOrderId, tier: input.tier });
      return { outcome: "submitted", record: publicRecord(await getMcfRecord(env.DB, orderId)) };
    } catch (error) {
      // Timeout / network / 5xx: the order may exist at Amazon. Reconcile by id before calling it a failure.
      if (error instanceof McfError && error.ambiguous) {
        const existing = await getFulfillmentOrder(env, sellerOrderId).catch(() => undefined);
        if (existing) return adopt(env, orderId, sellerOrderId, existing, actor, attempts);
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

// Amazon already has this order id (our earlier request landed): record it and apply its current status.
async function adopt(env, orderId, sellerOrderId, amazonOrder, actor, attempts) {
  await saveState(env.DB, orderId, { status: "submitted", mcfStatus: amazonOrder.status, submittedAt: now(), errorKind: "", errorMessage: "", note: "Found at Amazon after an unconfirmed attempt." });
  await audit(env.DB, orderId, "mcf.submitted", actor, { sellerOrderId, recovered: true, attempts });
  const synced = await applyAmazonOrder(env, orderId, amazonOrder, actor);
  if (!synced.shipped && !TERMINAL_BAD.includes(amazonOrder.status)) {
    const current = await getMcfRecord(env.DB, orderId);
    if (current && current.status === "submitted" && !current.note) await saveState(env.DB, orderId, { note: "Found at Amazon after an unconfirmed attempt." });
  }
  return { outcome: "submitted", record: publicRecord(await getMcfRecord(env.DB, orderId)), ...synced };
}

// ---------- sync ----------

// COMPLETE but the order lists no tracking number on its packages: ask the tracking endpoint per package (read-only).
async function shipmentFromPackageTracking(env, amazonOrder) {
  const packages = amazonOrder.shipments.flatMap((s) => s.packages).filter((p) => !p.trackingNumber && /^\d+$/.test(p.packageId));
  if (!packages.length) return null;
  const filled = { ...amazonOrder, shipments: [{ status: "", shipTime: null, packages: [] }] };
  for (const pkg of packages.slice(0, 5)) {
    const tracking = await getPackageTracking(env, pkg.packageId).catch(() => null);
    if (tracking?.trackingNumber) filled.shipments[0].packages.push({ ...pkg, carrierCode: tracking.carrierCode || pkg.carrierCode, trackingNumber: tracking.trackingNumber, trackingUrl: tracking.trackingUrl });
  }
  return shipmentFromMcfOrder(filled);
}

// Applies Amazon's order state to our row and, when Amazon reports shipped with tracking, to the order's fulfilment.
async function applyAmazonOrder(env, orderId, amazonOrder, actor) {
  const timestamp = now();
  const base = { mcfStatus: amazonOrder.status, lastSyncedAt: timestamp };

  if (TERMINAL_BAD.includes(amazonOrder.status)) {
    await saveState(env.DB, orderId, { ...base, status: "rejected", errorKind: "amazon", errorMessage: `Amazon closed the MCF order as ${amazonOrder.status}.`, note: "" });
    await audit(env.DB, orderId, "mcf.closed", actor, { mcfStatus: amazonOrder.status });
    return { changed: true, shipped: false, email: null };
  }

  let shipment = shipmentFromMcfOrder(amazonOrder);
  if (!shipment && SHIPPED_STATUSES.includes(amazonOrder.status)) shipment = await shipmentFromPackageTracking(env, amazonOrder);
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
    await saveState(env.DB, orderId, { ...base, status: "shipped", carrier: checked.carrier, trackingNumber: checked.trackingNumber, errorKind: "", errorMessage: "", note: "" });
    await audit(env.DB, orderId, "mcf.shipped", actor, { carrier: checked.carrier, trackingNumber: checked.trackingNumber });
    // The shipment row is saved; the email is claimed once per order (order_emails), so nothing can send it twice.
    const email = await sendCustomerEmail(env, (await getOrder(env.DB, orderId)) ?? order, "shipment", { shipment: checked });
    return { changed: true, shipped: true, email: email.status };
  } catch (error) {
    if (error instanceof FulfillmentError && error.code === "already_shipped") {
      // Shipped by hand (or by a parallel sync) first: no second record, no second email.
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

// Asks Amazon to stop an MCF order (only possible before picking). Used by tests / future UI; the row becomes "rejected".
export async function cancelMcfOrder(env, orderId, { actor = "admin" } = {}) {
  const row = await getMcfRecord(env.DB, orderId);
  if (!row || !["submitted", "submitting"].includes(row.status)) return { outcome: "skipped" };
  try {
    await cancelFulfillmentOrder(env, row.seller_order_id);
    await saveState(env.DB, orderId, { note: "Cancellation requested; sync to confirm." });
    await audit(env.DB, orderId, "mcf.cancel_requested", actor, { sellerOrderId: row.seller_order_id });
    return { outcome: "requested" };
  } catch (error) {
    return { outcome: "failed", reason: clip(error?.message, 200) };
  }
}

// Read-only connection check for admins (GET /admin/api/mcf/check): lists orders and previews one unit of a mapped SKU to a
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
  const sku = Object.keys(config.skuMap)[0];
  if (!sku) return { ...result, step: "preview", error: "MCF_SKU_MAP_JSON is empty" };
  try {
    const address = { name: "Connection Check", addressLine1: "400 Broad St", city: "Seattle", stateOrRegion: "WA", postalCode: "98109" };
    const preview = await getFulfillmentPreview(env, { address, items: [{ sku: config.skuMap[sku], qty: 1 }], tier: "STANDARD" });
    result.preview = { sku, tier: "STANDARD", fulfillable: preview.fulfillable, feeCents: preview.offer?.feeCents ?? null, deliveryStart: preview.offer?.deliveryStart ?? null, deliveryEnd: preview.offer?.deliveryEnd ?? null };
    result.ok = true;
  } catch (error) {
    return { ...result, step: "preview", error: clip(error?.message, 200), kind: error?.kind ?? "unexpected" };
  }
  return result;
}
