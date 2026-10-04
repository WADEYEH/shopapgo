// Ad attribution for Meta Conversions API: what the browser tells us (POST /api/checkout/session body.attribution),
// what the request carries (Cookie _fbp/_fbc, CF-Connecting-IP, User-Agent) and how it is stored (order_attribution).
//
// Everything here is untrusted input. Each value is checked against a strict format and a length cap; a value that fails
// is dropped (never "repaired"), and a missing/garbled attribution object never blocks checkout.

const MAX_URL = 500;
const MAX_UA = 400;

// fb.<subdomainIndex>.<creationTimeMs>.<random|fbclid>[.<appendix>]  (Meta cookie formats)
const FBP_PATTERN = /^fb\.[0-2]\.\d{10,14}\.\d{1,20}(\.[A-Za-z0-9_-]{1,40})?$/;
const FBC_PATTERN = /^fb\.[0-2]\.\d{10,14}\.[A-Za-z0-9_-]{1,255}(\.[A-Za-z0-9_-]{1,40})?$/;
const FBCLID_PATTERN = /^[A-Za-z0-9_-]{1,255}$/;
const IP_PATTERN = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9A-Fa-f:]{2,39}(?:%[A-Za-z0-9]{1,15})?)$/;

const asText = (value) => (typeof value === "string" ? value.trim() : "");

const match = (value, pattern) => {
  const text = asText(value);
  return text.length <= 300 && pattern.test(text) ? text : "";
};

// An http(s) URL without credentials or fragment, at most 500 characters. A longer URL keeps only origin + path.
export function cleanSourceUrl(value) {
  const text = asText(value);
  if (!text || text.length > 2000) return "";
  let url;
  try {
    url = new URL(text);
  } catch {
    return "";
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
  url.hash = "";
  let out = url.toString();
  if (out.length > MAX_URL) out = `${url.origin}${url.pathname}`;
  return out.length <= MAX_URL ? out : "";
}

function cookieValue(header, name) {
  for (const part of String(header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0 && part.slice(0, index).trim() === name) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return "";
      }
    }
  }
  return "";
}

const cleanIp = (value) => {
  const text = asText(value);
  return IP_PATTERN.test(text) ? text : "";
};

// eslint-disable-next-line no-control-regex
const cleanUserAgent = (value) => asText(value).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, MAX_UA);

// Builds the attribution record for a new order. `body` is the parsed JSON request body (or anything), `request` the
// incoming Request, `fallbackUrl` the event_source_url used when the browser did not send one.
export function readAttribution(body, request, { fallbackUrl = "", now = Date.now() } = {}) {
  const sent = body && typeof body === "object" && !Array.isArray(body) && body.attribution && typeof body.attribution === "object" && !Array.isArray(body.attribution) ? body.attribution : {};
  const cookies = request?.headers?.get?.("cookie") ?? "";

  const fbclid = match(sent.fbclid, FBCLID_PATTERN);
  const fbp = match(sent.fbp, FBP_PATTERN) || match(cookieValue(cookies, "_fbp"), FBP_PATTERN);
  let fbc = match(sent.fbc, FBC_PATTERN) || match(cookieValue(cookies, "_fbc"), FBC_PATTERN);
  // A click id without the cookie yet: build the value Meta documents (fb.<subdomain index>.<ms>.<fbclid>).
  if (!fbc && fbclid) fbc = `fb.1.${now}.${fbclid}`;

  return {
    fbp,
    fbc,
    fbclid,
    sourceUrl: cleanSourceUrl(sent.sourceUrl) || cleanSourceUrl(fallbackUrl),
    clientIp: cleanIp(request?.headers?.get?.("cf-connecting-ip")),
    clientUserAgent: cleanUserAgent(request?.headers?.get?.("user-agent")),
  };
}

export async function saveAttribution(db, orderId, attribution) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO order_attribution (order_id, fbp, fbc, fbclid, source_url, client_ip, client_user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(orderId, attribution.fbp, attribution.fbc, attribution.fbclid, attribution.sourceUrl, attribution.clientIp, attribution.clientUserAgent, new Date().toISOString())
    .run();
}

export async function loadAttribution(db, orderId) {
  const row = await db.prepare("SELECT * FROM order_attribution WHERE order_id = ?").bind(orderId).first();
  if (!row) return null;
  return { fbp: row.fbp, fbc: row.fbc, fbclid: row.fbclid, sourceUrl: row.source_url, clientIp: row.client_ip, clientUserAgent: row.client_user_agent };
}

// Extra Airwallex PaymentIntent metadata (keys <= 50 chars, values <= 500, no PII). Only keys that have a value;
// callers spread this BEFORE their own keys so source / order_id can never be overwritten.
export function attributionMetadata(attribution) {
  const meta = {};
  if (attribution?.fbc) meta.fbc = attribution.fbc.slice(0, 500);
  if (attribution?.fbp) meta.fbp = attribution.fbp.slice(0, 500);
  if (attribution?.sourceUrl) meta.event_source_url = attribution.sourceUrl.slice(0, 500);
  return meta;
}
