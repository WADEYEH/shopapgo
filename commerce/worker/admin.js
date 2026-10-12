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
//   GET  /admin/api/dashboard                the first page: numbers, what is waiting, shipping, connections (worker/dashboard.js)
//   POST /admin/api/orders/:id/notes         an internal note { body } (worker/order-notes.js, I10)
//   GET  /admin/api/products[/:id]           products with sales, stock and the on-sale switch (worker/products.js)
//   POST /admin/api/products/:id/sale        owners only: stop or resume selling { onSale, reason } (A4, M9-07)
//   POST /admin/api/orders/:id/refund        owners only: { key, amountCents, reason, note, notify, cancelFirst } (D51, D55)
//   GET  /admin/api/customers[/:ref]         customers, one customer by any of their order numbers (worker/customers.js)
//   POST /admin/api/customers/:ref/notes     an internal note on the customer { body }
//   GET  /admin/api/customers/:ref/export    privacy: everything about the customer, as a JSON file (worker/customer-privacy.js)
//   POST /admin/api/customers/:ref/erase     privacy: delete the customer's data, amounts kept { confirm: their email } (D53)
//   POST /admin/api/customers/:ref/privacy-requests  record a request { kind, receivedAt, handler, note }
//   POST /admin/api/privacy-requests/:id/close        { outcome, note }
//   GET  /admin/api/reports/sales            the sales report (?preset=&from=&to=; worker/reports.js)
//   GET  /admin/api/exports/orders.csv, /admin/api/exports/payments.csv   the same period as CSV (I4, M9-06)
//   GET  /admin/api/orders/:id/evidence      dispute evidence, a printable page (worker/evidence.js, M5-12)
//
// Writes (POST /admin/api/orders/:id/ship, .../mcf/submit, .../mcf/sync, /admin/api/mcf/sync, members) need the same credentials plus browser-CSRF
// guards, because a browser re-sends Basic credentials on its own: the body must be
// application/json (forces a CORS preflight for cross-site pages), and a request that
// carries Origin / Sec-Fetch-Site must be same-origin. Scripts using a Bearer token
// without those headers are unaffected.

import { fail, json } from "./http.js";
import { ORDER_ID_PATTERN } from "./checkout.js";
import { FULFILLMENT_FILTERS, ISSUE_FILTERS, ORDER_STATUSES, ORDER_VIEWS, adminOrder, fulfillmentCounts, getOrder, getOrderPayment, issueCounts, listOrders, orderCounts, viewCounts } from "./orders.js";
import { disputesForOrder } from "./disputes.js";
import { FulfillmentError, markShipped, validateShipment, recordAudit } from "./fulfillment.js";
import { processMessageJob, retryCustomerEmail } from "./customer-email.js";
import { validEmailKind } from './email-delivery.js';
import { MIN_ADMIN_TOKEN_LENGTH } from "./admin-auth.js";
import { accessMode, resolveAdmin } from "./admin-identity.js";
import { MemberError, addMember, changeRole, ensureOwner, listMembers, removeMember, setTeamAlerts, teamAlertsOf } from "./members.js";
import { accessListStatus, syncAccessList } from "./access-list.js";
import { activityActors, listActivity } from "./activity.js";
import { OrderError, applyRefundsToOrder, cancelOrder, changeAddress, confirmOrder, coolingOffMinutes, orderCoreView, orderHolds } from "./order-core.js";
import { runAfterPaid } from "./after-payment.js";
import { listCheckouts } from "./checkouts.js";
import { cancelMcfOrder, checkMcfConnection, getMcfRecord, isStockout, mcfView, submitOrderToMcf, syncAllMcf, syncMcfOrder } from "./mcf.js";
import { listHoldTests, runHoldTest } from "./mcf-hold-test.js";
import { cancelAndRefund, refundRequestOf } from "./order-refunds.js";
import { refundHold, syncOrderRefunds } from './refunds.js';
import { sandboxRefundChecksEnabled, runSandboxRefundCheck } from './sandbox-refund-checks.js';
import { AIRWALLEX_INTENT_LOOKUP, PAYPAL_ORDER_LOOKUP, lookupAirwallexIntent, lookupPaypalOrder } from "./payment-lookup.js";
import { listContactMessages } from "./contact.js";
import { dashboard, salesNumbers } from "./dashboard.js";
import { NoteError, addNote, listNotes } from "./order-notes.js";
import { ProductError, getProduct, listProducts, setOnSale } from "./products.js";
import { refundPanel, requestAdminRefund } from "./admin-refunds.js";
import { CUSTOMER_SORTS, CustomerError, addCustomerNote, getCustomer, listCustomers } from "./customers.js";
import { closePrivacyRequest, eraseCustomer, exportCustomer, privacyView, recordPrivacyRequest } from "./customer-privacy.js";
import { ReportError, ordersCsv, paymentsCsv, periodOf, salesReport } from "./reports.js";
import { disputeEvidence } from "./evidence.js";

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

