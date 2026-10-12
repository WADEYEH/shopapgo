// Customers (I7, M9-13, D34): there are no accounts, so a customer is everyone who paid with the same email (lowercased).
// The list shows name, email, phone, orders, money spent (paid minus refunded), last order and the latest marketing
// choice; the customer page adds every order, the addresses used, Contact us messages from the same email, internal
// notes (any member, never edited; D50) and privacy requests (worker/customer-privacy.js).
//
// A customer is opened by one of their order numbers (#/customers/APGO-US-…), so no email ever travels in a URL.
// After a privacy deletion (D53) the orders keep their amounts and nothing else: the page says so.
import { IS_ORDER, listOrders } from "./orders.js";
import { coolingOffMinutes } from "./order-core.js";
import { ORDER_ID_PATTERN } from "./checkout.js";

export const NOTE_MAX = 1000;
const PAGE = 50;
export const CUSTOMER_SORTS = ["last", "orders", "spent", "name"];
const SORT_SQL = {
  last: "last_at DESC, customer",
  orders: "orders DESC, last_at DESC",
  spent: "(paid_cents - refunded_cents) DESC, last_at DESC",
  name: "lower(json_extract(l.shipping_json, '$.firstName') || ' ' || json_extract(l.shipping_json, '$.lastName')), customer",
};

export class CustomerError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Line breaks are kept; other control characters are dropped.
const clean = (value) => String(value ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ").trim();
export const customerKey = (email) => String(email ?? "").trim().toLowerCase();

// Every paid order with its customer key and what was refunded of it (accepted or settled).
const PAID = `SELECT o.*, lower(trim(o.email)) AS customer,
    COALESCE((SELECT SUM(r.amount_cents) FROM order_refunds r WHERE r.order_id = o.id AND r.status IN ('ACCEPTED', 'SETTLED')), 0) AS refunded
  FROM orders o WHERE ${IS_ORDER} AND o.paid_at IS NOT NULL AND o.email != ''`;
const CUSTOMERS = `WITH paid AS (${PAID}),
  latest AS (SELECT customer, id, email, shipping_json, marketing_opt_in,
    ROW_NUMBER() OVER (PARTITION BY customer ORDER BY paid_at DESC, id DESC) AS rn FROM paid),
  totals AS (SELECT customer, COUNT(*) AS orders, SUM(total_cents) AS paid_cents, SUM(refunded) AS refunded_cents,
    MIN(paid_at) AS first_at, MAX(paid_at) AS last_at FROM paid GROUP BY customer)
  SELECT t.*, l.id AS ref, l.email, l.shipping_json, l.marketing_opt_in FROM totals t JOIN latest l ON l.customer = t.customer AND l.rn = 1`;

function summary(row) {
  const shipping = JSON.parse(row.shipping_json || "{}");
  return {
    ref: row.ref,
    email: row.email,
    name: `${shipping.firstName ?? ""} ${shipping.lastName ?? ""}`.trim(),
    phone: shipping.phone ?? "",
    city: shipping.city ?? "",
    state: shipping.state ?? "",
    orders: row.orders,
    paidCents: row.paid_cents,
    refundedCents: row.refunded_cents,
    spentCents: row.paid_cents - row.refunded_cents,
    firstOrderAt: row.first_at,
    lastOrderAt: row.last_at,
    marketingOptIn: row.marketing_opt_in === 1,
  };
}

// GET /admin/api/customers?q=&sort=&page=
export async function listCustomers(db, { q, sort = "last", page = 0 } = {}) {
  const clauses = [];
  const args = [];
  if (q) {
    const needle = String(q).trim().toLowerCase().slice(0, 100);
    const digits = needle.replace(/\D/g, "");
    const phone = digits.length >= 7 ? digits.slice(-10) : null;
    clauses.push(`(instr(c.customer, ?) > 0 OR instr(lower(c.shipping_json), ?) > 0${phone ? " OR instr(c.shipping_json, ?) > 0" : ""})`);
    args.push(needle, needle, ...(phone ? [phone] : []));
  }
  const order = SORT_SQL[CUSTOMER_SORTS.includes(sort) ? sort : "last"].replaceAll("l.shipping_json", "c.shipping_json");
  const index = Math.max(0, Math.floor(Number(page) || 0));
  const { results } = await db
    .prepare(`SELECT * FROM (${CUSTOMERS}) c ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...args, PAGE + 1, index * PAGE)
    .all();
  const total = await db.prepare(`SELECT COUNT(DISTINCT lower(trim(o.email))) AS n FROM orders o WHERE ${IS_ORDER} AND o.paid_at IS NOT NULL AND o.email != ''`).first();
  return { customers: results.slice(0, PAGE).map(summary), nextPage: results.length > PAGE ? index + 1 : null, total: total?.n ?? 0 };
}

// The customer key behind one of their order numbers, or null. An order whose data was deleted gives { erased: true }.
export async function customerOfOrder(db, ref) {
  if (!ORDER_ID_PATTERN.test(String(ref ?? ""))) return null;
  const row = await db.prepare(`SELECT o.id, o.email, o.shipping_json FROM orders o WHERE o.id = ? AND ${IS_ORDER}`).bind(ref).first();
  if (!row) return null;
  if (!row.email) return { erased: true, ref: row.id };
  return { key: customerKey(row.email), ref: row.id };
}

async function addresses(db, key) {
  const { results } = await db
    .prepare(`SELECT shipping_json, paid_at FROM orders o WHERE ${IS_ORDER} AND lower(trim(o.email)) = ? ORDER BY paid_at DESC`)
    .bind(key)
    .all();
  const seen = new Map();
  for (const row of results) {
    const s = JSON.parse(row.shipping_json || "{}");
    const value = { name: `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim(), street: s.street ?? "", street2: s.street2 ?? "", city: s.city ?? "", state: s.state ?? "", zip: s.zip ?? "" };
    const id = [value.street, value.street2, value.city, value.state, value.zip].join("|").toLowerCase();
    if (!seen.has(id)) seen.set(id, { ...value, lastUsedAt: row.paid_at });
  }
  return [...seen.values()];
}

