// Meta Pixel (browser side), end to end. The page is served as an allowed store host
// (store.shopapgo.com / shopapgo.com / www.shopapgo.com) by intercepting that origin with
// Playwright routes (files come from prototype/, /api/* from the store mock) and Meta's
// fbevents.js is replaced by a stub, so nothing reaches Meta.
// Because the stub never drains fbq's queue, window.fbq.queue is the list of calls the store made.
import { readFile } from "node:fs/promises";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { DEFAULT_PRICING } from "../worker/pricing.js";
import { ORDER_ID, fillCard, fillToPayment, mockStore, seedCart } from "./helpers/store-mock.mjs";

const PIXEL_ID = "2606879866471418";
const STORE = "store.shopapgo.com";
const STORE_HOSTS = ["store.shopapgo.com", "shopapgo.com", "www.shopapgo.com"];
const { d204, d215 } = DEFAULT_PRICING.products;
const PROTOTYPE = path.resolve(process.env.APGO_PROTOTYPE_DIR || "prototype");
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2" };

async function serveHost(page, host) {
  const state = { fbeventsRequests: 0, facebookRequests: [] };
  await page.route("https://connect.facebook.net/**", (route) => {
    state.fbeventsRequests += 1;
    return route.fulfill({ contentType: "application/javascript", body: "window.__fbeventsStub = true;" });
  });
  await page.route("https://www.facebook.com/**", (route) => {
    state.facebookRequests.push(route.request().url());
    return route.fulfill({ status: 204 });
  });
  await page.route(`https://${host}/**`, async (route) => {
    let { pathname } = new URL(route.request().url());
    if (pathname === "/") pathname = "/v3.html"; // ROOT_PAGE in wrangler.toml
    // API calls never leave the test: mockStore() (registered after this, so it runs first) answers them,
    // and without it the store is "down". The real store host must never be reached.
    if (/^\/(admin\/)?api\//.test(pathname)) return route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    if (pathname.endsWith("/")) pathname += "index.html";
    try {
      const file = path.join(PROTOTYPE, pathname);
      if (!file.startsWith(PROTOTYPE)) throw new Error("outside");
      return route.fulfill({ contentType: TYPES[path.extname(file)] || "application/octet-stream", body: await readFile(file) });
    } catch {
      return route.fulfill({ status: 404, body: "not found" });
    }
  });
  return state;
}

const queue = (page) =>
  page.evaluate(() => (window.fbq?.queue ? Array.from(window.fbq.queue, (args) => Array.from(args)) : null));
const tracked = async (page, name) => ((await queue(page)) || []).filter((c) => c[0] === "track" && c[1] === name);

async function checkoutToPayment(page, host = STORE) {
  await mockStore(page);
  await seedCart(page, [{ sku: "d204", qty: 1 }, { sku: "d215", qty: 2 }]);
  await page.goto(`https://${host}/checkout.html`);
  await fillToPayment(page);
  await fillCard(page);
}

test.describe("Meta Pixel loading", () => {
  for (const host of STORE_HOSTS) {
    test(`${host} loads fbevents.js once, inits the pixel and sends PageView`, async ({ page }) => {
      const meta = await serveHost(page, host);
      await mockStore(page);
      await page.goto(`https://${host}/privacy.html`);
      await expect.poll(() => meta.fbeventsRequests).toBe(1);
      expect(await queue(page)).toEqual([["init", PIXEL_ID], ["track", "PageView"]]);
    });
  }

  test("an existing window.fbq is not initialised a second time", async ({ page }) => {
    await serveHost(page, STORE);
    await page.addInitScript(() => {
      const existing = function () { existing.queue.push(arguments); };
      existing.queue = [];
      window.fbq = existing;
    });
    await page.goto(`https://${STORE}/privacy.html`);
    expect(await queue(page)).toEqual([]);
  });

  for (const host of ["staging.shopapgo.com", "localhost:4173", "admin.shopapgo.com", "apgo-us-store.pages.dev"]) {
    test(`${host} never loads Meta`, async ({ page }) => {
      const meta = await serveHost(page, host);
      await mockStore(page);
      await page.goto(`https://${host}/v3.html?fbclid=TEST123`);
      await page.waitForLoadState("networkidle");
      expect(meta.fbeventsRequests).toBe(0);
      expect(await page.evaluate(() => typeof window.fbq)).toBe("undefined");
      expect((await page.context().cookies()).map((c) => c.name)).not.toContain("_fbc");
    });
  }

  test("plain local development (the test server) never loads Meta", async ({ page }) => {
    let facebook = 0;
    await page.route(/facebook\.(net|com)/, (route) => { facebook += 1; return route.abort(); });
    await mockStore(page);
    await page.goto("/v3.html?fbclid=TEST123");
    await page.waitForLoadState("networkidle");
    expect(facebook).toBe(0);
    expect(await page.evaluate(() => typeof window.fbq)).toBe("undefined");
  });

  test("the back office never loads Meta, even on the store hostname", async ({ page }) => {
    const meta = await serveHost(page, STORE);
    await page.goto(`https://${STORE}/admin/`);
    await page.waitForLoadState("networkidle");
    expect(meta.fbeventsRequests).toBe(0);
    expect(await page.evaluate(() => typeof window.fbq)).toBe("undefined");
  });
});

test.describe("fbclid -> _fbc", () => {
  test("writes _fbc=fb.1.<ms>.<fbclid> for 90 days on .shopapgo.com when it is missing", async ({ page, context }) => {
    await serveHost(page, STORE);
    await mockStore(page);
    const before = Date.now();
    await page.goto(`https://${STORE}/v3.html?fbclid=IwAR_test-123`);
    const cookie = (await context.cookies(`https://${STORE}`)).find((c) => c.name === "_fbc");
    expect(cookie).toBeTruthy();
    expect(cookie.value).toMatch(/^fb\.1\.\d{13}\.IwAR_test-123$/);
    expect(Number(cookie.value.split(".")[2])).toBeGreaterThanOrEqual(before);
    expect(cookie.domain).toBe(".shopapgo.com");
    expect(cookie.path).toBe("/");
    expect(cookie.sameSite).toBe("Lax");
    const days = (cookie.expires * 1000 - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(89);
    expect(days).toBeLessThanOrEqual(90.1);
  });

  test("keeps an existing _fbc and writes nothing without fbclid", async ({ page, context }) => {
    await serveHost(page, STORE);
    await mockStore(page);
    await context.addCookies([{ name: "_fbc", value: "fb.1.1700000000000.OLD", domain: ".shopapgo.com", path: "/" }]);
    await page.goto(`https://${STORE}/v3.html?fbclid=NEW`);
    expect((await context.cookies(`https://${STORE}`)).find((c) => c.name === "_fbc").value).toBe("fb.1.1700000000000.OLD");

    const fresh = await context.browser().newContext();
    const other = await fresh.newPage();
    await serveHost(other, STORE);
    await mockStore(other);
    await other.goto(`https://${STORE}/v3.html`);
    expect((await fresh.cookies(`https://${STORE}`)).map((c) => c.name)).not.toContain("_fbc");
    await fresh.close();
  });
});

test.describe("product page events", () => {
  test("v3 sends ViewContent with SKUs and API prices, then AddToCart with the quantity price", async ({ page }) => {
    await serveHost(page, STORE);
    await mockStore(page);
    await page.goto(`https://${STORE}/v3.html#d204`);
    await expect.poll(async () => (await tracked(page, "ViewContent")).length).toBe(1);

    const [view] = await tracked(page, "ViewContent");
    expect(view[2]).toEqual({
      content_type: "product",
      content_ids: ["D204", "D215"],
      contents: [
        { id: "D204", quantity: 1, item_price: d204.priceCents / 100 },
        { id: "D215", quantity: 1, item_price: d215.priceCents / 100 },
      ],
      currency: "USD",
    });

    await page.locator('[data-product-panel="d204"] [data-add-to-cart]').click();
    await expect.poll(async () => (await tracked(page, "AddToCart")).length).toBe(1);
    const [add] = await tracked(page, "AddToCart");
    expect(add[2]).toEqual({
      content_type: "product",
      content_ids: ["D204"],
      contents: [{ id: "D204", quantity: 1, item_price: d204.priceCents / 100 }],
      currency: "USD",
      value: d204.priceCents / 100,
    });
  });

  test("when /api/store/config is unavailable no value is sent", async ({ page }) => {
    await serveHost(page, STORE);
    await page.goto(`https://${STORE}/v3.html#d215`);
    await expect.poll(async () => (await tracked(page, "ViewContent")).length).toBe(1);
    await page.locator('[data-product-panel="d215"] [data-add-to-cart]').click();
    await expect.poll(async () => (await tracked(page, "AddToCart")).length).toBe(1);
    for (const call of [...(await tracked(page, "ViewContent")), ...(await tracked(page, "AddToCart"))]) {
      expect(call[2]).not.toHaveProperty("value");
      expect(call[2].content_ids.length).toBeGreaterThan(0);
    }
  });
});

test.describe("product pages", () => {
  const price = (sku) => DEFAULT_PRICING.products[sku].priceCents / 100;

  test("view_item -> one ViewContent per view, add to cart -> AddToCart with API prices; a pair is one AddToCart per product", async ({ page }) => {
    await serveHost(page, STORE);
    await mockStore(page);
    await page.goto(`https://${STORE}/products/atomic-colored-glaze.html`);
    await expect.poll(async () => (await tracked(page, "ViewContent")).length).toBe(1);
    await page.waitForTimeout(300);
    expect(await tracked(page, "ViewContent")).toHaveLength(1);
    expect((await tracked(page, "ViewContent"))[0][2]).toEqual({
      content_type: "product", content_ids: ["D204"], contents: [{ id: "D204", quantity: 1, item_price: price("d204") }], currency: "USD", value: price("d204"),
    });

    await page.locator("[data-qty-inc]").click();
    await page.locator("[data-buyrow] [data-pdp-add]").click();
    await expect.poll(async () => (await tracked(page, "AddToCart")).length).toBe(1);
    expect((await tracked(page, "AddToCart"))[0][2]).toEqual({
      content_type: "product", content_ids: ["D204"], contents: [{ id: "D204", quantity: 2, item_price: price("d204") }], currency: "USD", value: Number((price("d204") * 2).toFixed(2)),
    });

    await page.locator("[data-pair-card]").click();
    await page.locator("[data-buyrow] [data-pdp-add]").click();
    await expect.poll(async () => (await tracked(page, "AddToCart")).length).toBe(3);
    const pair = (await tracked(page, "AddToCart")).slice(1).map((c) => [c[2].content_ids[0], c[2].value]);
    expect(pair).toEqual([["D204", Number((price("d204") * 2).toFixed(2))], ["D215", price("d215")]]);
    // Nothing else (no InitiateCheckout/Purchase/duplicate AddToCart) came from these actions.
    expect(await tracked(page, "InitiateCheckout")).toHaveLength(0);
  });

  test("switching the product sends a ViewContent for the new SKU; the product page loads Meta only on the store host", async ({ page }) => {
    await serveHost(page, STORE);
    await mockStore(page);
    await page.goto(`https://${STORE}/product.html#dry`);
    await expect.poll(async () => (await tracked(page, "ViewContent")).length).toBe(1);
    await page.locator('[data-compare-body] [data-switch-to="d215"]').click();
    await expect.poll(async () => (await tracked(page, "ViewContent")).length).toBe(2);
    expect((await tracked(page, "ViewContent")).map((c) => c[2].content_ids[0])).toEqual(["D204", "D215"]);
  });

  for (const host of ["staging.shopapgo.com", "admin.shopapgo.com"]) {
    test(`${host}: the product page loads no Meta and still works`, async ({ page }) => {
      const meta = await serveHost(page, host);
      await mockStore(page);
      await page.goto(`https://${host}/products/atomic-glaze-coating.html?fbclid=TEST123`);
      await page.locator("[data-buyrow] [data-pdp-add]").click();
      await expect(page.locator("[data-added]")).toContainText("Added to cart");
      expect(meta.fbeventsRequests).toBe(0);
      expect(await page.evaluate(() => typeof window.fbq)).toBe("undefined");
    });
  }

  test("the /products overview: one ViewContent for both products (no single value), AddToCart with the API price", async ({ page }) => {
    await serveHost(page, STORE);
    await mockStore(page);
    await page.goto(`https://${STORE}/products.html`);
    await expect.poll(async () => (await tracked(page, "ViewContent")).length).toBe(1);
    expect((await tracked(page, "ViewContent"))[0][2]).toEqual({
      content_type: "product",
      content_ids: ["D204", "D215"],
      contents: [{ id: "D204", quantity: 1, item_price: price("d204") }, { id: "D215", quantity: 1, item_price: price("d215") }],
      currency: "USD",
    });
    await page.locator('[data-add-to-cart="d215"]').click();
    await expect.poll(async () => (await tracked(page, "AddToCart")).length).toBe(1);
    expect((await tracked(page, "AddToCart"))[0][2]).toEqual({
      content_type: "product", content_ids: ["D215"], contents: [{ id: "D215", quantity: 1, item_price: price("d215") }], currency: "USD", value: price("d215"),
    });
  });

  test("product pages have no serious or critical axe violations with the pixel active", async ({ page }) => {
    await serveHost(page, STORE);
    await mockStore(page);
    await page.goto(`https://${STORE}/products/atomic-colored-glaze.html`);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));
    expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
  });
});

