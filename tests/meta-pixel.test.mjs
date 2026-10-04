// Meta Pixel (browser side): static contract + a behaviour harness that runs js/meta-pixel.js
// in a bare vm with a fake window/document, so hostname gating, the _fbc rule and the event
// mapping are tested without a browser. Browser flows are in meta-pixel.spec.mjs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { DEFAULT_PRICING } from "../worker/pricing.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(ROOT, file), "utf8");
const PIXEL_ID = "2606879866471418";
const PIXEL_PAGES = ["cart", "checkout", "v3", "index", "v2", "contact", "privacy", "returns", "terms"];

const head = (html) => html.slice(html.indexOf("<head"), html.indexOf("</head>"));

test("every public store page loads js/meta-pixel.js (deferred, in <head>) plus the noscript fallback", async () => {
  for (const page of PIXEL_PAGES) {
    const html = await read(`prototype/${page}.html`);
    const h = head(html);
    assert.equal((h.match(/<script src="js\/meta-pixel\.js" defer><\/script>/g) || []).length, 1, `${page}.html: one deferred meta-pixel script in head`);
    assert.ok(h.includes(`facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`), `${page}.html: noscript pixel in head`);
    assert.match(h, /<noscript><img [^>]*alt=""[^>]*><\/noscript>/, `${page}.html: noscript image has an empty alt`);
  }
});

test("pages that must not load the pixel do not", async () => {
  for (const page of ["admin/index", "v3-style"]) {
    let html;
    try { html = await read(`prototype/${page}.html`); } catch { continue; }
    assert.ok(!html.includes("meta-pixel") && !html.includes("facebook"), `${page}.html must not load the Meta Pixel`);
  }
  const admin = await read("prototype/admin/index.html").catch(() => "");
  assert.ok(!admin.includes("meta-pixel"));
});

test("the pixel is never part of shared.js (admin pages load that file)", async () => {
  const shared = await read("prototype/js/commerce/shared.js");
  assert.ok(!/fbq|facebook|fbevents|meta-pixel/i.test(shared));
  for (const file of ["admin.js"]) {
    const admin = await read(`prototype/js/${file}`);
    assert.ok(!/fbq|fbevents/.test(admin));
  }
});

test("policy pages come from scripts/build-policy-pages.py (template carries the pixel tags)", async () => {
  const script = await read("scripts/build-policy-pages.py");
  assert.ok(script.includes('<script src="js/meta-pixel.js" defer></script>'));
  assert.ok(script.includes(PIXEL_ID));
});

test("meta-pixel.js: fixed ids, hostname gate, event ids, and no hard-coded prices", async () => {
  const source = await read("prototype/js/meta-pixel.js");
  assert.ok(source.includes(`"${PIXEL_ID}"`));
  assert.ok(source.includes("https://connect.facebook.net/en_US/fbevents.js"));
  assert.ok(source.includes('"store.shopapgo.com"'));
  assert.ok(source.includes('"ic_" + orderId'));
  assert.ok(source.includes('"purchase_" + orderId'));
  assert.ok(source.includes("apgo_meta_purchase_"));
  assert.ok(source.includes("/api/store/config"));
  // No price literal anywhere: not 29.90 / 24.90 / 2990 / 2490, and no currency amounts.
  for (const product of Object.values(DEFAULT_PRICING.products)) {
    assert.ok(!source.includes(String(product.priceCents)), `price ${product.priceCents} must not be hard-coded`);
    assert.ok(!source.includes((product.priceCents / 100).toFixed(2)), "price must not be hard-coded");
  }
  assert.ok(!/\$\s?\d/.test(source));
  assert.ok(!/\b\d+\.\d{2}\b/.test(source.replace(/"2\.0"/g, "")), "no decimal money literals");
});

test("checkout.js: attribution goes into the request body but never into the session cache key", async () => {
  const source = await read("prototype/js/commerce/checkout.js");
  assert.ok(/body:\s*\{\s*\.\.\.payload,\s*attribution:\s*readAttribution\(\)\s*\}/.test(source));
  assert.ok(/const key = JSON\.stringify\(payload\);/.test(source), "cache key is built from payload only");
  assert.ok(!/payload\s*=\s*\{[^}]*attribution/.test(source), "attribution is not part of payload");
  assert.ok(source.includes('track("checkout_session_created"'));
});

