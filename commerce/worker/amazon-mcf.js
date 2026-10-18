// Amazon Multi-Channel Fulfillment (MCF) client. The Worker holds NO Amazon credentials: it calls the internal
// "outbound" HTTP endpoints of the amazon-spapi-mcp Worker (v1.5.0+), which keeps the Login-with-Amazon credentials and
// talks to SP-API Fulfillment Outbound (v2020-07-01, whose responses it returns as raw SP-API JSON).
//
//   Auth      Authorization: Bearer <OUTBOUND_INTERNAL_TOKEN>      (missing/wrong token -> 401; secret unset on the MCP -> 503)
//   Base URL  env AMAZON_OUTBOUND_BASE_URL (https://amazon-mcp.apgo.tw)
//   JSON      top level snake_case, nested address / destination_address / items[] camelCase
//   Errors    { error, spapiStatus, details }; validation failures are 400 with `issues`
//
//   POST /internal/outbound/preview                          read-only: fees + arrival window per shipping speed
//   POST /internal/outbound/orders                           REALLY creates an MCF order (ships + uses FBA stock;
//                                                            fulfillment_action "Hold" only reserves the stock).
//                                                            { created:true, sellerFulfillmentOrderId, response } or
//                                                            { created:false, alreadyExists:true, existing } (never re-created)
//   GET  /internal/outbound/orders/:sellerFulfillmentOrderId status, shipments, carrier, tracking (404 = unknown id)
//   GET  /internal/outbound/orders?query_start_date=&next_token=   list; pages can be empty but carry a nextToken
//   POST /internal/outbound/orders/:id/cancel                no body
//   GET  /internal/outbound/tracking/:packageNumber          numeric, from shipments[].fulfillmentShipmentPackage[].packageNumber
//   GET  /internal/outbound/inventory?skus=A,B               read-only (gateway 1.8.3+): sellable, inbound and reserved
//                                                            units per seller SKU; a SKU Amazon has no stock record for is
//                                                            left out of the reply
//
// Nothing here runs unless worker/mcf.js calls it, and that only happens when MCF_AUTO_SUBMIT=true. The stock read
// (worker/inventory.js) runs whenever the connection and the SKU map are set.
//
// Staging: MCF_FAKE=true (with SITE_ENV=staging) answers every call from worker/fake-amazon.js instead, so a staging order
// never ships a real parcel; the connection settings are then not needed. The stock read is the exception: it changes
// nothing at Amazon, so staging reads the real stock whenever the connection is set. MCF_FAKE anywhere else sends
// nothing at all.
//
// Env (values only via `wrangler secret put` / .dev.vars; never commit them):
//   AMAZON_OUTBOUND_BASE_URL, OUTBOUND_INTERNAL_TOKEN   connection to the MCP Worker
//   MCF_SKU_MAP_JSON      {"D204":"<amazon seller SKU>","D215":"..."}  default {} (nothing is sent until set)
//   MCF_SHIPPING_MAP_JSON optional {"<our shipping method key>":"STANDARD"|"EXPEDITED"}; default standard/express
//   MCF_NOTIFY_AMAZON_EMAIL  "true" = pass the shopper's email as notification_emails so Amazon sends its own shipping
//                            notices too (default off: our own emails are the only ones, no duplicates)
//   MCF_TIMEOUT_MS, MCF_RETRY_DELAY_MS   tuning / tests

import { FAKE_BLOCKED_MESSAGE, FAKE_SKU_MAP, fakeMode, fakeOutbound } from "./fake-amazon.js";

const USER_AGENT = "APGO-US-Store/1.0 (CloudflareWorkers)";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const MAX_LIST_PAGES = 20;
export const SERVICE_TIERS = ["STANDARD", "EXPEDITED"];
export const DEFAULT_SHIPPING_MAP = { standard: "STANDARD", express: "EXPEDITED" };
export const CONNECTION_ENV = ["AMAZON_OUTBOUND_BASE_URL", "OUTBOUND_INTERNAL_TOKEN"];
// Our tier -> the endpoint's shipping_speed_category (Amazon's ShippingSpeedCategory).
const WIRE_TIER = { STANDARD: "Standard", EXPEDITED: "Expedited" };
const DISPLAY_COMMENT = "Thank you for your order.";

