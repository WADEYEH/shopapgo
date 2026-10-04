// Meta Conversions API (CAPI), server side. Production only: every function is a no-op unless META_DATASET_ID is set
// (it is set only in wrangler.toml [env.production.vars]), so staging and local runs are untouched.
//
//   Event            When                                                   event_id
//   InitiateCheckout the Airwallex PaymentIntent was created                ic_<merchant_order_id>
//   Purchase         the order moved pending -> paid (afterSettle, once)    purchase_<merchant_order_id>
//
// merchant_order_id is our order id (APGO-US-XXXXXXXXXXXX). The browser Pixel uses the same ids as eventID, so Meta
// deduplicates the browser and server copies. Purchase value = what the customer paid: D1 total_cents / 100, USD.
//
// Delivery guarantees
//   * order_meta_events (PK order_id + event_name) is claimed atomically before anything is sent, so a webhook
//     redelivery, the confirmation-page poll and parallel requests send each event once.
//   * Network errors, timeouts, 429 and 5xx are retried up to 3 times in the same request (400 ms, 800 ms back-off).
//     Anything still failing is stored as `failed` and re-sent by the cron (scheduled()) with the SAME event_id and
//     event_time, with growing delays, until it succeeds, reaches the attempt cap or is older than 6 days (Meta accepts
//     events up to 7 days old).
//   * Nothing here ever throws to a caller and nothing here can change a payment, an order or a webhook response.
//
// Secrets: META_CAPI_ACCESS_TOKEN (wrangler secret, never in code/toml/tests/logs). Optional META_TEST_EVENT_CODE.
// Logs contain only: time, event name/id, HTTP status, events_received, fbtrace_id, attempts. Never PII, IP or token.

import { loadAttribution } from "./meta-attribution.js";

// Latest Graph API version on 2026-10-05 (v26.0, released 2026-07-29; v20.0 was removed 2026-09-24).
export const META_GRAPH_VERSION = "v26.0";
export const META_GRAPH_BASE = "https://graph.facebook.com";

export const EVENT_NAMES = ["InitiateCheckout", "Purchase"];
const EVENT_ID_PREFIX = { InitiateCheckout: "ic_", Purchase: "purchase_" };
export const metaEventId = (eventName, orderId) => `${EVENT_ID_PREFIX[eventName]}${orderId}`;

const TIMEOUT_MS = 8_000;
const MAX_TRIES = 3;
const STALE_SENDING_MS = 10 * 60_000;
const MAX_TOTAL_ATTEMPTS = 24;
const MAX_EVENT_AGE_S = 6 * 24 * 3600;
const CRON_BATCH = 25;
const SWEEP_GRACE_MS = 3 * 60_000;

const clip = (value, max) => String(value ?? "").slice(0, max);
const safeToken = (value, max = 40) => clip(value, max).replace(/[^A-Za-z0-9_.-]/g, "");
const nowIso = () => new Date().toISOString();

// ---------- configuration ----------

export function metaConfig(env = {}) {
  const datasetId = String(env.META_DATASET_ID ?? "").trim();
  const enabled = /^\d{6,20}$/.test(datasetId);
  const token = String(env.META_CAPI_ACCESS_TOKEN ?? "").trim();
  const testCode = String(env.META_TEST_EVENT_CODE ?? "").trim();
  return {
    enabled, // no dataset id = the whole feature is off (staging, local)
    datasetId: enabled ? datasetId : "",
    token,
    ready: enabled && Boolean(token),
    testEventCode: /^[A-Za-z0-9_-]{1,40}$/.test(testCode) ? testCode : "",
  };
}

export const metaEnabled = (env) => metaConfig(env).enabled;

// ---------- hashing / normalisation (Meta "customer information parameters") ----------

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const normalizeEmail = (value) => String(value ?? "").trim().toLowerCase();