// The order detail plus the Amazon MCF block (mode, reason, record, which buttons apply), how it was paid and its
// disputes (worker/disputes.js).
// actor: the signed-in person, for what they may do here (the refund panel is for owners, D51).
async function adminOrderView(env, orderId, actor = null) {
  const order = await adminOrder(env.DB, orderId);
  if (!order) return null;
  const row = await getOrder(env.DB, orderId);
  const paymentProvider = row.payment_intent_id ? (await getOrderPayment(env.DB, orderId))?.provider ?? "airwallex" : null;
  return {
    ...order, paymentProvider, disputes: await disputesForOrder(env.DB, orderId), refundRequest: await refundRequestOf(env.DB, orderId),
    sandboxRefundChecks: sandboxRefundChecksEnabled(env) && paymentProvider !== "paypal",
    mcf: await mcfView(env, row, order.fulfillment), core: await orderCoreView(env, orderId), notes: await listNotes(env.DB, orderId),
    refund: await refundPanel(env, row, actor),
  };
}

// PayPal refunds arrive by webhook (worker/payment-events.js); the refund check and sync buttons ask Airwallex.
const paidWithPaypal = async (env, order) => Boolean(order.payment_intent_id) && (await getOrderPayment(env.DB, order.id))?.provider === "paypal";

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
  return json({ result: { outcome: result.outcome, reason: result.reason ?? null }, order: await adminOrderView(env, orderId, actor) }, 200, NO_INDEX);
}

// POST .../mcf/cancel: stop the Amazon order only (the order stays paid and can be sent again).
async function handleMcfCancel(request, env, orderId, actor) {
  const blocked = csrfProblem(request);
  if (blocked) return fail(403, "forbidden", blocked, NO_INDEX);
  if (!(await readJsonObject(request))) return fail(400, "invalid_json", "Request body must be a JSON object.", NO_INDEX);
  if (!(await getOrder(env.DB, orderId))) return fail(404, "not_found", "Order not found.", NO_INDEX);
  const result = await cancelMcfOrder(env, orderId, { actor: actor.id });
  return json({ result: { outcome: result.outcome, reason: result.reason ?? null }, order: await adminOrderView(env, orderId, actor) }, result.outcome === "failed" ? 502 : 200, NO_INDEX);
}

// POST /admin/api/mcf/hold-test (owners): the Hold test order (worker/mcf-hold-test.js).
async function handleHoldTest(request, env, actor) {
  const blocked = csrfProblem(request);
  if (blocked) return fail(403, "forbidden", blocked, NO_INDEX);
  if (actor.role !== "owner") return fail(403, "owner_only", "Only an owner can create a Hold test order.", NO_INDEX);
  if (!(await readJsonObject(request))) return fail(400, "invalid_json", "Request body must be a JSON object.", NO_INDEX);
  const result = await runHoldTest(env, { actor: actor.id });
  return json({ result, tests: await listHoldTests(env.DB) }, 200, NO_INDEX);
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
    { result: { outcome: result.outcome, shipped: Boolean(result.shipped), email: result.email ?? null, reason: result.reason ?? null }, order: await adminOrderView(env, orderId, actor) },
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
    return json({ order: await adminOrderView(env, orderId, actor), email: { status: email.status } }, 200, NO_INDEX);
  } catch (error) {
    if (error instanceof FulfillmentError) return fail(error.status, error.code, error.message, NO_INDEX);
    throw error;
  }
}

