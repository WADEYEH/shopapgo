// Fake /admin/api/* responses built from the real worker/orders.js view code shape.
// The ship endpoint builds its email with the real worker/customer-email.js templates and
// records the payload instead of sending it: nothing here ever reaches Resend.
import { buildShipmentEmail, validateShipmentForMock } from "./admin-mock-email.mjs";

export const SAMPLE_ORDERS = [
  {
    id: "APGO-US-0123456789AB", status: "paid", email: "ada.lee@example.com", marketingOptIn: true,
    shipping: { firstName: "Ada", lastName: "Lee", street: "100 Example Ave", street2: "Apt 4", city: "Austin", state: "TX", zip: "78701" },
    shippingMethod: "express",
    lines: [
      { id: "d204", sku: "D204", name: "APGO Atomic Colored Glaze", size: "300 mL · 10.1 fl oz", qty: 1, unitCents: 5999, lineCents: 5999 },
      { id: "d215", sku: "D215", name: "APGO Atomic Glaze Coating", size: "200 mL · 6.8 fl oz", qty: 2, unitCents: 2999, lineCents: 5998 },
    ],
    currency: "USD", subtotalCents: 11997, shippingCents: 900, taxCents: 0, totalCents: 12897,
    paymentIntentId: "int_demo_1", createdAt: "2026-09-30T05:10:00.000Z", updatedAt: "2026-09-30T05:11:00.000Z", paidAt: "2026-09-30T05:11:00.000Z",
    notification: { status: "skipped", updatedAt: "2026-09-30T05:11:00.000Z", channels: [{ channel: "none", status: "skipped", detail: "" }] },
  },
  {
    id: "APGO-US-7K3M9Q2W4XZ8", status: "pending", email: "sam.ortiz@example.com", marketingOptIn: false,
    shipping: { firstName: "Sam", lastName: "Ortiz", street: "9 Harbor Rd", street2: "", city: "Portland", state: "OR", zip: "97205" },
    shippingMethod: "standard",
    lines: [{ id: "d215", sku: "D215", name: "APGO Atomic Glaze Coating", size: "200 mL · 6.8 fl oz", qty: 1, unitCents: 2999, lineCents: 2999 }],
    currency: "USD", subtotalCents: 2999, shippingCents: 0, taxCents: 0, totalCents: 2999,
    paymentIntentId: "int_demo_2", createdAt: "2026-09-30T04:40:00.000Z", updatedAt: "2026-09-30T04:40:00.000Z", paidAt: null, notification: null,
  },
  {
    id: "APGO-US-B2C4D6F8G0H1", status: "cancelled", email: "x@example.com", marketingOptIn: false,
    shipping: { firstName: "Xi", lastName: "Chen", street: "1 Market St", street2: "", city: "San Francisco", state: "CA", zip: "94105" },
    shippingMethod: "standard",
    lines: [{ id: "d204", sku: "D204", name: "APGO Atomic Colored Glaze", size: "300 mL · 10.1 fl oz", qty: 1, unitCents: 5999, lineCents: 5999 }],
    currency: "USD", subtotalCents: 5999, shippingCents: 0, taxCents: 0, totalCents: 5999,
    paymentIntentId: null, createdAt: "2026-09-29T20:00:00.000Z", updatedAt: "2026-09-29T20:00:00.000Z", paidAt: null, notification: null,
  },
];

const summary = (o) => {
  const disputed = openDisputes(o).length > 0;
  const stockout = o.mcfRecord?.status === "rejected" && o.mcfRecord?.mcfStatus === "UNFULFILLABLE";
  const shipping = o.status === "cancelled" ? "cancelled" : o.status === "review" ? "review" : o.fulfillment ? "shipped"
    : o.status !== "paid" ? null : disputed ? "on_hold" : o.mcfRecord?.status === "submitted" ? "with_amazon" : stockout ? "out_of_stock"
    : ["failed", "rejected"].includes(o.mcfRecord?.status) ? "not_sent" : o.core?.coolingOffEndsAt ? "cooling_off" : "waiting";
  return {
    id: o.id, status: o.status, email: o.email, name: `${o.shipping.firstName} ${o.shipping.lastName}`, city: o.shipping.city, state: o.shipping.state,
    itemCount: o.lines.reduce((n, l) => n + l.qty, 0), items: o.lines.map((l) => ({ sku: l.sku, qty: l.qty })), currency: o.currency, totalCents: o.totalCents,
    refundedCents: 0, paymentProvider: o.paymentIntentId ? o.paymentProvider ?? "airwallex" : null,
    createdAt: o.createdAt, paidAt: o.paidAt, notification: o.notification?.status ?? null,
    fulfillmentStatus: o.fulfillment ? "shipped" : "unfulfilled", shippedAt: o.fulfillment?.shippedAt ?? null,
    disputed, disputeDueAt: openDisputes(o).map((d) => d.dueAt).sort()[0] ?? null,
    payment: o.status === "review" ? "review" : disputed ? "disputed" : o.status === "pending" ? "awaiting" : o.status === "cancelled" && !o.paidAt ? "cancelled" : "paid",
    shipping,
    todo: o.status === "review" ? { code: "review" } : disputed ? { code: "dispute", dueAt: openDisputes(o).map((d) => d.dueAt).sort()[0] ?? null } : null,
  };
};
// The order list's views (worker/orders.js ORDER_VIEWS).
const inView = (o, view) => ({
  all: true,
  to_ship: o.status === "paid" && !o.fulfillment,
  review: o.status === "review",
  problems: o.status === "paid" && !o.fulfillment && ["failed", "rejected"].includes(o.mcfRecord?.status),
  disputes: openDisputes(o).length > 0,
  shipped: Boolean(o.fulfillment),
  cancelled: o.status === "cancelled",
}[view] ?? true);
export const PRODUCTS = [
  { id: "d204", sku: "D204", name: "Atomic Colored Glaze", routine: "dry", size: "300 mL", oz: "10.1 fl oz", priceCents: 5999 },
  { id: "d215", sku: "D215", name: "Atomic Glaze Coating", routine: "wet", size: "200 mL", oz: "6.8 fl oz", priceCents: 2999 },
];
// Disputes as worker/disputes.js disputesForOrder() returns them.
const openDisputes = (o) => (o.disputes ?? []).filter((d) => d.status === "open");

