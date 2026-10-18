// Amazon stock on the store (D25, D76; M6-09, M9-17, A3, B3, I9; worker/inventory.js): read every 15 minutes through the
// gateway, out of stock below 5 (the site and every quote and checkout refuse it), back by itself, one team email per
// stock-out, the last numbers kept when Amazon cannot be read (and one email after an hour), staging's simulated stock,
// and the back office (Products, Refresh, dashboard, daily summary). The database is the real migrations in memory;
// Amazon is the shared fake (tests/helpers/fake-amazon-mcf.mjs); nothing reaches the network.
import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.js";
import { dashboard } from "../worker/dashboard.js";
import { STOCK_THRESHOLD, currentStock, refreshStock, scheduledStock } from "../worker/inventory.js";
import { livePricing } from "../worker/products.js";
import { digestSections } from "../worker/team-digest.js";
import { quote } from "../worker/catalog.js";
import { createD1, sqliteAvailable } from "./helpers/d1.mjs";
import { FAKE_AMAZON_ENV, FAKE_BASE_URL, createFakeAmazon } from "./helpers/fake-amazon-mcf.mjs";

const original = globalThis.fetch;
globalThis.fetch = async (url) => { throw new Error(`unexpected real network call: ${url}`); };
const skip = (await sqliteAvailable()) ? false : "node:sqlite unavailable";

const MAIL_URL = "https://mail.example/send";
const OWNER = "owner@apgo.example";
const LOGIN = { email: OWNER, password: "owner-password-123" };
const ownerLogin = { Authorization: `Basic ${Buffer.from(`${LOGIN.email}:${LOGIN.password}`).toString("base64")}` };
const MIN = 60_000;
const T0 = Date.parse("2026-10-18T10:00:00Z");

const env0 = (db, extra = {}) => ({
  DB: db,
  AIRWALLEX_CLIENT_ID: "cid", AIRWALLEX_API_KEY: "key", AIRWALLEX_ENV: "demo",
  ADMIN_OWNER_EMAIL: OWNER, ADMIN_LOGIN_EMAIL: LOGIN.email, ADMIN_LOGIN_PASSWORD: LOGIN.password,
  RESEND_API_KEY: "rk_test_key", CUSTOMER_EMAIL_FROM: "APGO <orders@shop.example>", ORDER_NOTIFY_EMAIL_API_URL: MAIL_URL,
  ASSETS: { fetch: async () => new Response("ok") },
  ...FAKE_AMAZON_ENV,
  ...extra,
});

// The fake Amazon plus the email API; mails holds what the team was sent.
async function withAmazon(stock, run) {
  const amazon = createFakeAmazon({ stock });
  const mails = [];
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href === MAIL_URL) { mails.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: "m" }), { status: 200 }); }
    if (href.startsWith(FAKE_BASE_URL)) return amazon.fetch(href, init);
    throw new Error(`unexpected network call: ${href}`);
  };
  try {
    return await run(amazon, mails);
  } finally {
    globalThis.fetch = async (u) => { throw new Error(`unexpected real network call: ${u}`); };
  }
}

const call = (env, path, init = {}) => worker.fetch(new Request(`https://www.shopapgo.com${path}`, init), env, { waitUntil() {} });
const post = (body, headers = {}) => ({ method: "POST", headers: { "Content-Type": "application/json", Origin: "https://www.shopapgo.com", ...headers }, body: JSON.stringify(body) });
const cartQuote = async (env, items) => {
  const response = await call(env, "/api/cart/quote", post({ items }));
  const body = await response.json();
  return { status: response.status, body: body.error ?? body };
};
const subjects = (mails) => mails.map((mail) => mail.subject);

test("without the Amazon connection nothing is read and everything sells (D76: nothing to go on)", { skip }, async () => {
  const db = await createD1();
  const env = env0(db, { OUTBOUND_INTERNAL_TOKEN: "" });
  await withAmazon({}, async (amazon) => {
    assert.deepEqual(await scheduledStock(env, { nowMs: T0 }), { ran: false });
    assert.equal(amazon.count("inventory"), 0);
    const stock = await currentStock(env, { nowMs: T0 });
    assert.equal(stock.status.configured, false);
    assert.equal(stock.products.d204.connected, false);
    const priced = await cartQuote(env, [{ sku: "d204", qty: 10 }]);
    assert.equal(priced.status, 200);
  });
});

