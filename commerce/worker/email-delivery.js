// Durable outbox + Resend transport. Payment/fulfillment state is never changed here.
// Retries reuse a frozen payload and key inside Resend's 24-hour window; after
// 23 hours an ambiguous send stops for review instead of risking a duplicate.
import { claimOrderEmail, finishOrderEmail } from './orders.js';
import { fail, json } from './http.js';

const iso = (ms) => new Date(ms).toISOString();
const MAX_ATTEMPTS = 6;
const SAFE_WINDOW_MS = 23 * 60 * 60_000;
const LEASE_MS = 60_000;
const TERMINAL = new Set(['accepted', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'suppressed', 'review']);
const EVENT_STATUS = { 'email.sent': 'accepted', 'email.delivered': 'delivered', 'email.delivery_delayed': 'delivery_delayed', 'email.bounced': 'bounced', 'email.complained': 'complained', 'email.suppressed': 'suppressed', 'email.failed': 'failed' };

export const getDelivery = (db, orderId, kind) => db.prepare('SELECT * FROM order_email_delivery WHERE order_id = ? AND kind = ?').bind(orderId, kind).first();
export function refundEmailKind(kind) {
  const match = /^refund:(?:(failed|team-failed):)?([\w-]{1,120})$/.exec(kind);
  return match ? { id: match[2], failed: Boolean(match[1]), team: match[1] === 'team-failed' } : null;
}
export const validEmailKind = kind => ['confirmation','shipment'].includes(kind) || Boolean(refundEmailKind(kind));

// The frozen recipient also owns bounce suppression. Staff alerts must never
// suppress the customer address or silently move to a new configured mailbox.
function deliveryRecipient(row) {
  try {
    const to = JSON.parse(row.payload_json).to;
    return Array.isArray(to) && to.length === 1 && typeof to[0] === 'string' ? to[0] : null;
  } catch { return null; }
}

