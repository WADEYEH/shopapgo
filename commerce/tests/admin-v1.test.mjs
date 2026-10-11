// Back office v1 (PR 3-8, M9, D50): internal order notes (I10, M9-18), the owners' stop-selling switch (A4, M2-04,
// M9-07), the dashboard's numbers and lists (M9-04, M9-12) and the order list's views (M9-05). The database is the real
// migrations in memory; nothing reaches the network.
import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.js";
import { calendar } from "../worker/business-time.js";
import { dashboard, salesNumbers } from "../worker/dashboard.js";
import { listOrders, viewCounts } from "../worker/orders.js";
import { getProduct, listProducts, setOnSale } from "../worker/products.js";
import { createD1, sqliteAvailable } from "./helpers/d1.mjs";

globalThis.fetch = async (url) => { throw new Error(`unexpected real network call: ${url}`); };
const skip = (await sqliteAvailable()) ? false : "node:sqlite unavailable";

const OWNER = "owner@apgo.example";
const TOKEN = "test-admin-token-0123456789";
const LOGIN = { email: OWNER, password: "owner-password-123" };
const ownerLogin = { Authorization: `Basic ${Buffer.from(`${LOGIN.email}:${LOGIN.password}`).toString("base64")}` };
const DAY = 24 * 60 * 60_000;
const iso = (ms) => new Date(ms).toISOString();

const env0 = (db, extra = {}) => ({
  DB: db,
  AIRWALLEX_CLIENT_ID: "cid", AIRWALLEX_API_KEY: "key", AIRWALLEX_ENV: "demo",
  ADMIN_TOKEN: TOKEN, ADMIN_OWNER_EMAIL: OWNER, ADMIN_LOGIN_EMAIL: LOGIN.email, ADMIN_LOGIN_PASSWORD: LOGIN.password,
  ASSETS: { fetch: async () => new Response("ok") },
  ...extra,
});
const call = (env, path, init = {}) => worker.fetch(new Request(`https://www.shopapgo.com${path}`, init), env, { waitUntil() {} });
const post = (body, headers = {}) => ({ method: "POST", headers: { "Content-Type": "application/json", Origin: "https://www.shopapgo.com", ...headers }, body: JSON.stringify(body) });
const get = async (env, path) => (await call(env, path, { headers: ownerLogin })).json();

const LINE = {
  d204: (qty) => ({ id: "d204", sku: "D204", name: "APGO Atomic Colored Glaze", size: "300 mL · 10.1 fl oz", qty, unitCents: 5999, lineCents: 5999 * qty }),
  d215: (qty) => ({ id: "d215", sku: "D215", name: "APGO Atomic Glaze Coating", size: "200 mL · 6.8 fl oz", qty, unitCents: 2999, lineCents: 2999 * qty }),
};

function insertOrder(db, id, { status = "paid", paidAt, createdAt, lines = [LINE.d204(1)], shipping = {}, total } = {}) {
  const subtotal = lines.reduce((sum, line) => sum + line.lineCents, 0);
  const created = createdAt ?? paidAt ?? iso(Date.now() - 3 * DAY);
  db.raw.prepare(`INSERT INTO orders (id, status, email, shipping_json, shipping_method, lines_json, currency, subtotal_cents, shipping_cents, tax_cents, total_cents, payment_intent_id, created_at, updated_at, paid_at)
    VALUES (?, ?, 'ada@example.com', ?, 'standard', ?, 'USD', ?, 799, 0, ?, ?, ?, ?, ?)`)
    .run(id, status, JSON.stringify({ firstName: "Ada", lastName: "Lee", city: "Austin", state: "TX", phone: "+15125550148", ...shipping }), JSON.stringify(lines),
      subtotal, total ?? subtotal + 799, `int_${id}`, created, created, status === "review" ? null : paidAt ?? created);
}

// ---------- I10, M9-18: internal notes ----------

