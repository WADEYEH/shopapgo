// Packages (F6, F9; M6-05, M8-05): every package Amazon shipped for an order, with its tracking number, and what
// happened to it on the way.
//
//   * worker/mcf.js saves the packages when Amazon reports the order shipped, before the shipment email goes out, so the
//     email lists them all.
//   * Cron job "tracking": once a day per package, until it is delivered or 30 days after shipping, Amazon's tracking
//     (read-only) gives its status and last events. Returned to the sender (or undeliverable): the team is told once,
//     the order's timeline shows it, and the dashboard lists it until 14 days later (F9: after-sales decides what next).
//   * The events (status, time, city, state) are kept for dispute evidence (worker/evidence.js).
import { getPackageTracking, mcfReadiness } from "./amazon-mcf.js";
import { recordAudit } from "./fulfillment.js";
export { listPackages } from "./fulfillment.js";
import { alertTeam } from "./team-alerts.js";
import { adminHost } from "./hosts.js";

export const RETURN_STATUSES = ["RETURNING", "RETURNED", "UNDELIVERABLE", "RETURN_RECEIVED_IN_FC"];
const FINAL = ["DELIVERED", ...RETURN_STATUSES.filter((status) => status !== "RETURNING")];
const DAY_MS = 24 * 60 * 60_000;
const WATCH_DAYS = 30;
const BATCH = 10;
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const clip = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
const adminUrlOf = (env) => `${adminHost(env) ? `https://${adminHost(env)}` : "https://www.shopapgo.com"}/admin/`;

// packages: [{ packageId, carrier, trackingNumber, trackingUrl }]. Kept once per tracking number.
export async function savePackages(db, orderId, packages, { nowMs = Date.now() } = {}) {
  const at = iso(nowMs);
  for (const pkg of packages ?? []) {
    if (!pkg?.trackingNumber) continue;
    await db
      .prepare(
        `INSERT OR IGNORE INTO order_packages (order_id, tracking_number, package_id, carrier, tracking_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(orderId, clip(pkg.trackingNumber, 80), clip(pkg.packageId, 20), clip(pkg.carrier, 60), clip(pkg.trackingUrl, 500), at)
      .run();
  }
}

// One package's latest tracking: status, events; delivered or returned the first time it is seen.
async function checkPackage(env, row, nowMs) {
  const db = env.DB;
  const at = iso(nowMs);
  const tracking = await getPackageTracking(env, row.package_id);
  if (!tracking) {
    await db.prepare("UPDATE order_packages SET checked_at = ? WHERE order_id = ? AND tracking_number = ?").bind(at, row.order_id, row.tracking_number).run();
    return "no_data";
  }
  const status = tracking.status || row.status;
  const changed = status !== row.status;
  await db
    .prepare(
      `UPDATE order_packages SET status = ?, status_at = CASE WHEN ? THEN ? ELSE status_at END, events_json = ?, checked_at = ?,
         delivered_at = CASE WHEN ? = 'DELIVERED' AND delivered_at IS NULL THEN ? ELSE delivered_at END
       WHERE order_id = ? AND tracking_number = ?`,
    )
    .bind(status, changed ? 1 : 0, at, JSON.stringify(tracking.events ?? []), at, status, at, row.order_id, row.tracking_number)
    .run();
  if (!RETURN_STATUSES.includes(status)) return changed ? "updated" : "same";
  const first = await db
    .prepare("UPDATE order_packages SET returned_at = ? WHERE order_id = ? AND tracking_number = ? AND returned_at IS NULL")
    .bind(at, row.order_id, row.tracking_number)
    .run();
  if (!(first.meta?.changes > 0)) return "same";
  await recordAudit(db, { orderId: row.order_id, action: "mcf.package_returned", actor: "mcf", detail: { trackingNumber: row.tracking_number, carrier: row.carrier, status } });
  await alertTeam(env, {
    key: `package-returned:${row.order_id}:${row.tracking_number}`, kind: "package_returned", orderId: row.order_id, adminUrl: adminUrlOf(env),
    subject: `Order ${row.order_id}: a package is going back to the sender (${status})`,
    lines: [
      `${row.carrier || "The carrier"} reports package ${row.tracking_number} of order ${row.order_id} as ${status}.`,
      "The customer will not get it. Contact the customer, then decide: ship again once it is back at Amazon, or refund.",
    ],
  });
  return "returned";
}

// Cron job "tracking". Never throws for one package.
export async function scheduledPackageTracking(env, { nowMs = Date.now() } = {}) {
  if (String(env.MCF_SYNC_CRON ?? "").trim().toLowerCase() !== "true") return { ran: false };
  let readiness;
  try {
    readiness = mcfReadiness(env);
  } catch {
    return { ran: false };
  }
  if (!readiness.config?.connectionOk) return { ran: false };
  const db = env.DB;
  const { results } = await db
    .prepare(
      `SELECT * FROM order_packages
       WHERE package_id != '' AND status NOT IN (${FINAL.map(() => "?").join(", ")})
         AND created_at >= ? AND (checked_at IS NULL OR checked_at <= ?)
       ORDER BY checked_at IS NOT NULL, checked_at LIMIT ?`,
    )
    .bind(...FINAL, iso(nowMs - WATCH_DAYS * DAY_MS), iso(nowMs - DAY_MS), BATCH)
    .all();
  const summary = { ran: true, checked: 0, returned: 0, failed: 0 };
  for (const row of results) {
    try {
      const outcome = await checkPackage(env, row, nowMs);
      summary.checked += 1;
      if (outcome === "returned") summary.returned += 1;
    } catch (error) {
      summary.failed += 1;
      console.error("package_tracking_failed", { orderId: row.order_id, reason: error?.message });
    }
  }
  return summary;
}

// Packages going back to the sender in the last 14 days, for the dashboard and the daily team email.
export async function returnedPackages(db, { nowMs = Date.now() } = {}) {
  try {
    const { results } = await db
      .prepare("SELECT order_id, tracking_number, carrier, status, returned_at FROM order_packages WHERE returned_at IS NOT NULL AND returned_at >= ? ORDER BY returned_at")
      .bind(iso(nowMs - 14 * DAY_MS))
      .all();
    return results;
  } catch {
    return [];
  }
}