// MCF block as worker/mcf.js mcfView() returns it. mode: off | not_configured | ready.
const mcfBlock = (o, mcf) => {
  const record = o.mcfRecord ?? null;
  const eligible = o.status === "paid" && !o.fulfillment;
  const stockout = record?.stockoutAt && record.status === "rejected" && record.mcfStatus === "UNFULFILLABLE" && o.status === "paid";
  return {
    stockout: stockout ? { since: record.stockoutAt, days: Math.floor((Date.parse("2026-10-09T03:00:00.000Z") - Date.parse(record.stockoutAt)) / 86_400_000), canCancelAndRefund: true } : null,
    canCancelAtAmazon: Boolean(record) && record.status === "submitted",
    mode: mcf.mode,
    reason: mcf.mode === "off" ? 'MCF_AUTO_SUBMIT is not "true"; ship this order manually.' : mcf.mode === "not_configured" ? "missing OUTBOUND_INTERNAL_TOKEN" : null,
    canSubmit: mcf.mode === "ready" && eligible && (!record || ["failed", "rejected"].includes(record.status)),
    canSync: Boolean(record) && record.status === "submitted",
    record,
  };
};

export const CANCEL_REASONS = {
  customer_request: "Customer asked to cancel", out_of_stock: "Out of stock", full_refund: "Fully refunded",
  chargeback: "Chargeback lost", review_rejected: "Payment did not match (review)", other: "Other",
};

// The order core block as worker/order-core.js orderCoreView() returns it, from a small description:
// { stage, coolingOffEndsAt, holds, cancellation, payment }.
export function coreBlock(o, core) {
  const stage = core.stage;
  const cooling = Boolean(core.coolingOffEndsAt) && stage === "paid";
  return {
    stage,
    coolingOff: { endsAt: core.coolingOffEndsAt ?? null, active: cooling },
    holds: core.holds ?? (stage === "review" ? [{ code: "review", message: "The amount paid did not match the order. Confirm or cancel it." }] : []),
    cancellation: core.cancellation ?? null,
    actions: { confirm: stage === "review", cancel: ["review", "paid", "fulfilling"].includes(stage), changeAddress: stage === "paid" && cooling },
    payment: core.payment ?? { provider: "airwallex", paidCents: o.totalCents, refundedCents: 0, refundStatus: "none" },
    cancelReasons: CANCEL_REASONS,
  };
}

// Who the mocked back office thinks is signed in (mockAdminApi's team.role), for the refund panel.
let mockRole = "owner";
const REFUND_REASONS = ["customer_request", "returned", "damaged", "not_received", "out_of_stock", "goodwill", "other"];
function refundPanelOf(o) {
  const requests = o.adminRefunds ?? [];
  const base = { requests, reasons: REFUND_REASONS };
  if (mockRole !== "owner") return { ...base, allowed: false, why: "owner_only" };
  if (!o.paidAt) return { ...base, allowed: false, why: "not_paid" };
  if (openDisputes(o).length) return { ...base, allowed: false, why: "dispute_open" };
  const left = o.totalCents - (o.refunds?.refundedCents ?? 0);
  if (left <= 0) return { ...base, allowed: false, why: "nothing_left", refundableCents: 0 };
  const unshipped = !o.fulfillment && ["paid", "review"].includes(o.status);
  return { ...base, allowed: true, refundableCents: left, fullOnly: unshipped, canCancelFirst: unshipped, stage: unshipped ? "paid" : o.fulfillment ? "shipped" : "cancelled" };
}

const view = (o, mcf = { mode: "off" }) => ({
  ...o,
  refund: refundPanelOf(o),
  fulfillmentStatus: o.fulfillment ? "shipped" : "unfulfilled",
  fulfillment: o.fulfillment ?? null,
  paymentProvider: o.paymentProvider ?? (o.paymentIntentId ? "airwallex" : null),
  disputes: o.disputes ?? [],
  refundRequest: o.refundRequest ?? null,
  emails: o.emails ?? [],
  audit: o.audit ?? [],
  mcf: mcfBlock(o, mcf),
  ...(o.core ? { core: coreBlock(o, o.core) } : {}),
  notes: o.notes ?? [],
});

// Returns the list of requested URLs so tests can assert on query strings.
// Options: status (force an error status), emailConfigured (false = shipment email is "skipped"),
// shipError ({ status, code, message } forces the ship POST to fail).
// The returned array also carries .writes (ship requests), .mcf (MCF POSTs) and .emails (would-be Resend payloads).
export const TEAM_OWNER = "owner@apgo.example";
const TEAM_STAMP = "2026-10-09T03:00:00.000Z";

