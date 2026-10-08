import { expect } from "@playwright/test";

import { QuoteError, publicConfig, quote } from "../../worker/catalog.js";
import { validateCheckout } from "../../worker/checkout.js";
import { ADDRESS_MESSAGES } from "../../worker/address-check.js";
import { resolvePricing } from "../../worker/pricing.js";
import { checkShipping } from "../../prototype/js/commerce/address-rules.js";
import { CONTACT_MESSAGES, checkContactMessage } from "../../prototype/js/commerce/contact-rules.js";

// The static test server has no Worker, so /api/* is answered here with the real
// catalog/validation modules, and Airwallex.js is replaced by a local stub whose
// card fields are plain inputs.

export const ORDER_ID = "APGO-US-0123456789AB";
export const PAYPAL_ID = "5O190127TN364715T";
export const ENABLED_PAYPAL = { enabled: true, clientId: "test-paypal-client", env: "sandbox" };
export const TEST_PHONE = "(512) 555-0134";

// What the address check answers in these tests (worker/address-check.js statuses). Without a Google key the real
// Worker says "unverified", so that is the default. A function gets the checked address.
const ADDRESS_ANSWERS = {
  suggest: (shipping) => ({ status: "suggest", suggestion: { street: `${shipping.street.toUpperCase()} STE 200`, street2: "", city: shipping.city, state: shipping.state, zip: `${shipping.zip.slice(0, 5)}-1234` } }),
  missing_unit: () => ({ status: "missing_unit", message: ADDRESS_MESSAGES.missingUnit }),
  undeliverable: () => ({ status: "undeliverable", message: ADDRESS_MESSAGES.undeliverable }),
  po_box: () => ({ status: "po_box", message: ADDRESS_MESSAGES.poBox }),
};
const addressAnswer = (addressCheck, shipping) =>
  typeof addressCheck === "function" ? addressCheck(shipping) : (ADDRESS_ANSWERS[addressCheck]?.(shipping) ?? { status: addressCheck });

// The Worker checks the address again when the payment is created (enforceAddress); same outcome here.
function enforceAddress(addressCheck, checkout) {
  const answer = addressAnswer(addressCheck, checkout.shipping);
  if (answer.status === "undeliverable") throw new QuoteError("address_undeliverable", ADDRESS_MESSAGES.undeliverable, "street");
  if (answer.status === "po_box") throw new QuoteError("address_po_box", ADDRESS_MESSAGES.poBox, "street");
  if (answer.status === "missing_unit" && checkout.addressReview.noUnit !== true) {
    throw new QuoteError("address_needs_unit", ADDRESS_MESSAGES.missingUnit, "street2");
  }
}