// Digits only, leading zeros dropped, US country code 1 added to a 10-digit number. Too short/long numbers are dropped.
export function normalizePhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 10) digits = `1${digits}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : "";
}

// Lowercase, no punctuation or symbols (letters, digits and inner spaces are kept; UTF-8 letters stay as they are).
export const normalizeName = (value) =>
  String(value ?? "").trim().toLowerCase().replace(/[\p{P}\p{S}]/gu, "").replace(/\s+/g, " ").trim();

// Lowercase letters only: no spaces, punctuation or digits.
export const normalizeCity = (value) => String(value ?? "").toLowerCase().replace(/[^\p{L}]/gu, "");

export function normalizeState(value) {
  const state = String(value ?? "").trim().toLowerCase();
  return /^[a-z]{2}$/.test(state) ? state : "";
}

// First five digits of a US ZIP (ZIP+4 loses the extension).
export function normalizeZip(value) {
  const digits = String(value ?? "").toLowerCase().replace(/[\s-]/g, "").match(/^\d{5}/);
  return digits ? digits[0] : "";
}

async function hashed(normalized) {
  return normalized ? [await sha256Hex(normalized)] : undefined;
}

// user_data for CAPI: hashed contact fields (arrays of SHA-256 hex) + the unhashed technical identifiers.
// Only fields that have a value are included. `phone` is used when the order has one (the checkout does not collect it today).
export async function buildUserData({ email, shipping = {}, phone, attribution = null }) {
  const fields = {
    em: await hashed(normalizeEmail(email)),
    ph: await hashed(normalizePhone(phone ?? shipping.phone)),
    fn: await hashed(normalizeName(shipping.firstName)),
    ln: await hashed(normalizeName(shipping.lastName)),
    zp: await hashed(normalizeZip(shipping.zip)),
    ct: await hashed(normalizeCity(shipping.city)),
    st: await hashed(normalizeState(shipping.state)),
    country: await hashed("us"),
  };
  const plain = {
    client_ip_address: attribution?.clientIp,
    client_user_agent: attribution?.clientUserAgent,
    fbc: attribution?.fbc,
    fbp: attribution?.fbp,
  };
  const out = {};
  for (const [key, value] of Object.entries({ ...fields, ...plain })) if (value && value.length !== 0) out[key] = value;
  return out;
}

// ---------- event payload ----------

const dollars = (cents) => Math.round(Number(cents)) / 100;

function customData(order) {
  let lines = [];
  try {
    lines = JSON.parse(order.lines_json);
  } catch {
    lines = [];
  }
  const items = lines.filter((line) => line?.sku && Number(line.qty) > 0);
  return {
    value: dollars(order.total_cents), // what the customer paid, from D1 cents
    currency: "USD",
    content_type: "product",
    content_ids: [...new Set(items.map((line) => String(line.sku)))],
    contents: items.map((line) => ({ id: String(line.sku), quantity: Number(line.qty), item_price: dollars(line.unitCents) })),
    order_id: order.id,
  };
}

export async function buildEvent({ order, eventName, eventId, eventTime, attribution }) {
  let shipping = {};
  try {
    shipping = JSON.parse(order.shipping_json) ?? {};
  } catch {
    shipping = {};
  }
  return {
    event_name: eventName,
    event_time: eventTime,
    event_id: eventId,
    action_source: "website",
    ...(attribution?.sourceUrl ? { event_source_url: attribution.sourceUrl } : {}),
    user_data: await buildUserData({ email: order.email, shipping, attribution }),
    custom_data: customData(order),
  };
}

export function buildRequestBody(event, config) {
  return { data: [event], ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}) };
}

// ---------- HTTP ----------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const baseDelay = (env) => {
  const configured = Number(env.META_CAPI_RETRY_DELAY_MS);
  return env.META_CAPI_RETRY_DELAY_MS !== undefined && env.META_CAPI_RETRY_DELAY_MS !== "" && Number.isFinite(configured) && configured >= 0 ? configured : 400;
};
const backoffMs = (env, attempt) => baseDelay(env) * 2 ** attempt;

// Short, PII-free description of a failure: HTTP status and Meta's error codes, never Meta's free-text message.
function describeFailure(status, body) {
  const error = body?.error ?? {};
  const parts = [`http_${status}`];
  if (error.type) parts.push(`type=${safeToken(error.type)}`);
  if (error.code !== undefined) parts.push(`code=${safeToken(error.code, 10)}`);
  if (error.error_subcode !== undefined) parts.push(`subcode=${safeToken(error.error_subcode, 10)}`);
  if (error.fbtrace_id) parts.push(`trace=${safeToken(error.fbtrace_id)}`);
  return parts.join(" ");
}

// One CAPI call with up to MAX_TRIES attempts. Returns { ok, tries, httpStatus, eventsReceived, fbtraceId, error }.
export async function postEvent(env, event, config = metaConfig(env)) {
  const url = `${META_GRAPH_BASE}/${META_GRAPH_VERSION}/${config.datasetId}/events`;
  const body = JSON.stringify(buildRequestBody(event, config));
  let last = { ok: false, tries: 0, httpStatus: 0, eventsReceived: 0, fbtraceId: "", error: "not_sent" };
  for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let retryable = false;
    try {
      const response = await globalThis.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
        body,
        signal: controller.signal,
      });
      let data = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }
      const received = Number(data?.events_received) || 0;
      const fbtraceId = safeToken(data?.fbtrace_id ?? data?.error?.fbtrace_id);
      if (response.ok && received >= 1) {
        return { ok: true, tries: attempt + 1, httpStatus: response.status, eventsReceived: received, fbtraceId, error: "" };
      }
      retryable = response.status === 429 || response.status >= 500;
      last = {
        ok: false,
        tries: attempt + 1,
        httpStatus: response.status,
        eventsReceived: received,
        fbtraceId,
        error: response.ok ? "events_received_0" : describeFailure(response.status, data),
      };
    } catch (error) {
      const timedOut = controller.signal.aborted;
      retryable = true;
      last = { ok: false, tries: attempt + 1, httpStatus: 0, eventsReceived: 0, fbtraceId: "", error: timedOut ? "timeout" : "network_error" };
    } finally {
      clearTimeout(timer);
    }
    if (!retryable || attempt === MAX_TRIES - 1) break;
    await sleep(backoffMs(env, attempt));
  }
  return last;
}

function log(level, eventRow, result) {
  // The only things that are ever logged about a CAPI call.
  console[level]("meta_capi", {
    at: nowIso(),
    event_name: eventRow.event_name,
    event_id: eventRow.event_id,
    http_status: result.httpStatus,
    events_received: result.eventsReceived,
    fbtrace_id: result.fbtraceId || null,
    attempts: result.tries,
    outcome: result.ok ? "sent" : "failed",
    ...(result.ok ? {} : { error: result.error }),
  });
}

// ---------- state (order_meta_events) ----------

async function claimNew(db, orderId, eventName, eventId, eventTime) {
  const stamp = nowIso();
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO order_meta_events (order_id, event_name, event_id, event_time, status, attempts, error, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'sending', 0, '', ?, ?)`,
    )
    .bind(orderId, eventName, eventId, eventTime, stamp, stamp)
    .run();
  return result.meta.changes > 0;
}