test("M9-18: any signed-in person can add an internal note; it keeps who and when, is never edited, and empty or unknown is refused", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  insertOrder(db, "APGO-US-N0TE00000001");
  const first = await call(env, "/admin/api/orders/APGO-US-N0TE00000001/notes", post({ body: "  Customer called:\r\nwants it after Oct 15  " }, ownerLogin));
  assert.equal(first.status, 200);
  const { note, notes } = await first.json();
  assert.equal(note.author, OWNER);
  assert.equal(note.body, "Customer called:\nwants it after Oct 15");
  assert.ok(Date.parse(note.at));
  await call(env, "/admin/api/orders/APGO-US-N0TE00000001/notes", post({ body: "Second note" }, ownerLogin));
  const view = await get(env, "/admin/api/orders/APGO-US-N0TE00000001");
  assert.deepEqual(view.notes.map((n) => n.body), ["Customer called:\nwants it after Oct 15", "Second note"], "oldest first, both kept");
  assert.equal(notes.length, 1);

  assert.equal((await call(env, "/admin/api/orders/APGO-US-N0TE00000001/notes", post({ body: "   " }, ownerLogin))).status, 400);
  assert.equal((await call(env, "/admin/api/orders/APGO-US-N0TE00000001/notes", post({ body: "x".repeat(1001) }, ownerLogin))).status, 400);
  assert.equal((await call(env, "/admin/api/orders/APGO-US-N0NE00000001/notes", post({ body: "hello" }, ownerLogin))).status, 404);
  // Browser guards: JSON only, same origin.
  const crossSite = await call(env, "/admin/api/orders/APGO-US-N0TE00000001/notes", post({ body: "x" }, { ...ownerLogin, Origin: "https://evil.example" }));
  assert.equal(crossSite.status, 403);
  // No way to edit or delete one.
  assert.equal((await call(env, "/admin/api/orders/APGO-US-N0TE00000001/notes", { method: "DELETE", headers: ownerLogin })).status, 405);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM order_notes").get().n, 2);
});

// ---------- A4, M2-04, M9-07: stop selling ----------

test("M9-07: an owner stops a product: the store says it is off sale, carts with it cannot be quoted or checked out; resuming undoes it", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  const config = async () => (await (await call(env, "/api/store/config")).json()).products;
  assert.equal((await config()).d204.onSale, true);

  const stop = await call(env, "/admin/api/products/d204/sale", post({ onSale: false, reason: "quality check" }, ownerLogin));
  assert.equal(stop.status, 200);
  const stopped = await stop.json();
  assert.equal(stopped.changed, true);
  assert.equal(stopped.product.onSale, false);
  assert.equal(stopped.product.history[0].action, "product.stopped");
  assert.equal(stopped.product.history[0].reason, "quality check");
  assert.equal((await config()).d204.onSale, false);
  assert.equal((await config()).d215.onSale, true, "only that product");

  const quote = await call(env, "/api/cart/quote", post({ items: [{ sku: "d215", qty: 1 }, { sku: "d204", qty: 1 }] }));
  assert.equal(quote.status, 400);
  assert.equal((await quote.json()).error.code, "product_unavailable");
  assert.equal((await call(env, "/api/cart/quote", post({ items: [{ sku: "d215", qty: 1 }] }))).status, 200, "other products still sell");
  const checkout = await call(env, "/api/checkout/session", post({
    items: [{ sku: "d204", qty: 1 }],
    contact: { email: "ada@example.com", phone: "(512) 555-0134", marketingOptIn: false },
    shipping: { firstName: "Ada", lastName: "Lee", street: "100 Example Ave", street2: "", city: "Austin", state: "TX", zip: "78701" },
    method: "standard",
  }));
  assert.equal(checkout.status, 400);
  assert.equal((await checkout.json()).error.code, "product_unavailable");
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 0, "no checkout was opened");

  // Pressing it again changes nothing; the activity log has the change with who and why.
  assert.equal((await (await call(env, "/admin/api/products/d204/sale", post({ onSale: false }, ownerLogin))).json()).changed, false);
  const activity = await get(env, "/admin/api/activity");
  assert.equal(activity.entries.filter((e) => e.action === "product.stopped").length, 1);
  assert.equal(activity.entries[0].reason, "quality check");

  const resumed = await (await call(env, "/admin/api/products/d204/sale", post({ onSale: true }, ownerLogin))).json();
  assert.equal(resumed.product.onSale, true);
  assert.equal((await config()).d204.onSale, true);
  assert.equal((await call(env, "/api/cart/quote", post({ items: [{ sku: "d204", qty: 1 }] }))).status, 200);
});