test("the cron reads Amazon's stock per mapped seller SKU every 15 minutes and keeps what it read", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withAmazon({ "AMZ-SKU-D204": { fulfillable: 40, inbound: 12, reserved: 2 }, "AMZ-SKU-D215": { fulfillable: 187 } }, async (amazon) => {
    const first = await scheduledStock(env, { nowMs: T0 });
    assert.equal(first.ok, true);
    assert.equal(first.read, 2);
    assert.equal(amazon.calls.at(-1).query.skus, "AMZ-SKU-D204,AMZ-SKU-D215", "one read for every mapped product");
    assert.equal(amazon.calls.at(-1).headers.authorization, `Bearer ${FAKE_AMAZON_ENV.OUTBOUND_INTERNAL_TOKEN}`);
    const stock = await currentStock(env, { nowMs: T0 });
    assert.deepEqual(
      { ...stock.products.d204 },
      { connected: true, available: 40, inbound: 12, reserved: 2, threshold: STOCK_THRESHOLD, outOfStock: false, outSince: null, amazonUpdatedAt: "2026-10-18T08:00:00Z", readAt: new Date(T0).toISOString(), simulated: false },
    );
    assert.equal(stock.status.lastReadAt, new Date(T0).toISOString());
    assert.equal((await scheduledStock(env, { nowMs: T0 + 5 * MIN })).reason, "not_due");
    assert.equal((await scheduledStock(env, { nowMs: T0 + 10 * MIN })).reason, "not_due");
    assert.equal((await scheduledStock(env, { nowMs: T0 + 15 * MIN })).ok, true);
    assert.equal(amazon.count("inventory"), 2);
  });
});

test("below 5 a product is out of stock: the site says so, quotes and checkouts refuse it, the team gets one email", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withAmazon({ "AMZ-SKU-D204": { fulfillable: 40 }, "AMZ-SKU-D215": { fulfillable: 4 } }, async (amazon, mails) => {
    await refreshStock(env, { nowMs: T0 });
    const config = await (await call(env, "/api/store/config")).json();
    assert.equal(config.products.d215.inStock, false);
    assert.equal(config.products.d204.inStock, true);
    assert.equal(config.products.d204.available, undefined, "how many Amazon has is not published");

    const refused = await cartQuote(env, [{ sku: "d204", qty: 1 }, { sku: "d215", qty: 1 }]);
    assert.equal(refused.status, 400);
    assert.equal(refused.body.code, "out_of_stock");
    assert.equal(refused.body.message, "APGO Atomic Glaze Coating is out of stock. Remove it from your cart to check out.");
    assert.equal((await cartQuote(env, [{ sku: "d204", qty: 2 }])).status, 200);

    // Card and PayPal checkouts price with the same live pricing (worker/index.js).
    const live = await livePricing(env);
    assert.equal(live.products.d215.inStock, false);
    assert.equal(live.products.d204.available, 40);
    assert.throws(() => quote([{ sku: "d215", qty: 1 }], {}, live), (error) => error.code === "out_of_stock");

    assert.deepEqual(subjects(mails), ["Out of stock on the website: APGO Atomic Glaze Coating"]);
    assert.match(mails[0].text, /Amazon can ship 4 of APGO Atomic Glaze Coating \(D215, Amazon SKU AMZ-SKU-D215\), fewer than 5\./);
    assert.match(mails[0].text, /#\/products\/d215/);
    const since = (await currentStock(env, { nowMs: T0 })).products.d215.outSince;
    assert.equal(since, new Date(T0).toISOString());

    // Still out at the next read: no second email, the same "since".
    amazon.setStock("AMZ-SKU-D215", 2);
    await refreshStock(env, { nowMs: T0 + 15 * MIN });
    assert.equal(mails.length, 1);
    assert.equal((await currentStock(env, { nowMs: T0 })).products.d215.outSince, since);

    // Back at 5: sells again by itself.
    amazon.setStock("AMZ-SKU-D215", 5);
    await refreshStock(env, { nowMs: T0 + 30 * MIN });
    assert.equal((await currentStock(env, { nowMs: T0 })).products.d215.outOfStock, false);
    assert.equal((await cartQuote(env, [{ sku: "d215", qty: 5 }])).status, 200);

    // Out again later: a new email.
    amazon.setStock("AMZ-SKU-D215", 0);
    await refreshStock(env, { nowMs: T0 + 45 * MIN });
    assert.equal(mails.length, 2);
  });
});

test("a cart cannot ask for more than Amazon can ship", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withAmazon({ "AMZ-SKU-D204": { fulfillable: 7 }, "AMZ-SKU-D215": { fulfillable: 100 } }, async () => {
    await refreshStock(env, { nowMs: T0 });
    const tooMany = await cartQuote(env, [{ sku: "d204", qty: 8 }]);
    assert.equal(tooMany.status, 400);
    assert.equal(tooMany.body.code, "not_enough_stock");
    assert.equal(tooMany.body.message, "Only 7 of APGO Atomic Colored Glaze can ship right now. Lower the quantity to check out.");
    assert.equal((await cartQuote(env, [{ sku: "d204", qty: 7 }])).status, 200);
    // Two lines of the same product count together.
    assert.equal((await cartQuote(env, [{ sku: "d204", qty: 4 }, { sku: "d204", qty: 4 }])).body.code, "not_enough_stock");
  });
});

