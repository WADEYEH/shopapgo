// Privacy requests (E11, M9-14, M11-05; decided 10/12, D53–D54): a customer asks to see or delete their data. Any member
// can record the request, export the data and delete it; every step is in the activity log (admin_audit), which keeps the
// order number, never the email.
//
//   * A request has a handler and a date to answer by (45 days after it arrived). Open ones are on the dashboard and in
//     the daily team email until someone closes them (privacyReminders).
//   * Export: everything the store keeps about the customer, as one JSON file.
//   * Delete (D53): the amounts stay (tax and bookkeeping): order totals, items, the state shipped to, payments, refunds.
//     The rest is removed or replaced: email, name, address, phone, marketing choice, ad data, email copies, address
//     history, notes, Contact us messages. Not while an order is still open (not shipped and not cancelled), a refund is
//     on its way, a dispute is open, or an email is still being sent. Amazon and the payment providers keep their own
//     copies; that is said on the page and in the runbook.
import { IS_ORDER } from "./orders.js";
import { customerKey, customerOfOrder, getCustomer, listCustomerNotes } from "./customers.js";
import { CustomerError } from "./customers.js";
import { recordAdminAudit } from "./activity.js";
import { activeMember } from "./members.js";

export const PRIVACY_KINDS = ["access", "delete"];
export const PRIVACY_OUTCOMES = ["exported", "deleted", "other"];
export const ANSWER_DAYS = 45;
const DAY_MS = 24 * 60 * 60_000;
const NOTE_MAX = 300;
const REMOVED = "[Removed for a privacy request]";
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const clip = (value, max) => String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);

async function hashOf(key) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`apgo-privacy:${key}`));
  return [...new Uint8Array(digest)].slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const logActivity = (db, { actor, action, target, detail = {} }) => recordAdminAudit(db, { actor, action, target, detail });

const requestView = (row) => ({
  id: row.id, kind: row.kind, receivedAt: row.received_at, dueAt: row.due_at, handler: row.handler, status: row.status,
  outcome: row.outcome || null, note: row.note || null, createdBy: row.created_by, createdAt: row.created_at,
  closedBy: row.closed_by ?? null, closedAt: row.closed_at ?? null,
});

export async function privacyRequestsFor(db, key) {
  const { results } = await db.prepare("SELECT * FROM privacy_requests WHERE customer = ? ORDER BY created_at DESC").bind(key).all();
  return results.map(requestView);
}

// Why this customer's data cannot be deleted yet: [{ orderId, code }].
export async function erasureBlockers(db, key) {
  const { results } = await db
    .prepare(
      `SELECT o.id,
         (o.status IN ('paid', 'review') AND NOT EXISTS (SELECT 1 FROM order_fulfillments f WHERE f.order_id = o.id)) AS open_order,
         EXISTS (SELECT 1 FROM order_disputes d WHERE d.order_id = o.id AND d.status = 'open') AS dispute,
         (EXISTS (SELECT 1 FROM order_refunds r WHERE r.order_id = o.id AND r.status = 'RECEIVED')
           OR EXISTS (SELECT 1 FROM admin_refunds a WHERE a.order_id = o.id AND a.status = 'requesting')
           OR EXISTS (SELECT 1 FROM order_refund_requests q WHERE q.order_id = o.id AND q.status = 'requesting')) AS refund,
         (EXISTS (SELECT 1 FROM order_email_delivery e WHERE e.order_id = o.id AND e.status IN ('queued', 'retry', 'sending'))
           OR EXISTS (SELECT 1 FROM order_email_jobs j WHERE j.order_id = o.id AND j.status = 'pending')
           OR EXISTS (SELECT 1 FROM order_message_jobs j WHERE j.order_id = o.id AND j.status = 'pending')
           OR EXISTS (SELECT 1 FROM order_notice_jobs j WHERE j.order_id = o.id AND j.status = 'pending')) AS email
       FROM orders o WHERE ${IS_ORDER} AND lower(trim(o.email)) = ?`,
    )
    .bind(key)
    .all();
  const blockers = [];
  for (const row of results) {
    if (row.open_order) blockers.push({ orderId: row.id, code: "open_order" });
    if (row.dispute) blockers.push({ orderId: row.id, code: "dispute" });
    if (row.refund) blockers.push({ orderId: row.id, code: "refund" });
    if (row.email) blockers.push({ orderId: row.id, code: "email" });
  }
  return blockers;
}

