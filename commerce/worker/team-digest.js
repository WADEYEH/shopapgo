// The daily summary for the team (M8 §3, M8-08; PR 3-7): once a day, on the first cron run after midnight UTC (08:00 in
// Taiwan), one email listing what is still waiting for someone. Each problem was already emailed when it happened; this
// is the reminder of what is left. Nothing waiting: no email. Cron job "digest".
//
//   review          paid with an amount that did not match, not confirmed or cancelled yet
//   not sent        Amazon did not accept the order (send failed) or closed it, and it is still paid
//   out of stock    Amazon cannot fill it (with days since)
//   no tracking     with Amazon for 2 working days or more without shipping
//   disputes        open, with the response deadline
//   refunds         failed refunds, and refunds the store asked for that did not go through
//   emails          customer emails in the last day that bounced, were marked as spam, were blocked or failed
//   addresses       paid in the last day with the address unchecked because the check service was down
import { alertTeam } from "./team-alerts.js";
import { addWorkingDays } from "./fulfillment-checks.js";
import { adminHost } from "./hosts.js";

const STATE_KEY = "digest.date";
const DAY_MS = 24 * 60 * 60_000;
const LIST = 8;
const iso = (ms) => new Date(ms).toISOString();
const adminUrlOf = (env) => `${adminHost(env) ? `https://${adminHost(env)}` : "https://www.shopapgo.com"}/admin/`;
const ids = (rows, describe = (row) => row.order_id) => {
  const shown = rows.slice(0, LIST).map(describe).join(", ");
  return rows.length > LIST ? `${shown} and ${rows.length - LIST} more` : shown;
};
const day = (ms) => new Date(ms).toUTCString().slice(0, 16);
const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;

// The sections with something in them: [{ title, count, detail }].
export async function digestSections(env, { nowMs = Date.now() } = {}) {
  const db = env.DB;
  const since = iso(nowMs - DAY_MS);
  const sections = [];
  const add = (title, rows, describe) => rows.length && sections.push({ title, count: rows.length, detail: ids(rows, describe) });

  add("Needs review (the amount paid did not match): confirm or cancel", await all(db, "SELECT id AS order_id FROM orders WHERE status = 'review' ORDER BY created_at"));
  add("Not with Amazon (sending failed or Amazon closed it): retry or cancel", await all(db,
    `SELECT m.order_id, m.mcf_status FROM order_mcf m JOIN orders o ON o.id = m.order_id
      WHERE o.status = 'paid' AND (m.status = 'failed' OR (m.status = 'rejected' AND m.mcf_status != 'UNFULFILLABLE')) ORDER BY m.updated_at`),
  (row) => `${row.order_id}${row.mcf_status ? ` (${row.mcf_status})` : ""}`);
  add("Out of stock at Amazon: cancel and refund after 3 days", await all(db,
    `SELECT m.order_id, m.stockout_at FROM order_mcf m JOIN orders o ON o.id = m.order_id
      WHERE o.status = 'paid' AND m.status = 'rejected' AND m.mcf_status = 'UNFULFILLABLE' AND m.stockout_at IS NOT NULL ORDER BY m.stockout_at`),
  (row) => `${row.order_id} (${Math.floor((nowMs - Date.parse(row.stockout_at)) / DAY_MS)} days)`);
  const submitted = await all(db, "SELECT order_id, submitted_at FROM order_mcf WHERE status = 'submitted' AND submitted_at IS NOT NULL AND submitted_at <= ? ORDER BY submitted_at", iso(nowMs - 2 * DAY_MS));
  add("With Amazon for 2 working days or more without tracking", submitted.filter((row) => addWorkingDays(Date.parse(row.submitted_at), 2) <= nowMs),
    (row) => `${row.order_id} (sent ${day(Date.parse(row.submitted_at))})`);
  add("Open disputes: respond in the provider's dashboard", await all(db, "SELECT order_id, provider, due_at FROM order_disputes WHERE status = 'open' ORDER BY CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at"),
    (row) => `${row.order_id} (${row.provider === "paypal" ? "PayPal" : "Airwallex"}${row.due_at ? `, respond by ${day(Date.parse(row.due_at))}` : ""})`);
  add("Refunds that did not go through", await all(db,
    `SELECT order_id FROM order_refunds WHERE status = 'FAILED' AND provider_updated_at >= ?
     UNION SELECT order_id FROM order_refund_requests WHERE status = 'failed'`, iso(nowMs - 30 * DAY_MS)));
  add("Customer emails not delivered in the last day", await all(db,
    "SELECT order_id, kind, status FROM order_email_delivery WHERE status IN ('bounced', 'complained', 'suppressed', 'failed', 'review') AND updated_at >= ? ORDER BY updated_at", since),
  (row) => `${row.order_id} ${row.kind} (${row.status})`);
  const paid = await all(db, "SELECT id AS order_id, shipping_json FROM orders WHERE status = 'paid' AND paid_at >= ?", since);
  add("Paid in the last day with the address unchecked (the check service was down)", paid.filter((row) => {
    try {
      const check = JSON.parse(row.shipping_json).addressCheck;
      return check?.status === "unverified" && check.reason === "unavailable";
    } catch {
      return false;
    }
  }));
  return sections;
}

// Cron job: the first run of each UTC day sends the summary (or nothing when nothing waits). Never throws.
export async function scheduledDigest(env, { nowMs = Date.now() } = {}) {
  const db = env.DB;
  try {
    const today = iso(nowMs).slice(0, 10);
    const last = (await db.prepare("SELECT value FROM ops_state WHERE key = ?").bind(STATE_KEY).first())?.value ?? null;
    if (last === today) return { digest: "not_due" };
    const claimed = await db
      .prepare(
        `INSERT INTO ops_state (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE ops_state.value IS ?`,
      )
      .bind(STATE_KEY, today, iso(nowMs), last)
      .run();
    if (!(claimed.meta?.changes > 0)) return { digest: "claimed_elsewhere" };
    const sections = await digestSections(env, { nowMs });
    if (!sections.length) return { digest: "nothing" };
    const total = sections.reduce((sum, section) => sum + section.count, 0);
    await alertTeam(env, {
      key: `digest:${today}`, kind: "digest",
      subject: `Daily summary: ${total} thing${total === 1 ? "" : "s"} waiting`,
      lines: [
        ...sections.flatMap((section) => [`${section.title} (${section.count}):`, `  ${section.detail}`, ""]),
        `Each of these was emailed when it happened. Back office: ${adminUrlOf(env)}`,
      ],
    });
    return { digest: "sent", sections: sections.length, total };
  } catch (error) {
    console.error("digest_failed", { reason: error?.message });
    return { digest: "failed" };
  }
}