// Who is signed in, the Activity log and Members, like worker/admin.js. team: { role, accessSignIn, accessList,
// activity, members } or null (an older Worker without these endpoints). Returns a route handler; records writes.
function teamMock(team, writes) {
  const me = { id: TEAM_OWNER, email: TEAM_OWNER, role: team.role ?? "owner", via: team.accessSignIn ? "access" : "password" };
  const members = structuredClone(team.members ?? [{ email: TEAM_OWNER, role: "owner", status: "active", addedBy: "system", addedAt: TEAM_STAMP, updatedBy: "system", updatedAt: TEAM_STAMP }]);
  const activity = structuredClone(team.activity ?? []);
  let accessList = structuredClone(team.accessList ?? { configured: false, last: null });
  const syncResult = () => (accessList.configured ? { status: "synced", added: 1, removed: 0, detail: "" } : { status: "not_configured", added: 0, removed: 0, detail: "The Cloudflare Access list sync is not set up." });
  const owners = () => members.filter((m) => m.status === "active" && m.role === "owner").length;
  // Team emails (I12): team.teamAlerts is this person's setting (null = not on the list); team.othersGetAlerts says
  // whether anyone else still gets them (else turning off is refused).
  let teamAlerts = team.teamAlerts === undefined ? true : team.teamAlerts;
  return (url, request, reply) => {
    if (url.pathname === "/admin/api/me") return reply(200, { actor: me, accessSignIn: Boolean(team.accessSignIn), teamAlerts, site: team.site ?? "production" });
    if (url.pathname === "/admin/api/me/alerts") {
      const body = request.postDataJSON();
      writes.push({ path: url.pathname, contentType: request.headers()["content-type"], body });
      if (!body.on && !team.othersGetAlerts) return reply(409, { error: { code: "last_recipient", message: "At least one person must get the team emails. Ask someone else to turn theirs on first." } });
      teamAlerts = body.on;
      return reply(200, { teamAlerts });
    }
    if (url.pathname === "/admin/api/activity") {
      const actor = url.searchParams.get("actor");
      return reply(200, { entries: activity.filter((e) => !actor || e.actor === actor), nextCursor: null, actors: [...new Set(activity.map((e) => e.actor))].sort() });
    }
    if (!url.pathname.startsWith("/admin/api/members")) return null;
    if (me.role !== "owner") return reply(403, { error: { code: "owner_only", message: "Only an owner can manage members." } });
    if (request.method() === "GET") return reply(200, { members, accessSignIn: Boolean(team.accessSignIn), accessList });
    const body = request.postDataJSON();
    writes.push({ path: url.pathname, contentType: request.headers()["content-type"], body });
    const email = String(body.email ?? "").trim().toLowerCase();
    const found = members.find((m) => m.email === email && m.status === "active");
    const done = (title) => {
      activity.unshift({ source: "admin", at: TEAM_STAMP, actor: me.id, via: me.via, action: title, target: email, before: null, after: null, reason: body.reason || null, detail: {} });
      return reply(200, { member: members.find((m) => m.email === email), notified: { sent: owners(), skipped: 0, failed: 0 }, sync: syncResult(), members, accessList });
    };
    if (url.pathname === "/admin/api/members/sync") {
      accessList = { configured: true, last: { status: "synced", at: TEAM_STAMP, detail: "" } };
      return reply(200, { sync: syncResult(), accessList });
    }
    if (url.pathname === "/admin/api/members") {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(400, { error: { code: "invalid_email", message: "Enter a valid email address." } });
      if (found) return reply(409, { error: { code: "already_member", message: `${email} is already a member.` } });
      members.push({ email, role: body.role || "member", status: "active", addedBy: me.id, addedAt: TEAM_STAMP, updatedBy: me.id, updatedAt: TEAM_STAMP });
      return done("member.added");
    }
    if (!found) return reply(404, { error: { code: "not_a_member", message: `${email} is not a member.` } });
    if (found.role === "owner" && owners() <= 1 && (url.pathname.endsWith("/remove") || body.role === "member")) {
      return reply(409, { error: { code: "last_owner", message: "The last owner cannot be removed. Make someone else an owner first." } });
    }
    if (url.pathname.endsWith("/remove")) {
      Object.assign(found, { status: "removed", updatedBy: me.id, updatedAt: TEAM_STAMP });
      return done("member.removed");
    }
    found.role = body.role;
    return done("member.role_changed");
  };
}

