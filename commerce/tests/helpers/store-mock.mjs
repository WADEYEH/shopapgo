import { expect } from "@playwright/test";

import { QuoteError, publicConfig, quote } from "../../worker/catalog.js";
import { validateCheckout } from "../../worker/checkout.js";
import { resolvePricing } from "../../worker/pricing.js";

// The static test server has no Worker, so /api/* is answered here with the real
// catalog/validation modules, and Airwallex.js is replaced by a local stub whose
// card fields are plain inputs.

export const ORDER_ID = "APGO-US-0123456789AB";

const AIRWALLEX_STUB = `
window.AirwallexComponentsSDK = {
  async init(options) { window.__awxInit = options; },
  async createElement(type, options) {
    const handlers = {};
    if (type === "applePayButton" || type === "googlePayButton") {
      // Wallet elements: feature-detection mock. A wallet only reports "ready" when the
      // test says the device supports it (window.__awxWalletReady[type] === true).
      (window.__awxWalletCreates ||= []).push({ type, options });
      const element = {
        mount(id) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.stubWallet = type;
          button.textContent = type === "applePayButton" ? "Apple Pay" : "Google Pay";
          button.style.cssText = "width:100%;height:48px";
          button.addEventListener("click", () => handlers.click && handlers.click());
          document.getElementById(id).append(button);
          if (window.__awxWalletReady && window.__awxWalletReady[type] === true) {
            setTimeout(() => handlers.ready && handlers.ready(), 0);
          }
        },
        on(name, handler) { handlers[name] = handler; },
        async update(patch) { (window.__awxWalletUpdates ||= []).push({ type, patch }); },
        destroy() {},
      };
      (window.__awxWalletElements ||= {})[type] = { fire: (name, detail) => handlers[name] && handlers[name]({ detail }) };
      return element;
    }
    return {
      mount(id) {
        const input = document.createElement("input");
        input.setAttribute("aria-label", type);
        input.dataset.stubCard = type;
        input.style.cssText = "all:unset;width:100%;color:inherit";
        input.addEventListener("input", () =>
          handlers.change && handlers.change({ detail: { complete: input.value.length >= 3, empty: !input.value } }));
        document.getElementById(id).append(input);
      },
      on(name, handler) { handlers[name] = handler; },
      async confirm(args) {
        (window.__awxConfirms ||= []).push(args);
        if (window.__awxDecline) throw { code: "issuer_declined", message: "The card issuer declined this transaction." };
        return { id: args.intent_id, status: "SUCCEEDED" };
      },
    };
  },
};`;

export async function mockStore(page, { env = {} } = {}) {
  const calls = { session: [] };
  await page.route("https://static.airwallex.com/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: AIRWALLEX_STUB }));

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const body = request.postDataJSON?.() ?? null;
    const reply = (status, data) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    try {
      if (pathname === "/api/store/config") return reply(200, publicConfig(env));
      if (pathname === "/api/cart/quote") return reply(200, quote(body.items, { state: body.state, method: body.method }, resolvePricing(env)));
      if (pathname === "/api/checkout/session") {
        calls.session.push(body);
        const checkout = validateCheckout(body);
        const priced = quote(body.items, { state: checkout.shipping.state, method: checkout.method }, resolvePricing(env));
        return reply(200, { orderId: ORDER_ID, quote: priced, intent: { id: "int_test", clientSecret: "secret_test", currency: "USD" } });
      }
      if (pathname === `/api/orders/${ORDER_ID}`) {
        const last = calls.session.at(-1);
        const priced = quote(last.items, { state: last.shipping.state, method: last.method }, resolvePricing(env));
        return reply(200, { id: ORDER_ID, status: "paid", email: "t••••@example.com", ...priced, paymentStatus: "SUCCEEDED" });
      }
      return reply(404, { error: { code: "not_found", message: "Not found." } });
    } catch (error) {
      if (error instanceof QuoteError) return reply(400, { error: { code: error.code, message: error.message } });
      throw error;
    }
  });
  return calls;
}

export async function seedCart(page, items) {
  await page.addInitScript((value) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("apgo_us_cart_v1", JSON.stringify(value));
      sessionStorage.setItem("seeded", "1");
    }
  }, items);
}

export async function fillToPayment(page) {
  await page.locator("#email").fill("test.shopper@example.com");
  await page.getByRole("button", { name: /Continue to shipping/ }).click();
  await page.getByLabel("First name").fill("Test");
  await page.getByLabel("Last name").fill("Shopper");
  await page.getByLabel("Street address").fill("100 Example Ave");
  await page.getByLabel("City").fill("Austin");
  await page.getByLabel("State").selectOption("TX");
  await page.getByLabel("ZIP code").fill("78701");
  await page.getByRole("button", { name: /Continue to payment/ }).click();
  await expect(page.locator('[data-step="payment"]')).toBeVisible();
}

export async function fillCard(page) {
  await page.locator('[data-stub-card="cardNumber"]').fill("4035501000000008");
  await page.locator('[data-stub-card="expiry"]').fill("12/30");
  await page.locator('[data-stub-card="cvc"]').fill("123");
}
