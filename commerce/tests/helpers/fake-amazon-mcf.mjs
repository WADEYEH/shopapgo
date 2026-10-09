// A fake of the internal "outbound" HTTP endpoints of the amazon-spapi-mcp Worker (v1.5.0) for tests. It is a fetch
// replacement: nothing ever reaches the real Amazon or the real MCP Worker. Behaviour is scriptable per test:
//
//   const amazon = createFakeAmazon({ failCreate: [{ status: 400, error: "...", spapiStatus: 400, details: "..." }], networkErrors: { create: 1 } });
//   globalThis.fetch = amazon.fetch
//   amazon.orders            Map sellerFulfillmentOrderId -> stored create payload + status
//   amazon.calls             every request { op, method, path, query, body, headers }
//   amazon.ship(orderId, { carrierCode, trackingNumber })   make Amazon report the order shipped
//
// Options
//   token         the only bearer token accepted (default FAKE_OUTBOUND_TOKEN)
//   unconfigured  answer 503 everywhere (the MCP Worker has no OUTBOUND_INTERNAL_TOKEN secret)
//   failCreate    array of error replies consumed one per create call ({ status, error, spapiStatus, details, issues })
//   networkErrors { create: n, get: n } throw a network error n times BEFORE the request is processed
//   dropReply     { create: n } process the create (order stored) but fail the reply n times (the "lost response" case)
//   status        initial fulfillmentOrderStatus (default RECEIVED)
//   listPages     list endpoint pages: how many empty pages (each with a nextToken) come before the real one
export const FAKE_OUTBOUND_TOKEN = "test-outbound-token-0123456789";
export const FAKE_BASE_URL = "https://amazon-mcp.test.example";
export const FAKE_AMAZON_ENV = {
  AMAZON_OUTBOUND_BASE_URL: FAKE_BASE_URL,
  OUTBOUND_INTERNAL_TOKEN: FAKE_OUTBOUND_TOKEN,
  MCF_AUTO_SUBMIT: "true",
  MCF_SKU_MAP_JSON: JSON.stringify({ D204: "AMZ-SKU-D204", D215: "AMZ-SKU-D215" }),
  MCF_RETRY_DELAY_MS: "0",
  MCF_TIMEOUT_MS: "2000",
  ORDER_COOLING_OFF_MINUTES: "0", // no cooling-off in these tests: a paid order goes to Amazon right away
};

const reply = (status, body, headers = {}) =>
  new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

