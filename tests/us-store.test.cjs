const assert = require("node:assert/strict");
const test = require("node:test");
const { compile } = require("./fixture.cjs");

const load = (env = {}) => compile("lib/us/store.js", { env, globals: { URL } });

test("store destinations fail closed until a valid origin and explicit switch are supplied", () => {
  for (const env of [{}, { NEXT_PUBLIC_APGO_US_STORE_URL: "https://store.shopapgo.com" },
    { NEXT_PUBLIC_APGO_US_STORE_READY: "true", NEXT_PUBLIC_APGO_US_STORE_URL: "javascript:alert(1)" },
    { NEXT_PUBLIC_APGO_US_STORE_READY: "true", NEXT_PUBLIC_APGO_US_STORE_URL: "http://store.shopapgo.com" }]) {
    const store = load(env);
    assert.equal(store.storeEnabled, false);
    assert.equal(store.addToCartUrl("d204"), undefined);
  }
});

test("each SKU reaches the store's own cart and only adds a valid product", () => {
  const store = load({ NEXT_PUBLIC_APGO_US_STORE_READY: "true", NEXT_PUBLIC_APGO_US_STORE_URL: "https://store.shopapgo.com/" });
  assert.equal(store.cartUrl, "https://store.shopapgo.com/cart.html");
  assert.equal(store.addToCartUrl("d204"), "https://store.shopapgo.com/cart.html?add=d204");
  assert.equal(store.addToCartUrl("d215"), "https://store.shopapgo.com/cart.html?add=d215");
  assert.equal(store.addToCartUrl("other"), undefined);
});

test("destinations reject credentials, path prefixes and queries, but allow loopback preview", () => {
  const { validatedStoreUrl } = load();
  for (const value of ["https://user:pass@example.com", "https://example.com/store", "https://example.com/?add=d215", "https://example.com/#cart"]) {
    assert.equal(validatedStoreUrl(value), undefined);
  }
  assert.equal(validatedStoreUrl("http://127.0.0.1:8799"), "http://127.0.0.1:8799");
});
