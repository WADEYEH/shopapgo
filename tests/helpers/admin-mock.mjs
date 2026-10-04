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

const summary = (o) => ({
  id: o.id, status: o.status, email: o.email, name: `${o.shipping.firstName} ${o.shipping.lastName}`, state: o.shipping.state,
  itemCount: o.lines.reduce((n, l) => n + l.qty, 0), currency: o.currency, totalCents: o.totalCents,
  createdAt: o.createdAt, paidAt: o.paidAt, notification: o.notification?.status ?? null,
  fulfillmentStatus: o.fulfillment ? "shipped" : "unfulfilled", shippedAt: o.fulfillment?.shippedAt ?? null,
});

// MCF block as worker/mcf.js mcfView() returns it. mode: off | not_configured | ready.
const mcfBlock = (o, mcf) => {
  const record = o.mcfRecord ?? null;
  const eligible = o.status === "paid" && !o.fulfillment;
  return {
    mode: mcf.mode,
    reason: mcf.mode === "off" ? 'MCF_AUTO_SUBMIT is not "true"; ship this order manually.' : mcf.mode === "not_configured" ? "missing OUTBOUND_INTERNAL_TOKEN" : null,
    canSubmit: mcf.mode === "ready" && eligible && (!record || ["failed", "rejected"].includes(record.status)),
    canSync: Boolean(record) && record.status === "submitted",
    record,
  };
};

const view = (o, mcf = { mode: "off" }) => ({
  ...o,
  fulfillmentStatus: o.fulfillment ? "shipped" : "unfulfilled",
  fulfillment: o.fulfillment ?? null,
  emails: o.emails ?? [],
  audit: o.audit ?? [],
  mcf: mcfBlock(o, mcf),
});

// Returns the list of requested URLs so tests can assert on query strings.
// Options: status (force an error status), emailConfigured (false = shipment email is "skipped"),
// shipError ({ status, code, message } forces the ship POST to fail).
// The returned array also carries .writes (ship requests), .mcf (MCF POSTs) and .emails (would-be Resend payloads).
// MCF options: mcf ({ mode: "off" | "not_configured" | "ready", submitFails: n = first n submits fail,
// amazonShipped: true = the next sync finds the order shipped }), mcfRecords ({ [orderId]: record } to start from).
export async function mockAdminApi(page, { status = 200, emailConfigured = true, shipError, mcf = { mode: "off" }, mcfRecords = {} } = {}) {
  const requests = [];
  requests.writes = [];
  requests.mcf = [];
  requests.emails = [];
  const orders = SAMPLE_ORDERS.map((o) => structuredClone(o));
  for (const [id, record] of Object.entries(mcfRecords)) orders.find((o) => o.id === id).mcfRecord = structuredClone(record);
  let submitFails = mcf.submitFails ?? 0;
  const mcfState = { amazonShipped: Boolean(mcf.amazonShipped) };
  requests.mcfState = mcfState;
  const stamp = "2026-10-01T03:00:00.000Z";
  await page.route("**/admin/api/**", (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    const reply = (code, data) => route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify(data) });
    if (status !== 200) return reply(status, { error: { code: "admin_not_configured", message: "The order back office is not configured." } });
    const mcfMatch = url.pathname.match(/^\/admin\/api\/orders\/([^/]+)\/mcf\/(submit|sync)$/);
    if (mcfMatch || url.pathname === "/admin/api/mcf/sync") {
      const request = route.request();
      requests.mcf.push({ method: request.method(), path: url.pathname, contentType: request.headers()["content-type"], body: request.postDataJSON() });
      if (request.method() !== "POST") return reply(405, { error: { code: "method_not_allowed", message: "Use POST." } });
      if (!mcfMatch) return reply(200, { summary: { checked: orders.filter((o) => o.mcfRecord?.status === "submitted").length, shipped: 0, failed: 0, skipped: 0 } });
      const order = orders.find((o) => o.id === decodeURIComponent(mcfMatch[1]));
      if (!order) return reply(404, { error: { code: "not_found", message: "Order not found." } });
      if (order.status !== "paid") return reply(409, { error: { code: "not_paid", message: "Only paid orders can be sent to MCF." } });
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
    if (url.pathname === "/admin/api/orders") {
      const filter = url.searchParams.get("status");
      const fulfillment = url.searchParams.get("fulfillment");
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const rows = orders.filter(
        (o) =>
          (!filter || o.status === filter) &&
          (!fulfillment || (fulfillment === "shipped" ? Boolean(o.fulfillment) : o.status === "paid" && !o.fulfillment)) &&
          (!q || JSON.stringify(o).toLowerCase().includes(q)),
      );
      const counts = { pending: 0, paid: 0, review: 0, cancelled: 0 };
      for (const o of orders) counts[o.status] += 1;
      const fulfillmentCounts = {
        unfulfilled: orders.filter((o) => o.status === "paid" && !o.fulfillment).length,
        shipped: orders.filter((o) => o.fulfillment).length,
      };
      return reply(200, { orders: rows.map(summary), nextBefore: null, counts, fulfillmentCounts });
    }
    const match = url.pathname.match(/^\/admin\/api\/orders\/(.+)$/);
    const order = match && orders.find((o) => o.id === decodeURIComponent(match[1]));
    return order ? reply(200, view(order, mcf)) : reply(404, { error: { code: "not_found", message: "Order not found." } });
  });
  return requests;
}
