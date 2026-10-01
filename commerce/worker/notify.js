// New-paid-order notifications. Runs inside the Worker with no extra keys: every
// channel is opt-in through env, and with nothing configured the notification is
// skipped and logged. Nothing is ever sent unless the operator sets these.
//
//   ORDER_NOTIFY_WEBHOOK_URL      https URL (Slack/Teams/Discord incoming webhook, Zapier, n8n…)
//   ORDER_NOTIFY_WEBHOOK_SECRET   optional; adds X-APGO-Timestamp + X-APGO-Signature (HMAC-SHA256)
//   RESEND_API_KEY + ORDER_NOTIFY_EMAIL_TO + ORDER_NOTIFY_EMAIL_FROM   Resend email API
//   ORDER_NOTIFY_EMAIL_API_URL    optional override (tests / proxies)
//
// Payloads carry the order id, items, total and destination state only: no email
// address, street address or card data. The admin link is where the details live.

const TIMEOUT_MS = 5_000;
const DEFAULT_EMAIL_API = "https://api.resend.com/emails";

const money = (cents, currency) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

function validUrl(value, { allowLocalHttp = true } = {}) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url;
    if (allowLocalHttp && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) return url;
  } catch {
    // fall through
  }
  return null;
}

export function notificationChannels(env) {
  const channels = [];
  if (env.ORDER_NOTIFY_WEBHOOK_URL && validUrl(env.ORDER_NOTIFY_WEBHOOK_URL)) channels.push("webhook");
  if (env.RESEND_API_KEY && env.ORDER_NOTIFY_EMAIL_TO && env.ORDER_NOTIFY_EMAIL_FROM) channels.push("email");
  return channels;
}

export function buildNotification(order, { adminUrl } = {}) {
  const lines = JSON.parse(order.lines_json);
  const shipping = JSON.parse(order.shipping_json);
  const items = lines.map((line) => ({ sku: line.sku, name: line.name, qty: line.qty }));
  const itemText = items.map((item) => `${item.qty} × ${item.sku}`).join(", ");
  const total = money(order.total_cents, order.currency);
  const link = adminUrl ? `${adminUrl}#${encodeURIComponent(order.id)}` : undefined;
  const subject = `New paid order ${order.id} · ${total}`;
  const text = [`${subject}`, `${itemText} → ${shipping.state}`, link].filter(Boolean).join("\n");
  return {
    subject,
    text,
    payload: {
      event: "order.paid",
      text, // Slack / Discord-compatible field
      order: {
        id: order.id,
        currency: order.currency,
        totalCents: order.total_cents,
        items,
        shippingState: shipping.state,
        shippingMethod: order.shipping_method,
        createdAt: order.created_at,
        paidAt: order.paid_at,
        adminUrl: link,
      },
    },
  };
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function post(fetchImpl, url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, method: "POST", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function sendWebhook(env, message, fetchImpl) {
  const body = JSON.stringify(message.payload);
  const headers = { "Content-Type": "application/json" };
  if (env.ORDER_NOTIFY_WEBHOOK_SECRET) {
    const timestamp = String(Date.now());
    headers["X-APGO-Timestamp"] = timestamp;
    headers["X-APGO-Signature"] = `sha256=${await hmacHex(env.ORDER_NOTIFY_WEBHOOK_SECRET, `${timestamp}.${body}`)}`;
  }
  const response = await post(fetchImpl, env.ORDER_NOTIFY_WEBHOOK_URL, { headers, body });
  if (!response.ok) throw new Error(`webhook responded ${response.status}`);
}

async function sendEmail(env, message, fetchImpl) {
  const to = env.ORDER_NOTIFY_EMAIL_TO.split(",").map((value) => value.trim()).filter(Boolean);
  const response = await post(fetchImpl, env.ORDER_NOTIFY_EMAIL_API_URL || DEFAULT_EMAIL_API, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: env.ORDER_NOTIFY_EMAIL_FROM, to, subject: message.subject, text: message.text }),
  });
  if (!response.ok) throw new Error(`email api responded ${response.status}`);
}

const SENDERS = { webhook: sendWebhook, email: sendEmail };

// Returns one { channel, status, detail } per attempted channel. status is
// "sent" | "failed" | "skipped". Never throws: a failed notification must not
// affect the order.
export async function notifyOrderPaid(env, order, { adminUrl, fetchImpl = fetch } = {}) {
  const channels = notificationChannels(env);
  if (channels.length === 0) {
    console.log("order_notification_skipped", { orderId: order.id, reason: "no channel configured" });
    return [{ channel: "none", status: "skipped", detail: "No notification channel configured." }];
  }
  const message = buildNotification(order, { adminUrl });
  const results = [];
  for (const channel of channels) {
    try {
      await SENDERS[channel](env, message, fetchImpl);
      results.push({ channel, status: "sent", detail: "" });
    } catch (error) {
      // Never log the URL or key: they are secrets.
      console.error("order_notification_failed", { orderId: order.id, channel, reason: error?.message });
      results.push({ channel, status: "failed", detail: String(error?.message ?? "error").slice(0, 200) });
    }
  }
  return results;
}
