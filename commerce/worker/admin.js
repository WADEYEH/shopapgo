// Protected order back office: /admin/ (static page) and /admin/api/* (JSON). The API
// lives under /admin/ so the browser's Basic-auth credentials cover both.
//
// Who may use it (worker/admin-identity.js): with ADMIN_ACCESS="true", Cloudflare Access signs people in and only
// active members (worker/members.js) get in; until then the shared login (ADMIN_LOGIN_EMAIL / ADMIN_LOGIN_PASSWORD,
// browsers get the native Basic prompt), ADMIN_TOKEN for scripts, and on staging the website Basic login. Every
// action is recorded under the signed-in person (order_audit for orders, admin_audit for the rest; worker/activity.js).
//
//   GET  /admin/api/me                       who is signed in, and the role
//   GET  /admin/api/activity                 the site-wide activity log (?actor=&from=&to=&cursor=)
//   GET  /admin/api/members                  owners only: members and the Cloudflare list sync status
//   POST /admin/api/members                  owners only: add { email, role, reason }
//   POST /admin/api/members/role             owners only: { email, role, reason }
//   POST /admin/api/members/remove           owners only: { email, reason }
//   POST /admin/api/members/sync             owners only: copy the list to Cloudflare Access again
//   POST /admin/api/orders/:id/confirm       a review order is fine: { reason } (worker/order-core.js, T5)
//   POST /admin/api/orders/:id/cancel        { reason: customer_request | out_of_stock | ... | other, note } (T6, T8, T10)
//   POST /admin/api/orders/:id/address       in the cooling-off period: { shipping, reason, noUnit }
//   GET  /admin/api/checkouts                unpaid checkouts (?status=open|expired|all&q=&before=; D36, M9-22)
//
// Writes (POST /admin/api/orders/:id/ship, .../mcf/submit, .../mcf/sync, /admin/api/mcf/sync, members) need the same credentials plus browser-CSRF
// guards, because a browser re-sends Basic credentials on its own: the body must be
// application/json (forces a CORS preflight for cross-site pages), and a request that
// carries Origin / Sec-Fetch-Site must be same-origin. Scripts using a Bearer token
// without those headers are unaffected.

import { fail, json } from "./http.js";
import { ORDER_ID_PATTERN } from "./checkout.js";
import { FULFILLMENT_FILTERS, ORDER_STATUSES, adminOrder, fulfillmentCounts, getOrder, listOrders, orderCounts } from "./orders.js";
import { FulfillmentError, markShipped, validateShipment, recordAudit } from "./fulfillment.js";
import { processMessageJob, retryCustomerEmail } from "./customer-email.js";
import { validEmailKind } from './email-delivery.js';
import { MIN_ADMIN_TOKEN_LENGTH } from "./admin-auth.js";
import { accessMode, resolveAdmin } from "./admin-identity.js";
import { MemberError, addMember, changeRole, ensureOwner, listMembers, removeMember } from "./members.js";
import { accessListStatus, syncAccessList } from "./access-list.js";
import { activityActors, listActivity } from "./activity.js";
import { OrderError, applyRefundsToOrder, cancelOrder, changeAddress, confirmOrder, orderCoreView, orderHolds } from "./order-core.js";
import { runAfterPaid } from "./after-payment.js";
import { listCheckouts } from "./checkouts.js";
import { checkMcfConnection, mcfView, submitOrderToMcf, syncAllMcf, syncMcfOrder } from "./mcf.js";
import { refundHold, syncOrderRefunds } from './refunds.js';
import { sandboxRefundChecksEnabled, runSandboxRefundCheck } from './sandbox-refund-checks.js';
import { AIRWALLEX_INTENT_LOOKUP, PAYPAL_ORDER_LOOKUP, lookupAirwallexIntent, lookupPaypalOrder } from "./payment-lookup.js";
import { listContactMessages } from "./contact.js";

export { MIN_ADMIN_TOKEN_LENGTH };

const NO_INDEX = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" };

// Returns null when the request may proceed, otherwise the response to send.
export async function requireAdmin(request, env) {
  return (await resolveAdmin(request, env)).response ?? null;
}

export const isAdminPath = (pathname) => pathname === "/admin" || pathname.startsWith("/admin/");

// The page itself: a refusal other than the sign-in prompt is shown as a short sentence, not JSON.
async function pageRefusal(response) {
  if (response.status === 401) return response;
  const message = (await response.clone().json().catch(() => null))?.error?.message ?? "The back office is unavailable.";
  return new Response(`${message}\n`, { status: response.status, headers: { "Content-Type": "text/plain; charset=utf-8", ...NO_INDEX } });
}

