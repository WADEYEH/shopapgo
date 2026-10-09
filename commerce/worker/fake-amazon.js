// A stand-in for the amazon-spapi-mcp outbound endpoints, for staging only (M10, PR 3-1). Amazon has no test
// environment for Multi-Channel Fulfillment, so a real staging order sent to MCF would ship a real parcel. With
// MCF_FAKE=true and SITE_ENV=staging, worker/amazon-mcf.js answers every outbound call from here instead of the network:
// the order is stored in D1 (staging_fake_mcf_orders) and plays out over time like a real one.
//
//   ship      RECEIVED -> PROCESSING after 2 minutes -> COMPLETE with an Amazon Logistics tracking number after
//             FAKE_MCF_SHIP_MINUTES (default 10)
//   stockout  any recipient name containing "STOCKOUT": RECEIVED -> UNFULFILLABLE after 2 minutes (Amazon could not
//             fill it; the after-payment stock-out case)
//   cancel    allowed while RECEIVED or PROCESSING, as at Amazon
//
// MCF_FAKE anywhere else (production, local dev without SITE_ENV=staging) is "blocked": nothing is sent at all, neither
// to the fake nor to Amazon, and the back office says why. The fake never calls fetch().
import { PRODUCTS } from "./catalog.js";

const PROCESS_MINUTES = 2;
const DEFAULT_SHIP_MINUTES = 10;
const LIST_LIMIT = 200;
const STOCKOUT = /STOCKOUT/i;

// "on" | "blocked" | null (off).
export function fakeMode(env = {}) {
  if (String(env.MCF_FAKE ?? "").trim().toLowerCase() !== "true") return null;
  return String(env.SITE_ENV ?? "").trim().toLowerCase() === "staging" ? "on" : "blocked";
}

export const FAKE_BLOCKED_MESSAGE = "MCF_FAKE is only allowed on staging (SITE_ENV=staging); nothing is sent to Amazon.";

// Used when staging has no MCF_SKU_MAP_JSON: every store SKU maps to a made-up seller SKU.
export const FAKE_SKU_MAP = Object.fromEntries(Object.values(PRODUCTS).map((product) => [product.sku.toUpperCase(), `FAKE-${product.sku.toUpperCase()}`]));

const iso = (ms) => new Date(ms).toISOString();
const shipMinutes = (env) => {
  const value = Number(env.FAKE_MCF_SHIP_MINUTES);
  return env.FAKE_MCF_SHIP_MINUTES !== undefined && env.FAKE_MCF_SHIP_MINUTES !== "" && Number.isFinite(value) && value >= 0 ? value : DEFAULT_SHIP_MINUTES;
};

// A stable package number and tracking number per order id (FNV-1a), so every read agrees.
function packageNumber(sellerOrderId) {
  let hash = 0x811c9dc5;
  for (const char of String(sellerOrderId)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % 900_000_000) + 100_000_000;
}
export const fakeTrackingNumber = (sellerOrderId) => `TBA9${String(packageNumber(sellerOrderId)).padStart(11, "0")}`;

// Where a stored order stands at `nowMs`: { status, updatedAt, shipped }.
export function fakeProgress(row, nowMs, env = {}) {
  if (row.status === "CANCELLED") return { status: "CANCELLED", updatedAt: row.updated_at, shipped: false };
  const received = Date.parse(row.received_at);
  const ship = shipMinutes(env) * 60_000;
  const process = Math.min(PROCESS_MINUTES * 60_000, ship);
  if (row.scenario === "stockout") {
    return nowMs >= received + process ? { status: "UNFULFILLABLE", updatedAt: iso(received + process), shipped: false } : { status: "RECEIVED", updatedAt: row.received_at, shipped: false };
  }
  if (nowMs >= received + ship) return { status: "COMPLETE", updatedAt: iso(received + ship), shipped: true };
  if (nowMs >= received + process) return { status: "PROCESSING", updatedAt: iso(received + process), shipped: false };
  return { status: "RECEIVED", updatedAt: row.received_at, shipped: false };
}

