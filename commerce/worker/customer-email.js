// Customer emails (order confirmation, shipment notice) through the Resend API.
// Same opt-in style as worker/notify.js: nothing is sent unless the operator sets the
// env below; otherwise the email is skipped and logged. A failure is logged and recorded
// but never throws and never changes the order. Temporary failures use a durable
// outbox; signed delivery events are handled in email-delivery.js.
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
// Durable delivery state and provider idempotency are in email-delivery.js.

import { getOrder } from "./orders.js";
import { getFulfillment } from "./fulfillment.js";
import { sendOutboxEmail, getDelivery } from "./email-delivery.js";

const DEFAULT_EMAIL_API = "https://api.resend.com/emails";

const money = (cents, currency) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function customerEmailConfig(env) {
  if (String(env.CUSTOMER_EMAIL_ENABLED ?? "").toLowerCase() === "false") return null;
  const from = env.CUSTOMER_EMAIL_FROM || env.ORDER_NOTIFY_EMAIL_FROM;
  if (!env.RESEND_API_KEY || !from) return null;
  return {
    apiKey: String(env.RESEND_API_KEY).trim(),
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

// "sent" remains the compatibility result for API acceptance. Delivery is separate.
export async function sendCustomerEmail(env, order, kind, options = {}) {
  try {
    const config = customerEmailConfig(env);
    return await sendOutboxEmail(env, order, kind, config, () => kind === "shipment"
      ? buildShipmentEmail(order, options.shipment, { policyNote: config.policyNote })
      : buildConfirmationEmail(order, { policyNote: config.policyNote }), options);
  } catch {
    console.error("customer_email_error", { orderId: order.id, kind, reason: "delivery processing failed" });
    return { status: "failed", detail: "Email processing failed; check delivery records." };
  }
}

export async function retryCustomerEmail(env, order, kind, options = {}) {
  const shipment = kind === "shipment" ? await getFulfillment(env.DB, order.id) : undefined;
  if (kind === "shipment" && !shipment) return { status: "blocked", detail: "Shipment details are required." };
  return sendCustomerEmail(env, order, kind, { ...options, retry: true, shipment });
}

// Hand off a transaction-created confirmation instruction to the durable outbox.
// If preparation fails, retain the instruction; if transport has started, its
// frozen body/key and lease own recovery. This never backfills old paid orders.
export async function processConfirmationJob(env, order, options = {}) {
  const db = env.DB;
  try {
    const job = await db.prepare("SELECT status FROM order_email_jobs WHERE order_id = ? AND kind = 'confirmation'").bind(order.id).first();
    if (!job || job.status !== 'pending') return { status: 'duplicate', detail: '' };
    const legacy = await db.prepare("SELECT status FROM order_emails WHERE order_id = ? AND kind = 'confirmation'").bind(order.id).first();
    let row = await getDelivery(db, order.id, 'confirmation');
    // Preserve an explicit opt-out even if configuration changes after a crash.
    const result = !row && legacy?.status === 'skipped'
      ? { status: 'skipped', detail: 'Existing skipped email retained.' }
      : await sendCustomerEmail(env, order, 'confirmation', { ...options, retry: false, resumeInitialJob: true });
    row = await getDelivery(db, order.id, 'confirmation');
    const projection = await db.prepare("SELECT status FROM order_emails WHERE order_id = ? AND kind = 'confirmation'").bind(order.id).first();
    const complete = row || (projection && projection.status !== 'pending');
    const timestamp = new Date().toISOString();
    await db.prepare("UPDATE order_email_jobs SET status = ?, next_attempt_at = ?, updated_at = ? WHERE order_id = ? AND kind = 'confirmation' AND status = 'pending'")
      .bind(complete ? (projection?.status === 'skipped' && !row ? 'skipped' : 'handed_off') : 'pending',
        complete ? null : new Date(Date.now() + 60_000).toISOString(), timestamp, order.id).run();
    return result;
  } catch {
    console.error('customer_email_job_error', { orderId: order.id, reason: 'confirmation handoff failed' });
    return { status: 'failed', detail: 'Confirmation task retained for recovery.' };
  }
}

export async function scheduledCustomerEmailRetry(env) {
  if (env.CUSTOMER_EMAIL_RETRY_CRON !== "true") return;
  const timestamp = new Date().toISOString();
  const { results: jobs } = await env.DB.prepare("SELECT order_id FROM order_email_jobs WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY updated_at, order_id LIMIT 10").bind(timestamp).all();
  for (const item of jobs) {
    const order = await getOrder(env.DB, item.order_id);
    if (order) await processConfirmationJob(env, order);
  }
  if (!customerEmailConfig(env)) return;
  const { results } = await env.DB.prepare("SELECT order_id, kind FROM order_email_delivery WHERE status IN ('queued','retry','sending') AND (next_attempt_at IS NULL OR next_attempt_at <= ?) AND (lease_until IS NULL OR lease_until <= ?) ORDER BY created_at LIMIT 10").bind(timestamp, timestamp).all();
  for (const item of results) {
    const order = await getOrder(env.DB, item.order_id);
    if (order) await retryCustomerEmail(env, order, item.kind);
  }
}
