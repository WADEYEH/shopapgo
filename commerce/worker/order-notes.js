// Internal notes on an order (I10, M9-18, D50): any member can read and write them; customers never see them. A note
// keeps who wrote it and when, and is never edited or deleted: a correction is another note. Shown in the order's
// timeline (public/admin/order.js). API: POST /admin/api/orders/:id/notes { body } (worker/admin.js).
import { getOrder } from "./orders.js";

export const NOTE_MAX = 1000;
const LIST_MAX = 200;

export class NoteError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Line breaks are kept; other control characters are dropped.
const clean = (value) => String(value ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ").trim();

// Oldest first, as written.
export async function listNotes(db, orderId) {
  const { results } = await db
    .prepare("SELECT id, author, body, created_at FROM order_notes WHERE order_id = ? ORDER BY id LIMIT ?")
    .bind(orderId, LIST_MAX)
    .all();
  return results.map((row) => ({ id: row.id, author: row.author, body: row.body, at: row.created_at }));
}

export async function addNote(env, actor, orderId, body, { now = () => new Date().toISOString() } = {}) {
  const text = clean(body?.body);
  if (!text) throw new NoteError(400, "empty_note", "Write the note first.");
  if (text.length > NOTE_MAX) throw new NoteError(400, "note_too_long", `A note can be up to ${NOTE_MAX} characters.`);
  if (!(await getOrder(env.DB, orderId))) throw new NoteError(404, "not_found", "Order not found.");
  const row = await env.DB
    .prepare("INSERT INTO order_notes (order_id, author, body, created_at) VALUES (?, ?, ?, ?) RETURNING id, author, body, created_at")
    .bind(orderId, String(actor.email ?? actor.id).slice(0, 254), text, now())
    .first();
  return { id: row.id, author: row.author, body: row.body, at: row.created_at };
}
