// PayPal Orders v2 client for the Worker runtime (fetch + Web Crypto).
// Client Secret stays here; the browser only ever sees PAYPAL_CLIENT_ID and a PayPal order id.
//
//   auth      POST /v1/oauth2/token  (Basic client_id:secret, grant_type=client_credentials)
//   create    POST /v2/checkout/orders   PayPal-Request-Id = our store order id
//   retrieve  GET  /v2/checkout/orders/{id}
//   capture   POST /v2/checkout/orders/{id}/capture
//   webhook   POST /v1/notifications/verify-webhook-signature  (needs PAYPAL_WEBHOOK_ID)
//
// PAYPAL_ENV=live → api-m.paypal.com; anything else (including unset) → api-m.sandbox.paypal.com.

import { US_STATES } from "./states.js";
import { toMajor } from "./catalog.js";
import { checkShipping } from "../../lib/shop/address-rules.mjs";

const API_BASE = {
  live: "https://api-m.paypal.com",
  sandbox: "https://api-m.sandbox.paypal.com",
};

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

export class PaypalError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function paypalEnvName(env = {}) {
  return String(env.PAYPAL_ENV ?? "").trim().toLowerCase() === "live" ? "live" : "sandbox";
}

export function paypalApiBase(env = {}) {
  if (env.PAYPAL_API_BASE) return String(env.PAYPAL_API_BASE);
  return API_BASE[paypalEnvName(env)];
}

export const paypalConfigured = (env = {}) => Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);

// USD (and other 2-decimal currencies): always "59.99", never "59.9".
export function paypalAmount(cents) {
  return (Number(cents) / 100).toFixed(2);
}

export function amountsMatch(value, totalCents) {
  const dollars = Number(value);
  if (!Number.isFinite(dollars)) return false;
  return Math.abs(dollars - toMajor(totalCents)) < 0.005;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const retryDelay = (env, attempt) => Number(env.PAYPAL_RETRY_DELAY_MS ?? 300) * 2 ** attempt;
const retryable = (status) => status === 0 || status === 429 || status >= 500;

let cachedToken = null;

export function resetPaypalTokenCache() {
  cachedToken = null;
}

async function send(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    const timedOut = controller.signal.aborted;
    throw new PaypalError(0, timedOut ? "timeout" : "network_error", timedOut ? "PayPal request timed out." : "PayPal is unreachable.");
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

function basicAuth(clientId, secret) {
  return btoa(`${clientId}:${secret}`);
}

async function login(env) {
  const base = paypalApiBase(env);
  const cacheKey = `${base}|${env.PAYPAL_CLIENT_ID}`;
  if (cachedToken && cachedToken.key === cacheKey && cachedToken.expiresAt - Date.now() > 60_000) {
    return cachedToken.token;
  }
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new PaypalError(500, "not_configured", "PayPal credentials are not configured.");
  }

  let last;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await send(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth(env.PAYPAL_CLIENT_ID, env.PAYPAL_CLIENT_SECRET)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      const body = await readJson(response);
      if (response.ok && body.access_token) {
        const ttlMs = Math.max(60, Number(body.expires_in) || 300) * 1000;
        cachedToken = { key: cacheKey, token: body.access_token, expiresAt: Date.now() + ttlMs };
        return body.access_token;
      }
      last = new PaypalError(response.status, body.error ?? "auth_failed", body.error_description ?? "PayPal login failed.");
    } catch (error) {
      if (!(error instanceof PaypalError)) throw error;
      last = error;
    }
    if (!retryable(last.status) || attempt === MAX_ATTEMPTS - 1) break;
    await sleep(retryDelay(env, attempt));
  }
  throw last;
}

function paypalErrorFrom(status, body, path) {
  const issue = body?.details?.[0];
  const code = issue?.issue ?? body?.name ?? body?.error ?? "api_error";
  const message = issue?.description ?? body?.message ?? body?.error_description ?? `PayPal ${path} failed.`;
  return new PaypalError(status, code, message, body?.details);
}

async function request(env, method, path, payload, { idempotent = false, requestId } = {}) {
  const attempts = idempotent ? MAX_ATTEMPTS : 1;
  let refreshedToken = false;
  let last;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const token = await login(env);
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      if (requestId) headers["PayPal-Request-Id"] = requestId;
      const response = await send(`${paypalApiBase(env)}${path}`, {
        method,
        headers,
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      const body = await readJson(response);
      if (response.ok) return body;
      if (response.status === 401 && !refreshedToken) {
        refreshedToken = true;
        cachedToken = null;
        attempt -= 1;
        continue;
      }
      last = paypalErrorFrom(response.status, body, path);
    } catch (error) {
      if (!(error instanceof PaypalError)) throw error;
      last = error;
    }
    if (!retryable(last.status) || attempt >= attempts - 1) break;
    await sleep(retryDelay(env, attempt));
  }
  throw last;
}

