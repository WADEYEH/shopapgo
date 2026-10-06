// Customer notices and separately addressed refund-failure staff alerts through Resend.
// Same opt-in style as worker/notify.js: nothing is sent unless the operator sets the
// env below; otherwise the email is skipped and logged. A failure is logged and recorded
// but never throws and never changes the order. Temporary failures use a durable
// outbox; signed delivery events are handled in email-delivery.js.
//
//   RESEND_API_KEY                        (shared with notify.js)
//   CUSTOMER_EMAIL_FROM                   sender, e.g. "APGO <orders@your-domain>"; falls back to
//                                         ORDER_NOTIFY_EMAIL_FROM. The domain must be verified in Resend.
//   CUSTOMER_EMAIL_REPLY_TO               optional reply-to address
//   CUSTOMER_EMAIL_POLICY_NOTE            optional plain-text paragraph appended to all messages
//                                         (e.g. the approved return-policy sentence). Omitted when unset:
//                                         this code never invents policy or delivery promises.
//   CUSTOMER_EMAIL_ENABLED                "false" switches customer emails off
//   REFUND_ALERT_EMAIL_TO                  one approved staff recipient (separate from customer mail)
//   REFUND_ALERT_EMAIL_ENABLED             "false" switches staff alerts off independently
//   ORDER_NOTIFY_EMAIL_API_URL            optional endpoint override (tests / proxies), shared with notify.js
//
// Durable delivery state and provider idempotency are in email-delivery.js.

import { getOrder, claimOrderEmail, finishOrderEmail } from "./orders.js";
import { getFulfillment } from "./fulfillment.js";
import { sendOutboxEmail, getDelivery, validEmailKind, refundEmailKind } from "./email-delivery.js";

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

// Team alerts have their own explicit recipient and switch. Turning customer
// mail off must not silently turn internal incident communication off too.
export function refundAlertConfig(env) {
  const recipient = String(env.REFUND_ALERT_EMAIL_TO || '').trim();
  if (env.REFUND_ALERT_EMAIL_ENABLED === 'false' || !/^[\x21-\x7e]+$/.test(recipient)
    || !/^[^@,<>]+@[^@,<>]+\.[^@,<>]+$/.test(recipient)) return null;
  const config = customerEmailConfig({...env,CUSTOMER_EMAIL_ENABLED:'true'});
  return config ? {...config,recipient} : null;
}

