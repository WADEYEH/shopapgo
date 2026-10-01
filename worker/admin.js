// Protected order back office: /admin/ (static page) and /admin/api/* (JSON). The API
// lives under /admin/ so the browser's Basic-auth credentials cover both.
//
// Auth: the ADMIN_TOKEN Worker secret. Browsers get the native Basic-auth prompt
// (any username, password = ADMIN_TOKEN); scripts may send `Authorization: Bearer
// <ADMIN_TOKEN>`. With no token configured (or one shorter than 16 characters)
// everything answers 503, so a missing secret never opens the back office.
//
// Writes (POST /admin/api/orders/:id/ship, .../mcf/submit, .../mcf/sync, /admin/api/mcf/sync) need the same credentials plus browser-CSRF
// guards, because a browser re-sends Basic credentials on its own: the body must be
// application/json (forces a CORS preflight for cross-site pages), and a request that
// carries Origin / Sec-Fetch-Site must be same-origin. Scripts using a Bearer token
// without those headers are unaffected.

import { fail, json } from "./http.js";
import { ORDER_ID_PATTERN } from "./checkout.js";
import { FULFILLMENT_FILTERS, ORDER_STATUSES, adminOrder, fulfillmentCounts, getOrder, listOrders, orderCounts } from "./orders.js";
import { FulfillmentError, markShipped, validateShipment } from "./fulfillment.js";
import { sendCustomerEmail } from "./customer-email.js";
import { siteBasicOpensAdmin } from "./staging.js";
import { checkMcfConnection, mcfView, submitOrderToMcf, syncAllMcf, syncMcfOrder } from "./mcf.js";

export const MIN_ADMIN_TOKEN_LENGTH = 16;

const NO_INDEX = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" };
const CHALLENGE = { "WWW-Authenticate": 'Basic realm="APGO orders", charset="UTF-8"' };

// Comparing SHA-256 digests keeps the comparison constant-time regardless of length.
async function sameSecret(a, b) {
  const [x, y] = await Promise.all(
    [a, b].map(async (value) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))),
  );
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

function presentedToken(request) {
  const header = request.headers.get("Authorization") || "";
  const [scheme, value = ""] = header.split(/\s+/, 2);
  if (/^bearer$/i.test(scheme)) return value;
  if (/^basic$/i.test(scheme)) {
    try {
      const decoded = new TextDecoder().decode(Uint8Array.from(atob(value), (c) => c.charCodeAt(0)));
      return decoded.slice(decoded.indexOf(":") + 1);
    } catch {
      return "";
    }
  }
  return "";
}

// Returns null when the request may proceed, otherwise the response to send.
export async function requireAdmin(request, env) {
  const token = env.ADMIN_TOKEN;
  if (!token || token.length < MIN_ADMIN_TOKEN_LENGTH) {
    return fail(503, "admin_not_configured", "The order back office is not configured.", NO_INDEX);
  }
  const presented = presentedToken(request);
  if (presented && (await sameSecret(presented, token))) return null;
  // Staging only (ADMIN_ACCEPT_SITE_BASIC): the website's Basic user + password is accepted on the admin host too.
  if (await siteBasicOpensAdmin(request, env)) return null;
  return fail(401, "unauthorized", "Authentication required.", { ...NO_INDEX, ...CHALLENGE });
}

export const isAdminPath = (pathname) => pathname === "/admin" || pathname.startsWith("/admin/");

