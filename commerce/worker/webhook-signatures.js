// Notifications refused because their signature did not check out (C20). A key pasted wrong (a new
// AIRWALLEX_WEBHOOK_SECRET, PAYPAL_WEBHOOK_ID or RESEND_WEBHOOK_SECRET) makes every genuine notification fail, and
// nothing else would show it: each refusal is logged and counted per provider and UTC day (ops_state), and the third
// in a day emails the team once. Anyone can post junk to these URLs, so one or two refusals alone are no alert. The
// counts are kept 30 days (worker/retention.js). Never throws: the refusal itself is what matters to the sender.
import { alertTeam } from "./team-alerts.js";

export const SIGNATURE_ALERT_AT = 3;
const PROVIDERS = {
  airwallex: { label: "Airwallex", key: "AIRWALLEX_WEBHOOK_SECRET", what: "payments, refunds and disputes", where: "Airwallex → Developer → Webhooks" },
  paypal: { label: "PayPal", key: "PAYPAL_WEBHOOK_ID", what: "PayPal payments", where: "PayPal Developer → Apps & Credentials → the live app → Webhooks" },
  resend: { label: "Resend", key: "RESEND_WEBHOOK_SECRET", what: "email delivery results (delivered, bounced)", where: "Resend → Webhooks" },
};
export const signatureCountKey = (provider, day) => `webhook.bad_signature.${provider}.${day}`;

export async function noteBadSignature(env, provider, { nowMs = Date.now() } = {}) {
  const about = PROVIDERS[provider];
  console.warn("webhook_bad_signature", { provider, keySet: Boolean(String(env[about.key] ?? "").trim()) });
  try {
    const at = new Date(nowMs).toISOString();
    const day = at.slice(0, 10);
    const row = await env.DB.prepare(
      `INSERT INTO ops_state (key, value, updated_at) VALUES (?, '1', ?)
       ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(ops_state.value AS INTEGER) + 1 AS TEXT), updated_at = excluded.updated_at
       RETURNING value`,
    ).bind(signatureCountKey(provider, day), at).first();
    const count = Number(row?.value);
    if (!(count >= SIGNATURE_ALERT_AT)) return;
    await alertTeam(env, {
      key: `webhook-signature:${provider}:${day}`,
      kind: "webhook_signature",
      subject: `${about.label} notifications are being refused (signature check failed)`,
      lines: [
        `Today (UTC) ${count} notifications from ${about.label} were refused because their signature did not match ${about.key}.`,
        `While this lasts, ${about.what} are not recorded when they happen.`,
        "",
        `If ${about.key} was changed recently, it was probably pasted wrong: compare it with ${about.where}, where the failed deliveries are listed too.`,
        "If nothing was changed, someone may be sending fake notifications; they are refused and nothing needs doing.",
      ],
    });
  } catch (error) {
    console.error("webhook_bad_signature_unrecorded", { provider, message: String(error?.message ?? error).slice(0, 200) });
  }
}