export function createFakeAmazon(options = {}) {
  const token = options.token ?? FAKE_OUTBOUND_TOKEN;
  const failCreate = [...(options.failCreate ?? [])];
  const networkErrors = { create: 0, get: 0, ...(options.networkErrors ?? {}) };
  const dropReply = { create: 0, ...(options.dropReply ?? {}) };
  const orders = new Map();
  const calls = [];
  let emptyPagesLeft = options.listPages ?? 0;

  const failure = (e) => reply(e.status, { error: e.error ?? "error", ...(e.spapiStatus ? { spapiStatus: e.spapiStatus } : {}), ...(e.details ? { details: e.details } : {}), ...(e.issues ? { issues: e.issues } : {}) });

  // The raw SP-API getFulfillmentOrder JSON (v2020-07-01).
  const view = (record) => ({
    payload: {
      fulfillmentOrder: {
        sellerFulfillmentOrderId: record.request.seller_fulfillment_order_id,
        marketplaceId: "ATVPDKIKX0DER",
        displayableOrderId: record.request.displayable_order_id,
        receivedDate: record.receivedAt,
        fulfillmentOrderStatus: record.status,
        statusUpdatedDate: record.updatedAt,
        shippingSpeedCategory: record.request.shipping_speed_category,
        destinationAddress: record.request.destination_address,
      },
      fulfillmentOrderItems: record.request.items.map((i) => ({ sellerSku: i.sellerSku, sellerFulfillmentOrderItemId: i.sellerFulfillmentOrderItemId, quantity: i.quantity })),
      fulfillmentShipments: record.shipments,
      returnItems: [],
      returnAuthorizations: [],
    },
  });

  async function handle(url, init = {}) {
    const parsed = new URL(url);
    const method = (init.method ?? "GET").toUpperCase();
    const headers = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const rawBody = init.body ? String(init.body) : "";
    if (parsed.origin !== FAKE_BASE_URL) throw new Error(`unexpected real network call: ${url}`);
    const path = parsed.pathname;
    const body = rawBody ? JSON.parse(rawBody) : undefined;
    const record = (op) => calls.push({ op, method, path, query: Object.fromEntries(parsed.searchParams), body, headers });

    if (options.unconfigured) { record("unconfigured"); return reply(503, { error: "OUTBOUND_INTERNAL_TOKEN is not configured" }); }
    if (headers.authorization !== `Bearer ${token}`) { record("unauthorized"); return reply(401, { error: "Unauthorized" }); }

    if (method === "POST" && path === "/internal/outbound/preview") {
      record("preview");
      if (!body.address?.name || !body.address?.stateOrRegion || !body.items?.length) return reply(400, { error: "Validation failed", issues: [{ path: ["address"], message: "Required" }] });
      const fees = (value) => [{ name: "FBAPerOrderFulfillmentFee", amount: { currencyCode: "USD", value: "0.0" } }, { name: "FBAPerUnitFulfillmentFee", amount: { currencyCode: "USD", value: value } }];
      const speeds = body.shipping_speed_categories ?? ["Standard", "Expedited", "Priority"];
      return reply(200, { payload: { fulfillmentPreviews: speeds.map((speed) => ({
        shippingSpeedCategory: speed, isFulfillable: true, isCODCapable: false, marketplaceId: "ATVPDKIKX0DER",
        estimatedFees: fees(speed === "Standard" ? "8.91" : "12.22"),
        fulfillmentPreviewShipments: [{ earliestShipDate: "2026-10-01T07:00:00Z", latestShipDate: "2026-10-02T06:59:59Z", earliestArrivalDate: speed === "Standard" ? "2026-10-04T02:59:00Z" : "2026-10-02T07:00:00Z", latestArrivalDate: speed === "Standard" ? "2026-10-04T06:59:59Z" : "2026-10-03T06:59:59Z", fulfillmentPreviewItems: body.items }],
        unfulfillablePreviewItems: [], featureConstraints: [],
      })) } });
    }

    if (method === "POST" && path === "/internal/outbound/orders") {
      record("create");
      if (networkErrors.create > 0) { networkErrors.create -= 1; throw new TypeError("fetch failed"); }
      if (failCreate.length) return failure(failCreate.shift());
      const id = body.seller_fulfillment_order_id;
      if (!id || id.length > 40 || !body.items?.length || !body.destination_address?.postalCode || !body.shipping_speed_category || !body.displayable_order_id) {
        return reply(400, { error: "Validation failed", issues: [{ path: ["seller_fulfillment_order_id"], message: "Required" }] });
      }
      if (orders.has(id)) return reply(200, { created: false, alreadyExists: true, existing: view(orders.get(id)) });
      const stamp = new Date().toISOString();
      orders.set(id, { request: body, status: options.status ?? "RECEIVED", receivedAt: stamp, updatedAt: stamp, shipments: [] });
      if (dropReply.create > 0) { dropReply.create -= 1; throw new TypeError("fetch failed"); }
      return reply(200, { created: true, sellerFulfillmentOrderId: id, response: { headers: {} } });
    }

    if (method === "GET" && path === "/internal/outbound/orders") {
      record("list");
      if (emptyPagesLeft > 0) { emptyPagesLeft -= 1; return reply(200, { payload: { fulfillmentOrders: [], nextToken: `page-${emptyPagesLeft}` } }); }
      return reply(200, { payload: { fulfillmentOrders: [...orders.values()].map((r) => ({ sellerFulfillmentOrderId: r.request.seller_fulfillment_order_id, fulfillmentOrderStatus: r.status, statusUpdatedDate: r.updatedAt })) } });
    }

    const orderMatch = path.match(/^\/internal\/outbound\/orders\/([^/]+)(\/cancel)?$/);
    if (orderMatch) {
      const id = decodeURIComponent(orderMatch[1]);
      const stored = orders.get(id);
      if (method === "GET" && !orderMatch[2]) {
        record("get");
        if (networkErrors.get > 0) { networkErrors.get -= 1; throw new TypeError("fetch failed"); }
        if (!stored) return reply(404, { error: "Order not found", spapiStatus: 404 });
        return reply(200, view(stored));
      }
      if (method === "POST" && orderMatch[2]) {
        record("cancel");
        if (!stored) return reply(404, { error: "Order not found", spapiStatus: 404 });
        if (!["RECEIVED", "PLANNING", "PROCESSING"].includes(stored.status)) return reply(400, { error: "Order cannot be cancelled", spapiStatus: 400, details: stored.status });
        stored.status = "CANCELLED";
        stored.updatedAt = new Date().toISOString();
        return reply(200, { payload: {} });
      }
    }

    const trackingMatch = path.match(/^\/internal\/outbound\/tracking\/(\d+)$/);
    if (method === "GET" && trackingMatch) {
      record("tracking");
      const number = trackingMatch[1];
      for (const r of orders.values()) for (const s of r.shipments) for (const p of s.fulfillmentShipmentPackage) {
        if (String(p.packageNumber) === number) return reply(200, { payload: { packageNumber: Number(number), trackingNumber: p.lateTrackingNumber ?? p.trackingNumber, carrierCode: p.carrierCode, carrierURL: "", packageDeliveryStatus: "IN_TRANSIT", trackingEvents: [] } });
      }
      return reply(404, { error: "Package not found", spapiStatus: 404 });
    }
    record("unknown");
    return reply(404, { error: `no route ${method} ${path}` });
  }

  return {
    orders,
    calls,
    fetch: handle,
    count: (op) => calls.filter((c) => c.op === op).length,
    setStatus(orderId, status) {
      const stored = orders.get(orderId);
      stored.status = status;
      stored.updatedAt = new Date().toISOString();
    },
    // Amazon reports the order shipped, with one package carrying tracking. `lateTracking` hides the number from
    // getOrder (only the tracking endpoint knows it), as Amazon sometimes does right after shipping.
    ship(orderId, { carrierCode = "AMZL", trackingNumber = "TBA123456789000", status = "COMPLETE", packages, lateTracking = false } = {}) {
      const stored = orders.get(orderId);
      stored.status = status;
      stored.updatedAt = new Date().toISOString();
      stored.shipments = [{
        amazonShipmentId: "SHIP1", fulfillmentCenterId: "PSP1", fulfillmentShipmentStatus: "SHIPPED", shippingDate: "2026-10-02T08:00:00Z", estimatedArrivalDate: "2026-10-04T08:00:00Z",
        fulfillmentShipmentItem: [],
        fulfillmentShipmentPackage: packages ?? [lateTracking
          ? { packageNumber: 4242, carrierCode, lateTrackingNumber: trackingNumber }
          : { packageNumber: 4242, carrierCode, trackingNumber }],
      }];
    },
  };
}