export async function listCustomerNotes(db, key) {
  const { results } = await db.prepare("SELECT id, author, body, created_at FROM customer_notes WHERE customer = ? ORDER BY id LIMIT 200").bind(key).all();
  return results.map((row) => ({ id: row.id, author: row.author, body: row.body, at: row.created_at }));
}

async function contactMessages(db, key) {
  const { results } = await db
    .prepare("SELECT id, created_at, name, message FROM contact_messages WHERE lower(trim(email)) = ? ORDER BY created_at DESC LIMIT 50")
    .bind(key)
    .all();
  return results.map((row) => ({ id: row.id, at: row.created_at, name: row.name, message: row.message }));
}

// GET /admin/api/customers/:ref
export async function getCustomer(env, ref, { privacy } = {}) {
  const db = env.DB;
  const found = await customerOfOrder(db, ref);
  if (!found) return null;
  if (found.erased) return { ref, erased: true, erasedAt: await erasedAt(db, ref) };
  const row = await db.prepare(`SELECT * FROM (${CUSTOMERS}) c WHERE c.customer = ?`).bind(found.key).first();
  const orders = await listOrders(db, { customer: found.key, limit: 100, coolingMinutes: coolingOffMinutes(env) });
  return {
    ...summary(row),
    erased: false,
    orderList: orders.orders,
    addresses: await addresses(db, found.key),
    notes: await listCustomerNotes(db, found.key),
    messages: await contactMessages(db, found.key),
    ...(privacy ? await privacy(env, found.key) : {}),
  };
}

async function erasedAt(db, ref) {
  const row = await db.prepare("SELECT updated_at FROM orders WHERE id = ?").bind(ref).first();
  return row?.updated_at ?? null;
}

// POST /admin/api/customers/:ref/notes { body }
export async function addCustomerNote(env, actor, ref, body, { now = () => new Date().toISOString() } = {}) {
  const text = clean(body?.body);
  if (!text) throw new CustomerError(400, "empty_note", "Write the note first.");
  if (text.length > NOTE_MAX) throw new CustomerError(400, "note_too_long", `A note can be up to ${NOTE_MAX} characters.`);
  const found = await customerOfOrder(env.DB, ref);
  if (!found) throw new CustomerError(404, "not_found", "Customer not found.");
  if (found.erased) throw new CustomerError(409, "erased", "This customer's data was deleted.");
  await env.DB
    .prepare("INSERT INTO customer_notes (customer, author, body, created_at) VALUES (?, ?, ?, ?)")
    .bind(found.key, String(actor.email ?? actor.id).slice(0, 254), text, now())
    .run();
  return listCustomerNotes(env.DB, found.key);
}
