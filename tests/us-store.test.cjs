const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { ROOT, compile } = require("./fixture.cjs");

// The single-site switch (lib/us/routes.js): store links only where the store pages are on the same host.
const ON = { NEXT_PUBLIC_APGO_US_SINGLE_SITE: "true" };
const STORE_KEYS = ["shop", "cart", "privacy", "terms", "returns", "contact"];
const routesFor = (env = {}) => compile("lib/us/routes.js", { env });
const cartLink = () => compile("components/us/CartLink.js", { aliases: { "@/lib/us/routes": routesFor(ON) } });

test("off (the live www until the cutover, previews): today's product links and no store links", () => {
  for (const env of [{}, { NEXT_PUBLIC_APGO_US_SINGLE_SITE: "false" }, { NEXT_PUBLIC_APGO_US_SINGLE_SITE: "TRUE" }, { NEXT_PUBLIC_APGO_US_SINGLE_SITE: "1" }]) {
    const r = routesFor(env);
    assert.equal(r.singleSite, false);
    for (const key of STORE_KEYS) assert.equal(r.routes[key], "#", key);
    assert.deepEqual({ ...r.store }, { d204: "/products/d204", d215: "/products/d215" });
  }
});

test("on (the test site now, www after the cutover): same-host Shop, cart, policy pages and the named product URLs", async () => {
  const r = routesFor(ON);
  assert.equal(r.singleSite, true);
  assert.deepEqual(Object.fromEntries(STORE_KEYS.map((key) => [key, r.routes[key]])), {
    shop: "/products", cart: "/cart", privacy: "/privacy", terms: "/terms", returns: "/returns", contact: "/contact",
  });
  // The store's list of product URLs (D39) is the source; the brand links must match it exactly.
  const data = await import(pathToFileURL(path.join(ROOT, "commerce/prototype/js/commerce/product-data.js")).href);
  for (const sku of data.SKUS) assert.equal(r.productPathFor(sku), data.productPath(sku), sku);
  assert.equal(r.routes.shop, data.SHOP_PATH);
});

test("every store page the brand links to exists in the store", () => {
  const r = routesFor(ON);
  for (const href of [...STORE_KEYS.map((key) => r.routes[key]), ...Object.values(r.store)]) {
    assert.ok(fs.existsSync(path.join(ROOT, "commerce/prototype", `${href}.html`)), href);
  }
});

test("only the test-site build turns the switch on", () => {
  assert.match(fs.readFileSync(path.join(ROOT, "commerce/scripts/build-site.mjs"), "utf8"), /NEXT_PUBLIC_APGO_US_SINGLE_SITE: "true"/);
  assert.match(fs.readFileSync(path.join(ROOT, ".env.example"), "utf8"), /^NEXT_PUBLIC_APGO_US_SINGLE_SITE=false\r?$/m);
});

test("the header count reads the store's own cart with the store's rules", () => {
  const { cartCount, CART_KEY } = cartLink();
  const shared = fs.readFileSync(path.join(ROOT, "commerce/prototype/js/commerce/shared.js"), "utf8");
  assert.ok(shared.includes(`const STORAGE_KEY = "${CART_KEY}";`), "same localStorage key as the store");
  for (const raw of [null, "", "not json", '{"sku":"d204","qty":1}', "[]"]) assert.equal(cartCount(raw), 0, String(raw));
  assert.equal(cartCount(JSON.stringify([{ sku: "d204", qty: 2 }, { sku: "d215", qty: 1 }])), 3);
  assert.equal(cartCount(JSON.stringify([{ sku: "d204", qty: 1 }, { sku: "x", qty: 5 }, { sku: "d215", qty: 0 }, { sku: "d215", qty: 1.5 }, null])), 1);
});

test("the cart link's server markup: the cart page, a spoken count, the badge hidden until the cart is read", () => {
  const { default: CartLink, CartRow } = cartLink();
  const html = renderToStaticMarkup(createElement(CartLink));
  assert.match(html, /^<a href="\/cart" class="us-cart-link" aria-label="Cart, 0 items" data-cart-link="true">/);
  assert.match(html, /<span class="us-cart-count" data-cart-count="true" hidden="">0<\/span><\/a>$/);
  assert.match(renderToStaticMarkup(createElement(CartRow)), /^<a class="us-drawer-home" href="\/cart">Cart · 0/);
});