test("M9-07: only owners can stop selling; unknown products and bad bodies are refused", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  const member = { id: "colleague@apgo.example", email: "colleague@apgo.example", role: "member", via: "access" };
  await assert.rejects(setOnSale(env, member, "d204", { onSale: false }), (error) => error.status === 403 && error.code === "owner_only");
  assert.equal((await call(env, "/admin/api/products/d999/sale", post({ onSale: false }, ownerLogin))).status, 404);
  assert.equal((await call(env, "/admin/api/products/d204/sale", post({ onSale: "no" }, ownerLogin))).status, 400);
  assert.equal((await call(env, "/admin/api/products/d204/sale", { method: "GET", headers: ownerLogin })).status, 405);
  assert.equal((await listProducts(env)).every((p) => p.onSale), true, "nothing changed");
});

// ---------- products ----------

test("products list their price, switch, stock placeholder and this month's sales from the orders' lines", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  const now = Date.parse("2026-10-20T04:00:00Z"); // 12:00 in Taipei
  const cal = calendar(env, now);
  insertOrder(db, "APGO-US-PROD00000001", { paidAt: iso(cal.today + 60_000), lines: [LINE.d204(1), LINE.d215(2)] });
  insertOrder(db, "APGO-US-PROD00000002", { paidAt: iso(cal.today - 2 * DAY), lines: [LINE.d215(1)] });
  insertOrder(db, "APGO-US-PROD00000003", { paidAt: iso(cal.month - DAY), lines: [LINE.d204(3)] }); // last month
  db.raw.prepare("INSERT INTO order_refunds (id, order_id, payment_intent_id, amount_cents, currency, status, provider_created_at, provider_updated_at, received_at) VALUES ('rf_1', 'APGO-US-PROD00000002', 'int_x', 2999, 'USD', 'SETTLED', ?, ?, ?)")
    .run(iso(now - DAY), iso(now - DAY), iso(now - DAY));
  const products = await listProducts(env, { nowMs: now });
  const d204 = products.find((p) => p.id === "d204");
  const d215 = products.find((p) => p.id === "d215");
  assert.equal(d204.priceCents, 5999);
  assert.equal(d204.name, "Atomic Colored Glaze");
  assert.equal(d204.page, "/products/atomic-colored-glaze");
  assert.deepEqual(d204.stock, { connected: false, available: null, inbound: null, reserved: null, threshold: 5 });
  assert.equal(d204.sales.soldMonth, 1);
  assert.equal(d215.sales.soldMonth, 3);
  assert.equal(d215.sales.revenueMonthCents, 2999 * 3);
  assert.equal(d215.sales.refunds30, 1);
  assert.equal(d204.sales.monthOrderShare, 50);
  assert.equal(d215.sales.days.length, 14);
  assert.equal(d215.sales.days.at(-1).qty, 2, "today");
  assert.equal(d215.sales.days.at(-3).qty, 1, "two days ago");
  assert.equal(d204.sales.days.reduce((sum, d) => sum + d.qty, 0), 1, "last month's order is outside the chart");
  assert.equal(await getProduct(env, "d999"), null);
});

// ---------- M9-04, M9-12: the dashboard ----------

test("M9-12: the dashboard's numbers use the team's calendar day and month; refunds count when they were made", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  const now = Date.parse("2026-10-11T03:00:00Z"); // 11:00 on Oct 11 in Taipei
  insertOrder(db, "APGO-US-TODAY0000001", { paidAt: "2026-10-10T16:30:00Z" }); // 00:30 Oct 11 in Taipei: today
  insertOrder(db, "APGO-US-YDAY00000001", { paidAt: "2026-10-10T15:30:00Z" }); // 23:30 Oct 10 in Taipei: this month
  insertOrder(db, "APGO-US-LASTMONTH001", { paidAt: "2026-09-30T15:00:00Z" }); // 23:00 Sep 30 in Taipei
  insertOrder(db, "APGO-US-REVIEW000001", { status: "review" }); // never paid_at: not counted
  db.raw.prepare("INSERT INTO order_refunds (id, order_id, payment_intent_id, amount_cents, currency, status, provider_created_at, provider_updated_at, received_at) VALUES (?, ?, 'int_x', ?, 'USD', ?, ?, ?, ?)")
    .run("rf_ok", "APGO-US-LASTMONTH001", 2000, "SETTLED", "2026-10-02T00:00:00Z", "2026-10-02T00:00:00Z", "2026-10-02T00:00:00Z");
  db.raw.prepare("INSERT INTO order_refunds (id, order_id, payment_intent_id, amount_cents, currency, status, provider_created_at, provider_updated_at, received_at) VALUES (?, ?, 'int_x', ?, 'USD', ?, ?, ?, ?)")
    .run("rf_failed", "APGO-US-TODAY0000001", 500, "FAILED", "2026-10-05T00:00:00Z", "2026-10-05T00:00:00Z", "2026-10-05T00:00:00Z");
  const numbers = await salesNumbers(env, { nowMs: now });
  const each = 5999 + 799;
  assert.equal(numbers.timeZone, "Asia/Taipei");
  assert.deepEqual(numbers.today, { revenueCents: each, orders: 1 });
  assert.deepEqual(numbers.month, { revenueCents: 2 * each, orders: 2, averageCents: each });
  assert.deepEqual(numbers.refunds, { monthCents: 2000, monthOrders: 1 }, "failed refunds do not count");
  // Another zone moves the day boundary.
  const la = await salesNumbers({ ...env, ADMIN_TIME_ZONE: "America/Los_Angeles" }, { nowMs: now });
  assert.equal(la.today.orders, 2, "both were paid on Oct 10 in Los Angeles, which is still 'today' there");
});

