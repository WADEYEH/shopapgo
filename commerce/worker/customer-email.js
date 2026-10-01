// Customer emails (order confirmation, shipment notice) through the Resend API.
// Same opt-in style as worker/notify.js: nothing is sent unless the operator sets the
// env below; otherwise the email is skipped and logged. A failure is logged and recorded
// but never throws and never changes the order.
//
//   RESEND_API_KEY                        (shared with notify.js)
//   CUSTOMER_EMAIL_FROM                   sender, e.g. "APGO <orders@your-domain>"; falls back to
//                                         ORDER_NOTIFY_EMAIL_FROM. The domain must be verified in Resend.
//   CUSTOMER_EMAIL_REPLY_TO               optional reply-to address
//   CUSTOMER_EMAIL_POLICY_NOTE            optional plain-text paragraph appended to both emails
//                                         (e.g. the approved return-policy sentence). Omitted when unset:
//                                         this code never invents policy or delivery promises.
//   CUSTOMER_EMAIL_ENABLED                "false" switches customer emails off
//   ORDER_NOTIFY_EMAIL_API_URL            optional endpoint override (tests / proxies), shared with notify.js
//
// Idempotency lives in the caller (order_emails primary key: one row per order + kind).

import { claimOrderEmail, finishOrderEmail } from "./orders.js";

const TIMEOUT_MS = 5_000;
const DEFAULT_EMAIL_API = "https://api.resend.com/emails";

const money = (cents, currency) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function customerEmailConfig(env) {
  if (String(env.CUSTOMER_EMAIL_ENABLED ?? "").toLowerCase() === "false") return null;
  const from = env.CUSTOMER_EMAIL_FROM || env.ORDER_NOTIFY_EMAIL_FROM;
  if (!env.RESEND_API_KEY || !from) return null;
  return {
    apiKey: env.RESEND_API_KEY,
    from,
    replyTo: env.CUSTOMER_EMAIL_REPLY_TO || undefined,
    apiUrl: env.ORDER_NOTIFY_EMAIL_API_URL || DEFAULT_EMAIL_API,
    policyNote: String(env.CUSTOMER_EMAIL_POLICY_NOTE ?? "").trim().slice(0, 1000),
  };
}

function orderParts(order) {
  const lines = JSON.parse(order.lines_json);
  const shipping = JSON.parse(order.shipping_json);
  const items = lines.map((line) => ({ name: line.name, sku: line.sku, qty: line.qty, total: money(line.lineCents, order.currency) }));
  const address = [
    `${shipping.firstName} ${shipping.lastName}`.trim(),
    shipping.street,
    shipping.street2,
    `${shipping.city}, ${shipping.state} ${shipping.zip}`,
  ].filter(Boolean);
  const totals = [
    ["Subtotal", money(order.subtotal_cents, order.currency)],
    ["Shipping", order.shipping_cents ? money(order.shipping_cents, order.currency) : "Free"],
    ["Tax", money(order.tax_cents, order.currency)],
    ["Total", money(order.total_cents, order.currency)],
  ];
  return { items, address, totals, firstName: shipping.firstName };
}

function render({ heading, intro, order, extraRows = [], extraText = [], extraHtml = "", policyNote }) {
  const { items, address, totals, firstName } = orderParts(order);
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";

  const text = [
    greeting,
    "",
    intro,
    "",
    `Order number: ${order.id}`,
    ...extraText,
    "",
    "Items",
    ...items.map((item) => `  ${item.qty} × ${item.name} (${item.sku})  ${item.total}`),
    "",
    ...totals.map(([label, value]) => `${label}: ${value}`),
    "",
    "Ship to",
    ...address.map((line) => `  ${line}`),
    ...(policyNote ? ["", policyNote] : []),
    "",
    "APGO",
  ].join("\n");

  const rows = (list) => list.map(([label, value]) => `<tr><td style="padding:2px 12px 2px 0;color:#555">${escapeHtml(label)}</td><td style="padding:2px 0">${value}</td></tr>`).join("");
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.5;max-width:560px">
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(heading)}</h1>
<p>${escapeHtml(greeting)}</p>
<p>${escapeHtml(intro)}</p>
<table role="presentation" style="border-collapse:collapse">${rows([["Order number", `<strong>${escapeHtml(order.id)}</strong>`], ...extraRows])}</table>
<h2 style="font-size:15px;margin:20px 0 6px">Items</h2>
<table role="presentation" style="border-collapse:collapse;width:100%">${items
    .map((item) => `<tr><td style="padding:3px 0">${escapeHtml(`${item.qty} × ${item.name}`)} <span style="color:#777">(${escapeHtml(item.sku)})</span></td><td style="padding:3px 0;text-align:right">${escapeHtml(item.total)}</td></tr>`)
    .join("")}</table>