export async function handleAdmin(request, env) {
  const { pathname } = new URL(request.url);
  if (pathname.startsWith("/admin/api/")) return handleAdminApi(request, env, pathname);
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const url = new URL(request.url);
  if (url.pathname === "/admin") return Response.redirect(`${url.origin}/admin/`, 301);
  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(NO_INDEX)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

function csrfProblem(request) {
  const { origin } = new URL(request.url);
  const site = request.headers.get("Sec-Fetch-Site");
  if (site && !["same-origin", "none"].includes(site)) return "Cross-site requests are not allowed.";
  const requestOrigin = request.headers.get("Origin");
  if (requestOrigin && requestOrigin !== origin) return "Cross-origin requests are not allowed.";
  if (!/^application\/json\b/i.test(request.headers.get("Content-Type") || "")) return "Content-Type must be application/json.";
  return null;
}

// The order detail plus the Amazon MCF block (mode, reason, record, which buttons apply).
async function adminOrderView(env, orderId) {
  const order = await adminOrder(env.DB, orderId);
  if (!order) return null;
  const row = await getOrder(env.DB, orderId);
  return { ...order, mcf: await mcfView(env, row, order.fulfillment) };
}

async function readJsonObject(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  return body && typeof body === "object" && !Array.isArray(body) ? body : null;
}

// POST .../mcf/submit: (re)send a paid order to Amazon MCF. Needs the same admin + CSRF guards as shipping.
async function handleMcfSubmit(request, env, orderId) {
  const blocked = csrfProblem(request);
  if (blocked) return fail(403, "forbidden", blocked, NO_INDEX);
  if (!(await readJsonObject(request))) return fail(400, "invalid_json", "Request body must be a JSON object.", NO_INDEX);
  const row = await getOrder(env.DB, orderId);
  if (!row) return fail(404, "not_found", "Order not found.", NO_INDEX);
  if (row.status !== "paid") return fail(409, "not_paid", "Only paid orders can be sent to MCF.", NO_INDEX);
  const result = await submitOrderToMcf(env, row, { actor: "admin" });
  return json({ result: { outcome: result.outcome, reason: result.reason ?? null }, order: await adminOrderView(env, orderId) }, 200, NO_INDEX);
}

// POST .../mcf/sync (one order) and POST /admin/api/mcf/sync (every order waiting on Amazon).
async function handleMcfSync(request, env, orderId) {
  const blocked = csrfProblem(request);
  if (blocked) return fail(403, "forbidden", blocked, NO_INDEX);
  if (!(await readJsonObject(request))) return fail(400, "invalid_json", "Request body must be a JSON object.", NO_INDEX);
  if (!orderId) return json({ summary: await syncAllMcf(env, { actor: "admin" }) }, 200, NO_INDEX);
  if (!(await getOrder(env.DB, orderId))) return fail(404, "not_found", "Order not found.", NO_INDEX);
  const result = await syncMcfOrder(env, orderId, { actor: "admin" });
  return json(
    { result: { outcome: result.outcome, shipped: Boolean(result.shipped), email: result.email ?? null, reason: result.reason ?? null }, order: await adminOrderView(env, orderId) },
    200,
    NO_INDEX,
  );
}

async function handleShip(request, env, orderId) {
  const blocked = csrfProblem(request);
  if (blocked) return fail(403, "forbidden", blocked, NO_INDEX);
  let body;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "invalid_json", "Request body must be a JSON object.", NO_INDEX);
  try {
    const shipment = validateShipment(body);
    const order = await markShipped(env.DB, orderId, shipment, { actor: "admin" });
    // Emailed after the shipment is saved; a failure is recorded and never undoes it.
    const email = await sendCustomerEmail(env, (await getOrder(env.DB, orderId)) ?? order, "shipment", { shipment });
    return json({ order: await adminOrderView(env, orderId), email: { status: email.status } }, 200, NO_INDEX);
  } catch (error) {
    if (error instanceof FulfillmentError) return fail(error.status, error.code, error.message, NO_INDEX);
    throw error;
  }
}

export async function handleAdminApi(request, env, pathname) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;

  const url = new URL(request.url);
  const ship = pathname.match(/^\/admin\/api\/orders\/([^/]+)\/ship$/);
  if (ship) {
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.", { ...NO_INDEX, Allow: "POST" });
    const id = decodeURIComponent(ship[1]);
    if (!ORDER_ID_PATTERN.test(id)) return fail(404, "not_found", "Order not found.", NO_INDEX);
    return handleShip(request, env, id);
  }
  const mcf = pathname.match(/^\/admin\/api\/orders\/([^/]+)\/mcf\/(submit|sync)$/);
  if (mcf) {
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.", { ...NO_INDEX, Allow: "POST" });
    const id = decodeURIComponent(mcf[1]);
    if (!ORDER_ID_PATTERN.test(id)) return fail(404, "not_found", "Order not found.", NO_INDEX);
    return mcf[2] === "submit" ? handleMcfSubmit(request, env, id) : handleMcfSync(request, env, id);
  }
  if (pathname === "/admin/api/mcf/sync") {
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.", { ...NO_INDEX, Allow: "POST" });
    return handleMcfSync(request, env, null);
  }
  if (request.method !== "GET") return fail(405, "method_not_allowed", "Method not allowed.", { ...NO_INDEX, Allow: "GET" });

  // Read-only: list + preview against the Amazon outbound service. Creates and cancels nothing.
  if (pathname === "/admin/api/mcf/check") return json(await checkMcfConnection(env), 200, NO_INDEX);

  if (pathname === "/admin/api/orders") {
    const status = url.searchParams.get("status") || undefined;
    if (status && !ORDER_STATUSES.includes(status)) return fail(400, "invalid_status", "Unknown status.", NO_INDEX);
    const fulfillment = url.searchParams.get("fulfillment") || undefined;
    if (fulfillment && !FULFILLMENT_FILTERS.includes(fulfillment)) return fail(400, "invalid_fulfillment", "Unknown fulfilment status.", NO_INDEX);
    const page = await listOrders(env.DB, {
      status,
      fulfillment,
      q: url.searchParams.get("q") || undefined,
      limit: url.searchParams.get("limit") || undefined,
      before: url.searchParams.get("before") || undefined,
    });
    return json({ ...page, counts: await orderCounts(env.DB), fulfillmentCounts: await fulfillmentCounts(env.DB) }, 200, NO_INDEX);
  }

  const match = pathname.match(/^\/admin\/api\/orders\/([^/]+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (!ORDER_ID_PATTERN.test(id)) return fail(404, "not_found", "Order not found.", NO_INDEX);
    const order = await adminOrderView(env, id);
    return order ? json(order, 200, NO_INDEX) : fail(404, "not_found", "Order not found.", NO_INDEX);
  }
  return fail(404, "not_found", "Not found.", NO_INDEX);
}