test("M9-04: the dashboard lists what waits (the daily summary's lists), the shipping pipeline, the latest orders and the connections", { skip }, async () => {
  const db = await createD1();
  const env = env0(db, { ORDER_COOLING_OFF_MINUTES: "60", RESEND_API_KEY: "rk", CUSTOMER_EMAIL_FROM: "APGO <orders@shopapgo.com>" });
  const now = Date.now();
  insertOrder(db, "APGO-US-COOLING00001", { paidAt: iso(now - 10 * 60_000) });
  insertOrder(db, "APGO-US-WAITING00001", { paidAt: iso(now - 2 * 60 * 60_000) });
  insertOrder(db, "APGO-US-AMAZON000001", { paidAt: iso(now - DAY) });
  insertOrder(db, "APGO-US-STOCK0000001", { paidAt: iso(now - 3 * DAY) });
  insertOrder(db, "APGO-US-REVIEW000001", { status: "review", shipping: { firstName: "Tom", lastName: "Okafor" } });
  const at = iso(now - 2 * DAY);
  const mcf = db.raw.prepare("INSERT INTO order_mcf (order_id, seller_order_id, status, mcf_status, submitted_at, stockout_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  mcf.run("APGO-US-AMAZON000001", "APGO-US-AMAZON000001", "submitted", "PROCESSING", iso(now - 60 * 60_000), null, at, at);
  mcf.run("APGO-US-STOCK0000001", "APGO-US-STOCK0000001", "rejected", "UNFULFILLABLE", at, at, at, at);
  const board = await dashboard(env, { nowMs: now });
  assert.deepEqual(
    { coolingOff: board.pipeline.coolingOff, waiting: board.pipeline.waiting, withAmazon: board.pipeline.withAmazon, outOfStock: board.pipeline.outOfStock },
    { coolingOff: 1, waiting: 1, withAmazon: 2, outOfStock: 1 },
  );
  assert.deepEqual(board.attention.items.map((item) => [item.kind, item.orderId]), [["review", "APGO-US-REVIEW000001"], ["stockout", "APGO-US-STOCK0000001"]]);
  assert.equal(board.attention.items[0].name, "Tom Okafor");
  assert.equal(board.attention.items[1].detail.days, 2);
  assert.ok(board.attention.clear.includes("disputes") && !board.attention.clear.includes("review"));
  assert.equal(board.latest.length, 5);
  assert.equal(board.latest[0].id, "APGO-US-COOLING00001");
  assert.equal(board.latest.find((o) => o.id === "APGO-US-COOLING00001").shipping, "cooling_off");
  const health = Object.fromEntries(board.health.map((h) => [h.key, h.status]));
  assert.equal(health.airwallex, "ok");
  assert.equal(health.paypal, "off");
  assert.equal(health.email, "ok");
  assert.equal(health.amazon, "off");
  assert.equal(health.address, "off");
  assert.ok(!JSON.stringify(board).includes("rk"), "no setting values");
  assert.deepEqual(board.products.map((p) => [p.id, p.onSale]), [["d204", true], ["d215", true]]);

  const response = await call(env, "/admin/api/dashboard", { headers: ownerLogin });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await call(env, "/admin/api/dashboard")).status, 401, "signed in only");
});

// ---------- M9-05: the order list's views and columns ----------