<table role="presentation" style="border-collapse:collapse;margin-top:8px">${rows(totals.map(([l, v]) => [l, escapeHtml(v)]))}</table>
<h2 style="font-size:15px;margin:20px 0 6px">Ship to</h2>
<p style="margin:0">${address.map(escapeHtml).join("<br>")}</p>${extraHtml}
${policyNote ? `<p style="color:#555">${escapeHtml(policyNote)}</p>` : ""}
<p style="color:#555">APGO</p>
</body></html>`;
  return { text, html };
}

export function buildConfirmationEmail(order, { policyNote } = {}) {
  const subject = `We received your APGO order ${order.id}`;
  const body = render({
    heading: "Thanks for your order",
    intro: "Thanks for your order. Your payment was received. We'll email you again when your order ships.",
    order,
    policyNote,
  });
  return { subject, ...body };
}

export function buildShipmentEmail(order, shipment, { policyNote } = {}) {
  const subject = `Your APGO order ${order.id} has shipped`;
  const extraRows = [["Carrier", escapeHtml(shipment.carrier)], ["Tracking number", `<strong>${escapeHtml(shipment.trackingNumber)}</strong>`]];
  const extraText = [`Carrier: ${shipment.carrier}`, `Tracking number: ${shipment.trackingNumber}`];
  let extraHtml = "";
  if (shipment.trackingUrl) {
    extraText.push(`Track your package: ${shipment.trackingUrl}`);
    extraHtml = `<p><a href="${escapeHtml(shipment.trackingUrl)}">Track your package</a></p>`;
  }
  const body = render({ heading: "Your order has shipped", intro: "Good news: your order has shipped.", order, extraRows, extraText, extraHtml, policyNote });
  return { subject, ...body };
}

async function deliver(config, order, message, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const payload = { from: config.from, to: [order.email], subject: message.subject, text: message.text, html: message.html };
    if (config.replyTo) payload.reply_to = config.replyTo;
    const response = await fetchImpl(config.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`email api responded ${response.status}`);
  } finally {
    clearTimeout(timer);
  }
}

// Sends one customer email at most once per (order, kind). Returns { status, detail } where
// status is "sent" | "failed" | "skipped" | "duplicate". Never throws.
export async function sendCustomerEmail(env, order, kind, { shipment, fetchImpl = fetch } = {}) {
  try {
    if (!(await claimOrderEmail(env.DB, order.id, kind))) return { status: "duplicate", detail: "" };
    const config = customerEmailConfig(env);
    let result;
    if (!config) {
      console.log("customer_email_skipped", { orderId: order.id, kind, reason: "email not configured" });
      result = { status: "skipped", detail: "Customer email is not configured." };
    } else {
      try {
        const message =
          kind === "shipment"
            ? buildShipmentEmail(order, shipment, { policyNote: config.policyNote })
            : buildConfirmationEmail(order, { policyNote: config.policyNote });
        await deliver(config, order, message, fetchImpl);
        result = { status: "sent", detail: "" };
      } catch (error) {
        // Reason only: never the key, the recipient or the URL.
        console.error("customer_email_failed", { orderId: order.id, kind, reason: error?.message });
        result = { status: "failed", detail: String(error?.message ?? "error").slice(0, 200) };
      }
    }
    await finishOrderEmail(env.DB, order.id, kind, result);
    return result;
  } catch (error) {
    console.error("customer_email_error", { orderId: order.id, kind, reason: error?.message });
    return { status: "failed", detail: "internal error" };
  }
}
