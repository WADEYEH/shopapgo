// Minimal Airwallex Payments client for the Worker runtime (fetch + Web Crypto).
// Credentials stay server-side; only a PaymentIntent's client_secret reaches the browser.
//
// Reviewed against the Airwallex docs (Sep 2026):
//   auth      POST /api/v1/authentication/login  (x-client-id, x-api-key, optional x-login-as)
//             → { token, expires_at }, valid 30 min, reuse until expiry
//   create    POST /api/v1/pa/payment_intents/create   (amount in MAJOR units, request_id ≤ 64)
//   retrieve  GET  /api/v1/pa/payment_intents/{id}
//   webhook   x-signature = hex(HMAC-SHA256(secret, x-timestamp + raw body)), x-timestamp in ms

const API_BASE = {
  demo: "https://api.sandbox.airwallex.com",
  prod: "https://api.airwallex.com",
};

// Reject deliveries whose x-timestamp is older than this to limit replay. Orders
// also settle through the Retrieve fallback, so a rejected late retry is harmless.
export const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

export class AirwallexError extends Error {
  constructor(status, code, message, source) {
    super(message);
    this.status = status;
    this.code = code;
    // Airwallex validation errors name the offending field in `source`.
    this.source = source;
  }
}

export function apiBase(env) {
  return env.AIRWALLEX_API_BASE || API_BASE[env.AIRWALLEX_ENV === "prod" ? "prod" : "demo"];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const retryDelay = (env, attempt) => Number(env.AIRWALLEX_RETRY_DELAY_MS ?? 300) * 2 ** attempt;

async function send(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const timedOut = controller.signal.aborted;
    throw new AirwallexError(0, timedOut ? "timeout" : "network_error", timedOut ? "Airwallex request timed out." : "Airwallex is unreachable.");
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

const retryable = (status) => status === 0 || status === 429 || status >= 500;

// Access tokens live 30 minutes; reuse per isolate instead of logging in per request.
let cachedToken = null;

export function resetAirwallexTokenCache() {
  cachedToken = null;
}

async function login(env) {
  const base = apiBase(env);
  const cacheKey = `${base}|${env.AIRWALLEX_CLIENT_ID}|${env.AIRWALLEX_LOGIN_AS ?? ""}`;
  if (cachedToken && cachedToken.key === cacheKey && cachedToken.expiresAt - Date.now() > 60_000) {
    return cachedToken.token;
  }
  if (!env.AIRWALLEX_CLIENT_ID || !env.AIRWALLEX_API_KEY) {
    throw new AirwallexError(500, "not_configured", "Airwallex credentials are not configured.");
  }
  const headers = {
    "Content-Type": "application/json",
    "x-client-id": env.AIRWALLEX_CLIENT_ID,
    "x-api-key": env.AIRWALLEX_API_KEY,
  };
  // Only needed when the scoped API key is linked to several Airwallex accounts.
  if (env.AIRWALLEX_LOGIN_AS) headers["x-login-as"] = env.AIRWALLEX_LOGIN_AS;

  let last;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await send(`${base}/api/v1/authentication/login`, { method: "POST", headers });
      const body = await readJson(response);
      if (response.ok && body.token) {
        // expires_at looks like 2021-06-18T16:30:00+0000 (no colon in the offset).
        const iso = typeof body.expires_at === "string" ? body.expires_at.replace(/([+-]\d{2})(\d{2})$/, "$1:$2") : "";
        const expiresAt = Date.parse(iso) || Date.now() + 25 * 60_000;
        cachedToken = { key: cacheKey, token: body.token, expiresAt };
        return body.token;
      }
      last = new AirwallexError(response.status, body.code ?? "auth_failed", body.message ?? "Airwallex login failed.", body.source);
    } catch (error) {
      if (!(error instanceof AirwallexError)) throw error;
      last = error;
    }
    if (!retryable(last.status) || attempt === MAX_ATTEMPTS - 1) break;
    await sleep(retryDelay(env, attempt));
  }
  throw last;
}

// `idempotent` requests (GETs, and creates that carry a stable request_id) are
// retried on network errors, 429 and 5xx. A 401 refreshes the token once.
async function request(env, method, path, payload, { idempotent = false } = {}) {
  const attempts = idempotent ? MAX_ATTEMPTS : 1;
  let refreshedToken = false;
  let last;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const token = await login(env);
      const response = await send(`${apiBase(env)}${path}`, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const body = await readJson(response);
      if (response.ok) return body;
      if (response.status === 401 && !refreshedToken) {
        refreshedToken = true;
        cachedToken = null;
        attempt -= 1;
        continue;
      }
      last = new AirwallexError(response.status, body.code ?? "api_error", body.message ?? `Airwallex ${path} failed.`, body.source);
    } catch (error) {
      if (!(error instanceof AirwallexError)) throw error;
      last = error;
    }
    if (!retryable(last.status) || attempt >= attempts - 1) break;
    await sleep(retryDelay(env, attempt));
  }
  throw last;
}

// `payload.request_id` must be stable per order so a retry returns the same intent
// instead of creating a duplicate.
export function createPaymentIntent(env, payload) {
  return request(env, "POST", "/api/v1/pa/payment_intents/create", payload, { idempotent: Boolean(payload.request_id) });
}

export function retrievePaymentIntent(env, intentId) {
  return request(env, "GET", `/api/v1/pa/payment_intents/${encodeURIComponent(intentId)}`, undefined, { idempotent: true });
}

export function retrieveRefund(env, refundId) {
  return request(env, 'GET', `/api/v1/pa/refunds/${encodeURIComponent(refundId)}`, undefined, { idempotent:true });
}

export function listRefunds(env, intentId) {
  const query = new URLSearchParams({ payment_intent_id:intentId, page_size:'100', page_num:'0' });
  return request(env, 'GET', `/api/v1/pa/refunds?${query}`, undefined, { idempotent:true });
}

// Signature = hex(HMAC-SHA256(secret, x-timestamp + raw body)). Must run on the
// raw request text, before any JSON parsing.
// Pass toleranceMs: Infinity to check the signature alone (used to recognise a
// genuine but late retry, whose content is then re-read from the Retrieve API).
export async function verifyWebhookSignature({
  secret,
  timestamp,
  signature,
  rawBody,
  now = Date.now(),
  toleranceMs = WEBHOOK_TOLERANCE_MS,
}) {
  if (!secret || !timestamp || !signature) return false;
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > toleranceMs) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}${rawBody}`));
  const expected = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, signature.toLowerCase());
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