// kind: config | auth | rate_limited | transient | invalid | not_found | unexpected
// retryable: worth repeating the same request. ambiguous: the request may have reached Amazon and been processed
// (timeout / network / 5xx), so a create must be reconciled by id before any new attempt.
export class McfError extends Error {
  constructor(kind, message, { status = 0, code = "", details = "", retryable = false, ambiguous = false } = {}) {
    super(message);
    this.name = "McfError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
    this.ambiguous = ambiguous;
  }
}

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const clip = (value, max = 300) => String(value ?? "").slice(0, max);
const positive = (value, fallback) => (Number.isFinite(Number(value)) && Number(value) >= 0 && value !== "" && value != null ? Number(value) : fallback);
const unwrap = (body) => (isPlainObject(body?.payload) ? body.payload : isPlainObject(body) ? body : {});
const asArray = (value) => (Array.isArray(value) ? value : []);

// ---------- configuration ----------

function parseMap(raw, label, validateValue) {
  const text = String(raw ?? "").trim();
  if (!text) return { map: {}, error: null };
  try {
    const parsed = JSON.parse(text);
    if (!isPlainObject(parsed)) throw new Error("must be a JSON object");
    const map = {};
    for (const [key, value] of Object.entries(parsed)) {
      const cleaned = validateValue(value);
      if (!key.trim() || cleaned === null) throw new Error(`invalid entry "${clip(key, 40)}"`);
      map[key.trim().toUpperCase()] = cleaned;
    }
    return { map, error: null };
  } catch (error) {
    return { map: {}, error: `${label}: ${error.message}` };
  }
}

