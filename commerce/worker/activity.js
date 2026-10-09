// The site-wide activity log (M9 §2, M9-19, scenario I11): every back-office action with who did it, when, what it
// touched and why. Member and settings changes are written to admin_audit here; order actions keep their own
// order_audit rows (worker/fulfillment.js recordAudit). The Activity page reads both, newest first.

const clip = (value, max) => String(value ?? "").slice(0, max);
const PAGE = 50;

// Writes one admin_audit row and returns its id. `actor` is the signed-in person (worker/admin-identity.js).
export async function recordAdminAudit(db, { actor, action, target = "", before = null, after = null, reason = "", detail = {}, at = new Date().toISOString() }) {
  const row = await db
    .prepare(
      `INSERT INTO admin_audit (at, actor, actor_via, action, target, before_json, after_json, reason, detail_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      at,
      clip(actor.id, 254),
      clip(actor.via, 20),
      clip(action, 60),
      clip(target, 254),
      before === null ? null : JSON.stringify(before),
      after === null ? null : JSON.stringify(after),
      clip(reason, 300),
      JSON.stringify(detail),
    )
    .first();
  return row?.id ?? null;
}

// Updates the detail of an entry written moments ago (for example who was notified about it).
export async function updateAdminAuditDetail(db, id, detail) {
  if (id == null) return;
  await db.prepare("UPDATE admin_audit SET detail_json = ? WHERE id = ?").bind(JSON.stringify(detail), id).run();
}

const parse = (text) => {
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// The cursor is "<at>|<source>|<id>" of the last entry shown, so entries with the same timestamp are never skipped.
function readCursor(value) {
  const [at, source, id] = String(value ?? "").split("|");
  if (!at || Number.isNaN(Date.parse(at)) || !["admin", "order"].includes(source) || !/^\d+$/.test(id ?? "")) return null;
  return { at, source, id: Number(id) };
}

const isoOrNull = (value) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null);

// { entries, nextCursor, actors }. Filters: actor (exact id), from / to (ISO times, to exclusive), cursor.
export async function listActivity(db, { actor = null, from = null, to = null, cursor = null, limit = PAGE } = {}) {
  const after = readCursor(cursor);
  const size = Math.min(Math.max(Number(limit) || PAGE, 1), 100);
  const { results } = await db
    .prepare(
      `SELECT * FROM (
         SELECT 'admin' AS source, id, at, actor, actor_via AS via, action, target, before_json, after_json, reason, detail_json
           FROM admin_audit
         UNION ALL
         SELECT 'order' AS source, id, created_at AS at, actor, '' AS via, action, order_id AS target, NULL, NULL, '', detail_json
           FROM order_audit
       )
       WHERE (?1 IS NULL OR actor = ?1)
         AND (?2 IS NULL OR at >= ?2)
         AND (?3 IS NULL OR at < ?3)
         AND (?4 IS NULL OR at < ?4 OR (at = ?4 AND (source > ?5 OR (source = ?5 AND id < ?6))))
       ORDER BY at DESC, source ASC, id DESC
       LIMIT ?7`,
    )
    .bind(actor || null, isoOrNull(from), isoOrNull(to), after?.at ?? null, after?.source ?? null, after?.id ?? null, size + 1)
    .all();
  const page = results.slice(0, size);
  const last = page.at(-1);
  const entries = page.map((row) => ({
    source: row.source,
    at: row.at,
    actor: row.actor,
    via: row.via || null,
    action: row.action,
    target: row.target || null,
    before: parse(row.before_json),
    after: parse(row.after_json),
    reason: row.reason || null,
    detail: parse(row.detail_json) ?? {},
  }));
  return { entries, nextCursor: results.length > size && last ? `${last.at}|${last.source}|${last.id}` : null };
}

// Everyone who appears in the log, for the person filter.
export async function activityActors(db) {
  const { results } = await db
    .prepare("SELECT actor FROM admin_audit UNION SELECT actor FROM order_audit ORDER BY actor LIMIT 200")
    .all();
  return results.map((row) => row.actor);
}
