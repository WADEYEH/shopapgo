// These events describe a payment attempt, not a terminal order failure.
export const FAILURE_EVENTS = new Set([
  "payment_attempt.authentication_failed", "payment_attempt.authorization_failed",
  "payment_attempt.risk_declined", "payment_attempt.failed_to_process",
  "payment_attempt.capture_failed", "payment_attempt.expired",
]);

function safeText(value, limit = 500) {
  if (typeof value !== "string") return "";
  return value.slice(0, 2000)
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[redacted]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[redacted]")
    .replace(/(?:whsec_|Bearer\s+)[A-Za-z0-9_.-]+/gi, "[redacted]")
    .replace(/[\u0000-\u001f]/g, " ").slice(0, limit);
}

export async function recordPaymentFailure(db, event) {
  if (!FAILURE_EVENTS.has(event.name)) return;
  const attempt = event.data?.object;
  if (!attempt || typeof attempt.id !== "string" || !/^[\w-]{1,120}$/.test(attempt.id)
    || typeof attempt.payment_intent_id !== "string") return;
  const order = await db.prepare("SELECT id, status FROM orders WHERE payment_intent_id = ?").bind(attempt.payment_intent_id).first();
  if (!order || (attempt.merchant_order_id && attempt.merchant_order_id !== order.id)) return;
  const details = attempt.failure_details ?? {};
  const occurred = Date.parse(event.created_at || attempt.updated_at || "");
  const at = Number.isFinite(occurred) ? new Date(occurred).toISOString() : new Date().toISOString();
  await db.prepare(`INSERT INTO order_payment_failures
    (attempt_id, order_id, event_id, event_name, failure_code, provider_code, message, trace_id, occurred_at, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(attempt_id) DO UPDATE SET
      event_id=excluded.event_id, event_name=excluded.event_name,
      failure_code=excluded.failure_code, provider_code=excluded.provider_code,
      message=excluded.message, trace_id=excluded.trace_id, occurred_at=excluded.occurred_at,
      received_at=excluded.received_at
    WHERE excluded.occurred_at >= order_payment_failures.occurred_at
      AND excluded.event_id != order_payment_failures.event_id`)
    .bind(attempt.id, order.id, safeText(event.id, 180), event.name,
      safeText(attempt.failure_code, 100), safeText(details.code, 100),
      safeText(details.message), safeText(details.trace_id, 120), at, new Date().toISOString()).run();
}

export async function listPaymentFailures(db, orderId) {
  const { results } = await db.prepare(`SELECT attempt_id AS attemptId, event_name AS event,
    failure_code AS code, provider_code AS providerCode, message, trace_id AS traceId,
    occurred_at AS occurredAt FROM order_payment_failures WHERE order_id = ?
    ORDER BY occurred_at DESC, attempt_id DESC LIMIT 100`).bind(orderId).all();
  return results;
}

export async function publicPaymentFailure(db, order) {
  if (order.status !== "pending") return null;
  const failure = (await listPaymentFailures(db, order.id))[0];
  if (!failure) return null;
  const category = failure.code || failure.event.split(".")[1];
  const messages = {
    authentication_failed: "Card verification wasn't completed. Try again or use another payment method.",
    provider_unavailable: "The payment service is temporarily unavailable. Please try again shortly.",
    system_unavailable: "The payment service is temporarily unavailable. Please try again shortly.",
    expired: "The payment attempt expired. Please return to checkout and try again.",
  };
  // Provider messages, risk details and tracing identifiers are admin-only.
  return { message: messages[category] || "Your payment wasn't completed. Check your card details or try another payment method." };
}