// Members and the activity log. Returns null when the path is not one of theirs.
async function handleTeamApi(request, env, pathname, actor) {
  const url = new URL(request.url);
  if (pathname === "/admin/api/me" && request.method === "GET") {
    // teamAlerts: this person's own choice (worker/members.js); null when the sign-in is not on the member list.
    // site: "staging" shows the STAGING tag on every page.
    return json({ actor: { id: actor.id, email: actor.email, role: actor.role, via: actor.via }, accessSignIn: accessMode(env), teamAlerts: await teamAlertsOf(env.DB, actor.email), site: env.SITE_ENV === "staging" ? "staging" : "production" }, 200, NO_INDEX);
  }
  if (pathname === "/admin/api/me/alerts") {
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.", { ...NO_INDEX, Allow: "POST" });
    const blocked = csrfProblem(request);
    if (blocked) return fail(403, "forbidden", blocked, NO_INDEX);
    const body = await readJsonObject(request);
    if (!body) return fail(400, "invalid_json", "Request body must be a JSON object.", NO_INDEX);
    try {
      return json(await setTeamAlerts(env, actor, body), 200, NO_INDEX);
    } catch (error) {
      if (error instanceof MemberError) return fail(error.status, error.code, error.message, NO_INDEX);
      throw error;
    }
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
    } else if (action === "cancel-refund") {
      // Out of stock at Amazon (M6-06): cancel and refund in one step; pressed again it only retries a failed refund.
      const cancellation = await env.DB.prepare("SELECT reason_code FROM order_cancellations WHERE order_id = ?").bind(orderId).first();
      const allowed = isStockout(await getMcfRecord(env.DB, orderId)) || cancellation?.reason_code === "out_of_stock";
      if (!allowed) throw new OrderError(409, "not_out_of_stock", "Cancel and refund is for orders Amazon cannot fill. Use Cancel, and refund in the payment provider's dashboard.");
      const outcome = await cancelAndRefund(env, orderId, { actor, reasonCode: "out_of_stock", note: body.note }, { adminUrl: `${adminOrigin}/admin/` });
      result = { changed: outcome.cancelled, refund: outcome };
    } else {
      result = await changeAddress(env, orderId, { actor, shipping: body.shipping, reason: body.reason, noUnit: body.noUnit === true });
    }
    return json({ result: { changed: result.changed, payment: result.payment ?? null, refund: result.refund ?? null }, order: await adminOrderView(env, orderId, actor) }, 200, NO_INDEX);
  } catch (error) {
    if (error instanceof OrderError) {
      return json({ error: { code: error.code, message: error.message, ...(error.field ? { field: error.field } : {}) } }, error.status, NO_INDEX);
    }
    throw error;
  }
}

// POST .../refund (owners; worker/admin-refunds.js): the refund panel on the order page.
async function handleRefund(request, env, orderId, actor) {
  if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.", { ...NO_INDEX, Allow: "POST" });
  const blocked = csrfProblem(request);
  if (blocked) return fail(403, "forbidden", blocked, NO_INDEX);
  const body = await readJsonObject(request);
  if (!body) return fail(400, "invalid_json", "Request body must be a JSON object.", NO_INDEX);
  try {
    const result = await requestAdminRefund(env, orderId, body, { actor, adminUrl: `${new URL(request.url).origin}/admin/` });
    return json({ result, order: await adminOrderView(env, orderId, actor) }, 200, NO_INDEX);
  } catch (error) {
    if (error instanceof OrderError) return json({ error: { code: error.code, message: error.message, ...(error.field ? { field: error.field } : {}) } }, error.status, NO_INDEX);
    throw error;
  }
}