// Takes over a failed (or abandoned "sending") row. The WHERE clause repeats what we read, so exactly one runner wins.
async function claimRetry(db, row) {
  const result = await db
    .prepare("UPDATE order_meta_events SET status = 'sending', updated_at = ? WHERE order_id = ? AND event_name = ? AND status = ? AND updated_at = ?")
    .bind(nowIso(), row.order_id, row.event_name, row.status, row.updated_at)
    .run();
  return result.meta.changes > 0;
}

async function finish(db, row, result) {
  const stamp = nowIso();
  await db
    .prepare("UPDATE order_meta_events SET status = ?, attempts = attempts + ?, error = ?, sent_at = ?, updated_at = ? WHERE order_id = ? AND event_name = ?")
    .bind(result.ok ? "sent" : "failed", result.tries, result.ok ? "" : clip(result.error, 200), result.ok ? stamp : null, stamp, row.order_id, row.event_name)
    .run();
}

const secondsOf = (iso) => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : Math.floor(Date.now() / 1000);
};

// Builds and sends the claimed event; records the outcome. Never throws.
async function deliver(env, config, row, order) {
  try {
    if (!order) {
      const result = { ok: false, tries: 1, httpStatus: 0, eventsReceived: 0, fbtraceId: "", error: "order_missing" };
      await finish(env.DB, row, { ...result, tries: MAX_TOTAL_ATTEMPTS });
      log("error", row, result);
      return { outcome: "failed", error: result.error };
    }
    const attribution = await loadAttribution(env.DB, row.order_id).catch(() => null);
    const event = await buildEvent({ order, eventName: row.event_name, eventId: row.event_id, eventTime: row.event_time, attribution });
    const result = await postEvent(env, event, config);
    await finish(env.DB, row, result);
    log(result.ok ? "log" : "error", row, result);
    return { outcome: result.ok ? "sent" : "failed", httpStatus: result.httpStatus, error: result.error || undefined };
  } catch (error) {
    // Bookkeeping/build problems: leave the row `failed` so the cron looks at it again; keep the reason PII-free.
    console.error("meta_capi_error", { event_name: row.event_name, event_id: row.event_id, reason: clip(error?.name, 40) });
    await finish(env.DB, row, { ok: false, tries: 1, error: "internal_error" }).catch(() => {});
    return { outcome: "failed", error: "internal_error" };
  }
}