// The privacy part of the customer page.
export async function privacyView(env, key) {
  return { privacyRequests: await privacyRequestsFor(env.DB, key), erasure: { blockers: await erasureBlockers(env.DB, key) } };
}

// POST /admin/api/customers/:ref/privacy-requests { kind, receivedAt (YYYY-MM-DD), handler, note }
export async function recordPrivacyRequest(env, actor, ref, body, { nowMs = Date.now() } = {}) {
  const db = env.DB;
  const found = await customerOfOrder(db, ref);
  if (!found) throw new CustomerError(404, "not_found", "Customer not found.");
  if (found.erased) throw new CustomerError(409, "erased", "This customer's data was already deleted.");
  const kind = String(body?.kind ?? "");
  if (!PRIVACY_KINDS.includes(kind)) throw new CustomerError(400, "invalid_kind", "Choose what the customer asked for.");
  const received = String(body?.receivedAt ?? "").match(/^\d{4}-\d{2}-\d{2}$/) ? Date.parse(`${body.receivedAt}T00:00:00Z`) : nowMs;
  if (!Number.isFinite(received) || received > nowMs + DAY_MS || received < nowMs - 365 * DAY_MS) throw new CustomerError(400, "invalid_date", "Enter the day the request arrived.");
  const handler = clip(body?.handler, 254) || actor.email || actor.id;
  if (handler !== (actor.email || actor.id) && !(await activeMember(db, handler))) throw new CustomerError(400, "invalid_handler", "Choose a member to handle it.");
  const id = `PR-${crypto.randomUUID()}`;
  const at = iso(nowMs);
  await db
    .prepare(
      `INSERT INTO privacy_requests (id, customer, kind, received_at, due_at, handler, status, note, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
    )
    .bind(id, found.key, kind, iso(received), iso(received + ANSWER_DAYS * DAY_MS), handler, clip(body?.note, NOTE_MAX), actor.email ?? actor.id, at)
    .run();
  await logActivity(db, { actor, action: "privacy.request_recorded", target: ref, detail: { id, kind, handler } });
  return privacyRequestsFor(db, found.key);
}

// POST /admin/api/privacy-requests/:id/close { outcome, note }
export async function closePrivacyRequest(env, actor, id, body, { nowMs = Date.now() } = {}) {
  const db = env.DB;
  const outcome = String(body?.outcome ?? "");
  if (!PRIVACY_OUTCOMES.includes(outcome)) throw new CustomerError(400, "invalid_outcome", "Choose how it was answered.");
  const row = await db.prepare("SELECT * FROM privacy_requests WHERE id = ?").bind(String(id)).first();
  if (!row) throw new CustomerError(404, "not_found", "Request not found.");
  if (row.status === "done") return requestView(row);
  const note = clip(body?.note, NOTE_MAX);
  await db
    .prepare("UPDATE privacy_requests SET status = 'done', outcome = ?, note = CASE WHEN ? != '' THEN ? ELSE note END, closed_by = ?, closed_at = ? WHERE id = ? AND status = 'open'")
    .bind(outcome, note, note, actor.email ?? actor.id, iso(nowMs), row.id)
    .run();
  await logActivity(db, { actor, action: "privacy.request_closed", target: row.id, detail: { outcome } });
  return requestView(await db.prepare("SELECT * FROM privacy_requests WHERE id = ?").bind(row.id).first());
}

// Open requests for the dashboard and the daily team email: overdue first, then the closest deadline.
export async function privacyReminders(db, { nowMs = Date.now(), withinDays = 7 } = {}) {
  try {
    // ref: one of the customer's order numbers, to open the customer page.
    const { results } = await db.prepare(`SELECT p.*, (SELECT o.id FROM orders o WHERE lower(trim(o.email)) = p.customer AND o.paid_at IS NOT NULL
      ORDER BY o.paid_at DESC LIMIT 1) AS ref FROM privacy_requests p WHERE p.status = 'open' ORDER BY p.due_at`).all();
    return results.map((row) => ({
      id: row.id, kind: row.kind, dueAt: row.due_at, handler: row.handler, ref: row.ref ?? null,
      daysLeft: Math.ceil((Date.parse(row.due_at) - nowMs) / DAY_MS),
      erased: row.customer.startsWith("deleted:"),
    })).map((item) => ({ ...item, urgent: item.daysLeft <= withinDays }));
  } catch {
    return []; // a database without privacy_requests (before migration 0011)
  }
}

// GET /admin/api/customers/:ref/export: everything kept about this customer.
export async function exportCustomer(env, actor, ref) {
  const db = env.DB;
  const found = await customerOfOrder(db, ref);
  if (!found) throw new CustomerError(404, "not_found", "Customer not found.");
  if (found.erased) throw new CustomerError(409, "erased", "This customer's data was deleted.");
  const key = found.key;
  const customer = await getCustomer(env, ref);
  const { results: orders } = await db.prepare(`SELECT * FROM orders o WHERE ${IS_ORDER} AND lower(trim(o.email)) = ? ORDER BY paid_at`).bind(key).all();
  const ids = orders.map((order) => order.id);
  const each = async (sql) => (ids.length ? (await db.prepare(sql.replace("?", ids.map(() => "?").join(", "))).bind(...ids).all()).results : []);
  const refunds = await each("SELECT order_id, id, provider, amount_cents, currency, status, provider_created_at FROM order_refunds WHERE order_id IN (?)");
  const shipments = await each("SELECT order_id, carrier, tracking_number, tracking_url, shipped_at FROM order_fulfillments WHERE order_id IN (?)");
  const emails = await each("SELECT order_id, kind, status, updated_at FROM order_emails WHERE order_id IN (?)");
  const attribution = await each("SELECT order_id, fbp, fbc, fbclid, source_url, client_ip, client_user_agent, created_at FROM order_attribution WHERE order_id IN (?)");
  const cancellations = await each("SELECT order_id, reason_code, note, created_at FROM order_cancellations WHERE order_id IN (?)");
  const orderNotes = await each("SELECT order_id, author, body, created_at FROM order_notes WHERE order_id IN (?)");
  const { results: messages } = await db.prepare("SELECT created_at, name, email, message FROM contact_messages WHERE lower(trim(email)) = ? ORDER BY created_at").bind(key).all();
  const byOrder = (list, id) => list.filter((row) => row.order_id === id).map(({ order_id, ...rest }) => rest);
  await logActivity(db, { actor, action: "customer.exported", target: ref, detail: { orders: ids.length } });
  return {
    exportedAt: iso(),
    store: "APGO (www.shopapgo.com)",
    customer: { email: customer.email, name: customer.name, phone: customer.phone, marketingOptIn: customer.marketingOptIn, addresses: customer.addresses },
    orders: orders.map((order) => ({
      id: order.id, status: order.status, createdAt: order.created_at, paidAt: order.paid_at, email: order.email,
      marketingOptIn: order.marketing_opt_in === 1, shipping: JSON.parse(order.shipping_json || "{}"), shippingMethod: order.shipping_method,
      items: JSON.parse(order.lines_json || "[]"), currency: order.currency, subtotalCents: order.subtotal_cents, shippingCents: order.shipping_cents,
      taxCents: order.tax_cents, totalCents: order.total_cents, paymentReference: order.payment_intent_id,
      refunds: byOrder(refunds, order.id), shipments: byOrder(shipments, order.id), emailsSent: byOrder(emails, order.id),
      adData: byOrder(attribution, order.id), cancellation: byOrder(cancellations, order.id)[0] ?? null, internalNotes: byOrder(orderNotes, order.id),
    })),
    contactMessages: messages,
    customerNotes: await listCustomerNotes(db, key),
    privacyRequests: await privacyRequestsFor(db, key),
    elsewhere: "Amazon (shipping) and Airwallex or PayPal (payment) keep their own records of these orders.",
  };
}

// POST /admin/api/customers/:ref/erase { confirm: the customer's email }
export async function eraseCustomer(env, actor, ref, body, { nowMs = Date.now() } = {}) {
  const db = env.DB;
  const found = await customerOfOrder(db, ref);
  if (!found) throw new CustomerError(404, "not_found", "Customer not found.");
  if (found.erased) return { erased: true, already: true };
  const key = found.key;
  if (customerKey(body?.confirm) !== key) throw new CustomerError(400, "confirm_mismatch", "Type the customer's email exactly to confirm.");
  const blockers = await erasureBlockers(db, key);
  if (blockers.length) throw Object.assign(new CustomerError(409, "not_yet", "This customer's data cannot be deleted yet."), { blockers });
  const { results } = await db.prepare(`SELECT id FROM orders o WHERE ${IS_ORDER} AND lower(trim(o.email)) = ?`).bind(key).all();
  const ids = results.map((row) => row.id);
  const marker = `deleted:${await hashOf(key)}`;
  const at = iso(nowMs);
  const inIds = ids.map(() => "?").join(", ");
  const forOrders = (sql, ...before) => db.prepare(sql.replace("(?)", `(${inIds})`)).bind(...before, ...ids);
  await db.batch([
    // The order keeps its amounts, items and the state (sales tax); the person is gone.
    forOrders(`UPDATE orders SET email = '', marketing_opt_in = 0,
      shipping_json = json_object('state', json_extract(shipping_json, '$.state'), 'erased', 1), updated_at = ? WHERE id IN (?)`, at),
    forOrders("DELETE FROM order_attribution WHERE order_id IN (?)"),
    forOrders("UPDATE order_email_delivery SET payload_json = '{}' WHERE order_id IN (?)"),
    forOrders("UPDATE order_notice_jobs SET payload_json = '{}' WHERE order_id IN (?)"),
    forOrders("UPDATE order_audit SET detail_json = json_remove(detail_json, '$.before', '$.after', '$.note', '$.shipping', '$.email') WHERE order_id IN (?)"),
    forOrders("UPDATE order_cancellations SET note = '' WHERE order_id IN (?)"),
    forOrders("UPDATE order_notes SET body = ? WHERE order_id IN (?)", REMOVED),
    forOrders("UPDATE admin_refunds SET note = '' WHERE order_id IN (?)"),
    forOrders("UPDATE staging_fake_mcf_orders SET request_json = '{}' WHERE seller_order_id IN (SELECT seller_order_id FROM order_mcf WHERE order_id IN (?))"),
    db.prepare("UPDATE contact_messages SET name = '', email = '', message = ? WHERE lower(trim(email)) = ?").bind(REMOVED, key),
    db.prepare("DELETE FROM customer_notes WHERE customer = ?").bind(key),
    db.prepare("DELETE FROM customer_email_suppressions WHERE lower(trim(email)) = ?").bind(key),
    // Unpaid checkouts with the same email: removed the way old checkouts are (worker/checkout-jobs.js purgeCheckouts).
    db.prepare(`UPDATE orders SET email = '', marketing_opt_in = 0,
      shipping_json = json_object('state', json_extract(shipping_json, '$.state'), 'purged', 1), purged_at = ?, updated_at = ?
      WHERE lower(trim(email)) = ? AND paid_at IS NULL`).bind(at, at, key),
    db.prepare("UPDATE privacy_requests SET customer = ? WHERE customer = ?").bind(marker, key),
    db.prepare(`UPDATE privacy_requests SET status = 'done', outcome = 'deleted', closed_by = ?, closed_at = ?
      WHERE customer = ? AND status = 'open' AND kind = 'delete'`).bind(actor.email ?? actor.id, at, marker),
  ]);
  await logActivity(db, { actor, action: "customer.erased", target: ref, detail: { orders: ids.length, customer: marker } });
  return { erased: true, orders: ids.length };
}
