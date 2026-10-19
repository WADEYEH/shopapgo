// How long the store keeps what (C23, D67; the privacy policy's "How long we keep information"), applied by the cron job
// "retention" on its first run of each UTC day:
//   * Orders: 7 years after payment, the person is taken out the way a deletion request does it
//     (worker/customer-privacy.js anonymizeOrders): amounts, items and the state shipped to stay for the books.
//   * Contact us messages and the team's notes on a customer: deleted 2 years after that person's last paid order or
//     message.
//   * The Worker's own counters of refused notifications (worker/webhook-signatures.js): 30 days.
//   * Unpaid checkouts: 30 days, by the "checkouts" job (worker/checkout-jobs.js).
// A deletion request still removes everything at once (D53); this only catches what nobody asked about.
import { anonymizeOrders } from "./customer-privacy.js";

export const ORDER_YEARS = 7;
export const MESSAGE_YEARS = 2;
const COUNTER_DAYS = 30;
const BATCH = 50;          // order ids per statement (D1 allows 100 bound values)
const MAX_BATCHES = 10;    // per run; the rest waits for the next day
const STATE_KEY = "retention.ran";
const REMOVED = "[Removed after 7 years]";
const DAY_MS = 24 * 60 * 60_000;
const iso = (ms) => new Date(ms).toISOString();
const yearsBefore = (nowMs, years) => {
  const date = new Date(nowMs);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString();
};

// Runs the rules once. Returns what changed: { orders, messages, notes, counters }.
export async function applyRetention(env, { nowMs = Date.now() } = {}) {
  const db = env.DB;
  const at = iso(nowMs);
  const orderCutoff = yearsBefore(nowMs, ORDER_YEARS);
  const messageCutoff = yearsBefore(nowMs, MESSAGE_YEARS);

  let orders = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const { results } = await db.prepare(
      `SELECT id FROM orders WHERE paid_at IS NOT NULL AND paid_at < ? AND email != '' ORDER BY paid_at LIMIT ${BATCH}`,
    ).bind(orderCutoff).all();
    if (!results.length) break;
    await db.batch(anonymizeOrders(db, results.map((row) => row.id), at, { removed: REMOVED }));
    orders += results.length;
  }

  // Someone is "recent" while they have a paid order or a message within the last 2 years.
  const recent = (column) => `(
    EXISTS (SELECT 1 FROM contact_messages m WHERE lower(trim(m.email)) = ${column} AND m.created_at >= ?1)
    OR EXISTS (SELECT 1 FROM orders o WHERE lower(trim(o.email)) = ${column} AND o.paid_at >= ?1))`;
  const messages = await db.prepare(
    `DELETE FROM contact_messages WHERE created_at < ?1 AND (trim(email) = '' OR NOT ${recent("lower(trim(contact_messages.email))")})`,
  ).bind(messageCutoff).run();
  const notes = await db.prepare(
    `DELETE FROM customer_notes WHERE created_at < ?1 AND NOT EXISTS (
       SELECT 1 FROM customer_notes n WHERE n.customer = customer_notes.customer AND n.created_at >= ?1)
     AND NOT ${recent("customer_notes.customer")}`,
  ).bind(messageCutoff).run();
  const counters = await db.prepare("DELETE FROM ops_state WHERE key LIKE 'webhook.bad_signature.%' AND updated_at < ?")
    .bind(iso(nowMs - COUNTER_DAYS * DAY_MS)).run();

  return { orders, messages: messages.meta?.changes ?? 0, notes: notes.meta?.changes ?? 0, counters: counters.meta?.changes ?? 0 };
}

// Cron job "retention": once per UTC day (the first run that claims the day). Returns { ran, ...counts }.
export async function scheduledRetention(env, { nowMs = Date.now() } = {}) {
  const db = env.DB;
  const day = iso(nowMs).slice(0, 10);
  const last = (await db.prepare("SELECT value FROM ops_state WHERE key = ?").bind(STATE_KEY).first())?.value ?? null;
  if (last === day) return { ran: false };
  const claimed = await db
    .prepare(`INSERT INTO ops_state (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE ops_state.value IS ?`)
    .bind(STATE_KEY, day, iso(nowMs), last)
    .run();
  if (!(claimed.meta?.changes > 0)) return { ran: false };
  const counts = await applyRetention(env, { nowMs });
  if (counts.orders || counts.messages || counts.notes) console.log("retention", counts);
  return { ran: true, ...counts };
}