const AIRWALLEX_STUB = `
window.AirwallexComponentsSDK = {
  async init(options) { window.__awxInit = options; },
  async createElement(type, options) {
    const handlers = {};
    if (type === "dropIn") {
      (window.__awxDropInCreates ||= []).push({ type, options });
      const element = {
        mount(id) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.stubDropIn = (options?.methods || []).join(",") || "dropIn";
          button.textContent = "Airwallex Pay";
          button.style.cssText = "width:100%;min-height:48px";
          button.addEventListener("click", () => handlers.success && handlers.success());
          document.getElementById(id).append(button);
          setTimeout(() => handlers.ready && handlers.ready(), 0);
        },
        on(name, handler) { handlers[name] = handler; },
        async update(patch) { (window.__awxDropInUpdates ||= []).push(patch); },
        destroy() {},
      };
      window.__awxDropIn = { fire: (name, detail) => handlers[name] && handlers[name]({ detail }) };
      return element;
    }
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

export async function mockStore(page, { env = {}, paypal, paypalCaptureStatus = "paid", paypalCaptureError, orderStatus, paymentFailure = null, addressCheck = "unverified", contactBusy = false } = {}) {
  const calls = { session: [], paypalOrder: [], paypalCapture: [], address: [], contact: [] };
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
      // Contact us (worker/contact.js): the same field rules; a robot field answers ok and keeps nothing.
      if (pathname === "/api/contact") {
        if (contactBusy) return reply(429, { error: { code: "too_many_messages", message: CONTACT_MESSAGES.busy } });
        if (String(body?.company ?? "").trim()) return reply(200, { ok: true });
        const { value, errors } = checkContactMessage(body ?? {});
        const [field, message] = Object.entries(errors)[0] ?? [];
        if (field) throw new QuoteError("invalid_contact", message, field);
        calls.contact.push(value);
        return reply(200, { ok: true });
      }
      if (pathname === "/api/cart/quote") return reply(200, quote(body.items, { state: body.state, method: body.method }, resolvePricing(env)));
      if (pathname === "/api/checkout/address") {
        calls.address.push(body);
        const { value, errors } = checkShipping(body?.shipping);
        const [field, message] = Object.entries(errors)[0] ?? [];
        if (field) throw new QuoteError("invalid_address", message, field);
        return reply(200, addressAnswer(addressCheck, value));
      }
      if (pathname === "/api/checkout/session") {
        calls.session.push(body);
        const checkout = validateCheckout(body);
        enforceAddress(addressCheck, checkout);
        const priced = quote(body.items, { state: checkout.shipping.state, method: checkout.method }, resolvePricing(env));
        return reply(200, { orderId: ORDER_ID, quote: priced, intent: { id: "int_test", clientSecret: "secret_test", currency: "USD" } });
      }
      if (pathname === "/api/checkout/paypal/order") {
        calls.paypalOrder.push(body);
        if (body.shipping) enforceAddress(addressCheck, validateCheckout(body));
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
        const paidWithPaypal = calls.paypalCapture.length > 0;
        const status = orderStatus ?? (paidWithPaypal ? paypalCaptureStatus : "paid");
        // PayPal orders report the capture state; Airwallex orders report the PaymentIntent state.
        const paymentStatus = paidWithPaypal
          ? (status === "pending" ? "PENDING" : "COMPLETED")
          : (status === "paid" ? "SUCCEEDED" : "REQUIRES_PAYMENT_METHOD");
        return reply(200, { id: ORDER_ID, status, email: "t••••@example.com", ...priced, lines, paymentStatus, paymentFailure });
      }
      return reply(404, { error: { code: "not_found", message: "Not found." } });
    } catch (error) {
      if (error instanceof QuoteError) return reply(400, { error: { code: error.code, message: error.message, ...(error.field ? { field: error.field } : {}) } });
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

export async function selectPayMethod(page, id) {
  const radio = page.locator(`input[name="payMethod"][value="${id}"]`);
  if (!(await radio.count())) return;
  // Custom .check__box sits over the native input (opacity 0), so a normal
  // check() is intercepted. Click the visible label instead.
  const label = page.locator(`label:has(input[name="payMethod"][value="${id}"]) .check__label`);
  await label.scrollIntoViewIfNeeded();
  await label.click({ force: true });
  await expect(radio).toBeChecked();
}

export async function fillContact(page) {
  await page.locator("#email").fill("test.shopper@example.com");
  await page.locator("#phone").fill(TEST_PHONE);
  await page.getByRole("button", { name: /Continue to shipping/ }).click();
}

export async function fillToPayment(page, { payMethod } = {}) {
  await fillContact(page);
  await page.getByLabel("First name").fill("Test");
  await page.getByLabel("Last name").fill("Shopper");
  await page.getByLabel("Street address").fill("100 Example Ave");
  await page.getByLabel("City").fill("Austin");
  await page.getByLabel("State").selectOption("TX");
  await page.getByLabel("ZIP code").fill("78701");
  await page.getByRole("button", { name: /Continue to payment/ }).click();
  await expect(page.locator('[data-step="payment"]')).toBeVisible();
  if (payMethod) await selectPayMethod(page, payMethod);
}

export async function fillCard(page) {
  await page.locator('[data-stub-card="cardNumber"]').fill("4035501000000008");
  await page.locator('[data-stub-card="expiry"]').fill("12/30");
  await page.locator('[data-stub-card="cvc"]').fill("123");
}

export async function choosePayWith(page, method) {
  await selectPayMethod(page, method);
}