// MCF options: mcf ({ mode: "off" | "not_configured" | "ready", submitFails: n = first n submits fail,
// amazonShipped: true = the next sync finds the order shipped }), mcfRecords ({ [orderId]: record } to start from).
// orderCore: { [orderId]: { stage, coolingOffEndsAt, holds, payment } } adds the order core block to those orders;
// orderActionError: { status, code, message } makes the next confirm / cancel / address fail like the Worker would.
// checkouts: the Unfinished checkouts list (worker/checkouts.js listCheckouts shape).
// lang: the back office's language for the test (D49), "en" unless asked; null leaves the page's own choice.
// messages: the Contact us messages. stopped: product ids an owner stopped selling. notes: { [orderId]: notes }.
// fulfilled: order ids already shipped. refundOutcome: what the refund POST answers (requested | failed | not_cancelled).
// privacy: the dashboard's open privacy requests. customers: see CUSTOMERS. erasureBlockers: why deleting must wait.
export async function mockAdminApi(page, { status = 200, emailConfigured = true, shipError, mcf = { mode: "off" }, mcfRecords = {}, paymentFailures = {}, team = {}, orderCore = {}, orderActionError = null, checkouts = [], disputes = {}, providers = {}, lang = "en", messages = [], stopped = [], notes = {}, fulfilled = [], refundOutcome = "requested", privacy = [], erasureBlockers = [] } = {}) {
  mockRole = team?.role ?? "owner";
  if (lang) await page.addInitScript((value) => { try { localStorage.setItem("apgo_admin_lang", value); } catch { /* none */ } }, lang);
  const requests = [];
  requests.writes = [];
  requests.mcf = [];
  requests.emails = [];
  requests.team = [];
  const teamRoute = team ? teamMock(team, requests.team) : null;
  const orders = SAMPLE_ORDERS.map((o) => structuredClone(o));
  for (const [id, failures] of Object.entries(paymentFailures)) orders.find((o) => o.id === id).paymentFailures = structuredClone(failures);
  for (const [id, record] of Object.entries(mcfRecords)) orders.find((o) => o.id === id).mcfRecord = structuredClone(record);
  for (const [id, core] of Object.entries(orderCore)) orders.find((o) => o.id === id).core = structuredClone(core);
  for (const [id, list] of Object.entries(disputes)) orders.find((o) => o.id === id).disputes = structuredClone(list);
  for (const [id, provider] of Object.entries(providers)) orders.find((o) => o.id === id).paymentProvider = provider;
  for (const [id, list] of Object.entries(notes)) orders.find((o) => o.id === id).notes = structuredClone(list);
  for (const id of fulfilled) orders.find((o) => o.id === id).fulfillment = { status: "shipped", carrier: "UPS", trackingNumber: "1Z999", trackingUrl: null, shippedAt: "2026-10-02T03:00:00.000Z", shippedBy: "mcf" };
  requests.refunds = [];
  requests.customers = [];
  requests.downloads = [];
  const customer = structuredClone(CUSTOMER);
  customer.erasure = { blockers: structuredClone(erasureBlockers) };
  const products = PRODUCTS.map((p) => ({ ...p, onSale: !stopped.includes(p.id), history: [] }));
  requests.sales = [];
  requests.notes = [];
  requests.orderActions = [];
  requests.holdTests = [];
  let actionError = orderActionError;
  let submitFails = mcf.submitFails ?? 0;
  const mcfState = { amazonShipped: Boolean(mcf.amazonShipped) };
  requests.mcfState = mcfState;
  const stamp = "2026-10-01T03:00:00.000Z";
  await page.route("**/admin/api/**", (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    const reply = (code, data) => route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(data) });
    if (status !== 200) return reply(status, { error: { code: "admin_not_configured", message: "The order back office is not configured." } });
    if (url.pathname === "/admin/api/checkouts") {
      const wanted = url.searchParams.get("status") || "all";
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const list = checkouts.filter((c) => (wanted === "all" || c.status === wanted) && (!q || (c.email || "").toLowerCase().includes(q)));
      return reply(200, { checkouts: list, nextBefore: null, counts: { open: checkouts.filter((c) => c.status === "open").length, expired: checkouts.filter((c) => c.status === "expired").length } });
    }
    const teamReply = teamRoute?.(url, route.request(), reply);
    if (teamReply) return teamReply;
    const productView = (p) => ({
      ...p, changedBy: null, changedAt: null, page: `/products/${p.id === "d204" ? "atomic-colored-glaze" : "atomic-glaze-coating"}`, amazonSku: null,
      details: { promise: "A finishing step.", when: p.id === "d204" ? "After washing & fully drying" : "While paint is still wet", lasts: "6 months", scope: "Paint, clear coat." },
      stock: { connected: false, available: null, inbound: null, reserved: null, threshold: 5 },
      sales: { soldMonth: 3, revenueMonthCents: p.priceCents * 3, refunds30: 0, monthOrderShare: 50, days: Array.from({ length: 14 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, "0")}`, qty: i % 3 })) },
    });
    if (url.pathname === "/admin/api/dashboard") {
      const list = orders.filter((o) => o.status !== "pending");
      const waiting = orders.filter((o) => o.status === "review" || openDisputes(o).length);
      return reply(200, {
        generatedAt: stamp,
        numbers: { timeZone: "Asia/Taipei", today: { revenueCents: 12897, orders: 1 }, month: { revenueCents: 18896, orders: 2, averageCents: 9448 }, refunds: { monthCents: 0, monthOrders: 0 }, toShip: 1, averageDaysToShip: null },
        pipeline: { coolingOff: 0, waiting: 1, withAmazon: 0, outOfStock: 0, shippedThisWeek: 0, coolingOffMinutes: 60 },
        attention: {
          items: waiting.map((o) => ({ kind: o.status === "review" ? "review" : "disputes", orderId: o.id, name: `${o.shipping.firstName} ${o.shipping.lastName}`, totalCents: o.totalCents, detail: o.status === "review" ? {} : { provider: "airwallex", due_at: openDisputes(o)[0].dueAt } })),
          total: waiting.length,
          clear: ["not_sent", "stockout", "no_tracking", "refunds", "emails", "addresses"],
        },
        health: [
          { key: "airwallex", status: "ok", detail: { env: "demo" } }, { key: "paypal", status: "warn", detail: { env: "sandbox", webhook: false } },
          { key: "email", status: "ok", detail: { from: "APGO <orders@shopapgo.com>" } }, { key: "amazon", status: mcf.mode === "ready" ? "ok" : "off", detail: { mode: mcf.mode, lastSyncAt: null } },
          { key: "address", status: "off", detail: { uncheckedToday: 0 } }, { key: "schedule", status: "ok", detail: { lastRunAt: stamp } }, { key: "digest", status: "ok", detail: { lastDate: "2026-10-01", at: stamp } },
        ],
        products: products.map(({ id, sku, name, routine, size, priceCents, onSale }) => ({ id, sku, name, routine, size, priceCents, onSale, stock: { connected: false, threshold: 5 } })),
        latest: list.slice(0, 5).map(summary),
        privacy,
      });
    }
    if (url.pathname === "/admin/api/products") return reply(200, { products: products.map(productView) });
    const productMatch = url.pathname.match(/^\/admin\/api\/products\/([a-z0-9]+)(\/sale)?$/);
    if (productMatch) {
      const product = products.find((p) => p.id === productMatch[1]);
      if (!product) return reply(404, { error: { code: "not_found", message: "Product not found." } });
      if (!productMatch[2]) return reply(200, productView(product));
      const request = route.request();
      const body = request.postDataJSON();
      requests.sales.push({ method: request.method(), contentType: request.headers()["content-type"], body });
      if ((team?.role ?? "owner") !== "owner") return reply(403, { error: { code: "owner_only", message: "Only an owner can stop or resume selling a product." } });
      const changed = product.onSale !== body.onSale;
      if (changed) product.history.unshift({ at: stamp, actor: TEAM_OWNER, action: body.onSale ? "product.resumed" : "product.stopped", reason: body.reason || null });
      product.onSale = body.onSale;
      return reply(200, { changed, product: { ...productView(product), changedBy: TEAM_OWNER, changedAt: stamp } });
    }
    const noteMatch = url.pathname.match(/^\/admin\/api\/orders\/([^/]+)\/notes$/);
    if (noteMatch) {
      const request = route.request();
      const body = request.postDataJSON();
      requests.notes.push({ method: request.method(), contentType: request.headers()["content-type"], body });
      const order = orders.find((o) => o.id === decodeURIComponent(noteMatch[1]));
      if (!order) return reply(404, { error: { code: "not_found", message: "Order not found." } });
      if (!String(body.body ?? "").trim()) return reply(400, { error: { code: "empty_note", message: "Write the note first." } });
      const note = { id: (order.notes?.length ?? 0) + 1, author: TEAM_OWNER, body: String(body.body).trim(), at: stamp };
      order.notes = [...(order.notes ?? []), note];
      return reply(200, { note, notes: order.notes });
    }
    if (url.pathname === "/admin/api/contact-messages") return reply(200, { messages, nextBefore: null });
    if (url.pathname === "/admin/api/mcf/hold-test") {
      const request = route.request();
      requests.holdTests.push({ method: request.method(), contentType: request.headers()["content-type"], body: request.postDataJSON() });
      const result = { id: "HOLDTEST-20261009030000", outcome: "passed", at: stamp, steps: [
        { step: "create", ok: true, detail: "Amazon accepted HOLDTEST-20261009030000 on hold (1 × AMZ-SKU-D204)." },
        { step: "check", ok: true, detail: "Items and address match; status RECEIVED, on hold." },
        { step: "cancel", ok: true, detail: "Cancelled; Amazon now shows CANCELLED." },
      ] };
      return reply(200, { result, tests: [result] });
    }
    const mcfMatch = url.pathname.match(/^\/admin\/api\/orders\/([^/]+)\/mcf\/(submit|sync|cancel)$/);
    if (mcfMatch || url.pathname === "/admin/api/mcf/sync") {
      const request = route.request();
      requests.mcf.push({ method: request.method(), path: url.pathname, contentType: request.headers()["content-type"], body: request.postDataJSON() });
      if (request.method() !== "POST") return reply(405, { error: { code: "method_not_allowed", message: "Use POST." } });
      if (!mcfMatch) return reply(200, { summary: { checked: orders.filter((o) => o.mcfRecord?.status === "submitted").length, shipped: 0, failed: 0, skipped: 0 } });
      const order = orders.find((o) => o.id === decodeURIComponent(mcfMatch[1]));
      if (!order) return reply(404, { error: { code: "not_found", message: "Order not found." } });
      if (order.status !== "paid") return reply(409, { error: { code: "not_paid", message: "Only paid orders can be sent to MCF." } });
      if (mcfMatch[2] === "cancel") {
        order.mcfRecord = { ...order.mcfRecord, status: "rejected", mcfStatus: "CANCELLED", note: null, updatedAt: stamp };
        return reply(200, { result: { outcome: "requested", reason: null }, order: view(order, mcf) });
      }
      if (mcfMatch[2] === "submit") {
        if (mcf.mode !== "ready") return reply(200, { result: { outcome: "skipped", reason: "MCF is not enabled." }, order: view(order, mcf) });
        const attempts = (order.mcfRecord?.attempts ?? 0) + 1;
        const base = { sellerOrderId: order.id, attempts, serviceTier: "EXPEDITED", updatedAt: stamp, mcfStatus: null, carrier: null, trackingNumber: null, lastSyncedAt: null, note: null };
        if (submitFails > 0) {
          submitFails -= 1;
          order.mcfRecord = { ...base, status: "failed", errorKind: "invalid", errorMessage: "destination.deliveryAddress.postalCode is invalid", submittedAt: null };
          return reply(200, { result: { outcome: "failed", reason: null }, order: view(order, mcf) });
        }
        order.mcfRecord = { ...base, status: "submitted", mcfStatus: "PROCESSING", errorKind: null, errorMessage: null, submittedAt: stamp };
        return reply(200, { result: { outcome: "submitted", reason: null }, order: view(order, mcf) });
      }
      if (!order.mcfRecord) return reply(200, { result: { outcome: "skipped", reason: "This order was never sent to MCF." }, order: view(order, mcf) });
      if (!mcfState.amazonShipped) {
        order.mcfRecord = { ...order.mcfRecord, lastSyncedAt: stamp, mcfStatus: "PROCESSING" };
        return reply(200, { result: { outcome: "synced", shipped: false, email: null, reason: null }, order: view(order, mcf) });
      }
      const shipment = { carrier: "Amazon Logistics", trackingNumber: "TBA123456789000", trackingUrl: null };
      order.fulfillment = { status: "shipped", ...shipment, shippedAt: stamp, shippedBy: "mcf" };
      order.audit = [...(order.audit ?? []), { action: "order.shipped", actor: "mcf", detail: shipment, at: stamp }];
      order.mcfRecord = { ...order.mcfRecord, status: "shipped", mcfStatus: "COMPLETE", lastSyncedAt: stamp, carrier: shipment.carrier, trackingNumber: shipment.trackingNumber };
      let email = "skipped";
      if (emailConfigured) {
        requests.emails.push({ to: [order.email], ...buildShipmentEmail(order, shipment) });
        email = "sent";
      }
      order.emails = [...(order.emails ?? []), { kind: "shipment", status: email, detail: "", updatedAt: stamp }];
      return reply(200, { result: { outcome: "synced", shipped: true, email, reason: null }, order: view(order, mcf) });
    }
    const actionMatch = url.pathname.match(/^\/admin\/api\/orders\/([^/]+)\/(confirm|cancel|address|cancel-refund)$/);
    if (actionMatch) {
      const request = route.request();
      const body = request.postDataJSON();
      requests.orderActions.push({ action: actionMatch[2], method: request.method(), contentType: request.headers()["content-type"], body });
      if (actionError) {
        const error = actionError;
        actionError = null;
        return reply(error.status, { error: { code: error.code, message: error.message } });
      }
      const order = orders.find((o) => o.id === decodeURIComponent(actionMatch[1]));
      if (!order?.core) return reply(404, { error: { code: "not_found", message: "Order not found." } });
      if (actionMatch[2] === "cancel-refund") {
        order.status = "cancelled";
        order.core = { ...(order.core ?? { stage: "paid" }), stage: "cancelled", holds: [], cancellation: { fromStage: "paid", reason: "out_of_stock", note: null, by: "staff@apgo.example", at: stamp, amazonCancel: null } };
        order.refundRequest = { provider: "airwallex", amountCents: order.totalCents, currency: "USD", status: "requested", refundId: "rfd_demo", error: null, by: "staff@apgo.example", at: stamp };
        return reply(200, { result: { changed: true, payment: null, refund: { cancelled: true, refund: "requested", refundId: "rfd_demo" } }, order: view(order, mcf) });
      }
      if (actionMatch[2] === "confirm") {
        order.status = "paid";
        order.core = { ...order.core, stage: "paid", holds: [], coolingOffEndsAt: "2026-10-09T05:00:00.000Z" };
      } else if (actionMatch[2] === "cancel") {
        order.status = "cancelled";
        order.core = { ...order.core, stage: "cancelled", holds: [], cancellation: { fromStage: order.core.stage, reason: body.reason, note: body.note || null, by: "staff@apgo.example", at: stamp, amazonCancel: order.core.stage === "fulfilling" ? "requested" : null } };
      } else {
        order.shipping = { ...order.shipping, ...body.shipping };
      }
      const payment = coreBlock(order, order.core).payment;
      return reply(200, { result: { changed: true, payment: actionMatch[2] === "cancel" ? payment : null }, order: view(order, mcf) });
    }
    const shipMatch = url.pathname.match(/^\/admin\/api\/orders\/([^/]+)\/ship$/);
    if (shipMatch) {
      const request = route.request();
      requests.writes.push({ method: request.method(), path: url.pathname, contentType: request.headers()["content-type"], body: request.postDataJSON() });
      if (request.method() !== "POST") return reply(405, { error: { code: "method_not_allowed", message: "Use POST." } });
      if (shipError) return reply(shipError.status, { error: { code: shipError.code, message: shipError.message } });
      const order = orders.find((o) => o.id === decodeURIComponent(shipMatch[1]));
      if (!order) return reply(404, { error: { code: "not_found", message: "Order not found." } });
      if (order.status !== "paid") return reply(409, { error: { code: "not_paid", message: "Only paid orders can be marked shipped." } });
      if (order.fulfillment) return reply(409, { error: { code: "already_shipped", message: "This order is already marked shipped." } });
      const checked = validateShipmentForMock(request.postDataJSON());
      if (checked.error) return reply(400, { error: checked.error });
      const shippedAt = "2026-10-01T03:00:00.000Z";
      order.fulfillment = { status: "shipped", ...checked.shipment, shippedAt, shippedBy: "admin" };
      order.audit = [{ action: "order.shipped", actor: "admin", detail: checked.shipment, at: shippedAt }];
      let email = { status: "skipped" };
      if (emailConfigured) {
        requests.emails.push({ to: [order.email], ...buildShipmentEmail(order, checked.shipment) });
        email = { status: "sent" };
      }
      order.emails = [...(order.emails ?? []), { kind: "shipment", status: email.status, detail: "", updatedAt: shippedAt }];
      return reply(200, { order: view(order, mcf), email });
    }
    // ---------- PR 3-10: refunds, customers, privacy, reports, exports, payment lookup ----------
    const refundMatch = url.pathname.match(/^\/admin\/api\/orders\/([^/]+)\/refund$/);
    if (refundMatch) {
      const request = route.request();
      const body = request.postDataJSON();
      requests.refunds.push({ method: request.method(), contentType: request.headers()["content-type"], body });
      const order = orders.find((o) => o.id === decodeURIComponent(refundMatch[1]));
      if (!order) return reply(404, { error: { code: "not_found", message: "Order not found." } });
      if (mockRole !== "owner") return reply(403, { error: { code: "owner_only", message: "Only an owner can refund." } });
      const entry = { id: `refund-${body.key}`, amountCents: body.amountCents, currency: "USD", provider: order.paymentProvider ?? "airwallex", reason: body.reason, note: body.note || null,
        notify: body.notify !== false, cancelFirst: Boolean(body.cancelFirst), status: refundOutcome === "requested" ? "requested" : refundOutcome, refundId: refundOutcome === "requested" ? "rfd_mock" : null,
        error: refundOutcome === "failed" ? "Refund rejected" : null, by: TEAM_OWNER, at: stamp, updatedAt: stamp };
      if (refundOutcome === "not_cancelled") {
        return reply(200, { result: { outcome: "not_cancelled", error: "Amazon could not cancel this shipment (PICKING). The order stays with Amazon; the team was told." }, order: view(order, mcf) });
      }
      order.adminRefunds = [entry, ...(order.adminRefunds ?? [])];
      if (refundOutcome === "failed") return reply(200, { result: { outcome: "failed", error: "Refund rejected" }, order: view(order, mcf) });
      const refunded = (order.refunds?.refundedCents ?? 0) + body.amountCents;
      order.refunds = { records: [{ id: "rfd_mock", provider: entry.provider, amountCents: body.amountCents, currency: "USD", status: "RECEIVED", failureCode: "", createdAt: stamp, updatedAt: stamp }, ...(order.refunds?.records ?? [])], refundedCents: refunded, pendingCents: 0, hold: false, status: refunded >= order.totalCents ? "fully_refunded" : "partially_refunded" };
      const cancelled = Boolean(body.cancelFirst) && !order.fulfillment;
      if (cancelled) order.status = "cancelled";
      return reply(200, { result: { outcome: "requested", refundId: "rfd_mock", cancelled }, order: view(order, mcf) });
    }
    if (url.pathname === "/admin/api/customers") {
      requests.customers.push(url.search);
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const list = CUSTOMERS.filter((c) => !q || `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(q));
      return reply(200, { customers: list, nextPage: null, total: CUSTOMERS.length });
    }
    const customerMatch = url.pathname.match(/^\/admin\/api\/customers\/([^/]+)(?:\/(notes|export|erase|privacy-requests))?$/);
    if (customerMatch) {
      const request = route.request();
      const body = request.method() === "POST" ? request.postDataJSON() : null;
      requests.customers.push(`${request.method()} ${url.pathname}`);
      if (customer.erased || decodeURIComponent(customerMatch[1]) !== customer.ref && !customer.orderList.some((o) => o.id === decodeURIComponent(customerMatch[1]))) {
        return customer.erased ? reply(200, { ref: customer.ref, erased: true, erasedAt: stamp }) : reply(404, { error: { code: "not_found", message: "Customer not found." } });
      }
      if (customerMatch[2] === "notes") {
        customer.notes = [...customer.notes, { id: customer.notes.length + 1, author: TEAM_OWNER, body: String(body.body).trim(), at: stamp }];
        return reply(200, { notes: customer.notes });
      }
      if (customerMatch[2] === "privacy-requests") {
        customer.privacyRequests = [{ id: "PR-00000000-0000-4000-8000-000000000001", kind: body.kind, receivedAt: `${body.receivedAt}T00:00:00.000Z`, dueAt: "2026-11-25T00:00:00.000Z", handler: body.handler || TEAM_OWNER, status: "open", outcome: null, note: null, createdBy: TEAM_OWNER, createdAt: stamp, closedBy: null, closedAt: null }, ...customer.privacyRequests];
        return reply(200, { customer });
      }
      if (customerMatch[2] === "export") {
        requests.downloads.push(url.pathname);
        return route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", headers: { "Content-Disposition": `attachment; filename="apgo-customer-${customer.ref}.json"` }, body: JSON.stringify({ customer: { email: customer.email } }) });
      }
      if (customerMatch[2] === "erase") {
        if (customer.erasure.blockers.length) return reply(409, { error: { code: "not_yet", message: "This customer's data cannot be deleted yet.", blockers: customer.erasure.blockers } });
        if (String(body.confirm).trim().toLowerCase() !== customer.email) return reply(400, { error: { code: "confirm_mismatch", message: "Type the customer's email exactly to confirm." } });
        customer.erased = true;
        return reply(200, { result: { erased: true, orders: customer.orderList.length }, customer: { ref: customer.ref, erased: true, erasedAt: stamp } });
      }
      return reply(200, customer);
    }
    const closeMatch = url.pathname.match(/^\/admin\/api\/privacy-requests\/([^/]+)\/close$/);
    if (closeMatch) {
      const body = route.request().postDataJSON();
      requests.customers.push(`close ${body.outcome}`);
      const found = customer.privacyRequests.find((r) => r.id === decodeURIComponent(closeMatch[1]));
      Object.assign(found, { status: "done", outcome: body.outcome, closedBy: TEAM_OWNER, closedAt: stamp });
      return reply(200, { request: found });
    }
    if (url.pathname === "/admin/api/reports/sales") {
      const preset = url.searchParams.get("preset") || "month";
      if (preset === "custom" && url.searchParams.get("from") > url.searchParams.get("to")) return reply(400, { error: { code: "invalid_period", message: "The end day is before the start day." } });
      return reply(200, sampleReport(preset, url.searchParams.get("from"), url.searchParams.get("to")));
    }
    const exportMatch = url.pathname.match(/^\/admin\/api\/exports\/(orders|payments)\.csv$/);
    if (exportMatch) {
      requests.downloads.push(url.pathname + url.search);
      return route.fulfill({ status: 200, contentType: "text/csv; charset=utf-8", headers: { "Content-Disposition": `attachment; filename="apgo-${exportMatch[1]}-2026-10-01-to-2026-10-31.csv"` }, body: "\ufefforder,total\r\n" });
    }
    const lookupMatch = url.pathname.match(/^\/admin\/api\/(airwallex\/intents|paypal\/orders)\/([^/]+)$/);
    if (lookupMatch) {
      if (lookupMatch[1].startsWith("paypal")) return reply(404, { error: { code: "not_found", message: "PayPal has no payment with this id." } });
      return reply(200, { id: lookupMatch[2], status: "REQUIRES_PAYMENT_METHOD", amount: 59.99, currency: "USD", merchant_order_id: "APGO-US-0123456789AB",
        latest_payment_attempt: { id: "att_1", status: "FAILED", payment_method: "card", failure_code: "issuer_declined", failure_details: null, provider_original_response_code: "05", provider_original_response_msg: "Do not honor" },
        next_action: null, created_at: stamp, updated_at: stamp });
    }
    if (url.pathname === "/admin/api/orders") {
      const filter = url.searchParams.get("status");
      const fulfillment = url.searchParams.get("fulfillment");
      const issue = url.searchParams.get("issue");
      const view = url.searchParams.get("view") || "all";
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const rows = orders.filter(
        (o) =>
          (!filter || o.status === filter) &&
          (!issue || openDisputes(o).length > 0) &&
          inView(o, view) &&
          (!fulfillment || (fulfillment === "shipped" ? Boolean(o.fulfillment) : o.status === "paid" && !o.fulfillment)) &&
          (!q || JSON.stringify(o).toLowerCase().includes(q)),
      );
      const counts = { pending: 0, paid: 0, review: 0, cancelled: 0 };
      for (const o of orders) counts[o.status] += 1;
      const fulfillmentCounts = {
        unfulfilled: orders.filter((o) => o.status === "paid" && !o.fulfillment).length,
        shipped: orders.filter((o) => o.fulfillment).length,
      };
      const issueCounts = { disputes: orders.filter((o) => openDisputes(o).length > 0).length };
      const listed = rows.map(summary);
      if (issue || view === "disputes") listed.sort((a, b) => String(a.disputeDueAt).localeCompare(String(b.disputeDueAt)));
      const shown = orders.filter((o) => o.status !== "pending");
      const viewCounts = Object.fromEntries(["all", "to_ship", "review", "problems", "disputes", "shipped", "cancelled"].map((key) => [key, shown.filter((o) => inView(o, key)).length]));
      const numbers = { timeZone: "Asia/Taipei", today: { revenueCents: 0, orders: 1 }, month: { revenueCents: 0, orders: 2, averageCents: 0 }, refunds: { monthCents: 0, monthOrders: 0 }, toShip: viewCounts.to_ship, averageDaysToShip: null };
      return reply(200, { orders: listed, nextBefore: null, counts, fulfillmentCounts, issueCounts, viewCounts, numbers });
    }
    const match = url.pathname.match(/^\/admin\/api\/orders\/(.+)$/);
    const order = match && orders.find((o) => o.id === decodeURIComponent(match[1]));
    return order ? reply(200, view(order, mcf)) : reply(404, { error: { code: "not_found", message: "Order not found." } });
  });
  return requests;
}