function refundAdminUrl(env, orderId) {
  try {
    const url = new URL(`https://${env.ADMIN_HOST}/admin/`);
    if (!env.ADMIN_HOST || url.host !== env.ADMIN_HOST || url.username || url.password) return null;
    url.hash = encodeURIComponent(orderId);
    return url.href;
  } catch { return null; }
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
    intro: "Thanks for your order. Your payment was received. We'll email you with updates about your order.",
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

export function buildRefundEmail(order, refund, { policyNote } = {}) {
  const full = refund.refundedCents >= order.total_cents;
  const heading = full ? 'Your full refund was accepted' : 'Your partial refund was accepted';
  const intro = 'Your payment provider has accepted this refund to your original payment method. When the credit appears depends on your bank or payment method.';
  const firstName = orderParts(order).firstName;
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  const facts = [['Order number',order.id],['Refund reference',refund.id],['This refund',money(refund.amountCents,refund.currency)],
    ['Total refunds accepted',money(refund.refundedCents,refund.currency)],['Original order total',money(order.total_cents,order.currency)],['Refund type',full ? 'Full' : 'Partial']];
  const text = [greeting,'',heading,intro,'',...facts.map(([key,value])=>`${key}: ${value}`),
    '', 'For questions about this refund, reply to this email.',...(policyNote ? ['',policyNote] : []),'','APGO'].join('\n');
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.5;max-width:560px">
    <h1 style="font-size:20px">${escapeHtml(heading)}</h1><p>${escapeHtml(greeting)}</p><p>${escapeHtml(intro)}</p>
    <table role="presentation">${facts.map(([key,value])=>`<tr><td style="padding:2px 12px 2px 0;color:#555">${escapeHtml(key)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}</table>
    <p>For questions about this refund, reply to this email.</p>${policyNote ? `<p style="color:#555">${escapeHtml(policyNote)}</p>` : ''}<p>APGO</p></body></html>`;
  return { subject:`Your APGO ${full ? 'full' : 'partial'} refund was accepted · ${order.id}`,text,html };
}

export function buildRefundFailureEmail(order, refund, { policyNote, team = false, adminUrl } = {}) {
  const heading = team ? 'Refund failed — action required' : 'Your refund could not be completed';
  const subject = `${team ? 'Action required: APGO refund failed' : 'Update: your APGO refund could not be completed'} · ${order.id}`;
  const intro = team
    ? 'The payment provider reports that this refund failed. Review the payment in Airwallex and contact the customer. Do not assume an earlier acceptance notice means the refund completed.'
    : 'The payment provider reports that this refund could not be completed. If you received an earlier refund acceptance email, it reflected the initial status and does not confirm that the refund was completed.';
  const action = team
    ? 'No financial refund retry is automatic. Check the provider status before deciding any next action.'
    : 'We have flagged this for our team to review. Please reply to this email if you have questions about this refund.';
  const greeting = team ? 'APGO team,' : `Hi${orderParts(order).firstName ? ` ${orderParts(order).firstName}` : ''},`;
  const facts = [['Order number',order.id],['Refund reference',refund.id],['Refund amount',money(refund.amountCents,refund.currency)],['Original order total',money(order.total_cents,order.currency)],
    ...(team ? [['Failure code',refund.failureCode || 'Not supplied'],['Payment reference',order.payment_intent_id]] : [])];
  const text = [greeting,'',heading,intro,'',...facts.map(([key,value])=>`${key}: ${value}`),'',action,
    ...(team && adminUrl ? [`Review order: ${adminUrl}`] : []),...(policyNote ? ['',policyNote] : []),'','APGO'].join('\n');
  const html = `<!doctype html><html lang="en" dir="ltr"><head><title>${escapeHtml(subject)}</title></head><body style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#111;background:#fff;line-height:1.5;max-width:560px">
    <div lang="en" dir="ltr"><h1 style="font-size:22px">${escapeHtml(heading)}</h1><p>${escapeHtml(greeting)}</p><p>${escapeHtml(intro)}</p>
    <table role="presentation">${facts.map(([key,value])=>`<tr><td style="padding:4px 12px 4px 0;color:#555">${escapeHtml(key)}</td><td style="overflow-wrap:anywhere">${escapeHtml(value)}</td></tr>`).join('')}</table>
    <p>${escapeHtml(action)}</p>${team && adminUrl ? `<p><a href="${escapeHtml(adminUrl)}">Review this order in the APGO back office</a></p>` : ''}
    ${policyNote ? `<p style="color:#555">${escapeHtml(policyNote)}</p>` : ''}<p>APGO</p></div></body></html>`;
  return {subject,text,html};
}

async function refundForEmail(db, order, kind) {
  const parsed = refundEmailKind(kind);
  if (!parsed) return null;
  const record = await db.prepare('SELECT status,amount_cents,currency FROM order_refunds WHERE order_id=? AND id=?').bind(order.id,parsed.id).first();
  const job = await db.prepare('SELECT payload_json FROM order_message_jobs WHERE order_id=? AND kind=?').bind(order.id,kind).first();
  if (!record || !job || !(parsed.failed ? record.status === 'FAILED' : ['ACCEPTED','SETTLED'].includes(record.status))) return null;
  const snapshot = JSON.parse(job.payload_json);
  if (snapshot.id !== parsed.id || snapshot.amountCents !== record.amount_cents || snapshot.currency !== record.currency
    || snapshot.currency !== order.currency || (!parsed.failed && (!Number.isSafeInteger(snapshot.refundedCents) || snapshot.refundedCents < snapshot.amountCents))) return null;
  return snapshot;
}

// "sent" remains the compatibility result for API acceptance. Delivery is separate.
export async function sendCustomerEmail(env, order, kind, options = {}) {
  try {
    if (!validEmailKind(kind)) return { status:'blocked', detail:'Invalid email kind.' };
    const refund = kind.startsWith('refund:') ? await refundForEmail(env.DB,order,kind) : null;
    if (kind.startsWith('refund:') && !refund) {
      // Do not retry an unsent success notice after the provider changes to FAILED.
      // Any attempted/ambiguous send is retained for operator review.
      await env.DB.prepare(`UPDATE order_email_delivery SET status='review',detail='Refund status requires review; notification stopped.',updated_at=?
        WHERE order_id=? AND kind=? AND provider_id IS NULL AND status IN ('queued','retry','sending','failed')
          AND (lease_until IS NULL OR lease_until<=?)`).bind(new Date().toISOString(),order.id,kind,new Date().toISOString()).run();
      return { status:'blocked',detail:'Refund status does not match the saved notification instruction.' };
    }
    const parsed = refundEmailKind(kind);
    const config = parsed?.team ? refundAlertConfig(env) : customerEmailConfig(env);
    return await sendOutboxEmail(env, order, kind, config, () => parsed?.failed
      ? buildRefundFailureEmail(order,refund,{policyNote:config.policyNote,team:parsed.team,adminUrl:refundAdminUrl(env,order.id)}) : refund
      ? buildRefundEmail(order,refund,{policyNote:config.policyNote}) : kind === "shipment"
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

// Shipment and refund instructions use the same frozen outbox and transport as
// confirmations. A crash before handoff leaves the pending instruction intact.
export async function processMessageJob(env, order, kind, options = {}) {
  if (!validEmailKind(kind) || kind === 'confirmation') return { status:'blocked',detail:'Invalid message instruction.' };
  try {
    const job = await env.DB.prepare('SELECT status FROM order_message_jobs WHERE order_id=? AND kind=?').bind(order.id,kind).first();
    if (!job || job.status !== 'pending') return { status:'duplicate',detail:'' };
    const legacy = await env.DB.prepare('SELECT status FROM order_emails WHERE order_id=? AND kind=?').bind(order.id,kind).first();
    let row = await getDelivery(env.DB,order.id,kind);
    const shipment = kind === 'shipment' ? await getFulfillment(env.DB,order.id) : undefined;
    if (kind === 'shipment' && !shipment) throw new Error('Shipment instruction has no shipment.');
    const result = !row && legacy?.status === 'skipped' ? {status:'skipped',detail:'Existing skipped email retained.'}
      : await sendCustomerEmail(env,order,kind,{...options,shipment,retry:false,resumeInitialJob:true});
    if (result.status === 'blocked' && kind.startsWith('refund:') && !await refundForEmail(env.DB,order,kind)) {
      await claimOrderEmail(env.DB,order.id,kind);
      await finishOrderEmail(env.DB,order.id,kind,{status:'failed',detail:'Refund status requires review; no new notice sent.'});
      await env.DB.prepare("UPDATE order_message_jobs SET status='skipped',next_attempt_at=NULL,updated_at=? WHERE order_id=? AND kind=? AND status='pending'")
        .bind(new Date().toISOString(),order.id,kind).run();
      return result;
    }
    row = await getDelivery(env.DB,order.id,kind);
    const projection = await env.DB.prepare('SELECT status FROM order_emails WHERE order_id=? AND kind=?').bind(order.id,kind).first();
    const complete = row || (projection && projection.status !== 'pending');
    const timestamp = new Date().toISOString();
    await env.DB.prepare("UPDATE order_message_jobs SET status=?,next_attempt_at=?,updated_at=? WHERE order_id=? AND kind=? AND status='pending'")
      .bind(complete ? (projection?.status === 'skipped' && !row ? 'skipped' : 'handed_off') : 'pending',
        complete ? null : new Date(Date.now()+60_000).toISOString(),timestamp,order.id,kind).run();
    return result;
  } catch {
    console.error('customer_message_job_error',{orderId:order.id,kind,reason:'message handoff failed'});
    return {status:'failed',detail:'Message instruction retained for recovery.'};
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
  const {results: messages} = await env.DB.prepare("SELECT order_id,kind FROM order_message_jobs WHERE status='pending' AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY updated_at,order_id,kind LIMIT 10").bind(timestamp).all();
  for (const item of messages) {
    const order = await getOrder(env.DB,item.order_id);
    if (order) await processMessageJob(env,order,item.kind);
  }
  if (!customerEmailConfig(env) && !refundAlertConfig(env)) return;
  const { results } = await env.DB.prepare("SELECT order_id, kind FROM order_email_delivery WHERE status IN ('queued','retry','sending') AND (next_attempt_at IS NULL OR next_attempt_at <= ?) AND (lease_until IS NULL OR lease_until <= ?) ORDER BY created_at LIMIT 10").bind(timestamp, timestamp).all();
  for (const item of results) {
    const order = await getOrder(env.DB, item.order_id);
    if (order) await retryCustomerEmail(env, order, item.kind);
  }
}