export async function handleAdmin(request, env) {
  const { pathname } = new URL(request.url);
  if (pathname.startsWith("/admin/api/")) return handleAdminApi(request, env, pathname);
  const auth = await resolveAdmin(request, env);
  if (auth.response) return pageRefusal(auth.response);
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
  return { ...order, sandboxRefundChecks:sandboxRefundChecksEnabled(env), mcf: await mcfView(env, row, order.fulfillment), core: await orderCoreView(env, orderId) };
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
async function handleMcfSubmit(request, env, orderId, actor) {
  const blocked = csrfProblem(request);
  if (blocked) return fail(403, "forbidden", blocked, NO_INDEX);
  if (!(await readJsonObject(request))) return fail(400, "invalid_json", "Request body must be a JSON object.", NO_INDEX);
  const row = await getOrder(env.DB, orderId);
  if (!row) return fail(404, "not_found", "Order not found.", NO_INDEX);
  if (row.status !== "paid") return fail(409, "not_paid", "Only paid orders can be sent to MCF.", NO_INDEX);
  const result = await submitOrderToMcf(env, row, { actor: actor.id });
  return json({ result: { outcome: result.outcome, reason: result.reason ?? null }, order: await adminOrderView(env, orderId) }, 200, NO_INDEX);
}

// POST .../mcf/sync (one order) and POST /admin/api/mcf/sync (every order waiting on Amazon).
async function handleMcfSync(request, env, orderId, actor) {
  const blocked = csrfProblem(request);
  if (blocked) return fail(403, "forbidden", blocked, NO_INDEX);
  if (!(await readJsonObject(request))) return fail(400, "invalid_json", "Request body must be a JSON object.", NO_INDEX);
  if (!orderId) return json({ summary: await syncAllMcf(env, { actor: actor.id }) }, 200, NO_INDEX);
  if (!(await getOrder(env.DB, orderId))) return fail(404, "not_found", "Order not found.", NO_INDEX);
  const result = await syncMcfOrder(env, orderId, { actor: actor.id });
  return json(
    { result: { outcome: result.outcome, shipped: Boolean(result.shipped), email: result.email ?? null, reason: result.reason ?? null }, order: await adminOrderView(env, orderId) },
    200,
    NO_INDEX,
  );
}

async function handleShip(request, env, orderId, actor) {
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
    if (await refundHold(env.DB, orderId)) return fail(409, 'refund_hold', 'Refund registered; review fulfillment in Airwallex and Amazon before shipping.', NO_INDEX);
    const order0 = await getOrder(env.DB, orderId);
    if (order0 && (await orderHolds(env.DB, order0)).some((hold) => hold.code === "dispute")) return fail(409, "dispute_hold", "A dispute is open for this order; it cannot ship until the dispute is won.", NO_INDEX);
    const order = await markShipped(env.DB, orderId, shipment, { actor: actor.id });
    // Emailed after the shipment is saved; a failure is recorded and never undoes it.
    const email = await processMessageJob(env, (await getOrder(env.DB, orderId)) ?? order, 'shipment');
    return json({ order: await adminOrderView(env, orderId), email: { status: email.status } }, 200, NO_INDEX);
  } catch (error) {
    if (error instanceof FulfillmentError) return fail(error.status, error.code, error.message, NO_INDEX);
    throw error;
  }
}

// Members and the activity log. Returns null when the path is not one of theirs.
async function handleTeamApi(request, env, pathname, actor) {
  const url = new URL(request.url);
  if (pathname === "/admin/api/me" && request.method === "GET") {
    return json({ actor: { id: actor.id, email: actor.email, role: actor.role, via: actor.via }, accessSignIn: accessMode(env) }, 200, NO_INDEX);
  }
  if (pathname === "/admin/api/activity" && request.method === "GET") {
    const page = await listActivity(env.DB, {
      actor: url.searchParams.get("actor") || null,
      from: url.searchParams.get("from") || null,
      to: url.searchParams.get("to") || null,
      cursor: url.searchParams.get("cursor") || null,
    });
    return json({ ...page, actors: url.searchParams.get("cursor") ? undefined : await activityActors(env.DB) }, 200, NO_INDEX);
  }
  if (!pathname.startsWith("/admin/api/members")) return null;
  if (actor.role !== "owner") return fail(403, "owner_only", "Only an owner can manage members.", NO_INDEX);
  if (pathname === "/admin/api/members" && request.method === "GET") {
    await ensureOwner(env);
    return json({ members: await listMembers(env.DB), accessSignIn: accessMode(env), accessList: await accessListStatus(env) }, 200, NO_INDEX);
  }
  const action = { "/admin/api/members": addMember, "/admin/api/members/role": changeRole, "/admin/api/members/remove": removeMember }[pathname];
  if (!action && pathname !== "/admin/api/members/sync") return fail(404, "not_found", "Not found.", NO_INDEX);
  if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.", { ...NO_INDEX, Allow: "POST" });
  const blocked = csrfProblem(request);
  if (blocked) return fail(403, "forbidden", blocked, NO_INDEX);
  const body = await readJsonObject(request);
  if (!body) return fail(400, "invalid_json", "Request body must be a JSON object.", NO_INDEX);
  if (!action) return json({ sync: await syncAccessList(env, { actor }), accessList: await accessListStatus(env) }, 200, NO_INDEX);
  try {
    const result = await action(env, actor, body);
    return json({ ...result, members: await listMembers(env.DB), accessList: await accessListStatus(env) }, 200, NO_INDEX);
  } catch (error) {
    if (error instanceof MemberError) return fail(error.status, error.code, error.message, NO_INDEX);
    throw error;
  }
}