// ---------- PR 3-10 samples ----------

export const CUSTOMERS = [
  { ref: "APGO-US-0123456789AB", email: "ada.lee@example.com", name: "Ada Lee", phone: "+15125550148", city: "Austin", state: "TX", orders: 2, paidCents: 18896, refundedCents: 1000, spentCents: 17896,
    firstOrderAt: "2026-09-12T05:11:00.000Z", lastOrderAt: "2026-09-30T05:11:00.000Z", marketingOptIn: true },
  { ref: "APGO-US-B2C4D6F8G0H1", email: "x@example.com", name: "Xi Chen", phone: "", city: "San Francisco", state: "CA", orders: 1, paidCents: 5999, refundedCents: 5999, spentCents: 0,
    firstOrderAt: "2026-09-29T20:00:00.000Z", lastOrderAt: "2026-09-29T20:00:00.000Z", marketingOptIn: false },
];

const CUSTOMER = {
  ...CUSTOMERS[0], erased: false,
  orderList: [
    { id: "APGO-US-0123456789AB", status: "paid", totalCents: 12897, paidAt: "2026-09-30T05:11:00.000Z", createdAt: "2026-09-30T05:10:00.000Z", payment: "partly_refunded", shipping: "shipped" },
    { id: "APGO-US-4K7M2N9P3Q5R", status: "paid", totalCents: 5999, paidAt: "2026-09-12T05:11:00.000Z", createdAt: "2026-09-12T05:10:00.000Z", payment: "paid", shipping: "shipped" },
  ],
  addresses: [
    { name: "Ada Lee", street: "100 Example Ave", street2: "Apt 4", city: "Austin", state: "TX", zip: "78701", lastUsedAt: "2026-09-30T05:11:00.000Z" },
    { name: "Ada Lee", street: "9 Other St", street2: "", city: "Austin", state: "TX", zip: "78702", lastUsedAt: "2026-09-12T05:11:00.000Z" },
  ],
  notes: [],
  messages: [{ id: "CM-1", at: "2026-10-02T03:00:00.000Z", name: "Ada", message: "Where is my second bottle?" }],
  privacyRequests: [],
};

function sampleReport(preset, from, to) {
  const days = Array.from({ length: preset === "today" ? 1 : 7 }, (_, i) => ({ day: `2026-10-0${i + 1}`, orders: i % 2, paidCents: (i % 3) * 5999, refundedCents: 0 }));
  return {
    period: { preset, from: from ?? "2026-10-01", to: to ?? "2026-10-31", timeZone: "Asia/Taipei" },
    orders: 3, productsCents: 23994, shippingCents: 2397, taxCents: 1200, grossCents: 27591,
    refunds: { cents: 1000, count: 1, orders: 1 }, netCents: 26591, averageCents: 9197,
    products: [{ sku: "D204", name: "APGO Atomic Colored Glaze", units: 3, salesCents: 17997 }, { sku: "D215", name: "APGO Atomic Glaze Coating", units: 2, salesCents: 5998 }],
    payments: [{ provider: "airwallex", orders: 2, paidCents: 21592, refundedCents: 1000 }, { provider: "paypal", orders: 1, paidCents: 5999, refundedCents: 0 }],
    days,
    shippingVsAmazon: { orders: 2, withoutEstimate: 1, chargedCents: 1598, feeCents: 1782, differenceCents: -184 },
  };
}