// ---------- vm harness ----------

function run({ hostname = "store.shopapgo.com", search = "", cookie = "", fbq, addToCartIds = [], config = null, storage = {} } = {}) {
  const writes = [];
  const listeners = {};
  const appended = [];
  const store = { ...storage };
  const sandbox = {
    URLSearchParams,
    Date,
    Number,
    Math,
    Array,
    String,
    encodeURIComponent,
    decodeURIComponent,
    console,
    fetchCalls: [],
  };
  sandbox.window = sandbox;
  sandbox.location = { hostname, search };
  sandbox.fetch = async (url) => {
    sandbox.fetchCalls.push(url);
    return { ok: Boolean(config), json: async () => config };
  };
  sandbox.sessionStorage = {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
  };
  let jar = cookie;
  sandbox.document = {
    get cookie() { return jar; },
    set cookie(value) { writes.push(value); },
    createElement: () => ({}),
    getElementsByTagName: () => [],
    head: { appendChild: (node) => appended.push(node) },
    querySelectorAll: () => addToCartIds.map((id) => ({ getAttribute: () => id })),
  };
  sandbox.addEventListener = (name, handler) => { (listeners[name] ||= []).push(handler); };
  if (fbq) sandbox.fbq = fbq;
  vm.createContext(sandbox);
  return {
    sandbox,
    writes,
    appended,
    store,
    load: async () => {
      const source = await read("prototype/js/meta-pixel.js");
      vm.runInContext(source, sandbox);
    },
    emit: (detail) => (listeners["apgo:analytics"] || []).forEach((handler) => handler({ detail })),
    // JSON round trip: values built inside the vm have the vm realm's prototypes.
    calls: () => JSON.parse(JSON.stringify(Array.from(sandbox.fbq?.queue || [], (args) => Array.from(args)))),
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
const CONFIG = {
  currency: "USD",
  products: Object.fromEntries(Object.entries(DEFAULT_PRICING.products).map(([id, p]) => [id, { sku: p.sku, name: p.name, priceCents: p.priceCents }])),
};

test("only store.shopapgo.com initialises Meta; staging, localhost, admin and look-alike hosts stay silent", async () => {
  for (const hostname of ["staging.shopapgo.com", "localhost", "127.0.0.1", "admin.shopapgo.com", "shopapgo.com", "store.shopapgo.com.evil.example", "apgo-us-store-staging.workers.dev"]) {
    const h = run({ hostname, search: "?fbclid=abc" });
    await h.load();
    assert.equal(h.sandbox.fbq, undefined, hostname);
    assert.equal(h.appended.length, 0, hostname);
    assert.deepEqual(h.writes, [], `${hostname}: no cookie writes`);
    assert.equal(h.sandbox.fetchCalls.length, 0, hostname);
  }
  const live = run();
  await live.load();
  assert.equal(typeof live.sandbox.fbq, "function");
  assert.deepEqual(live.calls(), [["init", PIXEL_ID], ["track", "PageView"]]);
});

test("an existing window.fbq is reused: no second init or PageView", async () => {
  const existing = Object.assign(() => {}, { queue: [] });
  const h = run({ fbq: existing });
  await h.load();
  assert.equal(h.sandbox.fbq, existing);
  assert.deepEqual(h.calls(), []);
});

test("fbclid writes _fbc only when the cookie is missing (fb.1.<ms>.<fbclid>, 90 days, Lax, .shopapgo.com)", async () => {
  const before = Date.now();
  const h = run({ search: "?utm=1&fbclid=IwAR_test-123" });
  await h.load();
  assert.equal(h.writes.length, 1);
  const [pair, ...attrs] = h.writes[0].split("; ");
  const [name, value] = pair.split("=");
  assert.equal(name, "_fbc");
  const match = value.match(/^fb\.1\.(\d{13})\.IwAR_test-123$/);
  assert.ok(match, value);
  assert.ok(Number(match[1]) >= before && Number(match[1]) <= Date.now());
  assert.deepEqual(attrs, [`Max-Age=${90 * 24 * 60 * 60}`, "Path=/", "Domain=.shopapgo.com", "SameSite=Lax"]);

  const existing = run({ search: "?fbclid=new", cookie: "a=1; _fbc=fb.1.1.old" });
  await existing.load();
  assert.deepEqual(existing.writes, [], "an existing _fbc is never overwritten");

  const none = run({ search: "?utm=1" });
  await none.load();
  assert.deepEqual(none.writes, []);
});

test("InitiateCheckout / Purchase use ic_<orderId> / purchase_<orderId> and carry server amounts", async () => {
  const h = run();
  await h.load();
  h.emit({
    event: "checkout_session_created",
    order_id: "APGO-US-0123456789AB",
    value: 79.3,
    currency: "USD",
    items: [{ item_id: "D204", quantity: 1, price: 29.9 }, { item_id: "D215", quantity: 2, price: 24.9 }],
  });
  h.emit({ event: "checkout_session_created", order_id: "APGO-US-0123456789AB", value: 79.3, currency: "USD", items: [] });
  h.emit({
    event: "purchase",
    transaction_id: "APGO-US-0123456789AB",
    value: 85.3,
    currency: "USD",
    items: [{ item_id: "D204", quantity: 1, price: 29.9 }],
  });
  h.emit({ event: "purchase", transaction_id: "APGO-US-0123456789AB", value: 85.3, currency: "USD" });
  const calls = h.calls().slice(2);
  assert.equal(calls.length, 2, "each order id is sent once per event type");
  const [ic, purchase] = calls;
  assert.deepEqual(ic.slice(0, 2), ["track", "InitiateCheckout"]);
  assert.deepEqual(ic[3], { eventID: "ic_APGO-US-0123456789AB" });
  assert.deepEqual(ic[2].content_ids, ["D204", "D215"]);
  assert.equal(ic[2].content_type, "product");
  assert.equal(ic[2].value, 79.3);
  assert.equal(ic[2].currency, "USD");
  assert.equal(ic[2].num_items, 3);
  assert.deepEqual(ic[2].contents[1], { id: "D215", quantity: 2, item_price: 24.9 });
  assert.deepEqual(purchase.slice(0, 2), ["track", "Purchase"]);
  assert.deepEqual(purchase[3], { eventID: "purchase_APGO-US-0123456789AB" });
  assert.equal(purchase[2].value, 85.3);
  assert.ok("apgo_meta_purchase_APGO-US-0123456789AB" in h.store);
});

test("a stored apgo_meta_purchase_<id> key blocks the Purchase", async () => {
  const h = run({ storage: { "apgo_meta_purchase_APGO-US-AAAAAAAAAAAA": "1" } });
  await h.load();
  h.emit({ event: "purchase", transaction_id: "APGO-US-AAAAAAAAAAAA", value: 1, currency: "USD" });
  assert.deepEqual(h.calls().slice(2), []);
});

test("AddToCart and ViewContent take prices from /api/store/config and omit value when unknown", async () => {
  const h = run({ config: CONFIG, addToCartIds: ["d204", "d215", "d204"] });
  await h.load();
  await tick();
  h.emit({ event: "add_to_cart", sku: "d215", quantity: 2 });
  await tick();
  const [, , view, add] = h.calls();
  assert.equal(view[1], "ViewContent");
  assert.deepEqual(view[2].content_ids, ["D204", "D215"]);
  assert.ok(!("value" in view[2]), "two products on the page: no single value");
  assert.equal(add[1], "AddToCart");
  assert.deepEqual(add[2].content_ids, ["D215"]);
  assert.equal(add[2].value, (DEFAULT_PRICING.products.d215.priceCents * 2) / 100);
  assert.equal(add[2].contents[0].quantity, 2);

  const offline = run({ config: null, addToCartIds: ["d204"] });
  await offline.load();
  await tick();
  offline.emit({ event: "add_to_cart", sku: "d204", quantity: 1 });
  await tick();
  for (const call of offline.calls().slice(2)) {
    assert.deepEqual(call[2].content_ids, ["D204"]);
    assert.ok(!("value" in call[2]), "no price from the API means no value");
  }
  assert.equal(offline.calls().slice(2).length, 2);

  const single = run({ config: CONFIG, addToCartIds: ["d204"] });
  await single.load();
  await tick();
  assert.equal(single.calls()[2][2].value, DEFAULT_PRICING.products.d204.priceCents / 100);
});