export function allowedEmailRecipient(env, email) {
  if (env.SITE_ENV !== 'staging') return true;
  const allowed = String(env.CUSTOMER_EMAIL_TEST_RECIPIENTS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(String(email).toLowerCase()); // staging fails closed; never reroute customer data
}

async function project(db, row) {
  const status = ['accepted', 'delivered', 'delivery_delayed'].includes(row.status) ? 'sent' : ['queued', 'sending'].includes(row.status) ? 'pending' : 'failed';
  await finishOrderEmail(db, row.order_id, row.kind, { status, detail: row.detail });
}

export async function reconcileDelivery(db, providerId, timestamp = Date.now()) {
  const row = await db.prepare('SELECT * FROM order_email_delivery WHERE provider_id = ?').bind(providerId).first();
  if (!row) return; // events may arrive before the send response; retain for later reconciliation
  // Compute in SQL so concurrent and out-of-order deliveries cannot overwrite a
  // complaint/bounce with an earlier accepted/delivered event.
  await db.prepare(`UPDATE order_email_delivery SET status = CASE
    WHEN status = 'complained' OR EXISTS(SELECT 1 FROM customer_email_events WHERE provider_id = ? AND event_type = 'email.complained') THEN 'complained'
    WHEN status = 'bounced' OR EXISTS(SELECT 1 FROM customer_email_events WHERE provider_id = ? AND event_type = 'email.bounced') THEN 'bounced'
    WHEN status = 'suppressed' OR EXISTS(SELECT 1 FROM customer_email_events WHERE provider_id = ? AND event_type = 'email.suppressed') THEN 'suppressed'
    WHEN status = 'failed' OR EXISTS(SELECT 1 FROM customer_email_events WHERE provider_id = ? AND event_type = 'email.failed') THEN 'failed'
    WHEN status = 'delivered' OR EXISTS(SELECT 1 FROM customer_email_events WHERE provider_id = ? AND event_type = 'email.delivered') THEN 'delivered'
    WHEN status = 'delivery_delayed' OR EXISTS(SELECT 1 FROM customer_email_events WHERE provider_id = ? AND event_type = 'email.delivery_delayed') THEN 'delivery_delayed'
    ELSE 'accepted' END, updated_at = ? WHERE provider_id = ?`).bind(providerId, providerId, providerId, providerId, providerId, providerId, iso(timestamp), providerId).run();
  const status = (await getDelivery(db, row.order_id, row.kind)).status;
  if (['bounced', 'complained', 'suppressed'].includes(status)) {
    const recipient = deliveryRecipient(row);
    if (recipient) await db.prepare('INSERT OR IGNORE INTO customer_email_suppressions (email, reason, created_at) VALUES (?, ?, ?)').bind(recipient.toLowerCase(), status, iso(timestamp)).run();
  }
  await db.prepare("UPDATE order_email_delivery SET detail = CASE WHEN status = 'accepted' THEN 'Accepted by email service; delivery not confirmed.' ELSE 'Email ' || replace(status, '_', ' ') || '.' END WHERE provider_id = ?").bind(providerId).run();
  await project(db, await getDelivery(db, row.order_id, row.kind));
}

async function postEmail(config, row, fetchImpl) {
  let apiUrl;
  try { apiUrl = new URL(config.apiUrl); } catch { return { retry: false, detail: 'Email API URL is invalid.' }; }
  if (apiUrl.protocol !== 'https:' || apiUrl.username || apiUrl.password) return { retry: false, detail: 'Email API must use HTTPS without URL credentials.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    // Workers supports manual redirects here. Never follow a redirect carrying the key.
    const response = await fetchImpl(config.apiUrl, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}`, 'Idempotency-Key': row.request_key }, body: row.payload_json, signal: controller.signal });
    if (response.status >= 300 && response.status < 400) return { retry: false, detail: 'Email service returned an unexpected redirect; no credentials forwarded.' };
    const raw = await limitedBody(response);
    let body; try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    if (response.ok && typeof body?.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(body.id)) return { providerId: body.id };
    const retry = response.ok || response.status === 429 || response.status >= 500 || (response.status === 409 && body?.name === 'concurrent_idempotent_requests');
    const retryHeader = response.headers.get('Retry-After');
    const seconds = retryHeader && /^\d+$/.test(retryHeader) ? Number(retryHeader) : retryHeader ? (Date.parse(retryHeader) - Date.now()) / 1000 : 0;
    return { retry, delayMs: Math.min(Math.max(seconds * 1000 || 0, 0), SAFE_WINDOW_MS), detail: response.ok ? 'Email service response is missing its message ID; retry safely.' : `Email service returned HTTP ${response.status}.` };
  } catch (error) {
    // Never persist the raw error: invalid-header errors may contain credentials.
    const message = String(error?.message || '');
    const reason = controller.signal.aborted ? 'timed out'
      : /redirect/i.test(message) ? 'rejected the redirect policy'
      : /illegal invocation/i.test(message) ? 'could not invoke the transport'
      : /header|ByteString|invalid character/i.test(message) ? 'rejected an invalid request header'
      : 'could not be reached';
    return { retry: true, detail: `Email service ${reason}; retry safely.` };
  } finally { clearTimeout(timer); }
}

export async function sendOutboxEmail(env, order, kind, config, makeMessage, { retry = false, resumeInitialJob = false, fetchImpl = fetch, nowMs = Date.now() } = {}) {
  // Refund notices also go out for an order cancelled after payment (worker/order-core.js); nothing else does.
  const sendable = order.status === 'paid' || (order.status === 'cancelled' && Boolean(order.paid_at) && Boolean(refundEmailKind(kind)));
  if (!validEmailKind(kind) || !sendable) return { status: 'blocked', detail: 'A paid order and valid email kind are required.' };
  const db = env.DB;
  const legacy = await db.prepare('SELECT status FROM order_emails WHERE order_id = ? AND kind = ?').bind(order.id, kind).first();
  let row = await getDelivery(db, order.id, kind);
  // Only a transaction-created instruction proves that a pending legacy claim
  // interrupted before outbox creation is safe to resume. Old ambiguous claims
  // remain protected; sending always happens after the frozen outbox is saved.
  const jobTable = kind === 'confirmation' ? 'order_email_jobs' : 'order_message_jobs';
  const resumable = resumeInitialJob && legacy?.status === 'pending'
    && await db.prepare(`SELECT order_id FROM ${jobTable} WHERE order_id = ? AND kind = ? AND status = 'pending'`).bind(order.id, kind).first();
  if (!row && legacy && legacy.status !== 'skipped' && !resumable) return { status: 'duplicate', detail: 'Existing email record retained; no new send.' };
  if (row && !retry) return { status: 'duplicate', detail: '' };
  if (row && (row.provider_id || TERMINAL.has(row.status))) return { status: 'blocked', detail: 'This email cannot be retried safely.' };
  await claimOrderEmail(db, order.id, kind);
  const recipient = row ? deliveryRecipient(row) : config?.recipient || order.email;
  if (!config || !recipient || !allowedEmailRecipient(env, recipient) || !allowedEmailRecipient(env, order.email)) {
    const detail = config ? 'Recipient is not in the staging email allowlist.' : 'Email sending is not configured for this recipient.';
    if (!row) await finishOrderEmail(db, order.id, kind, { status: 'skipped', detail });
    return { status: 'skipped', detail };
  }
  if (await db.prepare('SELECT email FROM customer_email_suppressions WHERE email = ?').bind(recipient.toLowerCase()).first()) {
    if (row) await db.prepare("UPDATE order_email_delivery SET status = 'suppressed', detail = 'Recipient is suppressed.', updated_at = ? WHERE order_id = ? AND kind = ?").bind(iso(nowMs), order.id, kind).run();
    await finishOrderEmail(db, order.id, kind, { status: 'failed', detail: 'Recipient is suppressed; no email sent.' });
    return { status: 'blocked', detail: 'Recipient is suppressed; no email sent.' };
  }
  if (!row) {
    const message = makeMessage();
    const payload = { from: config.from, to: [recipient], ...message };
    if (config.replyTo) payload.reply_to = config.replyTo;
    await db.prepare("INSERT OR IGNORE INTO order_email_delivery (order_id,kind,status,payload_json,request_key,created_at,updated_at) VALUES (?,?,'queued',?,?,?,?)").bind(order.id, kind, JSON.stringify(payload), `apgo/${order.id}/${kind}`, iso(nowMs), iso(nowMs)).run();
    row = await getDelivery(db, order.id, kind);
  }
  // A concurrent preparation can win INSERT OR IGNORE with a different frozen
  // recipient. Re-check that actual payload before claiming the transport.
  const frozenRecipient = deliveryRecipient(row);
  if (!frozenRecipient || !allowedEmailRecipient(env, frozenRecipient)) {
    await db.prepare("UPDATE order_email_delivery SET status='review',detail='Frozen recipient is not approved; review before sending.',updated_at=? WHERE order_id=? AND kind=? AND provider_id IS NULL AND status IN ('queued','retry','sending','failed') AND (lease_until IS NULL OR lease_until<=?)")
      .bind(iso(nowMs),order.id,kind,iso(nowMs)).run();
    await project(db,await getDelivery(db,order.id,kind));
    return {status:'blocked',detail:'Frozen recipient is not approved; review before sending.'};
  }
  if (frozenRecipient !== recipient && await db.prepare('SELECT email FROM customer_email_suppressions WHERE email=?').bind(frozenRecipient.toLowerCase()).first()) {
    await db.prepare("UPDATE order_email_delivery SET status='suppressed',detail='Recipient is suppressed.',updated_at=? WHERE order_id=? AND kind=? AND provider_id IS NULL AND (lease_until IS NULL OR lease_until<=?)")
      .bind(iso(nowMs),order.id,kind,iso(nowMs)).run();
    await project(db,await getDelivery(db,order.id,kind));
    return {status:'blocked',detail:'Recipient is suppressed; no email sent.'};
  }
  if (row.first_attempt_at && nowMs - Date.parse(row.first_attempt_at) >= SAFE_WINDOW_MS) {
    await db.prepare("UPDATE order_email_delivery SET status = 'review', detail = 'Retry window expired; review provider history before sending again.', updated_at = ? WHERE order_id = ? AND kind = ? AND status IN ('queued','retry','sending','failed') AND (lease_until IS NULL OR lease_until <= ?)").bind(iso(nowMs), order.id, kind, iso(nowMs)).run();
    await project(db, await getDelivery(db, order.id, kind));
    return { status: 'blocked', detail: 'Retry window expired; review provider history before sending again.' };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    await db.prepare("UPDATE order_email_delivery SET status = 'review', detail = 'Retry limit reached; review provider history.', updated_at = ? WHERE order_id = ? AND kind = ? AND status IN ('queued','retry','sending') AND (lease_until IS NULL OR lease_until <= ?)").bind(iso(nowMs), order.id, kind, iso(nowMs)).run();
    await project(db, await getDelivery(db, order.id, kind));
    return { status: 'blocked', detail: 'Retry limit reached; review provider history.' };
  }
  const token = crypto.randomUUID();
  const claim = await db.prepare(`UPDATE order_email_delivery SET status = 'sending', attempts = attempts + 1, lease_until = ?, lease_token = ?, first_attempt_at = COALESCE(first_attempt_at, ?), updated_at = ? WHERE order_id = ? AND kind = ? AND status IN ('queued','retry','sending','failed') AND attempts < ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?) AND (lease_until IS NULL OR lease_until <= ?)
    AND (kind NOT LIKE 'refund:%' OR EXISTS (SELECT 1 FROM order_refunds r WHERE r.order_id=order_email_delivery.order_id AND (
      ('refund:'||r.id=order_email_delivery.kind AND r.status IN ('ACCEPTED','SETTLED')) OR
      (order_email_delivery.kind IN ('refund:failed:'||r.id,'refund:team-failed:'||r.id) AND r.status='FAILED'))))`)
    .bind(iso(nowMs + LEASE_MS), token, iso(nowMs), iso(nowMs), order.id, kind, MAX_ATTEMPTS, iso(nowMs), iso(nowMs)).run();
  if (!claim.meta.changes) return { status: 'duplicate', detail: 'Email is already processing or not due for retry.' };
  row = await getDelivery(db, order.id, kind);
  await project(db, row);
  const outcome = await postEmail(config, row, fetchImpl);
  const status = outcome.providerId ? 'accepted' : outcome.retry && row.attempts < MAX_ATTEMPTS ? 'retry' : 'failed';
  const detail = outcome.providerId ? 'Accepted by email service; delivery not confirmed.' : outcome.detail;
  // Persist next attempt, don't sleep inside a Worker. Provider Retry-After is honored.
  const next = status === 'retry' ? iso(nowMs + Math.max(outcome.delayMs || 0, 60_000 * 2 ** (row.attempts - 1))) : null;
  await db.prepare('UPDATE order_email_delivery SET status = ?, provider_id = ?, detail = ?, next_attempt_at = ?, lease_until = NULL, lease_token = NULL, updated_at = ? WHERE order_id = ? AND kind = ? AND lease_token = ?').bind(status, outcome.providerId || null, detail, next, iso(nowMs), order.id, kind, token).run();
  if (outcome.providerId) await reconcileDelivery(db, outcome.providerId, nowMs);
  else await project(db, await getDelivery(db, order.id, kind));
  return { status: outcome.providerId ? 'sent' : 'failed', detail, providerId: outcome.providerId || null };
}

// Standard Svix HMAC verification with Web Crypto; raw body is never reserialized.
// https://docs.svix.com/receiving/verifying-payloads/how-manual
export async function verifyResendSignature(request, secret, raw, nowMs = Date.now()) {
  const id = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signatures = request.headers.get('svix-signature') || '';
  if (!id || id.length > 200 || !/^\d+$/.test(timestamp || '') || Math.abs(nowMs / 1000 - Number(timestamp)) > 300 || !secret?.startsWith('whsec_')) return false;
  try {
    const bytes = Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    for (const part of signatures.split(' ').slice(0, 10)) {
      if (!part.startsWith('v1,')) continue;
      let signature;
      try { signature = Uint8Array.from(atob(part.slice(3)), (c) => c.charCodeAt(0)); } catch { continue; }
      if (await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(`${id}.${timestamp}.${raw}`))) return true;
    }
  } catch { /* missing/invalid secret fails closed */ }
  return false;
}

async function limitedBody(request, limit = 64 * 1024) {
  if (Number(request.headers.get('content-length')) > limit) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = []; let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const data = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(data);
}

export async function handleResendWebhook(request, env) {
  const raw = await limitedBody(request);
  if (raw === null) return fail(413, 'payload_too_large', 'Webhook payload too large.');
  if (!(await verifyResendSignature(request, env.RESEND_WEBHOOK_SECRET, raw))) return fail(400, 'invalid_signature', 'Webhook signature verification failed.');
  let event;
  try { event = JSON.parse(raw); } catch { return fail(400, 'invalid_payload', 'Invalid webhook payload.'); }
  if (!EVENT_STATUS[event?.type]) return json({ ignored: true });
  const providerId = event.data?.email_id;
  if (typeof providerId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(providerId) || !Number.isFinite(Date.parse(event.created_at))) return fail(400, 'invalid_payload', 'Invalid email event.');
  const result = await env.DB.prepare('INSERT OR IGNORE INTO customer_email_events (id,provider_id,event_type,occurred_at,received_at) VALUES (?,?,?,?,?)').bind(request.headers.get('svix-id'), providerId, event.type, iso(Date.parse(event.created_at)), iso(Date.now())).run();
  // Reconcile on duplicate too: if a prior DB operation failed the provider's retry repairs it.
  await reconcileDelivery(env.DB, providerId);
  return json({ duplicate: !result.meta.changes });
}