const clip = (value, max) => String(value ?? "").trim().slice(0, max);

export function paypalOrderPayload({ orderId, quote, checkout, returnUrl, cancelUrl }) {
  const currency = quote.currency;
  const taxCents = quote.taxCents ?? 0;
  const unit = {
    reference_id: "default",
    invoice_id: orderId,
    custom_id: orderId,
    description: "APGO US store",
    amount: {
      currency_code: currency,
      value: paypalAmount(quote.totalCents),
      breakdown: {
        item_total: { currency_code: currency, value: paypalAmount(quote.subtotalCents) },
        shipping: { currency_code: currency, value: paypalAmount(quote.shippingCents) },
        tax_total: { currency_code: currency, value: paypalAmount(taxCents) },
      },
    },
    items: quote.lines.map((line) => ({
      name: clip(line.name, 127) || line.sku,
      sku: clip(line.sku, 127),
      quantity: String(line.qty),
      category: "PHYSICAL_GOODS",
      unit_amount: { currency_code: currency, value: paypalAmount(line.unitCents) },
    })),
  };

  const provided = isUsableUsShipping(checkout.shipping);
  if (provided) {
    unit.shipping = {
      name: { full_name: clip(`${checkout.shipping.firstName} ${checkout.shipping.lastName}`, 300) },
      address: {
        address_line_1: clip(checkout.shipping.street, 300),
        ...(checkout.shipping.street2 ? { address_line_2: clip(checkout.shipping.street2, 300) } : {}),
        admin_area_2: clip(checkout.shipping.city, 120),
        admin_area_1: checkout.shipping.state,
        postal_code: checkout.shipping.zip,
        country_code: "US",
      },
    };
  }

  return {
    intent: "CAPTURE",
    purchase_units: [unit],
    application_context: {
      brand_name: "APGO",
      locale: "en-US",
      landing_page: "NO_PREFERENCE",
      shipping_preference: provided ? "SET_PROVIDED_ADDRESS" : "GET_FROM_FILE",
      user_action: "PAY_NOW",
      return_url: returnUrl,
      cancel_url: cancelUrl,
    },
  };
}

export function createPaypalOrder(env, payload, requestId) {
  return request(env, "POST", "/v2/checkout/orders", payload, { idempotent: Boolean(requestId), requestId });
}

export function retrievePaypalOrder(env, paypalOrderId) {
  return request(env, "GET", `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, undefined, { idempotent: true });
}

export function capturePaypalOrder(env, paypalOrderId, requestId) {
  return request(env, "POST", `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {}, {
    idempotent: Boolean(requestId),
    requestId,
  });
}

export function approveUrlFrom(paypalOrder) {
  const links = Array.isArray(paypalOrder?.links) ? paypalOrder.links : [];
  const approve = links.find((link) => link?.rel === "approve" && link?.href);
  return approve?.href ?? "";
}

// ---------- shipping from a PayPal order ----------

const NAME_LOOKUP = Object.fromEntries(Object.entries(US_STATES).map(([code, name]) => [name.toLowerCase(), code]));

export function normalizePaypalState(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (US_STATES[upper]) return upper;
  return NAME_LOOKUP[raw.toLowerCase()] ?? "";
}

function splitFullName(fullName, payerName = {}) {
  const given = clip(payerName.given_name, 60);
  const surname = clip(payerName.surname, 60);
  const parts = clip(fullName, 120).split(/\s+/).filter(Boolean);
  const firstName = given || parts[0] || "";
  const lastName = surname || (parts.length > 1 ? parts.slice(1).join(" ") : "");
  return { firstName, lastName };
}

export function shippingFromPaypalOrder(paypalOrder) {
  const unit = paypalOrder?.purchase_units?.[0] ?? {};
  const ship = unit.shipping ?? {};
  const address = ship.address ?? {};
  const payer = paypalOrder?.payer ?? paypalOrder?.payment_source?.paypal ?? {};
  const names = splitFullName(ship.name?.full_name, payer.name);
  const country = String(address.country_code ?? "").trim().toUpperCase();
  return {
    firstName: names.firstName,
    lastName: names.lastName,
    street: clip(address.address_line_1, 120),
    street2: clip(address.address_line_2, 120),
    city: clip(address.admin_area_2, 60),
    state: normalizePaypalState(address.admin_area_1),
    zip: clip(address.postal_code, 10),
    country,
  };
}