test("a product an owner stopped: its stock-out sends no email and is not listed as waiting; the switch wins after a restock", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  db.raw.prepare("INSERT INTO product_settings (sku, on_sale, updated_by, updated_at) VALUES ('d215', 0, ?, ?)").run(OWNER, new Date(T0).toISOString());
  await withAmazon({ "AMZ-SKU-D204": { fulfillable: 40 }, "AMZ-SKU-D215": { fulfillable: 1 } }, async (amazon, mails) => {
    await refreshStock(env, { nowMs: T0 });
    assert.equal(mails.length, 0);
    assert.deepEqual((await dashboard(env, { nowMs: T0 })).stock.out, []);
    assert.ok(!(await digestSections(env, { nowMs: T0 })).some((section) => /Out of stock on the website/.test(section.title)));
    amazon.setStock("AMZ-SKU-D215", 90);
    await refreshStock(env, { nowMs: T0 + 15 * MIN });
    const refused = await cartQuote(env, [{ sku: "d215", qty: 1 }]);
    assert.equal(refused.body.code, "product_unavailable", "still stopped");
  });
});

test("a seller SKU Amazon has no stock record for counts as none", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withAmazon({ "AMZ-SKU-D204": { fulfillable: 40 } }, async (amazon, mails) => {
    await refreshStock(env, { nowMs: T0 });
    const stock = await currentStock(env, { nowMs: T0 });
    assert.equal(stock.products.d215.available, 0);
    assert.equal(stock.products.d215.outOfStock, true);
    assert.deepEqual(subjects(mails), ["Out of stock on the website: APGO Atomic Glaze Coating"]);
  });
});

test("when Amazon cannot be read the store sells on the last numbers; after an hour the team gets one email (D76)", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withAmazon({ "AMZ-SKU-D204": { fulfillable: 40 }, "AMZ-SKU-D215": { fulfillable: 4 } }, async (amazon, mails) => {
    await scheduledStock(env, { nowMs: T0 });
    mails.length = 0;
    amazon.stockDown(true);
    for (const minutes of [15, 30, 45]) {
      const outcome = await scheduledStock(env, { nowMs: T0 + minutes * MIN });
      assert.equal(outcome.ok, false);
    }
    let stock = await currentStock(env, { nowMs: T0 + 45 * MIN });
    assert.equal(stock.status.stale, false, "under an hour");
    assert.match(stock.status.error, /Amazon outbound error \(500\)/);
    assert.equal(stock.products.d204.available, 40, "the last numbers stay");
    assert.equal(stock.products.d215.outOfStock, true);
    assert.equal((await cartQuote(env, [{ sku: "d204", qty: 1 }])).status, 200, "still sells");
    assert.equal(mails.length, 0);

    await scheduledStock(env, { nowMs: T0 + 60 * MIN });
    stock = await currentStock(env, { nowMs: T0 + 60 * MIN });
    assert.equal(stock.status.stale, true);
    assert.deepEqual(subjects(mails), ["Amazon stock has not been read for an hour"]);
    assert.match(mails[0].text, /keeps selling on the last numbers/);
    await scheduledStock(env, { nowMs: T0 + 75 * MIN });
    await scheduledStock(env, { nowMs: T0 + 90 * MIN });
    assert.equal(mails.length, 1, "one email per outage");

    const board = await dashboard(env, { nowMs: T0 + 90 * MIN });
    assert.deepEqual(board.stock.stale, { since: new Date(T0).toISOString() });
    assert.equal(board.health.find((item) => item.key === "stock").status, "warn");
    const sections = await digestSections(env, { nowMs: T0 + 90 * MIN });
    assert.ok(sections.some((section) => /Amazon stock not read for over an hour/.test(section.title)));

    amazon.stockDown(false);
    await scheduledStock(env, { nowMs: T0 + 105 * MIN });
    stock = await currentStock(env, { nowMs: T0 + 105 * MIN });
    assert.equal(stock.status.stale, false);
    assert.equal(stock.status.error, null);
    // A later outage gets its own email.
    amazon.stockDown(true);
    for (const minutes of [120, 135, 150, 165]) await scheduledStock(env, { nowMs: T0 + minutes * MIN });
    assert.equal(mails.length, 2);
  });
});

test("never read and failing: products are not connected and sell", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withAmazon({}, async (amazon) => {
    amazon.stockDown(true);
    await scheduledStock(env, { nowMs: T0 });
    const stock = await currentStock(env, { nowMs: T0 });
    assert.equal(stock.products.d204.connected, false);
    assert.equal((await cartQuote(env, [{ sku: "d204", qty: 10 }])).status, 200);
  });
});

