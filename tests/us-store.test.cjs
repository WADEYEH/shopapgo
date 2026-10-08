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
const STORE_KEYS = ["shop", "cart", "checkout", "privacy", "terms", "returns", "shipping", "contact"];
const routesFor = (env = {}) => compile("lib/us/routes.js", { env });
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

// The store's cart (lib/shop/cart.js) with a browser stand-in: localStorage, events, and the analytics it reports to.
function cartModule({ storage = new Map(), blocked = false } = {}) {
  const dispatched = [];
  const tracked = [];
  const localStorage = {
    getItem: (key) => {
      if (blocked) throw new Error("blocked");
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem: (key, value) => {
      if (blocked) throw new Error("blocked");
      storage.set(key, value);
    },
  };
  const window = { localStorage, dispatchEvent: (event) => dispatched.push(event), addEventListener() {}, removeEventListener() {} };
  class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }
  const cart = compile("lib/shop/cart.js", {
    aliases: {
      "@/lib/shop/catalog": compile("commerce/prototype/js/commerce/product-data.js"),
      "@/lib/us/analytics": { track: (event, params) => tracked.push({ event, ...params }) },
    },
    globals: { window, CustomEvent },
  });
  return { cart, storage, dispatched, tracked };
}

const cartLink = () =>
  compile("components/us/CartLink.js", { aliases: { "@/lib/us/routes": routesFor(ON), "@/lib/shop/cart": cartModule().cart } });

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
    shop: "/products", cart: "/cart", checkout: "/checkout", privacy: "/privacy", terms: "/terms", returns: "/returns", shipping: "/shipping", contact: "/contact",
  });
  // The store's list of product URLs (D39) is the source; the brand links must match it exactly.
  const data = await import(pathToFileURL(path.join(ROOT, "commerce/prototype/js/commerce/product-data.js")).href);
  for (const sku of data.SKUS) assert.equal(r.productPathFor(sku), data.productPath(sku), sku);
  assert.equal(r.routes.shop, data.SHOP_PATH);
});

