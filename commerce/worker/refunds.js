// Refunds are initiated in Airwallex. This module only reads provider state and
// records minimal, order-scoped metadata; it never creates a refund or shipment.
import { retrieveRefund, listRefunds } from './airwallex.js';

export const REFUND_EVENTS = new Set(['refund.received', 'refund.accepted', 'refund.settled', 'refund.failed']);
const STATUSES = new Set(['RECEIVED', 'ACCEPTED', 'SETTLED', 'FAILED']);
const validId = value => typeof value === 'string' && /^[\w-]{1,120}$/.test(value);
const safeCode = value => typeof value === 'string' && /^[\w.-]{1,100}$/.test(value) ? value : '';

function validate(order, refund) {
  const cents = Math.round(Number(refund?.amount) * 100);
  if (!validId(refund?.id) || refund.payment_intent_id !== order.payment_intent_id
    || refund.currency !== order.currency || !STATUSES.has(refund.status)
    || typeof refund.amount !== 'number' || !Number.isSafeInteger(cents) || cents <= 0 || cents > order.total_cents
    || Math.abs(Number(refund.amount) * 100 - cents) > 0.000001
    || !Number.isFinite(Date.parse(refund.updated_at)) || !Number.isFinite(Date.parse(refund.created_at))) {
    throw new Error('Refund data does not match the stored order.');
  }
  return cents;
}

export async function saveRefund(db, order, refund) {
  const cents = validate(order, refund);
  const previous = await db.prepare('SELECT order_id, amount_cents, currency FROM order_refunds WHERE id = ?').bind(refund.id).first();
  if (previous && (previous.order_id !== order.id || previous.amount_cents !== cents || previous.currency !== refund.currency)) {
    throw new Error('Refund identity conflicts with its stored record.');
  }
  const updated = new Date(refund.updated_at).toISOString();
  const timestamp = new Date().toISOString();
  // A newly accepted refund owns one instruction. Its amount/cumulative total
  // freeze at that transition; accepted -> settled and historical replays do
  // not create another notice. Commit this with the observation, never after it.
  const results = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO order_message_jobs
      (order_id,kind,payload_json,status,created_at,updated_at)
      SELECT ?,?,json_object('id',?,'amountCents',?,'currency',?,
        'refundedCents',? + COALESCE((SELECT SUM(amount_cents) FROM order_refunds
          WHERE order_id=? AND status IN ('ACCEPTED','SETTLED')),0)), 'pending',?,?
      WHERE ? IN ('ACCEPTED','SETTLED') AND ?='paid'
        AND NOT EXISTS (SELECT 1 FROM order_refunds WHERE id=? AND
          (status IN ('ACCEPTED','SETTLED') OR provider_updated_at>? OR order_id!=? OR amount_cents!=? OR currency!=?))`)
      .bind(order.id,`refund:${refund.id}`,refund.id,cents,refund.currency,cents,order.id,
        timestamp,timestamp,refund.status,order.status,refund.id,updated,order.id,cents,refund.currency),
    db.prepare(`INSERT INTO order_refunds
    (id,order_id,payment_intent_id,amount_cents,currency,status,failure_code,provider_created_at,provider_updated_at,received_at)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      status=excluded.status, failure_code=excluded.failure_code,
      provider_updated_at=excluded.provider_updated_at, received_at=excluded.received_at
    WHERE excluded.order_id=order_refunds.order_id AND excluded.amount_cents=order_refunds.amount_cents
      AND excluded.currency=order_refunds.currency AND excluded.provider_updated_at >= order_refunds.provider_updated_at
      AND NOT (order_refunds.status='SETTLED' AND excluded.status!='SETTLED')
      AND NOT (order_refunds.status IN ('ACCEPTED','FAILED') AND excluded.status='RECEIVED')`)
    .bind(refund.id, order.id, order.payment_intent_id, cents, refund.currency, refund.status,
      safeCode(refund.failure_details?.code), new Date(refund.created_at).toISOString(),
      updated, timestamp),
  ]);
  return results[0].meta.changes > 0 ? `refund:${refund.id}` : null;
}

export async function refundHold(db, orderId) {
  return Boolean(await db.prepare("SELECT id FROM order_refunds WHERE order_id = ? AND status != 'FAILED' LIMIT 1").bind(orderId).first());
}

export async function refundView(db, order) {
  const { results } = await db.prepare(`SELECT id,amount_cents AS amountCents,currency,status,
    failure_code AS failureCode,provider_created_at AS createdAt,provider_updated_at AS updatedAt
    FROM order_refunds WHERE order_id = ? ORDER BY provider_created_at DESC, id`).bind(order.id).all();
  const refundedCents = results.filter(item => ['ACCEPTED','SETTLED'].includes(item.status)).reduce((sum,item) => sum + item.amountCents,0);
  const pendingCents = results.filter(item => item.status === 'RECEIVED').reduce((sum,item) => sum + item.amountCents,0);
  return { records:results, refundedCents, pendingCents,
    hold:results.some(item=>item.status !== 'FAILED'),
    status:refundedCents >= order.total_cents ? 'fully_refunded' : pendingCents ? 'refund_pending' : refundedCents ? 'partially_refunded' : 'none' };
}

export async function handleRefundEvent(env, event) {
  if (!REFUND_EVENTS.has(event.name)) return;
  const snapshot = event.data?.object;
  if (!validId(snapshot?.id) || !validId(snapshot.payment_intent_id)) throw new Error('Invalid refund event.');
  const order = await env.DB.prepare('SELECT * FROM orders WHERE payment_intent_id = ?').bind(snapshot.payment_intent_id).first();
  if (!order) return; // other integrations in the same account are not imported
  // Always read current provider state, including fresh, replayed and late events.
  const current = await retrieveRefund(env, snapshot.id);
  if (current.id !== snapshot.id) throw new Error('Refund response identity does not match.');
  const kind = await saveRefund(env.DB, order, current);
  return kind ? { order, kind } : null;
}

export async function syncOrderRefunds(env, order) {
  if (!validId(order.payment_intent_id)) throw new Error('This order has no payment intent.');
  const page = await listRefunds(env, order.payment_intent_id);
  if (!Array.isArray(page?.items) || page.has_more) throw new Error('Refund list is incomplete; review the payment provider.');
  for (const item of page.items) validate(order,item);
  // Preserve creation order when multiple newly accepted refunds are observed
  // together, so their frozen cumulative summaries progress consistently.
  for (const item of [...page.items].sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at) || a.id.localeCompare(b.id))) await saveRefund(env.DB,order,item);
  return refundView(env.DB,order);
}