// The raw SP-API getFulfillmentOrder JSON (v2020-07-01), as the MCP Worker returns it.
function view(row, progress) {
  const request = JSON.parse(row.request_json);
  const number = packageNumber(row.seller_order_id);
  return {
    payload: {
      fulfillmentOrder: {
        sellerFulfillmentOrderId: row.seller_order_id,
        marketplaceId: "ATVPDKIKX0DER",
        displayableOrderId: request.displayable_order_id,
        receivedDate: row.received_at,
        fulfillmentOrderStatus: progress.status,
        statusUpdatedDate: progress.updatedAt,
        shippingSpeedCategory: request.shipping_speed_category,
      },
      fulfillmentOrderItems: (request.items ?? []).map((item) => ({ sellerSku: item.sellerSku, sellerFulfillmentOrderItemId: item.sellerFulfillmentOrderItemId, quantity: item.quantity })),
      fulfillmentShipments: progress.shipped
        ? [{
            amazonShipmentId: `FAKE-${number}`,
            fulfillmentCenterId: "FAKE1",
            fulfillmentShipmentStatus: "SHIPPED",
            shippingDate: progress.updatedAt,
            fulfillmentShipmentItem: [],
            fulfillmentShipmentPackage: [{ packageNumber: number, carrierCode: "AMZL", trackingNumber: fakeTrackingNumber(row.seller_order_id) }],
          }]
        : [],
      returnItems: [],
      returnAuthorizations: [],
    },
  };
}

const reply = (status, body) => ({ status, body });
const notFound = () => reply(404, { error: "Order not found", spapiStatus: 404 });
const invalid = (message) => reply(400, { error: "Validation failed", issues: [{ path: ["request"], message }] });

async function stored(db, sellerOrderId) {
  return db.prepare("SELECT * FROM staging_fake_mcf_orders WHERE seller_order_id = ?").bind(sellerOrderId).first();
}

// Keeps the table's status column in step with the clock (for anyone looking at the table); reads never depend on it.
async function settle(db, row, progress) {
  if (row.status !== progress.status) {
    await db.prepare("UPDATE staging_fake_mcf_orders SET status = ?, updated_at = ? WHERE seller_order_id = ?").bind(progress.status, progress.updatedAt, row.seller_order_id).run();
  }
}

function preview(body) {
  if (!body?.address?.name || !body?.address?.stateOrRegion || !body?.items?.length) return invalid("address and items are required");
  const fulfillable = !STOCKOUT.test(body.address.name);
  const speeds = body.shipping_speed_categories ?? ["Standard", "Expedited"];
  const day = (days) => iso(Date.now() + days * 86_400_000);
  return reply(200, {
    payload: {
      fulfillmentPreviews: speeds.map((speed) => ({
        shippingSpeedCategory: speed,
        isFulfillable: fulfillable,
        marketplaceId: "ATVPDKIKX0DER",
        estimatedFees: [{ name: "FBAPerUnitFulfillmentFee", amount: { currencyCode: "USD", value: speed === "Standard" ? "8.91" : "12.22" } }],
        fulfillmentPreviewShipments: fulfillable ? [{ earliestArrivalDate: day(speed === "Standard" ? 3 : 1), latestArrivalDate: day(speed === "Standard" ? 5 : 2) }] : [],
        unfulfillablePreviewItems: fulfillable ? [] : body.items.map((item) => ({ sellerSku: item.sellerSku, quantity: item.quantity, itemUnfulfillableReasons: ["InventoryUnavailable"] })),
        featureConstraints: [],
      })),
    },
  });
}

