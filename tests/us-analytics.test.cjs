// Analytics on the site (M10, PR 3-9): GA4 e-commerce data in the dataLayer for GTM, one Meta Pixel for every page,
// and Global Privacy Control (D46). Runs the shipped modules (lib/us/analytics.js, lib/us/privacy.js) in a bare context.
const { before, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadBindings } = require("next/dist/build/swc");
const { ROOT, compile } = require("./fixture.cjs");

before(() => loadBindings());

// JSON round trip: objects built inside the vm context have that realm's prototypes.
const plain = (value) => JSON.parse(JSON.stringify(value));

function analytics(extra = {}) {
  const events = [];
  const window = { dataLayer: undefined, dispatchEvent: (event) => events.push(event.detail), ...extra };
  const module = compile("lib/us/analytics.js", {
    globals: { window, CustomEvent: class { constructor(name, init) { this.name = name; this.detail = init.detail; } } },
  });
  return { ...module, window, events };
}

test("an e-commerce event clears the previous ecommerce object, then carries GA4's items, value and currency", () => {
  const { track, window, events } = analytics();
  track("view_item", { sku: "d204", currency: "USD", value: 59.99, items: [{ item_id: "D204", item_name: "Dry · Atomic Colored Glaze", item_category: "dry", price: 59.99, quantity: 1 }] });
  assert.deepEqual(plain(window.dataLayer), [
    { ecommerce: null },
    {
      event: "view_item", sku: "d204", currency: "USD", value: 59.99,
      items: [{ item_id: "D204", item_name: "Dry · Atomic Colored Glaze", item_category: "dry", price: 59.99, quantity: 1 }],
      ecommerce: { currency: "USD", value: 59.99, items: [{ item_id: "D204", item_name: "Dry · Atomic Colored Glaze", item_category: "dry", price: 59.99, quantity: 1 }] },
    },
  ]);
  // The DOM event the Meta Pixel listens to is unchanged: no ecommerce object there.
  assert.deepEqual(plain(events), [{ event: "view_item", sku: "d204", currency: "USD", value: 59.99, items: [{ item_id: "D204", item_name: "Dry · Atomic Colored Glaze", item_category: "dry", price: 59.99, quantity: 1 }] }]);
});

test("purchase carries the order number, shipping and tax; an item from a bare sku gets its unit price from the value", () => {
  const { track, window } = analytics();
  track("purchase", { transaction_id: "APGO-US-0123456789AB", currency: "USD", value: 127.96, shipping: 7.99, tax: 0, items: [{ item_id: "d204", price: 59.99, quantity: 1 }, { item_id: "D215", price: 29.99, quantity: 2 }] });
  track("add_to_cart", { sku: "d215", quantity: 2, currency: "USD", value: 59.98, placement: "shop" });
  track("remove_from_cart", { sku: "d204", quantity: 1 });
  const [purchase, add, remove] = plain(window.dataLayer).filter((entry) => entry.event).map((entry) => entry.ecommerce);
  assert.deepEqual(purchase, { currency: "USD", value: 127.96, transaction_id: "APGO-US-0123456789AB", shipping: 7.99, tax: 0, items: [{ item_id: "D204", price: 59.99, quantity: 1 }, { item_id: "D215", price: 29.99, quantity: 2 }] });
  assert.deepEqual(add, { currency: "USD", value: 59.98, items: [{ item_id: "D215", quantity: 2, price: 29.99 }] });
  assert.deepEqual(remove, { items: [{ item_id: "D204", quantity: 1 }] });
  assert.equal(plain(window.dataLayer).filter((entry) => "ecommerce" in entry && entry.ecommerce === null).length, 3, "cleared before each");
});

test("quote lines (unit or line cents) become items; other events stay plain and never get an ecommerce object", () => {
  const { quoteItems, track, window } = analytics();
  assert.deepEqual(plain(quoteItems([{ sku: "D204", name: "APGO Atomic Colored Glaze", qty: 1, unitCents: 5999 }, { sku: "d215", name: "APGO Atomic Glaze Coating", qty: 2, lineCents: 5998 }])), [
    { item_id: "D204", item_name: "APGO Atomic Colored Glaze", price: 59.99, quantity: 1 },
    { item_id: "D215", item_name: "APGO Atomic Glaze Coating", price: 29.99, quantity: 2 },
  ]);
  track("faq_expand", { question: "q1" });
  track("scroll_depth", { percent: 25 });
  assert.deepEqual(plain(window.dataLayer), [{ event: "faq_expand", question: "q1" }, { event: "scroll_depth", percent: 25 }]);
});

test("analytics never calls Meta itself and has no Amazon event; the product buttons send select_item", () => {
  const calls = [];
  const { track, window } = analytics({ fbq: (...args) => calls.push(args) });
  track("select_item", { sku: "d204", placement: "hero", item_list_name: "hero" });
  assert.deepEqual(calls, []);
  assert.deepEqual(plain(window.dataLayer.at(-1).ecommerce), { item_list_name: "hero", items: [{ item_id: "D204", quantity: 1 }] });
  for (const file of ["lib/us/analytics.js", "components/us/landing/ProductCta.js"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, file), "utf8"), /amazon_referral_click|AmazonClick|fbq/, file);
  }
});

test("one Meta Pixel for the whole site (M10-07): loaded by the site layout and the 404 page, never by a component of its own", () => {
  for (const file of ["app/(us)/layout.js", "app/global-not-found.js"]) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    assert.equal(source.split('src="/js/meta-pixel.js"').length - 1, 1, file);
    assert.doesNotMatch(source, /MetaPixel/, file);
  }
  assert.equal(fs.existsSync(path.join(ROOT, "components/us/MetaPixel.js")), false);
  const env = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
  assert.doesNotMatch(env, /META_PIXEL_ID/, "no Pixel id to set: public/js/meta-pixel.js has the one dataset id");
  assert.match(env, /^NEXT_PUBLIC_APGO_US_HONOR_GPC=$/m);
});

test("Global Privacy Control: sharing is blocked only when the browser sends it and the switch is on (the default)", () => {
  const privacy = (env, navigator) => {
    const config = compile("lib/us/config.js", { env });
    return compile("lib/us/privacy.js", { aliases: { "@/lib/us/config": config }, globals: navigator === undefined ? {} : { navigator } });
  };
  assert.equal(privacy({}, { globalPrivacyControl: true }).shareBlocked(), true, "honoured by default");
  assert.equal(privacy({ NEXT_PUBLIC_APGO_US_HONOR_GPC: "true" }, { globalPrivacyControl: true }).shareBlocked(), true);
  assert.equal(privacy({ NEXT_PUBLIC_APGO_US_HONOR_GPC: "false" }, { globalPrivacyControl: true }).shareBlocked(), false, "switched off");
  assert.equal(privacy({}, { globalPrivacyControl: false }).shareBlocked(), false);
  assert.equal(privacy({}, {}).shareBlocked(), false, "a browser without GPC");
  assert.equal(privacy({}).shareBlocked(), false, "no navigator (server render)");
});