// ---------- public API ----------

// Sends one event for an order, once. `order` is the D1 orders row. Returns
// { outcome: "skipped" | "duplicate" | "sent" | "failed" | "error" } and never throws.
export async function sendMetaEvent(env, order, eventName) {
  const config = metaConfig(env);
  if (!config.enabled) return { outcome: "skipped", reason: "META_DATASET_ID not set" };
  if (!config.token) {
    console.log("meta_capi_skipped", { event_name: eventName, reason: "META_CAPI_ACCESS_TOKEN not set" });
    return { outcome: "skipped", reason: "META_CAPI_ACCESS_TOKEN not set" };
  }
  try {
    if (!order || !EVENT_NAMES.includes(eventName)) return { outcome: "skipped", reason: "nothing to send" };
    const eventTime = secondsOf(eventName === "Purchase" ? order.paid_at : order.created_at);
    const eventId = metaEventId(eventName, order.id);
    if (!(await claimNew(env.DB, order.id, eventName, eventId, eventTime))) return { outcome: "duplicate" };
    return await deliver(env, config, { order_id: order.id, event_name: eventName, event_id: eventId, event_time: eventTime }, order);
  } catch (error) {
    console.error("meta_capi_error", { event_name: eventName, reason: clip(error?.name, 40) });
    return { outcome: "error" };
  }
}

// Minutes the cron waits after a failure, growing with the number of attempts so far (5, 10, 20 … capped at 6 h).
export const retryDelayMs = (attempts) => Math.min(6 * 3600_000, 5 * 60_000 * 2 ** Math.max(0, attempts - 1));

// Cron: re-sends failed events (same event_id / event_time) and sweeps paid orders that never got a Purchase row
// (e.g. the Worker was cut off before the first send). Bounded per run; never throws.
export async function retryMetaEvents(env, { now = Date.now(), limit = CRON_BATCH } = {}) {
  const summary = { checked: 0, sent: 0, failed: 0, skipped: 0, swept: 0 };
  const config = metaConfig(env);
  if (!config.ready) return { ran: false, ...summary };
  try {
    const oldest = Math.floor(now / 1000) - MAX_EVENT_AGE_S;
    const staleBefore = new Date(now - STALE_SENDING_MS).toISOString();
    const { results } = await env.DB
      .prepare(
        `SELECT * FROM order_meta_events
         WHERE (status = 'failed' OR (status = 'sending' AND updated_at < ?)) AND attempts < ? AND event_time >= ?
         ORDER BY updated_at LIMIT ?`,
      )
      .bind(staleBefore, MAX_TOTAL_ATTEMPTS, oldest, limit * 8)
      .all();
    for (const row of results) {
      if (summary.checked >= limit) break;
      if (row.status === "failed" && now - Date.parse(row.updated_at) < retryDelayMs(row.attempts)) { summary.skipped += 1; continue; }
      if (!(await claimRetry(env.DB, row))) { summary.skipped += 1; continue; }
      summary.checked += 1;
      const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(row.order_id).first();
      const result = await deliver(env, config, row, order);
      if (result.outcome === "sent") summary.sent += 1;
      else summary.failed += 1;
    }

    // Paid orders from the last 6 days with no Purchase row at all (claimed by the same primary key, so no duplicates).
    const sweep = await env.DB
      .prepare(
        `SELECT * FROM orders o WHERE o.status = 'paid' AND o.paid_at >= ? AND o.paid_at <= ?
           AND NOT EXISTS (SELECT 1 FROM order_meta_events e WHERE e.order_id = o.id AND e.event_name = 'Purchase')
         ORDER BY o.paid_at LIMIT ?`,
      )
      .bind(new Date(now - MAX_EVENT_AGE_S * 1000).toISOString(), new Date(now - SWEEP_GRACE_MS).toISOString(), limit)
      .all();
    for (const order of sweep.results) {
      const result = await sendMetaEvent(env, order, "Purchase");
      if (result.outcome === "sent") { summary.sent += 1; summary.swept += 1; }
      else if (result.outcome === "failed") { summary.failed += 1; summary.swept += 1; }
    }
  } catch (error) {
    console.error("meta_capi_cron_error", { reason: clip(error?.name, 40) });
  }
  return { ran: true, ...summary };
}

// scheduled() entry: does nothing unless the feature is on (production).
export async function scheduledMetaRetry(env) {
  if (!metaEnabled(env)) return { ran: false };
  return retryMetaEvents(env);
}