const attachment = (filename, body, type) => new Response(body, {
  status: 200,
  headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${filename}"`, ...NO_INDEX },
});

// Customers, privacy requests, reports and exports. Returns null when the path is not one of theirs.
async function handleCustomerApi(request, env, pathname, actor) {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams);
  try {
    if (pathname === "/admin/api/customers" && request.method === "GET") {
      if (params.sort && !CUSTOMER_SORTS.includes(params.sort)) return fail(400, "invalid_sort", "Unknown sort.", NO_INDEX);
      return json(await listCustomers(env.DB, { q: params.q, sort: params.sort, page: params.page }), 200, NO_INDEX);
    }
    if (pathname === "/admin/api/reports/sales" && request.method === "GET") return json(await salesReport(env, periodOf(env, params)), 200, NO_INDEX);
    if (pathname === "/admin/api/exports/orders.csv" || pathname === "/admin/api/exports/payments.csv") {
      if (request.method !== "GET") return fail(405, "method_not_allowed", "Use GET.", { ...NO_INDEX, Allow: "GET" });
      const file = await (pathname.endsWith("orders.csv") ? ordersCsv : paymentsCsv)(env, actor, periodOf(env, params));
      return attachment(file.filename, file.body, "text/csv; charset=utf-8");
    }
    const close = pathname.match(/^\/admin\/api\/privacy-requests\/(PR-[0-9a-f-]{36})\/close$/);
    const customer = pathname.match(/^\/admin\/api\/customers\/([^/]+)(?:\/(notes|export|erase|privacy-requests))?$/);
    if (!close && !customer) return null;
    const write = Boolean(close) || ["notes", "erase", "privacy-requests"].includes(customer?.[2]);
    if (write) {
      if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.", { ...NO_INDEX, Allow: "POST" });
      const blocked = csrfProblem(request);
      if (blocked) return fail(403, "forbidden", blocked, NO_INDEX);
    } else if (request.method !== "GET") return fail(405, "method_not_allowed", "Use GET.", { ...NO_INDEX, Allow: "GET" });
    const body = write ? await readJsonObject(request) : null;
    if (write && !body) return fail(400, "invalid_json", "Request body must be a JSON object.", NO_INDEX);
    if (close) return json({ request: await closePrivacyRequest(env, actor, close[1], body) }, 200, NO_INDEX);
    const ref = decodeURIComponent(customer[1]);
    if (!ORDER_ID_PATTERN.test(ref)) return fail(404, "not_found", "Customer not found.", NO_INDEX);
    const view = async () => getCustomer(env, ref, { privacy: privacyView });
    switch (customer[2]) {
      case "notes":
        return json({ notes: await addCustomerNote(env, actor, ref, body) }, 200, NO_INDEX);
      case "export":
        return attachment(`apgo-customer-${ref}.json`, JSON.stringify(await exportCustomer(env, actor, ref), null, 2), "application/json; charset=utf-8");
      case "erase":
        return json({ result: await eraseCustomer(env, actor, ref, body), customer: await view() }, 200, NO_INDEX);
      case "privacy-requests":
        await recordPrivacyRequest(env, actor, ref, body);
        return json({ customer: await view() }, 200, NO_INDEX);
      default: {
        const found = await view();
        return found ? json(found, 200, NO_INDEX) : fail(404, "not_found", "Customer not found.", NO_INDEX);
      }
    }
  } catch (error) {
    if (error instanceof CustomerError) return json({ error: { code: error.code, message: error.message, ...(error.blockers ? { blockers: error.blockers } : {}) } }, error.status, NO_INDEX);
    if (error instanceof ReportError) return fail(error.status, error.code, error.message, NO_INDEX);
    throw error;
  }
}