test.describe("checkout events", () => {
  test("InitiateCheckout (ic_<order>) fires once the order exists; Purchase (purchase_<order>) uses the server order", async ({ page }) => {
    await serveHost(page, STORE);
    await checkoutToPayment(page);
    // The order does not exist yet: begin_checkout alone must not become InitiateCheckout.
    expect(await tracked(page, "InitiateCheckout")).toHaveLength(0);

    await page.locator("[data-place-order]").click();
    await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");

    const [ic] = await tracked(page, "InitiateCheckout");
    expect(await tracked(page, "InitiateCheckout")).toHaveLength(1);
    expect(ic[3]).toEqual({ eventID: `ic_${ORDER_ID}` });
    expect(ic[2].content_ids).toEqual(["D204", "D215"]);
    expect(ic[2].content_type).toBe("product");
    expect(ic[2].currency).toBe("USD");
    expect(ic[2].num_items).toBe(3);
    expect(ic[2].contents).toEqual([
      { id: "D204", quantity: 1, item_price: d204.priceCents / 100 },
      { id: "D215", quantity: 2, item_price: d215.priceCents / 100 },
    ]);
    const total = (d204.priceCents + 2 * d215.priceCents + DEFAULT_PRICING.shippingMethods[DEFAULT_PRICING.defaultShippingMethod].amountCents) / 100;
    expect(ic[2].value).toBeCloseTo(total, 2);

    const [payment] = await tracked(page, "AddPaymentInfo");
    expect(payment[2].value).toBeCloseTo(total, 2);
    expect(payment[2].content_ids).toEqual(["D204", "D215"]);

    const purchases = await tracked(page, "Purchase");
    expect(purchases).toHaveLength(1);
    const [purchase] = purchases;
    expect(purchase[3]).toEqual({ eventID: `purchase_${ORDER_ID}` });
    expect(purchase[2].value).toBeCloseTo(total, 2);
    expect(purchase[2].currency).toBe("USD");
    expect(purchase[2].content_type).toBe("product");
    // The order response only has lineCents (no unit price): the unit price is derived from it.
    expect(purchase[2].contents).toEqual([
      { id: "D204", quantity: 1, item_price: d204.priceCents / 100 },
      { id: "D215", quantity: 2, item_price: d215.priceCents / 100 },
    ]);
    expect(await page.evaluate((id) => sessionStorage.getItem(`apgo_meta_purchase_${id}`), ORDER_ID)).toBe("1");
  });

  test("reloading the confirmation page does not send Purchase again", async ({ page }) => {
    await serveHost(page, STORE);
    await checkoutToPayment(page);
    await page.locator("[data-place-order]").click();
    await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
    expect(await tracked(page, "Purchase")).toHaveLength(1);

    await page.reload();
    await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
    expect(await tracked(page, "Purchase")).toHaveLength(0);

    // Even if the shared analytics once-guard is gone, the Meta key still blocks a repeat.
    await page.evaluate((id) => sessionStorage.removeItem(`apgo_us_purchase_tracked_${id}`), ORDER_ID);
    await page.reload();
    await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
    expect(await page.evaluate(() => window.dataLayer.filter((e) => e.event === "purchase").length)).toBe(1);
    expect(await tracked(page, "Purchase")).toHaveLength(0);
  });

  test("off the store hostname the same checkout sends nothing to Meta", async ({ page }) => {
    const meta = await serveHost(page, "staging.shopapgo.com");
    await checkoutToPayment(page, "staging.shopapgo.com");
    await page.locator("[data-place-order]").click();
    await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
    expect(meta.fbeventsRequests).toBe(0);
    expect(await queue(page)).toBeNull();
    // The analytics contract for GTM is unchanged apart from the extra checkout_session_created event.
    const events = await page.evaluate(() => window.dataLayer.map((e) => e.event));
    expect(events).toEqual(expect.arrayContaining(["begin_checkout", "add_shipping_info", "checkout_session_created", "add_payment_info", "purchase"]));
  });
});