// POST .../confirm | .../cancel | .../address (worker/order-core.js). Every action carries a reason and is logged
// under the signed-in person.
async function handleOrderAction(request, env, orderId, action, actor) {
  if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.", { ...NO_INDEX, Allow: "POST" });
  const blocked = csrfProblem(request);
  if (blocked) return fail(403, "forbidden", blocked, NO_INDEX);
  const body = await readJsonObject(request);
  if (!body) return fail(400, "invalid_json", "Request body must be a JSON object.", NO_INDEX);
  const adminOrigin = new URL(request.url).origin;
  try {
    let result;
    if (action === "confirm") {
      result = await confirmOrder(env, orderId, { actor, reason: body.reason });
      // The same follow-ups as a payment that matched: notification, confirmation email, Purchase, Amazon queue.
      if (result.changed) await runAfterPaid(env, result.order, { adminOrigin });
    } else if (action === "cancel") {
      result = await cancelOrder(env, orderId, { actor, reasonCode: body.reason, note: body.note }, { adminUrl: `${adminOrigin}/admin/` });
    } else {
      result = await changeAddress(env, orderId, { actor, shipping: body.shipping, reason: body.reason, noUnit: body.noUnit === true });
    }
    return json({ result: { changed: result.changed, payment: result.payment ?? null }, order: await adminOrderView(env, orderId) }, 200, NO_INDEX);
  } catch (error) {
    if (error instanceof OrderError) {
      return json({ error: { code: error.code, message: error.message, ...(error.field ? { field: error.field } : {}) } }, error.status, NO_INDEX);
    }
    throw error;
  }
}