export async function handleAdminApi(request, env, pathname) {
  const auth = await resolveAdmin(request, env);
  if (auth.response) return auth.response;
  const { actor } = auth;

  const team = await handleTeamApi(request, env, pathname, actor);
  if (team) return team;
  const customers = await handleCustomerApi(request, env, pathname, actor);
  if (customers) return customers;

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
    if (await paidWithPaypal(env,order)) return fail(409,'paypal_order','This order was paid with PayPal; refund checks run against Airwallex only.',NO_INDEX);
    const result = await runSandboxRefundCheck(env,order,body.scenario,actor.id);
    return json({result,order:await adminOrderView(env,id,actor)},result.outcome === 'blocked' ? 409 : 200,NO_INDEX);
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
    return json({ email, order: await adminOrderView(env, id, actor) }, email.status === "blocked" ? 409 : 200, NO_INDEX);
  }
  const notes = pathname.match(/^\/admin\/api\/orders\/([^/]+)\/notes$/);
  if (notes) {
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.", { ...NO_INDEX, Allow: "POST" });
    const blocked = csrfProblem(request);
    if (blocked) return fail(403, "forbidden", blocked, NO_INDEX);
    const body = await readJsonObject(request);
    if (!body) return fail(400, "invalid_json", "Request body must be a JSON object.", NO_INDEX);
    const id = decodeURIComponent(notes[1]);
    if (!ORDER_ID_PATTERN.test(id)) return fail(404, "not_found", "Order not found.", NO_INDEX);
    try {
      const note = await addNote(env, actor, id, body);
      return json({ note, notes: await listNotes(env.DB, id) }, 200, NO_INDEX);
    } catch (error) {
      if (error instanceof NoteError) return fail(error.status, error.code, error.message, NO_INDEX);
      throw error;
    }
  }
  const productSale = pathname.match(/^\/admin\/api\/products\/([a-z0-9]+)\/sale$/);
  if (productSale) {
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.", { ...NO_INDEX, Allow: "POST" });
    const blocked = csrfProblem(request);
    if (blocked) return fail(403, "forbidden", blocked, NO_INDEX);
    const body = await readJsonObject(request);
    if (!body) return fail(400, "invalid_json", "Request body must be a JSON object.", NO_INDEX);
    try {
      const result = await setOnSale(env, actor, productSale[1], body);
      return json({ changed: result.changed, product: await getProduct(env, productSale[1]) }, 200, NO_INDEX);
    } catch (error) {
      if (error instanceof ProductError) return fail(error.status, error.code, error.message, NO_INDEX);
      throw error;
    }
  }
  const refund = pathname.match(/^\/admin\/api\/orders\/([^/]+)\/refund$/);
  if (refund) {
    const id = decodeURIComponent(refund[1]);
    if (!ORDER_ID_PATTERN.test(id)) return fail(404, "not_found", "Order not found.", NO_INDEX);
    return handleRefund(request, env, id, actor);
  }
  const orderAction = pathname.match(/^\/admin\/api\/orders\/([^/]+)\/(confirm|cancel|address|cancel-refund)$/);
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
    if (await paidWithPaypal(env,order)) return fail(409,'paypal_order','This order was paid with PayPal; its refunds arrive from PayPal automatically. Check the PayPal dashboard.',NO_INDEX);
    try {
      await syncOrderRefunds(env,order);
      await applyRefundsToOrder(env, id, { adminUrl: `${url.origin}/admin/` });
    } catch {
      return fail(502,'refund_sync_failed','Could not verify refunds with Airwallex. Try again or review the provider dashboard.',NO_INDEX);
    }
    return json({order:await adminOrderView(env,id,actor)},200,NO_INDEX);
  }
  if (ship) {
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.", { ...NO_INDEX, Allow: "POST" });
    const id = decodeURIComponent(ship[1]);
    if (!ORDER_ID_PATTERN.test(id)) return fail(404, "not_found", "Order not found.", NO_INDEX);
    return handleShip(request, env, id, actor);
  }
  const mcf = pathname.match(/^\/admin\/api\/orders\/([^/]+)\/mcf\/(submit|sync|cancel)$/);
  if (mcf) {
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.", { ...NO_INDEX, Allow: "POST" });
    const id = decodeURIComponent(mcf[1]);
    if (!ORDER_ID_PATTERN.test(id)) return fail(404, "not_found", "Order not found.", NO_INDEX);
    if (mcf[2] === "cancel") return handleMcfCancel(request, env, id, actor);
    return mcf[2] === "submit" ? handleMcfSubmit(request, env, id, actor) : handleMcfSync(request, env, id, actor);
  }
  if (pathname === "/admin/api/mcf/sync") {
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.", { ...NO_INDEX, Allow: "POST" });
    return handleMcfSync(request, env, null, actor);
  }
  if (pathname === "/admin/api/mcf/hold-test") {
    if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.", { ...NO_INDEX, Allow: "POST" });
    return handleHoldTest(request, env, actor);
  }
  if (request.method !== "GET") return fail(405, "method_not_allowed", "Method not allowed.", { ...NO_INDEX, Allow: "GET" });

  // Read-only: list + preview against the Amazon outbound service. Creates and cancels nothing.
  if (pathname === "/admin/api/mcf/check") return json(await checkMcfConnection(env), 200, NO_INDEX);
  if (pathname === "/admin/api/mcf/hold-tests") return json({ tests: await listHoldTests(env.DB) }, 200, NO_INDEX);

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

  if (pathname === "/admin/api/dashboard") return json(await dashboard(env), 200, NO_INDEX);
  if (pathname === "/admin/api/products") return json({ products: await listProducts(env) }, 200, NO_INDEX);
  const product = pathname.match(/^\/admin\/api\/products\/([a-z0-9]+)$/);
  if (product) {
    const found = await getProduct(env, product[1]);
    return found ? json(found, 200, NO_INDEX) : fail(404, "not_found", "Product not found.", NO_INDEX);
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
    const issue = url.searchParams.get("issue") || undefined;
    if (issue && !ISSUE_FILTERS.includes(issue)) return fail(400, "invalid_issue", "Unknown issue filter.", NO_INDEX);
    const view = url.searchParams.get("view") || undefined;
    if (view && !ORDER_VIEWS.includes(view)) return fail(400, "invalid_view", "Unknown view.", NO_INDEX);
    const page = await listOrders(env.DB, {
      status,
      fulfillment,
      issue,
      view,
      coolingMinutes: coolingOffMinutes(env),
      q: url.searchParams.get("q") || undefined,
      limit: url.searchParams.get("limit") || undefined,
      before: url.searchParams.get("before") || undefined,
    });
    return json({
      ...page,
      counts: await orderCounts(env.DB),
      fulfillmentCounts: await fulfillmentCounts(env.DB),
      issueCounts: await issueCounts(env.DB),
      viewCounts: await viewCounts(env.DB),
      // The numbers above the list (D50); not for the next pages.
      numbers: url.searchParams.get("before") ? undefined : await salesNumbers(env),
    }, 200, NO_INDEX);
  }

  // Dispute evidence (M5-12, D57): a printable page to save as PDF and upload in the provider's dispute.
  const evidence = pathname.match(/^\/admin\/api\/orders\/([^/]+)\/evidence$/);
  if (evidence) {
    const id = decodeURIComponent(evidence[1]);
    if (!ORDER_ID_PATTERN.test(id)) return fail(404, "not_found", "Order not found.", NO_INDEX);
    const file = await disputeEvidence(env, id, actor);
    if (!file) return fail(404, "not_found", "Only paid orders have evidence to export.", NO_INDEX);
    return attachment(file.filename, file.html, "text/html; charset=utf-8");
  }

  const match = pathname.match(/^\/admin\/api\/orders\/([^/]+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (!ORDER_ID_PATTERN.test(id)) return fail(404, "not_found", "Order not found.", NO_INDEX);
    const order = await adminOrderView(env, id, actor);
    return order ? json(order, 200, NO_INDEX) : fail(404, "not_found", "Order not found.", NO_INDEX);
  }
  return fail(404, "not_found", "Not found.", NO_INDEX);
}