test.describe("session attribution", () => {
  async function placeOrder(page) {
    await page.locator("[data-place-order]").click();
    await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
  }

  test("fbp, fbc, fbclid and sourceUrl ride along on POST /api/checkout/session", async ({ page, context }, testInfo) => {
    const origin = new URL(testInfo.project.use.baseURL || "http://127.0.0.1:4173").origin;
    await context.addCookies([
      { name: "_fbp", value: "fb.1.1700000000000.1234567890", url: origin },
      { name: "_fbc", value: "fb.1.1700000000001.COOKIECLID", url: origin },
    ]);
    const calls = await mockStore(page);
    await seedCart(page, [{ sku: "d204", qty: 1 }]);
    await page.goto("/checkout.html?fbclid=URLCLID");
    await fillToPayment(page);
    await fillCard(page);
    await placeOrder(page);

    expect(calls.session).toHaveLength(1);
    expect(calls.session[0].attribution).toEqual({
      fbp: "fb.1.1700000000000.1234567890",
      fbc: "fb.1.1700000000001.COOKIECLID",
      fbclid: "URLCLID",
      sourceUrl: expect.stringMatching(/\/checkout\.html\?fbclid=URLCLID$/),
    });
    // Order content is unchanged by the new field.
    expect(calls.session[0]).toMatchObject({ items: [{ sku: "d204", qty: 1 }], contact: { email: "test.shopper@example.com" }, shipping: { state: "TX" } });
  });

  test("fbclid falls back to the _fbc cookie, and every field may be missing", async ({ page, context }, testInfo) => {
    const origin = new URL(testInfo.project.use.baseURL || "http://127.0.0.1:4173").origin;
    await context.addCookies([{ name: "_fbc", value: "fb.1.1700000000001.COOKIECLID", url: origin }]);
    const calls = await mockStore(page);
    await seedCart(page, [{ sku: "d204", qty: 1 }]);
    await page.goto("/checkout.html");
    await fillToPayment(page);
    await fillCard(page);
    await placeOrder(page);
    expect(calls.session[0].attribution).toMatchObject({ fbc: "fb.1.1700000000001.COOKIECLID", fbclid: "COOKIECLID" });
    expect(calls.session[0].attribution).not.toHaveProperty("fbp");

    await context.clearCookies();
    const bare = await mockStore(page);
    await seedCart(page, [{ sku: "d215", qty: 1 }]);
    await page.evaluate(() => { sessionStorage.clear(); });
    await page.goto("/checkout.html");
    await fillToPayment(page);
    await fillCard(page);
    await placeOrder(page);
    expect(Object.keys(bare.session.at(-1).attribution)).toEqual(["sourceUrl"]);
  });

  test("attribution changes do not change the session cache key (the retry reuses the PaymentIntent)", async ({ page, context }, testInfo) => {
    const origin = new URL(testInfo.project.use.baseURL || "http://127.0.0.1:4173").origin;
    const calls = await mockStore(page);
    await seedCart(page, [{ sku: "d204", qty: 1 }]);
    await page.goto("/checkout.html");
    await fillToPayment(page);
    await fillCard(page);

    await page.evaluate(() => { window.__awxDecline = true; });
    await page.locator("[data-place-order]").click();
    // Shoppers see a generic message, never the provider's decline reason (commerce.spec.mjs, spec M5 3.3).
    await expect(page.locator("[data-payment-message]")).toContainText("Your payment wasn't completed.");

    // Meta's script drops _fbp, the shopper arrives with a new fbclid: still the same order content.
    await context.addCookies([{ name: "_fbp", value: "fb.1.1700000000000.999", url: origin }]);
    await page.evaluate(() => { history.replaceState(null, "", "/checkout.html?fbclid=LATER"); window.__awxDecline = false; });
    await page.locator("[data-place-order]").click();
    await expect(page.locator("[data-confirmation]")).toContainText("Order confirmed");
    expect(calls.session).toHaveLength(1);
    // Both card attempts (declined, then accepted) used the one PaymentIntent.
    const confirms = await page.evaluate(() => window.__awxConfirms);
    expect(confirms.map((c) => c.intent_id)).toEqual(["int_test", "int_test"]);
  });
});

test.describe("accessibility with the pixel active", () => {
  for (const pageName of ["v3.html", "cart.html", "privacy.html"]) {
    test(`${pageName} has no serious or critical axe violations on the store hostname`, async ({ page }) => {
      await serveHost(page, STORE);
      await mockStore(page);
      await seedCart(page, [{ sku: "d204", qty: 1 }]);
      await page.goto(`https://${STORE}/${pageName}`);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page }).analyze();
      const blocking = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));
      expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
    });
  }
});
