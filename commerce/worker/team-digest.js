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
//   returned        packages going back to the sender in the last 14 days (worker/package-tracking.js, F9)
//   privacy         privacy requests not answered yet, with the date to answer by (M11-05; worker/customer-privacy.js)
import { alertTeam } from "./team-alerts.js";
import { privacyReminders } from "./customer-privacy.js";
import { returnedPackages } from "./package-tracking.js";
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

// What is waiting, as data: [{ key, rows }] in this order, every key always present (rows may be empty). The daily
// summary words it below; the back office's dashboard shows the same lists (worker/dashboard.js).
export async function waitingLists(env, { nowMs = Date.now() } = {}) {
  const db = env.DB;
  const since = iso(nowMs - DAY_MS);
  const submitted = await all(db, "SELECT order_id, submitted_at FROM order_mcf WHERE status = 'submitted' AND submitted_at IS NOT NULL AND submitted_at <= ? ORDER BY submitted_at", iso(nowMs - 2 * DAY_MS));
  const paid = await all(db, "SELECT id AS order_id, paid_at, shipping_json FROM orders WHERE status = 'paid' AND paid_at >= ?", since);
  return [
    { key: "review", rows: await all(db, "SELECT id AS order_id FROM orders WHERE status = 'review' ORDER BY created_at") },
    { key: "not_sent", rows: await all(db,
      `SELECT m.order_id, m.mcf_status FROM order_mcf m JOIN orders o ON o.id = m.order_id
        WHERE o.status = 'paid' AND (m.status = 'failed' OR (m.status = 'rejected' AND m.mcf_status != 'UNFULFILLABLE')) ORDER BY m.updated_at`) },
    { key: "stockout", rows: (await all(db,
      `SELECT m.order_id, m.stockout_at FROM order_mcf m JOIN orders o ON o.id = m.order_id
        WHERE o.status = 'paid' AND m.status = 'rejected' AND m.mcf_status = 'UNFULFILLABLE' AND m.stockout_at IS NOT NULL ORDER BY m.stockout_at`))
      .map((row) => ({ ...row, days: Math.floor((nowMs - Date.parse(row.stockout_at)) / DAY_MS) })) },
    { key: "no_tracking", rows: submitted.filter((row) => addWorkingDays(Date.parse(row.submitted_at), 2) <= nowMs) },
    { key: "disputes", rows: await all(db, "SELECT order_id, provider, due_at FROM order_disputes WHERE status = 'open' ORDER BY CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at") },
    { key: "refunds", rows: await all(db,
      `SELECT order_id FROM order_refunds WHERE status = 'FAILED' AND provider_updated_at >= ?
       UNION SELECT order_id FROM order_refund_requests WHERE status = 'failed'`, iso(nowMs - 30 * DAY_MS)) },
    { key: "returned", rows: await returnedPackages(db, { nowMs }) },
    { key: "emails", rows: await all(db,
      "SELECT order_id, kind, status FROM order_email_delivery WHERE status IN ('bounced', 'complained', 'suppressed', 'failed', 'review') AND updated_at >= ? ORDER BY updated_at", since) },
    { key: "addresses", rows: paid.filter((row) => {
      try {
        const check = JSON.parse(row.shipping_json).addressCheck;
        return check?.status === "unverified" && check.reason === "unavailable";
      } catch {
        return false;
      }
    }).map(({ order_id, paid_at }) => ({ order_id, paid_at })) },
  ];
}

const SECTIONS = {
  review: ["Needs review (the amount paid did not match): confirm or cancel"],
  not_sent: ["Not with Amazon (sending failed or Amazon closed it): retry or cancel", (row) => `${row.order_id}${row.mcf_status ? ` (${row.mcf_status})` : ""}`],
  stockout: ["Out of stock at Amazon: cancel and refund after 3 days", (row) => `${row.order_id} (${row.days} days)`],
  no_tracking: ["With Amazon for 2 working days or more without tracking", (row) => `${row.order_id} (sent ${day(Date.parse(row.submitted_at))})`],
  disputes: ["Open disputes: respond in the provider's dashboard",
    (row) => `${row.order_id} (${row.provider === "paypal" ? "PayPal" : "Airwallex"}${row.due_at ? `, respond by ${day(Date.parse(row.due_at))}` : ""})`],
  refunds: ["Refunds that did not go through"],
  returned: ["Packages going back to the sender: contact the customer, then ship again or refund",
    (row) => `${row.order_id} (${row.carrier || "carrier"} ${row.tracking_number}, ${row.status})`],
  emails: ["Customer emails not delivered in the last day", (row) => `${row.order_id} ${row.kind} (${row.status})`],
  addresses: ["Paid in the last day with the address unchecked (the check service was down)"],
};

// The sections with something in them: [{ title, count, detail }].
export async function digestSections(env, { nowMs = Date.now() } = {}) {
  const sections = (await waitingLists(env, { nowMs }))
    .filter((list) => list.rows.length)
    .map(({ key, rows }) => ({ title: SECTIONS[key][0], count: rows.length, detail: ids(rows, SECTIONS[key][1]) }));
  const privacy = await privacyReminders(env.DB, { nowMs });
  if (privacy.length) {
    sections.push({
      title: "Privacy requests to answer (open the customer in the back office)",
      count: privacy.length,
      detail: privacy.slice(0, LIST).map((item) => `${item.kind === "delete" ? "delete" : "see their data"}, ${item.handler}, ${item.daysLeft < 0 ? `${-item.daysLeft} days late` : `answer by ${day(Date.parse(item.dueAt))}`}`).join("; ")
        + (privacy.length > LIST ? ` and ${privacy.length - LIST} more` : ""),
    });
  }
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
