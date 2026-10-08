// The "Contact us" form (D28, M11): POST /api/contact with a name, an email address and a message; no order number
// needed. The message is saved first (nothing is lost if email fails, and the back office lists it), then sent to the
// customer-service inbox through Resend with the shopper's address as Reply-To, so the team answers from their own mail.
//
// Abuse limits (M12-06): a field that only robots fill (`company`), at most 5 messages an hour from one address (kept
// as a salted daily hash, never the address itself) and 60 an hour overall, and Cloudflare Turnstile once the operator
// sets its keys.
//
//   CONTACT_EMAIL_TO          the inbox that receives the messages (plain var). Unset: messages are only saved.
//   RESEND_API_KEY + CUSTOMER_EMAIL_FROM   the sender, shared with the order emails (customer-email.js)
//   TURNSTILE_SITE_KEY        public widget key (plain var), shown to the page through /api/store/config
//   TURNSTILE_SECRET_KEY      secret; with it every message needs a valid Turnstile token
// On staging only the approved test recipients receive mail (email-delivery.js allowedEmailRecipient).

import { CONTACT_LIMITS as FIELD_LIMITS, CONTACT_MESSAGES, checkContactMessage, cleanText, isEmail } from "../prototype/js/commerce/contact-rules.js";
import { QuoteError } from "./catalog.js";
import { allowedEmailRecipient } from "./email-delivery.js";
import { customerEmailConfig } from "./customer-email.js";
import { json } from "./http.js";

export const CONTACT_LIMITS = { ...FIELD_LIMITS, perAddressHour: 5, allHour: 60 };
export { CONTACT_MESSAGES, checkContactMessage };

const HOUR_MS = 60 * 60 * 1000;
const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// The same address hashes alike only within one UTC day: enough for the hourly cap, useless for tracking anyone.
const addressHash = (request, nowMs) =>
  sha256(`${request.headers.get("CF-Connecting-IP") || "unknown"}|${new Date(nowMs).toISOString().slice(0, 10)}|apgo-contact`);

async function verifyTurnstile(env, token, request, fetchImpl) {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (typeof token !== "string" || !token) return false;
  try {
    const form = new FormData();
    form.set("secret", env.TURNSTILE_SECRET_KEY);
    form.set("response", token.slice(0, 2048));
    const ip = request.headers.get("CF-Connecting-IP");
    if (ip) form.set("remoteip", ip);
    const response = await fetchImpl(TURNSTILE_VERIFY, { method: "POST", body: form });
    const result = await response.json();
    return result?.success === true;
  } catch {
    return false;
  }
}

function contactEmail(record) {
  return {
    subject: `Website message from ${record.name}`.slice(0, 150),
    reply_to: record.email,
    text: [
      `From: ${record.name} <${record.email}>`,
      `Received: ${record.created_at} (message ${record.id})`,
      "",
      record.message,
      "",
      "Reply to this email to answer the customer. Sent from the Contact us form on shopapgo.com.",
    ].join("\n"),
  };
}

// Returns { status: "sent" | "skipped" | "failed", detail }. Never throws: the message is already saved.
async function sendContactEmail(env, record, fetchImpl) {
  const config = customerEmailConfig({ ...env, CUSTOMER_EMAIL_ENABLED: "true" });
  const to = String(env.CONTACT_EMAIL_TO || "").trim();
  if (!config || !isEmail(to)) return { status: "skipped", detail: "Contact email is not configured; the message is in the back office." };
  if (!allowedEmailRecipient(env, to)) return { status: "skipped", detail: "Recipient is not in the staging email allowlist." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchImpl(config.apiUrl, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}`, "Idempotency-Key": `contact-${record.id}` },
      body: JSON.stringify({ from: config.from, to: [to], ...contactEmail(record) }),
      signal: controller.signal,
    });
    return response.ok ? { status: "sent", detail: "" } : { status: "failed", detail: `Email service returned HTTP ${response.status}.` };
  } catch {
    return { status: "failed", detail: controller.signal.aborted ? "Email service timed out." : "Email service could not be reached." };
  } finally {
    clearTimeout(timer);
  }
}

export async function handleContact(request, env, { fetchImpl = fetch, nowMs = Date.now() } = {}) {
  let body;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object") throw new QuoteError("invalid_json", "Request body must be a JSON object.");
  // Only robots fill the hidden field: answer as if it worked and keep nothing.
  if (cleanText(body.company)) return json({ ok: true });

  const { value, errors } = checkContactMessage(body);
  const [field, message] = Object.entries(errors)[0] ?? [];
  if (field) throw new QuoteError("invalid_contact", message, field);
  if (!(await verifyTurnstile(env, body.turnstileToken, request, fetchImpl))) throw new QuoteError("turnstile_failed", CONTACT_MESSAGES.turnstile, "turnstile");

  const db = env.DB;
  const ipHash = await addressHash(request, nowMs);
  const since = new Date(nowMs - HOUR_MS).toISOString();
  const recent = await db.prepare(
    "SELECT SUM(CASE WHEN ip_hash = ? THEN 1 ELSE 0 END) AS mine, COUNT(*) AS everyone FROM contact_messages WHERE created_at > ?",
  ).bind(ipHash, since).first();
  if ((recent?.mine ?? 0) >= CONTACT_LIMITS.perAddressHour || (recent?.everyone ?? 0) >= CONTACT_LIMITS.allHour) {
    return json({ error: { code: "too_many_messages", message: CONTACT_MESSAGES.busy } }, 429);
  }

  const record = { id: `CM-${crypto.randomUUID()}`, created_at: new Date(nowMs).toISOString(), ...value };
  await db.prepare(
    "INSERT INTO contact_messages (id, created_at, name, email, message, ip_hash, email_status) VALUES (?, ?, ?, ?, ?, ?, 'pending')",
  ).bind(record.id, record.created_at, record.name, record.email, record.message, ipHash).run();

  const sent = await sendContactEmail(env, record, fetchImpl);
  await db.prepare("UPDATE contact_messages SET email_status = ?, email_detail = ? WHERE id = ?").bind(sent.status, sent.detail || null, record.id).run();
  if (sent.status !== "sent") console.log("contact_email_not_sent", { id: record.id, status: sent.status });
  return json({ ok: true });
}

// Back office: the newest messages first, 50 at a time (`before` = created_at of the last one shown).
export async function listContactMessages(db, { before } = {}) {
  const rows = before
    ? await db.prepare("SELECT id, created_at, name, email, message, email_status, email_detail FROM contact_messages WHERE created_at < ? ORDER BY created_at DESC LIMIT 51").bind(before).all()
    : await db.prepare("SELECT id, created_at, name, email, message, email_status, email_detail FROM contact_messages ORDER BY created_at DESC LIMIT 51").all();
  const list = rows.results ?? [];
  const messages = list.slice(0, 50).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    email: row.email,
    message: row.message,
    emailStatus: row.email_status,
    emailDetail: row.email_detail ?? "",
  }));
  return { messages, nextBefore: list.length > 50 ? messages.at(-1).createdAt : null };
}
