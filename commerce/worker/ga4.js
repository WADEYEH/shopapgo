// GA4 events the Worker sends itself, with the Measurement Protocol (K3, M10-03): a refund, once the payment provider
// accepted it, so GA4 takes it off the order's revenue (the browser sends the purchase through GTM; a refund happens
// where no browser is).
//
//   * The visitor's GA client id (the _ga cookie) is kept at checkout (saveGaClient), so the refund joins the same user.
//   * worker/refunds.js recordRefund queues one "refund:<refund id>" row the moment a refund is first accepted.
//   * Cron job "ga4" sends what is due: only in production with GA4_MEASUREMENT_ID (a var) and GA4_API_SECRET (a secret,
//     created in GA4 at the cutover, D58). Staging and local never send (M10-04). Rows that could not be sent for 7 days
//     are skipped; a network failure is retried with a growing wait, 6 times at most.
const MP_URL = "https://www.google-analytics.com/mp/collect";
const DAY_MS = 24 * 60 * 60_000;
const MAX_ATTEMPTS = 6;
const BATCH = 20;
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const clip = (value, max) => String(value ?? "").slice(0, max);

export function ga4Configured(env = {}) {
  return env.SITE_ENV !== "staging" && /^G-[A-Z0-9]{4,20}$/.test(String(env.GA4_MEASUREMENT_ID ?? "")) && Boolean(String(env.GA4_API_SECRET ?? "").trim());
}

// "GA1.1.1234567890.1700000000" -> "1234567890.1700000000"; anything else -> null.
export function gaClientIdFrom(cookieHeader) {
  const match = /(?:^|;\s*)_ga=GA\d\.\d\.(\d{1,20}\.\d{1,20})(?:;|$)/.exec(String(cookieHeader ?? ""));
  return match ? match[1] : null;
}

// At checkout (worker/index.js). Never throws.
export async function saveGaClient(db, orderId, request, { nowMs = Date.now() } = {}) {
  try {
    const clientId = gaClientIdFrom(request.headers.get("Cookie"));
    if (!clientId) return false;
    await db
      .prepare("INSERT INTO order_analytics (order_id, ga_client_id, created_at) VALUES (?, ?, ?) ON CONFLICT(order_id) DO UPDATE SET ga_client_id = excluded.ga_client_id")
      .bind(orderId, clientId, iso(nowMs))
      .run();
    return true;
  } catch (error) {
    console.error("ga_client_save_failed", { orderId, reason: error?.name });
    return false;
  }
}

// The Measurement Protocol body for one queued event.
export function ga4Body(row, clientId) {
  const payload = JSON.parse(row.payload_json);
  return {
    // Without the visitor's id GA4 still takes the refund off the transaction; a stable stand-in keeps it one "user".
    client_id: clientId ?? `apgo.${row.order_id.replace(/\D/g, "").slice(-10) || "0"}`,
    non_personalized_ads: true,
    events: [{
      name: "refund",
      params: { currency: payload.currency, value: Math.round(payload.amountCents) / 100, transaction_id: row.order_id, refund_id: payload.refundId },
    }],
  };
}

async function send(env, row) {
  const db = env.DB;
  const client = await db.prepare("SELECT ga_client_id FROM order_analytics WHERE order_id = ?").bind(row.order_id).first().catch(() => null);
  const url = `${MP_URL}?measurement_id=${encodeURIComponent(env.GA4_MEASUREMENT_ID)}&api_secret=${encodeURIComponent(String(env.GA4_API_SECRET).trim())}`;
  const at = iso();
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ga4Body(row, client?.ga_client_id ?? null)) });
    if (!response.ok) throw new Error(`GA4 answered HTTP ${response.status}`);
    await db.prepare("UPDATE order_ga_events SET status = 'sent', attempts = attempts + 1, sent_at = ?, detail = '', next_attempt_at = NULL, updated_at = ? WHERE order_id = ? AND kind = ?")
      .bind(at, at, row.order_id, row.kind).run();
    return "sent";
  } catch (error) {
    const attempts = row.attempts + 1;
    const done = attempts >= MAX_ATTEMPTS;
    await db.prepare("UPDATE order_ga_events SET status = ?, attempts = ?, detail = ?, next_attempt_at = ?, updated_at = ? WHERE order_id = ? AND kind = ?")
      .bind(done ? "failed" : "pending", attempts, clip(error?.message, 200), done ? null : iso(Date.now() + 2 ** attempts * 60_000), at, row.order_id, row.kind).run();
    return done ? "failed" : "retry";
  }
}

// Cron job "ga4".
export async function scheduledGa4Events(env, { nowMs = Date.now() } = {}) {
  const db = env.DB;
  const at = iso(nowMs);
  let stale;
  try {
    stale = await db.prepare("UPDATE order_ga_events SET status = 'skipped', detail = 'Not sent within 7 days (GA4 not set up).', next_attempt_at = NULL, updated_at = ? WHERE status = 'pending' AND created_at <= ?")
      .bind(at, iso(nowMs - 7 * DAY_MS)).run();
  } catch {
    return { ran: false }; // a database without order_ga_events (before migration 0012)
  }
  if (!ga4Configured(env)) return { ran: false, skipped: stale.meta?.changes ?? 0 };
  const { results } = await db
    .prepare("SELECT * FROM order_ga_events WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY created_at LIMIT ?")
    .bind(at, BATCH)
    .all();
  const summary = { ran: true, sent: 0, retry: 0, failed: 0 };
  for (const row of results) summary[await send(env, row)] += 1;
  return summary;
}