// The checkout page's rules (48 states and DC, no PO boxes or military mail, ZIP matching the state, Amazon's lengths):
// an address PayPal hands back must pass them before the order is captured or shipped (M3-12).
export function isUsableUsShipping(shipping) {
  if (!shipping || typeof shipping !== "object") return false;
  if (shipping.country && shipping.country !== "US") return false;
  return Object.keys(checkShipping(shipping).errors).length === 0;
}

export function inspectPaypalOrder(paypalOrder) {
  const unit = paypalOrder?.purchase_units?.[0] ?? {};
  const captures = unit.payments?.captures ?? [];
  const capture = captures.find((item) => item?.status === "COMPLETED") ?? captures[0];
  const amount = capture?.amount ?? unit.amount ?? {};
  const captured = paypalOrder?.status === "COMPLETED" || capture?.status === "COMPLETED";
  return {
    paypalOrderId: paypalOrder?.id ?? "",
    storeOrderId: unit.custom_id || unit.invoice_id || "",
    status: captured ? "COMPLETED" : String(paypalOrder?.status ?? ""),
    captureStatus: capture?.status ?? "",
    amountValue: amount.value,
    currency: amount.currency_code,
    shipping: shippingFromPaypalOrder(paypalOrder),
  };
}

// ---------- return / cancel URLs ----------

const STOREFRONT_HOSTS = new Set([
  "www.shopapgo.com",
  "store.shopapgo.com",
  "shopapgo.com",
  "staging.shopapgo.com",
  "localhost",
  "127.0.0.1",
]);

function originOf(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

function allowedOrigin(origin) {
  if (!origin) return "";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (STOREFRONT_HOSTS.has(host) || host.endsWith(".workers.dev") || host.endsWith(".pages.dev")) return origin;
  } catch {
    return "";
  }
  return "";
}

export function storefrontOrigin(request, env = {}) {
  const referer = request.headers.get("Referer");
  const candidates = [request.headers.get("Origin"), referer ? originOf(referer) : "", new URL(request.url).origin];
  for (const raw of candidates) {
    const allowed = allowedOrigin(raw);
    if (allowed) return allowed;
  }
  if (env.SITE_ENV === "staging") return "https://staging.shopapgo.com";
  if (paypalEnvName(env) === "live" || env.AIRWALLEX_ENV === "prod") return "https://www.shopapgo.com";
  return new URL(request.url).origin;
}

export function checkoutReturnUrls(origin, orderId) {
  const base = `${origin}/checkout?order=${encodeURIComponent(orderId)}`;
  return { returnUrl: `${base}&paypal=return`, cancelUrl: `${base}&paypal=cancel` };
}

// ---------- webhook verification ----------

const PAYPAL_CERT_HOSTS = new Set(["api.paypal.com", "api.sandbox.paypal.com", "api-m.paypal.com", "api-m.sandbox.paypal.com"]);

export function paypalWebhookHeaders(request) {
  return {
    auth_algo: request.headers.get("paypal-auth-algo") || "",
    cert_url: request.headers.get("paypal-cert-url") || "",
    transmission_id: request.headers.get("paypal-transmission-id") || "",
    transmission_sig: request.headers.get("paypal-transmission-sig") || "",
    transmission_time: request.headers.get("paypal-transmission-time") || "",
  };
}

function certUrlAllowed(certUrl) {
  try {
    const url = new URL(certUrl);
    return url.protocol === "https:" && PAYPAL_CERT_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function verifyPaypalWebhook(env, { headers, event }) {
  const webhookId = String(env.PAYPAL_WEBHOOK_ID ?? "").trim();
  if (!webhookId) return false;
  const { auth_algo, cert_url, transmission_id, transmission_sig, transmission_time } = headers;
  if (!auth_algo || !cert_url || !transmission_id || !transmission_sig || !transmission_time) return false;
  if (!certUrlAllowed(cert_url)) return false;
  if (!event || typeof event !== "object") return false;

  try {
    const result = await request(env, "POST", "/v1/notifications/verify-webhook-signature", {
      auth_algo,
      cert_url,
      transmission_id,
      transmission_sig,
      transmission_time,
      webhook_id: webhookId,
      webhook_event: event,
    }, { idempotent: true });
    return result.verification_status === "SUCCESS";
  } catch (error) {
    if (error instanceof PaypalError) return false;
    throw error;
  }
}

export function paypalOrderIdFromWebhook(event) {
  const resource = event?.resource ?? {};
  const related = resource.supplementary_data?.related_ids?.order_id;
  if (related) return String(related);
  if (String(event?.event_type ?? "").startsWith("CHECKOUT.ORDER.") && resource.id) return String(resource.id);
  return "";
}

export function storeOrderIdFromWebhook(event) {
  const resource = event?.resource ?? {};
  const custom = resource.custom_id || resource.invoice_id || resource.purchase_units?.[0]?.custom_id || "";
  return String(custom || "");
}