test("staging: the stock read goes to the real gateway even with the fake Amazon, and a simulated number tries a stock-out", { skip }, async () => {
  const db = await createD1();
  const staging = env0(db, { SITE_ENV: "staging", MCF_FAKE: "true", CUSTOMER_EMAIL_TEST_RECIPIENTS: OWNER });
  await withAmazon({ "AMZ-SKU-D204": { fulfillable: 40 }, "AMZ-SKU-D215": { fulfillable: 187 } }, async (amazon, mails) => {
    await refreshStock(staging, { nowMs: T0 });
    assert.equal(amazon.count("inventory"), 1, "read from the gateway, not the fake");
    assert.equal((await currentStock(staging, { nowMs: T0 })).products.d204.available, 40);

    db.raw.prepare("UPDATE product_stock SET simulated_available = 2 WHERE sku = 'd204'").run();
    let stock = await currentStock(staging, { nowMs: T0 });
    assert.equal(stock.products.d204.available, 2);
    assert.equal(stock.products.d204.simulated, true);
    assert.equal(stock.products.d204.outOfStock, true, "the site goes by it at once");
    await refreshStock(staging, { nowMs: T0 + 15 * MIN });
    assert.deepEqual(subjects(mails), ["Out of stock on the website: APGO Atomic Colored Glaze"]);
    assert.match(mails[0].text, /Amazon can ship 2 of/);

    // Production ignores the column.
    const production = env0(db);
    stock = await currentStock(production, { nowMs: T0 });
    assert.equal(stock.products.d204.available, 40);
    assert.equal(stock.products.d204.outOfStock, false);
  });

  // Staging without a real connection: the built-in fake answers (100 of everything), nothing goes to the network.
  const bare = await createD1();
  const fakeOnly = env0(bare, { SITE_ENV: "staging", MCF_FAKE: "true", AMAZON_OUTBOUND_BASE_URL: "", OUTBOUND_INTERNAL_TOKEN: "" });
  await refreshStock(fakeOnly, { nowMs: T0 });
  assert.equal((await currentStock(fakeOnly, { nowMs: T0 })).products.d215.available, 100);
  // MCF_FAKE outside staging reads nothing.
  assert.deepEqual(await scheduledStock(env0(bare, { MCF_FAKE: "true" }), { nowMs: T0 }), { ran: false });
});

test("back office: Products show the stock and when it was read, Refresh reads now, the dashboard and summary list stock-outs", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withAmazon({ "AMZ-SKU-D204": { fulfillable: 40, inbound: 12, reserved: 2 }, "AMZ-SKU-D215": { fulfillable: 3 } }, async (amazon) => {
    let list = await (await call(env, "/admin/api/products", { headers: ownerLogin })).json();
    assert.equal(list.products[0].stock.connected, false);
    assert.equal(list.stock.configured, true);
    assert.equal(list.stock.lastReadAt, null);

    const refreshed = await call(env, "/admin/api/products/stock/refresh", post({}, ownerLogin));
    assert.equal(refreshed.status, 200);
    const body = await refreshed.json();
    assert.equal(body.result.ok, true);
    assert.equal(body.products.find((p) => p.id === "d204").stock.inbound, 12);
    assert.equal(body.products.find((p) => p.id === "d215").stock.outOfStock, true);
    assert.ok(body.stock.lastReadAt);

    const again = await (await call(env, "/admin/api/products/stock/refresh", post({}, ownerLogin))).json();
    assert.equal(again.result.reason, "just_read", "a second press right away does not read again");
    assert.equal(amazon.count("inventory"), 1);
    assert.equal((await call(env, "/admin/api/products/stock/refresh", { method: "GET", headers: ownerLogin })).status, 405);
    assert.equal((await call(env, "/admin/api/products/stock/refresh", { method: "POST", headers: { ...ownerLogin, Origin: "https://evil.example" } })).status, 403);

    const one = await (await call(env, "/admin/api/products/d215", { headers: ownerLogin })).json();
    assert.equal(one.stock.available, 3);
    assert.ok(one.stockStatus.lastReadAt);

    const board = await dashboard(env);
    assert.deepEqual(board.stock.out.map((p) => [p.id, p.available]), [["d215", 3]]);
    assert.equal(board.stock.stale, null);
    assert.equal(board.health.find((item) => item.key === "stock").status, "ok");
    const sections = await digestSections(env);
    const section = sections.find((s) => /Out of stock on the website/.test(s.title));
    assert.equal(section.count, 1);
    assert.match(section.detail, /^APGO Atomic Glaze Coating \(3 at Amazon, since /);
  });
});

test.after(() => { globalThis.fetch = original; });
