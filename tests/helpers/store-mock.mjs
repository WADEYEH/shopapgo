import { expect } from "@playwright/test";

import { QuoteError, publicConfig, quote } from "../../worker/catalog.js";
import { validateCheckout } from "../../worker/checkout.js";
import { resolvePricing } from "../../worker/pricing.js";

// The static test server has no Worker, so /api/* is answered here with the real
// catalog/validation modules, and Airwallex.js is replaced by a local stub whose
// card fields are plain inputs.

export const ORDER_ID = "APGO-US-0123456789AB";
export const PAYPAL_ID = "5O190127TN364715T";
export const ENABLED_PAYPAL = { enabled: true, clientId: "test-paypal-client", env: "sandbox" };

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

const PAYPAL_SDK_STUB = `
window.paypal = {
  Buttons(options) {
    window.__paypalButtonOptions = options;
    return {
      render(selector) {
        const root = typeof selector === "string" ? document.querySelector(selector) : selector;
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.stubPaypal = "buttons";
        button.textContent = "PayPal";
        button.style.cssText = "width:100%;height:48px";
        button.addEventListener("click", async () => {
          try {
            const id = await options.createOrder();
            window.__paypalOrderId = id;
            if (window.__paypalCancel) {
              options.onCancel?.({ orderID: id });
              return;
            }
            await options.onApprove({ orderID: id });
          } catch (error) {
            options.onError?.(error);
          }
        });
        root.replaceChildren(button);
        return Promise.resolve();
      },
    };
  },
};
`;

export async function mockStore(page, { env = {}, paypal, paypalCaptureStatus = "paid", paypalCaptureError, orderStatus } = {}) {
  const calls = { session: [], paypalOrder: [], paypalCapture: [] };
  await page.route("https://static.airwallex.com/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: AIRWALLEX_STUB }));
  await page.route("https://www.paypal.com/sdk/js**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: PAYPAL_SDK_STUB }));

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const body = request.postDataJSON?.() ?? null;
    const reply = (status, data) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    try {
      if (pathname === "/api/store/config") {
        const config = publicConfig(env);
        if (paypal !== undefined) config.paypal = paypal;
        return reply(200, config);
      }
      if (pathname === "/api/cart/quote") return reply(200, quote(body.items, { state: body.state, method: body.method }, resolvePricing(env)));
      if (pathname === "/api/checkout/session") {
        calls.session.push(body);
        const checkout = validateCheckout(body);
        const priced = quote(body.items, { state: checkout.shipping.state, method: checkout.method }, resolvePricing(env));
        return reply(200, { orderId: ORDER_ID, quote: priced, intent: { id: "int_test", clientSecret: "secret_test", currency: "USD" } });
      }
      if (pathname === "/api/checkout/paypal/order") {
        calls.paypalOrder.push(body);
        const priced = quote(body.items, { state: body.shipping?.state, method: body.method }, resolvePricing(env));
        return reply(200, {
          orderId: ORDER_ID,
          quote: priced,
          paypal: { id: PAYPAL_ID, status: "CREATED", approveUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${PAYPAL_ID}` },
          eventIds: { initiateCheckout: `ic_${ORDER_ID}`, purchase: `purchase_${ORDER_ID}` },
        });
      }
      if (pathname === "/api/checkout/paypal/capture") {
        calls.paypalCapture.push(body);
        if (paypalCaptureError) {
          return reply(paypalCaptureError.status ?? 400, {
            error: paypalCaptureError.error ?? { code: "invalid_request", message: "Payment could not be completed." },
          });
        }
        return reply(200, {
          orderId: ORDER_ID,
          status: paypalCaptureStatus,
          paypal: { id: body.paypalOrderId || PAYPAL_ID, status: "COMPLETED" },
          eventIds: { initiateCheckout: `ic_${ORDER_ID}`, purchase: `purchase_${ORDER_ID}` },
        });
      }
      if (pathname === `/api/orders/${ORDER_ID}`) {
        const last = calls.session.at(-1) || calls.paypalOrder.at(-1);
        const items = last?.items || [{ sku: "d204", qty: 1 }];
        const priced = quote(items, { state: last?.shipping?.state, method: last?.method }, resolvePricing(env));
        // Same public shape as worker/orders.js publicOrder(): lines carry lineCents but no unitCents.
        const lines = priced.lines.map(({ id, sku, name, routine, size, qty, lineCents }) => ({ id, sku, name, routine, size, qty, lineCents }));
        const status = orderStatus ?? (calls.paypalCapture.length ? paypalCaptureStatus : "paid");
        const paymentStatus = status === "pending" ? "PENDING" : "COMPLETED";
        return reply(200, { id: ORDER_ID, status, email: "t••••@example.com", ...priced, lines, paymentStatus });
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

export async function choosePayWith(page, method) {
  await page.locator(`label:has(input[name="payWith"][value="${method}"])`).click();
}
