// Emails to the team about things someone has to look at (M4 §6, M8): an order that needs review, a refund that put
// shipping on hold, a refused order-state change, an order that could not be sent to Amazon. Recipients: the active
// back-office owners (PR 3-7 lets each member choose). Sent through Resend like the other team emails; staging sends
// only to its allowlist.
//
// alertTeam() sends each alert once: the key (e.g. "review:APGO-US-…") is claimed in team_alerts first, so a webhook
// delivered twice or a cron run repeated never emails twice. Never throws; the outcome is stored on the row.
import { customerEmailConfig } from "./customer-email.js";
import { allowedEmailRecipient } from "./email-delivery.js";

const clip = (value, max) => String(value ?? "").slice(0, max);

// The active owners; before anyone has opened the Members page (no owner row yet), the first owner, ADMIN_OWNER_EMAIL.
async function owners(env) {
  const { results } = await env.DB.prepare("SELECT email FROM admin_members WHERE role = 'owner' AND status = 'active' ORDER BY email").all();
  if (results.length) return results.map((row) => row.email);
  const first = String(env.ADMIN_OWNER_EMAIL ?? "").trim().toLowerCase();
  return first ? [first] : [];
}

// Sends one email to every active owner. Returns { sent, skipped, failed } counts. Never throws.
export async function emailOwners(env, { subject, text, idempotencyKey }, fetchImpl = fetch) {
  const counts = { sent: 0, skipped: 0, failed: 0 };
  let recipients = [];
  try {
    recipients = await owners(env);
  } catch (error) {
    console.error("team_alert_recipients_unreadable", { message: clip(error?.message ?? error, 200) });
  }
  const config = customerEmailConfig({ ...env, CUSTOMER_EMAIL_ENABLED: "true" });
  for (const email of recipients) {
    if (!config || !allowedEmailRecipient(env, email)) {
      counts.skipped += 1;
      continue;
    }
    try {
      const response = await fetchImpl(config.apiUrl, {
        method: "POST",
        redirect: "manual",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}`, "Idempotency-Key": clip(`${idempotencyKey}-${email}`, 256) },
        body: JSON.stringify({ from: config.from, to: [email], subject: clip(subject, 150), text }),
        signal: AbortSignal.timeout(10_000),
      });
      counts[response.ok ? "sent" : "failed"] += 1;
    } catch {
      counts.failed += 1;
    }
  }
  return counts;
}

// One alert per key. Returns { status: "sent" | "skipped" | "failed" | "duplicate" }.
export async function alertTeam(env, { key, kind, orderId = null, subject, lines = [], adminUrl = null }, { fetchImpl = fetch, now = () => new Date().toISOString() } = {}) {
  const db = env.DB;
  const at = now();
  try {
    const claimed = await db
      .prepare("INSERT OR IGNORE INTO team_alerts (key, kind, order_id, subject, status, detail, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', '', ?, ?)")
      .bind(clip(key, 200), clip(kind, 60), orderId, clip(subject, 150), at, at)
      .run();
    if (!(claimed.meta?.changes > 0)) return { status: "duplicate" };
  } catch (error) {
    console.error("team_alert_unrecorded", { kind, message: clip(error?.message ?? error, 200) });
    return { status: "failed" };
  }
  const text = [
    ...lines,
    "",
    ...(orderId ? [`Order: ${orderId}${adminUrl ? ` (${adminUrl}#${orderId})` : ""}`] : []),
    "You get this because you are an owner of the APGO back office.",
  ].join("\n");
  const counts = await emailOwners(env, { subject, text, idempotencyKey: `alert-${key}` }, fetchImpl);
  const status = counts.sent ? "sent" : counts.failed ? "failed" : "skipped";
  console.log("team_alert", { kind, orderId, status });
  try {
    await db.prepare("UPDATE team_alerts SET status = ?, detail = ?, updated_at = ? WHERE key = ?").bind(status, JSON.stringify(counts), now(), clip(key, 200)).run();
  } catch {
    // the alert went out (or not); its bookkeeping is best effort
  }
  return { status, ...counts };
}