export async function handleAdminApi(request, env, pathname) {
  const auth = await resolveAdmin(request, env);
  if (auth.response) return auth.response;
  const { actor } = auth;

  const team = await handleTeamApi(request, env, pathname, actor);
  if (team) return team;

  const url = new URL(request.url);
  const sandboxCheck = pathname.match(/^\/admin\/api\/orders\/([^/]+)\/refunds\/sandbox-check$/);
  if (sandboxCheck) {
    if (!sandboxRefundChecksEnabled(env)) return fail(404,'not_found','Not found.',NO_INDEX);
    if (request.method !== 'POST') return fail(405,'method_not_allowed','Use POST.',{...NO_INDEX,Allow:'POST'});
    const problem = csrfProblem(request);
    if (problem) return fail(403,'forbidden',problem,NO_INDEX);
    const body = await readJsonObject(request);
    if (!body || Object.keys(body).some(key=>key !== 'scenario') || !['above_limit','fully_refunded'].includes(body.scenario)) return fail(400,'invalid_probe','Select a fixed negative check.',NO_INDEX);
    const id=decodeURIComponent(sandboxCheck[1]);
    if (!ORDER_ID_PATTERN.test(id)) return fail(404,'not_found','Order not found.',NO_INDEX);
    const order = await getOrder(env.DB,id);
    if (!order) return fail(404,'not_found','Order not found.',NO_INDEX);
    const result = await runSandboxRefundCheck(env,order,body.scenario,actor.id);
    return json({result,order:await adminOrderView(env,id)},result.outcome === 'blocked' ? 409 : 200,NO_INDEX);
  }
  const emailRetry = pathname.match(/^\/admin\/api\/orders\/([^/]+)\/emails\/([^/]+)\/retry$/);
  if (emailRetry) {
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.", { ...NO_INDEX, Allow: "POST" });
    const problem = csrfProblem(request);
    if (problem) return fail(403, "forbidden", problem, NO_INDEX);
    if (!(await readJsonObject(request))) return fail(400,'invalid_json','Request body must be a JSON object.',NO_INDEX);
    const kind = decodeURIComponent(emailRetry[2]);
    if (!validEmailKind(kind)) return fail(404,'not_found','Email not found.',NO_INDEX);
    const id = decodeURIComponent(emailRetry[1]);
    if (!ORDER_ID_PATTERN.test(id)) return fail(404, "not_found", "Order not found.", NO_INDEX);
    const order = await getOrder(env.DB, id);
    if (!order) return fail(404, "not_found", "Order not found.", NO_INDEX);
    const email = await retryCustomerEmail(env, order, kind);
    await recordAudit(env.DB, { orderId: id, action: "order.email.retry", actor: actor.id, detail: { kind, result: email.status } });
    return json({ email, order: await adminOrderView(env, id) }, email.status === "blocked" ? 409 : 200, NO_INDEX);
  }
  const orderAction = pathname.match(/^\/admin\/api\/orders\/([^/]+)\/(confirm|cancel|address)$/);
  if (orderAction) {
    const id = decodeURIComponent(orderAction[1]);
    if (!ORDER_ID_PATTERN.test(id)) return fail(404, "not_found", "Order not found.", NO_INDEX);
    return handleOrderAction(request, env, id, orderAction[2], actor);
  }
  const ship = pathname.match(/^\/admin\/api\/orders\/([^/]+)\/ship$/);
  const refundSync = pathname.match(/^\/admin\/api\/orders\/([^/]+)\/refunds\/sync$/);
  if (refundSync) {
    if (request.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST.', { ...NO_INDEX, Allow:'POST' });
    const blocked = csrfProblem(request);
    if (blocked) return fail(403, 'forbidden', blocked, NO_INDEX);
    if (!(await readJsonObject(request))) return fail(400,'invalid_json','Request body must be a JSON object.',NO_INDEX);
    const id = decodeURIComponent(refundSync[1]);
    if (!ORDER_ID_PATTERN.test(id)) return fail(404,'not_found','Order not found.',NO_INDEX);
    const order = await getOrder(env.DB,id);
    if (!order) return fail(404,'not_found','Order not found.',NO_INDEX);
    if (!order.payment_intent_id) return fail(409,'no_payment_intent','This order has no payment intent.',NO_INDEX);
    try {
      await syncOrderRefunds(env,order);
      await applyRefundsToOrder(env, id, { adminUrl: `${url.origin}/admin/` });
    } catch {
      return fail(502,'refund_sync_failed','Could not verify refunds with Airwallex. Try again or review the provider dashboard.',NO_INDEX);
    }
    return json({order:await adminOrderView(env,id)},200,NO_INDEX);
  }
  if (ship) {
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.", { ...NO_INDEX, Allow: "POST" });
    const id = decodeURIComponent(ship[1]);
    if (!ORDER_ID_PATTERN.test(id)) return fail(404, "not_found", "Order not found.", NO_INDEX);
    return handleShip(request, env, id, actor);
  }
  const mcf = pathname.match(/^\/admin\/api\/orders\/([^/]+)\/mcf\/(submit|sync)$/);
  if (mcf) {
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.", { ...NO_INDEX, Allow: "POST" });
    const id = decodeURIComponent(mcf[1]);
    if (!ORDER_ID_PATTERN.test(id)) return fail(404, "not_found", "Order not found.", NO_INDEX);
    return mcf[2] === "submit" ? handleMcfSubmit(request, env, id, actor) : handleMcfSync(request, env, id, actor);
  }
  if (pathname === "/admin/api/mcf/sync") {
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.", { ...NO_INDEX, Allow: "POST" });
    return handleMcfSync(request, env, null, actor);
  }
  if (request.method !== "GET") return fail(405, "method_not_allowed", "Method not allowed.", { ...NO_INDEX, Allow: "GET" });

  // Read-only: list + preview against the Amazon outbound service. Creates and cancels nothing.
  if (pathname === "/admin/api/mcf/check") return json(await checkMcfConnection(env), 200, NO_INDEX);

  // Read-only: ask Airwallex or PayPal about one payment (worker/payment-lookup.js).
  const intentLookup = pathname.match(AIRWALLEX_INTENT_LOOKUP);
  if (intentLookup) return lookupAirwallexIntent(env, intentLookup[1], NO_INDEX);
  const paypalLookup = pathname.match(PAYPAL_ORDER_LOOKUP);
  if (paypalLookup) return lookupPaypalOrder(env, paypalLookup[1], NO_INDEX);

  // Unpaid checkouts (D36): not orders, so not in the order list, counts or reports.
  if (pathname === "/admin/api/checkouts") {
    const status = url.searchParams.get("status") || "all";
    if (!["all", "open", "expired"].includes(status)) return fail(400, "invalid_status", "Unknown status.", NO_INDEX);
    return json(await listCheckouts(env.DB, { status, q: url.searchParams.get("q") || "", before: url.searchParams.get("before") || null }), 200, NO_INDEX);
  }

  // Messages from the Contact us form (worker/contact.js), newest first.
  if (pathname === "/admin/api/contact-messages") {
    return json(await listContactMessages(env.DB, { before: url.searchParams.get("before") || undefined }), 200, NO_INDEX);
  }

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