async function create(env, body, nowMs) {
  const db = env.DB;
  const id = body?.seller_fulfillment_order_id;
  if (!id || String(id).length > 40 || !body.items?.length || !body.destination_address?.postalCode || !body.shipping_speed_category || !body.displayable_order_id) {
    return invalid("seller_fulfillment_order_id, items, destination_address and shipping_speed_category are required");
  }
  const scenario = STOCKOUT.test(String(body.destination_address.name ?? "")) ? "stockout" : "ship";
  const stamp = iso(nowMs);
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO staging_fake_mcf_orders (seller_order_id, request_json, scenario, status, received_at, updated_at)
       VALUES (?, ?, ?, 'RECEIVED', ?, ?)`,
    )
    .bind(id, JSON.stringify(body), scenario, stamp, stamp)
    .run();
  if (inserted.meta.changes === 0) {
    const row = await stored(db, id);
    return reply(200, { created: false, alreadyExists: true, existing: view(row, fakeProgress(row, nowMs, env)) });
  }
  console.log("fake_mcf_created", { sellerOrderId: id, scenario });
  return reply(200, { created: true, sellerFulfillmentOrderId: id, response: { headers: {} } });
}

// Answers one outbound call like the MCP Worker would: { status, body }. Never calls fetch().
export async function fakeOutbound(env, method, path, { body, query } = {}, { now = () => Date.now() } = {}) {
  const db = env.DB;
  const nowMs = now();
  if (method === "POST" && path === "/internal/outbound/preview") return preview(body);
  if (method === "POST" && path === "/internal/outbound/orders") return create(env, body, nowMs);

  if (method === "GET" && path === "/internal/outbound/orders") {
    const since = Date.parse(query?.query_start_date ?? "") || 0;
    const { results } = await db.prepare("SELECT * FROM staging_fake_mcf_orders ORDER BY received_at DESC LIMIT ?").bind(LIST_LIMIT).all();
    const orders = results
      .map((row) => ({ row, progress: fakeProgress(row, nowMs, env) }))
      .filter(({ progress }) => Date.parse(progress.updatedAt) >= since)
      .map(({ row, progress }) => ({ sellerFulfillmentOrderId: row.seller_order_id, fulfillmentOrderStatus: progress.status, statusUpdatedDate: progress.updatedAt }));
    return reply(200, { payload: { fulfillmentOrders: orders } });
  }

  const orderMatch = path.match(/^\/internal\/outbound\/orders\/([^/]+)(\/cancel)?$/);
  if (orderMatch) {
    const row = await stored(db, decodeURIComponent(orderMatch[1]));
    if (!row) return notFound();
    const progress = fakeProgress(row, nowMs, env);
    if (method === "GET" && !orderMatch[2]) {
      await settle(db, row, progress);
      return reply(200, view(row, progress));
    }
    if (method === "POST" && orderMatch[2]) {
      if (!["RECEIVED", "PROCESSING"].includes(progress.status)) return reply(400, { error: "Order cannot be cancelled", spapiStatus: 400, details: progress.status });
      await db.prepare("UPDATE staging_fake_mcf_orders SET status = 'CANCELLED', updated_at = ? WHERE seller_order_id = ?").bind(iso(nowMs), row.seller_order_id).run();
      return reply(200, { payload: {} });
    }
  }

  const trackingMatch = path.match(/^\/internal\/outbound\/tracking\/(\d+)$/);
  if (method === "GET" && trackingMatch) {
    const { results } = await db.prepare("SELECT * FROM staging_fake_mcf_orders ORDER BY received_at DESC LIMIT ?").bind(LIST_LIMIT).all();
    const row = results.find((candidate) => String(packageNumber(candidate.seller_order_id)) === trackingMatch[1]);
    if (!row || !fakeProgress(row, nowMs, env).shipped) return reply(404, { error: "Package not found", spapiStatus: 404 });
    return reply(200, { payload: { packageNumber: Number(trackingMatch[1]), trackingNumber: fakeTrackingNumber(row.seller_order_id), carrierCode: "AMZL", carrierURL: "", packageDeliveryStatus: "IN_TRANSIT", trackingEvents: [] } });
  }
  return reply(404, { error: `no route ${method} ${path}` });
}