// The MCP Worker's base URL, or null when unset / not https (the bearer token must never travel over http).
function baseUrl(env) {
  try {
    const url = new URL(String(env.AMAZON_OUTBOUND_BASE_URL ?? "").trim());
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

// Resolves everything the Worker needs to decide whether MCF may run. Never returns secret values.
export function mcfConfig(env = {}) {
  const enabled = String(env.MCF_AUTO_SUBMIT ?? "").trim().toLowerCase() === "true";
  const fake = fakeMode(env); // "on" | "blocked" | null
  const missingSettings = fake ? [] : CONNECTION_ENV.filter((name) => !String(env[name] ?? "").trim());
  const badUrl = !fake && !missingSettings.includes("AMAZON_OUTBOUND_BASE_URL") && !baseUrl(env);
  const sku = parseMap(env.MCF_SKU_MAP_JSON, "MCF_SKU_MAP_JSON", (value) =>
    typeof value === "string" && value.trim() && value.trim().length <= 40 ? value.trim() : null,
  );
  const shipping = parseMap(env.MCF_SHIPPING_MAP_JSON, "MCF_SHIPPING_MAP_JSON", (value) => {
    const tier = String(value ?? "").toUpperCase();
    return SERVICE_TIERS.includes(tier) ? tier : null;
  });
  const shippingMap = Object.fromEntries(Object.entries(DEFAULT_SHIPPING_MAP).map(([k, v]) => [k.toUpperCase(), v]));
  Object.assign(shippingMap, shipping.map);
  const fakeSkus = fake === "on" && !sku.error && Object.keys(sku.map).length === 0;
  return {
    enabled,
    fake,
    missingSettings,
    badUrl,
    connectionOk: fake === "on" || (!fake && missingSettings.length === 0 && !badUrl),
    skuMap: fakeSkus ? { ...FAKE_SKU_MAP } : sku.map,
    skuError: sku.error,
    shippingMap,
    shippingError: shipping.error,
    notifyAmazonEmail: String(env.MCF_NOTIFY_AMAZON_EMAIL ?? "").trim().toLowerCase() === "true",
  };
}

// Why the connection to the MCP Worker is unusable (null when fine). Names only, never values.
export function connectionProblem(config) {
  if (config.fake === "blocked") return FAKE_BLOCKED_MESSAGE;
  if (config.missingSettings.length) return `missing ${config.missingSettings.join(", ")}`;
  if (config.badUrl) return "AMAZON_OUTBOUND_BASE_URL must be an https:// URL";
  return null;
}

// Whether `order` (a D1 row, or null for a global check) may be sent to MCF right now.
// mode: "off" (MCF_AUTO_SUBMIT not true) | "not_configured" (on, but something is missing) | "ready".
export function mcfReadiness(env, order = null) {
  const config = mcfConfig(env);
  if (!config.enabled) return { ok: false, mode: "off", reason: "MCF_AUTO_SUBMIT is not \"true\"; ship this order manually.", config };
  const problems = [];
  const connection = connectionProblem(config);
  if (connection) problems.push(connection);
  if (config.skuError) problems.push(config.skuError);
  else if (Object.keys(config.skuMap).length === 0) problems.push("MCF_SKU_MAP_JSON is empty (no SKU is mapped to an Amazon seller SKU)");
  if (config.shippingError) problems.push(config.shippingError);
  if (order) {
    try {
      const unmapped = JSON.parse(order.lines_json).filter((line) => !config.skuMap[String(line.sku).toUpperCase()]).map((line) => line.sku);
      if (unmapped.length && !config.skuError && Object.keys(config.skuMap).length) problems.push(`SKU not mapped: ${[...new Set(unmapped)].join(", ")}`);
    } catch {
      problems.push("order lines unreadable");
    }
    if (!config.shippingMap[String(order.shipping_method).toUpperCase()]) problems.push(`shipping method "${order.shipping_method}" has no MCF service tier`);
  }
  if (problems.length) return { ok: false, mode: "not_configured", reason: problems.join("; "), config };
  return { ok: true, mode: "ready", reason: null, config };
}

// ---------- transport ----------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const retryDelay = (env, attempt) => positive(env.MCF_RETRY_DELAY_MS, 500 * 2 ** attempt);
const timeoutMs = (env) => positive(env.MCF_TIMEOUT_MS, DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

async function readJson(response) {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

// A single fetch with a hard timeout. Network errors and timeouts become ambiguous, retryable McfErrors.
async function send(env, url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs(env));
  try {
    return await globalThis.fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    const timedOut = error?.name === "AbortError" || controller.signal.aborted;
    throw new McfError("transient", timedOut ? "Request to the Amazon outbound service timed out." : "Could not reach the Amazon outbound service.", {
      code: timedOut ? "timeout" : "network",
      retryable: true,
      ambiguous: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

// Turns the endpoint's error reply ({ error, spapiStatus, details } | { error, issues }) into a McfError.
// `spapiStatus` is what Amazon itself answered; absent means the MCP Worker answered on its own.
function httpError(status, body, label) {
  const spapi = Number(body?.spapiStatus) || 0;
  const upstream = spapi || status;
  const message = clip(typeof body?.error === "string" ? body.error : body?.error?.message ?? "", 300);
  const issues = Array.isArray(body?.issues) ? clip(body.issues.map((i) => (typeof i === "string" ? i : [i?.path?.join?.("."), i?.message].filter(Boolean).join(": "))).join("; "), 300) : "";
  const details = clip(typeof body?.details === "string" ? body.details : body?.details ? JSON.stringify(body.details) : issues, 300);
  const base = { status: upstream, code: clip(spapi ? `spapi_${spapi}` : `http_${status}`, 40), details };
  const text = [message, details].filter(Boolean).join(" — ");

  if (!spapi && status === 401) return new McfError("auth", `The outbound service rejected OUTBOUND_INTERNAL_TOKEN (401) for ${label}.`, base);
  if (!spapi && status === 503) return new McfError("config", `The outbound service is not configured (503): its OUTBOUND_INTERNAL_TOKEN secret is missing on the MCP Worker.`, base);
  if (!spapi && status === 400) return new McfError("invalid", `Request rejected for ${label}${text ? `: ${text}` : "."}`, base);
  if (upstream === 401 || upstream === 403) {
    return new McfError("auth", `Amazon denied access (${upstream}) for ${label}: the SP-API app needs the "Amazon Fulfillment" role and the seller must have authorized it.${message ? ` ${message}` : ""}`, base);
  }
  if (upstream === 404) return new McfError("not_found", text || `${label}: not found.`, base);
  if (upstream === 429) return new McfError("rate_limited", "Amazon rate limit reached (429).", { ...base, retryable: true });
  if (upstream >= 500) return new McfError("transient", `Amazon outbound error (${upstream}) for ${label}.${text ? ` ${text}` : ""}`, { ...base, retryable: true, ambiguous: true });
  if ([400, 409, 413, 415, 422].includes(upstream)) return new McfError("invalid", text || `Amazon rejected the request (${upstream}) for ${label}.`, base);
  return new McfError("unexpected", `Unexpected reply (${status}) for ${label}.`, base);
}

// Every outbound call here is safe to repeat: previews / gets / lists only read, cancel is idempotent, and create always
// carries the same caller-chosen seller_fulfillment_order_id (the endpoint answers alreadyExists instead of creating a
// second order), so network errors / timeouts / 429 / 5xx are retried (3 tries, exponential backoff) with the SAME body.
// readOnly: a call that changes nothing at Amazon goes to the real gateway even with MCF_FAKE on, when it is set up.
async function outbound(env, method, path, { body, query, label, readOnly = false } = {}) {
  const fake = fakeMode(env);
  if (fake === "blocked") throw new McfError("config", FAKE_BLOCKED_MESSAGE, { code: "fake_outside_staging" });
  const realRead = readOnly && Boolean(baseUrl(env)) && Boolean(String(env.OUTBOUND_INTERNAL_TOKEN ?? "").trim());
  if (fake === "on" && !realRead) {
    const reply = await fakeOutbound(env, method, path, { body, query });
    if (reply.status >= 200 && reply.status < 300) return reply;
    throw httpError(reply.status, reply.body, label);
  }
  const base = baseUrl(env);
  const token = String(env.OUTBOUND_INTERNAL_TOKEN ?? "").trim();
  if (!base || !token) {
    throw new McfError("config", "The Amazon outbound service connection is not configured (AMAZON_OUTBOUND_BASE_URL / OUTBOUND_INTERNAL_TOKEN).", { code: "missing_connection" });
  }
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(query ?? {})) if (value) url.searchParams.set(key, value);
  let ambiguous = false;
  let last;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await send(env, url.toString(), {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          "user-agent": USER_AGENT,
          accept: "application/json",
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await readJson(response);
      if (response.ok) return { status: response.status, body: data };
      last = httpError(response.status, data, label);
    } catch (error) {
      if (!(error instanceof McfError)) throw error;
      last = error;
    }
    ambiguous = ambiguous || last.ambiguous;
    if (!last.retryable || attempt >= MAX_ATTEMPTS - 1) break;
    await sleep(retryDelay(env, attempt));
  }
  last.ambiguous = ambiguous;
  throw last;
}

// ---------- payloads ----------

// Exported: the read-back check (worker/mcf.js) compares Amazon's copy with exactly what was sent.
export const amazonAddress = (address) => {
  const out = {
    name: clip(address.name, 50),
    addressLine1: clip(address.addressLine1, 60),
    city: clip(address.city, 50),
    stateOrRegion: clip(address.stateOrRegion, 30),
    postalCode: clip(address.postalCode, 12),
    countryCode: "US",
  };
  if (address.addressLine2) out.addressLine2 = clip(address.addressLine2, 60);
  if (address.phone) out.phone = clip(address.phone, 20);
  return out;
};

// items: [{ sku: <Amazon seller SKU>, qty }]; the line id is positional so a retry sends identical bytes.
const amazonItems = (items) => items.map((item, index) => ({ sellerSku: item.sku, sellerFulfillmentOrderItemId: `L${index + 1}`, quantity: Number(item.qty) }));

export function buildPreviewRequest({ address, items, tier }) {
  return { address: amazonAddress(address), items: amazonItems(items), shipping_speed_categories: [WIRE_TIER[tier]], include_delivery_windows: false };
}

// Fulfilment action Ship releases the order for picking at once. Hold only reserves the stock and never ships unless it
// is released in Seller Central: used for the Hold test order (worker/mcf-hold-test.js, D26), which is then cancelled.
// The MCP Worker's create endpoint accepts both ("Ship" | "Hold", checked in its code 10/9).
// displayable_order_id is our order number; notification_emails only when MCF_NOTIFY_AMAZON_EMAIL=true.
export const FULFILLMENT_ACTIONS = ["Ship", "Hold"];
export function buildCreateRequest({ orderId, address, items, tier, displayableOrderDate, notificationEmails, action = "Ship" }) {
  return {
    seller_fulfillment_order_id: orderId,
    displayable_order_id: orderId,
    shipping_speed_category: WIRE_TIER[tier],
    destination_address: amazonAddress(address),
    items: amazonItems(items),
    ...(displayableOrderDate ? { displayable_order_date: displayableOrderDate } : {}),
    displayable_order_comment: DISPLAY_COMMENT,
    fulfillment_action: action,
    ...(notificationEmails?.length ? { notification_emails: notificationEmails } : {}),
  };
}

// ---------- normalisers ----------

export function toCents(amount) {
  const value = Number(amount);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

// getFulfillmentPreview payload -> { fulfillable, offer: { tier, feeCents, deliveryStart, deliveryEnd } | null, constraints }.
export function normalizePreview(body, tier) {
  const wire = WIRE_TIER[tier];
  const preview = asArray(unwrap(body).fulfillmentPreviews).find((p) => String(p?.shippingSpeedCategory).toLowerCase() === wire.toLowerCase());
  if (!preview) return { fulfillable: false, offer: null, constraints: [{ code: "NoPreview", type: "Missing", message: `Amazon returned no ${wire} option.` }] };
  const constraints = [
    ...asArray(preview.unfulfillablePreviewItems).map((item) => ({
      code: clip(asArray(item?.itemUnfulfillableReasons).join(",") || "Unfulfillable", 80), type: "Unfulfillable", message: clip(`${item?.sellerSku ?? ""} x${item?.quantity ?? ""}`.trim(), 200),
    })),
    ...asArray(preview.featureConstraints).map((c) => ({
      code: clip(asArray(c?.notFulfillableReasons).join(",") || c?.featureFulfillmentPolicy, 80), type: "Feature", message: clip(c?.featureName, 200),
    })),
  ];
  const fees = asArray(preview.estimatedFees).map((fee) => toCents(fee?.amount?.value)).filter((value) => value !== null);
  const shipments = asArray(preview.fulfillmentPreviewShipments);
  const fulfillable = preview.isFulfillable === true;
  return {
    fulfillable,
    offer: fulfillable
      ? {
          tier,
          feeCents: fees.length ? fees.reduce((a, b) => a + b, 0) : null,
          deliveryStart: shipments.map((s) => s?.earliestArrivalDate).filter(Boolean).sort()[0] ?? null,
          deliveryEnd: shipments.map((s) => s?.latestArrivalDate).filter(Boolean).sort().at(-1) ?? null,
        }
      : null,
    constraints,
  };
}

// getFulfillmentOrder payload -> { orderId, status, statusUpdatedAt, action, address, items: [{ sku, qty }],
// shipments: [{ status, shipTime, packages: [...] }] }. address and items are Amazon's copy, for the read-back check.
export function normalizeMcfOrder(body) {
  const payload = unwrap(body);
  const order = payload.fulfillmentOrder ?? payload;
  const shipments = asArray(payload.fulfillmentShipments).map((shipment) => ({
    status: clip(shipment?.fulfillmentShipmentStatus, 40),
    shipTime: shipment?.shippingDate ?? null,
    packages: asArray(shipment?.fulfillmentShipmentPackage).map((pkg) => ({
      packageId: clip(pkg?.packageNumber, 40),
      status: "",
      carrierCode: clip(pkg?.carrierCode, 60),
      trackingNumber: clip(pkg?.trackingNumber, 80),
      trackingUrl: clip(pkg?.trackingUrl ?? pkg?.carrierURL ?? "", 500),
    })),
  }));
  const destination = isPlainObject(order.destinationAddress) ? order.destinationAddress : null;
  return {
    orderId: clip(order.sellerFulfillmentOrderId, 60),
    status: clip(order.fulfillmentOrderStatus, 40).toUpperCase(),
    statusUpdatedAt: order.statusUpdatedDate ?? null,
    action: clip(order.fulfillmentAction, 20),
    address: destination
      ? Object.fromEntries(["name", "addressLine1", "addressLine2", "city", "stateOrRegion", "postalCode"].map((key) => [key, clip(destination[key], 120)]))
      : null,
    items: asArray(payload.fulfillmentOrderItems).map((item) => ({ sku: clip(item?.sellerSku, 60), qty: Number(item?.quantity) || 0 })),
    shipments,
  };
}

// v2020-07-01 spells the partial case COMPLETE_PARTIALLED.
export const SHIPPED_STATUSES = ["COMPLETE", "COMPLETE_PARTIAL", "COMPLETE_PARTIALLED"];
const CARRIER_NAMES = { AMZL: "Amazon Logistics", AMZN_US: "Amazon Logistics", AMZN: "Amazon Logistics", UPS: "UPS", USPS: "USPS", FEDEX: "FedEx", DHL: "DHL", ONTRAC: "OnTrac", LASERSHIP: "LaserShip" };

// "Shipped with tracking" = Amazon says the whole order left (COMPLETE, or COMPLETE_PARTIAL when the rest was
// cancelled) and at least one package has a tracking number. Returns null until then.
export function shipmentFromMcfOrder(normalized) {
  if (!SHIPPED_STATUSES.includes(normalized.status)) return null;
  const packages = normalized.shipments.flatMap((s) => s.packages).filter((p) => p.trackingNumber);
  if (!packages.length) return null;
  const first = packages[0];
  const numbers = [];
  for (const pkg of packages) {
    if (!numbers.includes(pkg.trackingNumber) && [...numbers, pkg.trackingNumber].join(", ").length <= 80) numbers.push(pkg.trackingNumber);
  }
  const code = first.carrierCode;
  return {
    carrier: CARRIER_NAMES[code.toUpperCase()] ?? (code || "Amazon Logistics"),
    trackingNumber: numbers.join(", "),
    trackingUrl: numbers.length === 1 && /^https:\/\//i.test(first.trackingUrl) ? first.trackingUrl : "",
  };
}

// Every package with a tracking number, once each (F6): [{ packageId, carrier, trackingNumber, trackingUrl }].
export function packagesFromMcfOrder(normalized) {
  const seen = new Set();
  const packages = [];
  for (const pkg of normalized.shipments.flatMap((s) => s.packages)) {
    if (!pkg.trackingNumber || seen.has(pkg.trackingNumber)) continue;
    seen.add(pkg.trackingNumber);
    const code = pkg.carrierCode ?? "";
    packages.push({
      packageId: /^\d{1,20}$/.test(pkg.packageId ?? "") ? pkg.packageId : "",
      carrier: CARRIER_NAMES[code.toUpperCase()] ?? (code || "Amazon Logistics"),
      trackingNumber: pkg.trackingNumber,
      trackingUrl: /^https:\/\//i.test(pkg.trackingUrl ?? "") ? pkg.trackingUrl : "",
    });
  }
  return packages;
}

// ---------- operations ----------

// getFulfillmentPreview: is it fulfillable, what will it cost, when will it arrive. Read-only.
export async function getFulfillmentPreview(env, { address, items, tier }) {
  if (!SERVICE_TIERS.includes(tier)) throw new McfError("config", `Unknown MCF service tier "${tier}".`, { code: "invalid_tier" });
  const { body } = await outbound(env, "POST", "/internal/outbound/preview", { body: buildPreviewRequest({ address, items, tier }), label: "preview" });
  return normalizePreview(body, tier);
}

// createFulfillmentOrder (REAL: ships and consumes FBA stock). `orderId` is the SellerFulfillmentOrderId (<= 40 chars):
// the endpoint never creates a second order for an id it already knows, which is what makes retries duplicate-proof.
// Returns { accepted, created, alreadyExists, existing, status }; `existing` is the normalised Amazon order when the
// id was already there (status is then Amazon's current status).
export async function createFulfillmentOrder(env, { orderId, address, items, tier, displayableOrderDate, notificationEmails, action = "Ship" }) {
  if (!orderId || !/^[A-Za-z0-9._-]{1,40}$/.test(orderId)) {
    throw new McfError("config", "A valid SellerFulfillmentOrderId (<= 40 chars) is required.", { code: "invalid_order_id" });
  }
  if (!SERVICE_TIERS.includes(tier)) throw new McfError("config", `Unknown MCF service tier "${tier}".`, { code: "invalid_tier" });
  if (!items?.length) throw new McfError("config", "No items to fulfil.", { code: "no_items" });
  if (!FULFILLMENT_ACTIONS.includes(action)) throw new McfError("config", `Unknown fulfillment action "${action}".`, { code: "invalid_action" });
  const { status, body } = await outbound(env, "POST", "/internal/outbound/orders", {
    body: buildCreateRequest({ orderId, address, items, tier, displayableOrderDate, notificationEmails, action }),
    label: "create order",
  });
  if (body?.alreadyExists === true || body?.created === false) {
    const existing = body?.existing && isPlainObject(body.existing) ? normalizeMcfOrder(body.existing) : null;
    return { accepted: true, httpStatus: status, created: false, alreadyExists: true, existing: existing?.status ? existing : null, status: existing?.status || "RECEIVED" };
  }
  return { accepted: true, httpStatus: status, created: true, alreadyExists: false, existing: null, status: "RECEIVED" };
}

// getFulfillmentOrder with shipments. Returns null when Amazon does not know the id (404).
export async function getFulfillmentOrder(env, orderId) {
  try {
    const { body } = await outbound(env, "GET", `/internal/outbound/orders/${encodeURIComponent(orderId)}`, { label: "get order" });
    return normalizeMcfOrder(body);
  } catch (error) {
    if (error instanceof McfError && error.kind === "not_found") return null;
    throw error;
  }
}

// Lists orders (optionally only those updated since `queryStartDate`), following nextToken through empty pages too.
export async function listFulfillmentOrders(env, { queryStartDate } = {}) {
  const orders = [];
  let token = "";
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const { body } = await outbound(env, "GET", "/internal/outbound/orders", { query: { query_start_date: queryStartDate, next_token: token }, label: "list orders" });
    const payload = unwrap(body);
    orders.push(...asArray(payload.fulfillmentOrders).map((o) => ({ orderId: clip(o?.sellerFulfillmentOrderId, 60), status: clip(o?.fulfillmentOrderStatus, 40).toUpperCase(), statusUpdatedAt: o?.statusUpdatedDate ?? null })));
    token = String(payload.nextToken ?? "");
    if (!token) return { orders, complete: true };
  }
  return { orders, complete: false };
}

// Tracking details of one package (numeric packageNumber from getOrder). Returns { carrierCode, trackingNumber, trackingUrl,
// status, events } or null when Amazon has nothing yet. status is Amazon's currentStatus (IN_TRANSIT, DELIVERED, RETURNING,
// RETURNED, UNDELIVERABLE, …); events the last few tracking events { status, at, city, state }.
export async function getPackageTracking(env, packageNumber) {
  if (!/^\d{1,20}$/.test(String(packageNumber))) return null;
  try {
    const { body } = await outbound(env, "GET", `/internal/outbound/tracking/${packageNumber}`, { label: "package tracking" });
    const p = unwrap(body);
    const events = asArray(p.trackingEvents).slice(-10).map((event) => ({
      status: clip(event?.eventCode ?? event?.eventDescription ?? event?.status, 60),
      at: event?.eventDate ?? event?.eventTime ?? null,
      city: clip(event?.eventAddress?.city ?? event?.city, 60),
      state: clip(event?.eventAddress?.state ?? event?.eventAddress?.stateOrRegion ?? event?.state, 40),
    }));
    return {
      carrierCode: clip(p.carrierCode, 60), trackingNumber: clip(p.trackingNumber, 80), trackingUrl: clip(p.carrierURL ?? p.trackingUrl ?? "", 500),
      status: clip(p.currentStatus ?? p.packageDeliveryStatus, 40).toUpperCase(), events,
    };
  } catch (error) {
    if (error instanceof McfError && ["not_found", "invalid"].includes(error.kind)) return null;
    throw error;
  }
}

// cancelFulfillmentOrder: asks Amazon to stop fulfilling (only works before picking starts).
export async function cancelFulfillmentOrder(env, orderId) {
  await outbound(env, "POST", `/internal/outbound/orders/${encodeURIComponent(orderId)}/cancel`, { label: "cancel order" });
  return { requested: true };
}

// Read-only: what Amazon can ship of each seller SKU (worker/inventory.js). [{ sellerSku, fulfillable, inbound, reserved,
// updatedAt }]; a SKU Amazon has no stock record for is not in the list.
export async function getInventory(env, sellerSkus) {
  const skus = [...new Set(sellerSkus.map((sku) => String(sku).trim()).filter(Boolean))];
  if (!skus.length) return [];
  const { body } = await outbound(env, "GET", "/internal/outbound/inventory", { query: { skus: skus.join(",") }, label: "stock", readOnly: true });
  const units = (value) => (Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0);
  return asArray(body?.items)
    .filter((item) => typeof item?.sellerSku === "string" && item.sellerSku)
    .map((item) => ({
      sellerSku: clip(item.sellerSku, 40),
      fulfillable: units(item.fulfillable),
      inbound: units(item.inbound),
      reserved: units(item.reserved),
      updatedAt: typeof item.updatedAt === "string" && Number.isFinite(Date.parse(item.updatedAt)) ? item.updatedAt : null,
    }));
}