test("every store page the brand links to exists on the site", async () => {
  const r = routesFor(ON);
  const data = await import(pathToFileURL(path.join(ROOT, "commerce/prototype/js/commerce/product-data.js")).href);
  // The overview, the product pages, the cart and the checkout are Next.js pages (D41); one page file per product URL
  // from the store's list.
  assert.equal(r.routes.shop, "/products");
  assert.ok(fs.existsSync(path.join(ROOT, "app/(us)/(shop)/products/page.js")), "/products");
  assert.match(read("app/(us)/(shop)/products/[slug]/page.js"), /generateStaticParams\(\) \{\n\s+return SKUS\.map\(\(sku\) => \(\{ slug: PRODUCT_SLUGS\[sku\] \}\)\);/);
  for (const sku of data.SKUS) assert.equal(r.store[sku], `/products/${data.PRODUCT_SLUGS[sku]}`, sku);
  for (const key of ["cart", "checkout", "privacy", "terms", "returns", "shipping", "contact"]) {
    assert.ok(fs.existsSync(path.join(ROOT, "app/(us)/(shop)", r.routes[key], "page.js")), r.routes[key]);
  }
});

test("only the test-site build turns the switch on", () => {
  assert.match(read("commerce/scripts/build-site.mjs"), /NEXT_PUBLIC_APGO_US_SINGLE_SITE: "true"/);
  assert.match(read(".env.example"), /^NEXT_PUBLIC_APGO_US_SINGLE_SITE=false\r?$/m);
});

test("the store's cart: one key and the same rules as the cart and checkout pages that are still plain HTML", () => {
  const { cart } = cartModule();
  const shared = read("commerce/prototype/js/commerce/shared.js");
  assert.ok(shared.includes(`const STORAGE_KEY = "${cart.CART_KEY}";`), "same localStorage key");
  assert.ok(shared.includes(`const MAX_QTY = ${cart.MAX_QTY};`), "same quantity limit");
  for (const raw of [null, "", "not json", '{"sku":"d204","qty":1}', "[]"]) assert.equal(cart.parseCart(raw).length, 0, String(raw));
  assert.equal(cart.cartCount(cart.parseCart(JSON.stringify([{ sku: "d204", qty: 2 }, { sku: "d215", qty: 1 }]))), 3);
  // Unknown products, zero, fractions and junk are dropped, as in shared.js.
  const mixed = JSON.stringify([{ sku: "d204", qty: 1 }, { sku: "x", qty: 5 }, { sku: "d215", qty: 0 }, { sku: "d215", qty: 1.5 }, null]);
  assert.deepEqual([...cart.parseCart(mixed)].map((line) => ({ ...line })), [{ sku: "d204", qty: 1 }]);
});

test("adding: merges the line, caps it at 10, stores it, tells the page and reports add_to_cart", () => {
  const { cart, storage, dispatched, tracked } = cartModule();
  cart.addToCart("d215", 2, { placement: "shop" });
  cart.addToCart("d204");
  cart.addToCart("d215", 9);
  cart.addToCart("nope", 1);
  assert.deepEqual(JSON.parse(storage.get("apgo_us_cart_v1")), [{ sku: "d215", qty: 10 }, { sku: "d204", qty: 1 }]);
  assert.equal(cart.cartCount(), 11);
  assert.deepEqual(dispatched.map((event) => event.type), ["apgo:cart-updated", "apgo:cart-updated", "apgo:cart-updated"]);
  assert.deepEqual(tracked, [
    { event: "add_to_cart", sku: "d215", quantity: 2, placement: "shop" },
    { event: "add_to_cart", sku: "d204", quantity: 1 },
    { event: "add_to_cart", sku: "d215", quantity: 9 },
  ]);
});

test("the cart page's changes: quantity kept between 1 and 10, remove reports remove_from_cart, clear empties it", () => {
  const { cart, storage, dispatched, tracked } = cartModule();
  cart.addToCart("d204", 2);
  cart.addToCart("d215", 1);
  cart.setCartQty("d204", 12);
  assert.deepEqual(JSON.parse(storage.get("apgo_us_cart_v1")), [{ sku: "d204", qty: 10 }, { sku: "d215", qty: 1 }]);
  cart.setCartQty("d215", 0);
  assert.deepEqual(JSON.parse(storage.get("apgo_us_cart_v1")), [{ sku: "d204", qty: 10 }, { sku: "d215", qty: 1 }]);
  cart.removeFromCart("d204");
  assert.deepEqual(JSON.parse(storage.get("apgo_us_cart_v1")), [{ sku: "d215", qty: 1 }]);
  assert.deepEqual(tracked.at(-1), { event: "remove_from_cart", sku: "d204" });
  cart.clearCart();
  assert.equal(storage.get("apgo_us_cart_v1"), "[]");
  assert.equal(dispatched.length, 6, "every change tells the page (the header count follows it)");
});

test("storage blocked (private mode): the cart still works for the page view", () => {
  const { cart, dispatched } = cartModule({ blocked: true });
  assert.equal(cart.cartCount(), 0);
  cart.addToCart("d204", 3);
  assert.equal(cart.cartCount(), 3);
  assert.equal(dispatched.length, 1);
});

test("the cart link's server markup: the cart page, a spoken count, the badge hidden until the cart is read", () => {
  const { default: CartLink, CartRow } = cartLink();
  const html = renderToStaticMarkup(createElement(CartLink));
  assert.match(html, /^<a href="\/cart" class="us-cart-link" aria-label="Cart, 0 items" data-cart-link="true">/);
  assert.match(html, /<span class="us-cart-count" data-cart-count="true" hidden="">0<\/span><\/a>$/);
  assert.match(renderToStaticMarkup(createElement(CartRow)), /^<a class="us-drawer-home" href="\/cart">Cart · 0/);
});

test("reviews (FTC 16 CFR 465): only verified ones with a rating, and none at all below the minimum", () => {
  const { reviewsToShow, verifiedReviews, averageRating } = compile("lib/shop/reviews.js");
  const review = (rating, verified = true) => ({ rating, verified, quote: "Real quote" });
  assert.equal(reviewsToShow(undefined, 3).length, 0);
  assert.equal(reviewsToShow([review(5), review(4), review(5, false)], 3).length, 0, "two verified are not enough");
  assert.equal(reviewsToShow([review(5), review(4), review(5, "true")], 3).length, 0, "verified must be exactly true");
  assert.equal(reviewsToShow([review(5), review(4), review(Number.NaN), {}], 3).length, 0, "a review without a rating does not count");
  assert.equal(reviewsToShow([review(5), review(4), review(3), review(2, false)], 3).length, 3);
  assert.equal(verifiedReviews([review(5), null, review(4, false)]).length, 1);
  assert.equal(averageRating([review(5), review(4)]), 4.5);
});
