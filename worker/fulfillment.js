// Fulfilment (shipping) writes for the back office. Payment status lives in
// orders.status; fulfilment lives in order_fulfillments (no row = "unfulfilled"), so
// the two never get mixed and existing databases need no ALTER (see worker/schema.sql).

const now = () => new Date().toISOString();

export class FulfillmentError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

// Validates the admin-supplied shipment fields. Throws FulfillmentError(400).
export function validateShipment(body) {
  const field = (value, max) => String(value ?? "").trim().slice(0, max + 1);
  const carrier = field(body?.carrier, 60);
  const trackingNumber = field(body?.trackingNumber, 80);
  const trackingUrl = field(body?.trackingUrl, 500);
  if (!carrier || carrier.length > 60 || CONTROL.test(carrier)) {
    throw new FulfillmentError(400, "invalid_carrier", "Enter the carrier (up to 60 characters).");
  }
  if (!trackingNumber || trackingNumber.length > 80 || CONTROL.test(trackingNumber)) {
    throw new FulfillmentError(400, "invalid_tracking_number", "Enter the tracking number (up to 80 characters).");
  }
  let url = null;
  if (trackingUrl) {
    try {
      const parsed = new URL(trackingUrl);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || trackingUrl.length > 500 || CONTROL.test(trackingUrl)) throw new Error("bad");
      url = parsed.toString();
    } catch {
      throw new FulfillmentError(400, "invalid_tracking_url", "The tracking link must be a valid https:// URL.");
    }
  }
  return { carrier, trackingNumber, trackingUrl: url };
}

export async function getFulfillment(db, orderId) {
  const row = await db.prepare("SELECT * FROM order_fulfillments WHERE order_id = ?").bind(orderId).first();
  if (!row) return null;
  return {
    status: row.fulfillment_status,
    carrier: row.carrier,
    trackingNumber: row.tracking_number,
    trackingUrl: row.tracking_url,
    shippedAt: row.shipped_at,
    shippedBy: row.shipped_by,
  };
}

export async function listAudit(db, orderId) {
  const { results } = await db
    .prepare("SELECT action, actor, detail_json, created_at FROM order_audit WHERE order_id = ? ORDER BY id")
    .bind(orderId)
    .all();
  return results.map((row) => ({ action: row.action, actor: row.actor, detail: JSON.parse(row.detail_json), at: row.created_at }));
}

export async function recordAudit(db, { orderId, action, actor, detail = {} }) {
  await db
    .prepare("INSERT INTO order_audit (order_id, action, actor, detail_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(orderId, action, actor, JSON.stringify(detail), now())
    .run();
}

// Marks a PAID order shipped. The INSERT is conditional on status = 'paid' and the
// order_id primary key rejects a second shipment, so both rules hold even when two
// admins click at once. Returns the order row; throws FulfillmentError otherwise.
export async function markShipped(db, orderId, shipment, { actor = "admin" } = {}) {
  const order = await db.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();
  if (!order) throw new FulfillmentError(404, "not_found", "Order not found.");
  if (order.status !== "paid") {
    throw new FulfillmentError(409, "not_paid", "Only paid orders can be marked shipped.");
  }
  const timestamp = now();
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO order_fulfillments
         (order_id, fulfillment_status, carrier, tracking_number, tracking_url, shipped_at, shipped_by, created_at, updated_at)
       SELECT id, 'shipped', ?, ?, ?, ?, ?, ?, ? FROM orders WHERE id = ? AND status = 'paid'`,
    )
    .bind(shipment.carrier, shipment.trackingNumber, shipment.trackingUrl, timestamp, actor, timestamp, timestamp, orderId)
    .run();
  if (!(result?.meta?.changes > 0)) {
    throw new FulfillmentError(409, "already_shipped", "This order is already marked shipped.");
  }
  try {
    await recordAudit(db, {
      orderId,
      action: "order.shipped",
      actor,
      detail: { carrier: shipment.carrier, trackingNumber: shipment.trackingNumber, trackingUrl: shipment.trackingUrl },
    });
  } catch (error) {
    // The shipment itself is saved (and its row carries shipped_by/shipped_at); say so in the log.
    console.error("order_audit_failed", { orderId, reason: error?.message });
  }
  return order;
}