test("M9-05: the order list's views, their counts, the payment and shipping columns, and finding an order by phone", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  const now = Date.now();
  insertOrder(db, "APGO-US-COOLING00001", { paidAt: iso(now - 5 * 60_000), shipping: { phone: "+15035550199" } });
  insertOrder(db, "APGO-US-SHIPPED00001", { paidAt: iso(now - 4 * DAY) });
  insertOrder(db, "APGO-US-REVIEW000001", { status: "review" });
  insertOrder(db, "APGO-US-FAILED000001", { paidAt: iso(now - 2 * DAY) });
  insertOrder(db, "APGO-US-DISPUTE00001", { paidAt: iso(now - 5 * DAY) });
  insertOrder(db, "APGO-US-PARTREF00001", { paidAt: iso(now - 2 * DAY) });
  insertOrder(db, "APGO-US-CANCEL000001", { status: "cancelled", paidAt: iso(now - 6 * DAY) });
  const at = iso(now - DAY);
  db.raw.prepare("INSERT INTO order_fulfillments (order_id, carrier, tracking_number, shipped_at, shipped_by, created_at, updated_at) VALUES ('APGO-US-SHIPPED00001', 'UPS', '1Z', ?, 'mcf', ?, ?)").run(at, at, at);
  db.raw.prepare("INSERT INTO order_mcf (order_id, seller_order_id, status, mcf_status, created_at, updated_at) VALUES ('APGO-US-FAILED000001', 'APGO-US-FAILED000001', 'failed', '', ?, ?)").run(at, at);
  db.raw.prepare("INSERT INTO order_disputes (provider, dispute_id, order_id, status, amount_cents, currency, due_at, provider_updated_at, created_at, updated_at) VALUES ('airwallex', 'D-1', 'APGO-US-DISPUTE00001', 'open', 1000, 'USD', ?, ?, ?, ?)").run(iso(now + 5 * DAY), at, at, at);
  db.raw.prepare("INSERT INTO order_refunds (id, order_id, payment_intent_id, amount_cents, currency, status, provider_created_at, provider_updated_at, received_at) VALUES ('rf_p', 'APGO-US-PARTREF00001', 'int_x', 1000, 'USD', 'SETTLED', ?, ?, ?)").run(at, at, at);

  assert.deepEqual(await viewCounts(db), { all: 7, to_ship: 4, review: 1, problems: 1, disputes: 1, shipped: 1, cancelled: 1 });
  const ids = async (options) => (await listOrders(db, { ...options, nowMs: now })).orders.map((o) => o.id).sort();
  assert.deepEqual(await ids({ view: "problems" }), ["APGO-US-FAILED000001"]);
  assert.deepEqual(await ids({ view: "to_ship" }), ["APGO-US-COOLING00001", "APGO-US-DISPUTE00001", "APGO-US-FAILED000001", "APGO-US-PARTREF00001"]);
  assert.deepEqual(await ids({ q: "(503) 555-0199" }), ["APGO-US-COOLING00001"], "phone typed with punctuation");

  const rows = Object.fromEntries((await listOrders(db, { nowMs: now })).orders.map((o) => [o.id, o]));
  const cols = (id) => [rows[id].payment, rows[id].shipping, rows[id].todo?.code ?? null];
  assert.deepEqual(cols("APGO-US-COOLING00001"), ["paid", "cooling_off", null]);
  assert.deepEqual(cols("APGO-US-SHIPPED00001"), ["paid", "shipped", null]);
  assert.deepEqual(cols("APGO-US-REVIEW000001"), ["review", "review", "review"]);
  assert.deepEqual(cols("APGO-US-FAILED000001"), ["paid", "not_sent", "not_sent"]);
  assert.deepEqual(cols("APGO-US-DISPUTE00001"), ["disputed", "on_hold", "dispute"]);
  assert.deepEqual(cols("APGO-US-PARTREF00001"), ["partly_refunded", "on_hold", null]);
  assert.deepEqual(cols("APGO-US-CANCEL000001"), ["paid", "cancelled", null]);
  assert.equal(rows["APGO-US-COOLING00001"].city, "Austin");
  assert.equal(rows["APGO-US-PARTREF00001"].refundedCents, 1000);

  const api = await get(env, "/admin/api/orders?view=disputes");
  assert.deepEqual(api.orders.map((o) => o.id), ["APGO-US-DISPUTE00001"]);
  assert.equal(api.viewCounts.all, 7);
  assert.equal(typeof api.numbers.toShip, "number");
  assert.equal((await call(env, "/admin/api/orders?view=nope", { headers: ownerLogin })).status, 400);
});
