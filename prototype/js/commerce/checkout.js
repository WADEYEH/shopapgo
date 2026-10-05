import {
  PRODUCT_IMAGES,
  api,
  cart,
  el,
  money,
  notice,
  priceRows,
  productName,
  renderCartCount,
  routineWord,
  track,
  isEstimate,
  withEstimate,
} from "./shared.js";
import { paypalEnabled, paypalOrderPayload, paypalSdkUrl, readPaypalOrder, storePaypalOrder } from "./paypal.js";
import {
  clearCheckoutDraft,
  readCheckoutDraft,
  resolveDraftStep,
  shippingComplete,
  writeCheckoutDraft,
} from "./checkout-draft.js";
import { WALLETS, candidateWallets, walletOptions, walletUpdate } from "./wallets.js";
import {
  AIRWALLEX_PAY_CONTAINER_ID,
  AIRWALLEX_PAY_ELEMENT,
  airwallexPayEnabled,
  dropInOptions,
  dropInUpdate,
} from "./airwallex-pay.js";

const AIRWALLEX_SDK_URL = "https://static.airwallex.com/components/sdk/v1/index.js";
const STEPS = ["contact", "shipping", "payment"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_PATTERN = /^\d{5}(-\d{4})?$/;
// Airwallex client secrets expire 60 minutes after the PaymentIntent is created.
const SESSION_MAX_AGE_MS = 50 * 60 * 1000;
// A wallet button that has not reported `ready` by then stays hidden.
const WALLET_READY_TIMEOUT_MS = 10_000;
const ORDER_POLL_ATTEMPTS = 8;
const ORDER_POLL_INTERVAL_MS = 1500;
const DRAFT_SAVE_MS = 200;

const $ = (selector, root = document) => root.querySelector(selector);

const state = {
  config: null,
  step: "contact",
  contact: { email: "", marketingOptIn: false },
  shipping: null,
  method: null,
  quote: null,
  session: null,
  sessionKey: null,
  card: null,
  sdk: null,
  wallets: { started: false, elements: {}, ready: new Set(), visible: new Set() },
  paypal: { sdk: null, mounted: false },
  airwallexPay: { element: null, mounted: false },
  payMethod: "card",
  cardStatus: { cardNumber: false, expiry: false, cvc: false },
  placing: false,
};

let draftTimer = 0;

function collectDraft() {
  const contactForm = $('[data-step="contact"]');
  const shippingForm = $('[data-step="shipping"]');
  const value = (form, name) => form?.[name]?.value?.trim?.() ?? "";
  return {
    step: state.step,
    contact: {
      email: value(contactForm, "email"),
      marketingOptIn: Boolean(contactForm?.marketingOptIn?.checked),
    },
    shipping: {
      firstName: value(shippingForm, "firstName"),
      lastName: value(shippingForm, "lastName"),
      street: value(shippingForm, "street"),
      street2: value(shippingForm, "street2"),
      city: value(shippingForm, "city"),
      state: value(shippingForm, "state"),
      zip: value(shippingForm, "zip"),
    },
    method: state.method,
  };
}

function saveDraftNow() {
  writeCheckoutDraft(collectDraft());
}

function scheduleDraftSave() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraftNow, DRAFT_SAVE_MS);
}

function restoreDraft() {
  const draft = readCheckoutDraft();
  if (!draft) return null;
  const contactForm = $('[data-step="contact"]');
  if (contactForm) {
    contactForm.email.value = draft.contact.email;
    contactForm.marketingOptIn.checked = draft.contact.marketingOptIn;
  }
  const shippingForm = $('[data-step="shipping"]');
  if (shippingForm && draft.shipping) {
    for (const name of ["firstName", "lastName", "street", "street2", "city", "state", "zip"]) {
      if (shippingForm[name]) shippingForm[name].value = draft.shipping[name] ?? "";
    }
  }
  if (draft.method && state.config.shippingMethods.some((method) => method.id === draft.method)) {
    state.method = draft.method;
    const radio = document.querySelector(`input[name="method"][value="${CSS.escape(draft.method)}"]`);
    if (radio) radio.checked = true;
  }
  if (draft.contact.email) state.contact = { ...draft.contact };
  const step = resolveDraftStep(draft);
  if (step === "payment" && shippingComplete(draft.shipping)) state.shipping = { ...draft.shipping };
  return step;
}

// ---------- Rendering ----------

function showMessage(tone, title, body, action) {
  const box = $("[data-checkout-message]");
  if (!tone) return box.replaceChildren();
  const node = notice(tone, title, body);
  if (action) node.append(el("span", {}, action));
  box.replaceChildren(node);
}

function renderSummary(source) {
  $("[data-summary]").hidden = false;
  $("[data-summary-lines]").replaceChildren(
    ...source.lines.map((line) =>
      el(
        "li",
        { class: "summary-line" },
        el("img", { src: PRODUCT_IMAGES[line.id], alt: "", width: 56, height: 56 }),
        el(
          "div",
          { class: "line-item__body" },
          el("span", { class: "line-item__title" }, routineWord(line.routine), productName(line, { newTab: true })),
          el("span", { class: "label" }, `Qty ${line.qty}`),
        ),
        el("span", { class: "summary-line__price" }, money(line.lineCents)),
      ),
    ),
  );
  const taxValue = source.taxCents === null || source.taxCents === undefined ? "Calculated at next step" : money(source.taxCents);
  $("[data-summary-rows]").replaceChildren(
    priceRows([
      { label: "Subtotal", value: money(source.subtotalCents) },
      { label: "Shipping", value: withEstimate(source.shippingCents ? money(source.shippingCents) : "Free", isEstimate(state.config)), free: !source.shippingCents },
      { label: "Tax", value: withEstimate(taxValue, isEstimate(state.config)) },
    ], money(source.totalCents)),
  );
  const button = $("[data-place-order]");
  if (button && !state.placing) button.replaceChildren(`Place order · ${money(source.totalCents)}`);
}

function setFieldError(form, name, message) {
  const field = $(`[data-field="${name}"]`, form);
  if (!field) return;
  const error = $("[data-error]", field);
  const input = $("input, select", field);
  field.classList.toggle("field--error", Boolean(message));
  if (error) {
    error.hidden = !message;
    error.textContent = message || "";
    if (error.id === "") error.id = `${name}-error`;
  }
  if (input) {
    input.setAttribute("aria-invalid", message ? "true" : "false");
    if (message) input.setAttribute("aria-describedby", `${name}-error`);
    else input.removeAttribute("aria-describedby");
  }
}

function goTo(step, { focus = true } = {}) {
  state.step = step;
  const index = STEPS.indexOf(step);
  for (const form of document.querySelectorAll("[data-step]")) form.hidden = form.dataset.step !== step;
  for (const li of document.querySelectorAll("[data-step-indicator]")) {
    const i = STEPS.indexOf(li.dataset.stepIndicator);
    li.classList.toggle("is-done", i < index);
    if (i === index) li.setAttribute("aria-current", "step");
    else li.removeAttribute("aria-current");
    $(".steps__dot", li).textContent = i < index ? "✓" : String(i + 1);
  }
  if (focus) $(`[data-step="${step}"] h2`)?.focus();
  saveDraftNow();
  if (step === "payment") {
    mountCardElements();
    renderPayMethods();
    applyPayMethod(state.payMethod);
    syncWallets();
  }
}

// ---------- Quote ----------

async function refreshQuote() {
  const body = { items: cart.items(), method: state.method ?? undefined, state: state.shipping?.state };
  try {
    state.quote = await api("/api/cart/quote", { method: "POST", body });
    renderSummary(state.quote);
    return state.quote;
  } catch (error) {
    showMessage("warning", "Pricing unavailable", error.message);
    return null;
  }
}

// ---------- Steps ----------

function renderShippingOptions() {
  const select = $("[data-state-select]");
  for (const { code, name } of state.config.states) select.append(el("option", { value: code }, name));

  state.method = state.config.defaultShippingMethod;
  $("[data-ship-options]").replaceChildren(
    ...state.config.shippingMethods.map((method) =>
      el(
        "div",
        { class: "ship-option" },
        el(
          "label",
          { class: "check" },
          el(
            "span",
            { class: "check__control" },
            el("input", {
              type: "radio",
              name: "method",
              value: method.id,
              checked: method.id === state.method,
              onchange: () => {
                state.method = method.id;
                saveDraftNow();
                refreshQuote();
              },
            }),
            el("span", { class: "check__box", "aria-hidden": "true" }),
          ),
          el("span", { class: "check__label" }, method.label),
          el("span", { class: "check__description" }, withEstimate(`${method.detail} · ${method.amountCents ? money(method.amountCents) : "Free"}`, isEstimate(state.config))),
        ),
      ),
    ),
  );
}

function submitContact(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = form.email.value.trim();
  const valid = EMAIL_PATTERN.test(email);
  setFieldError(form, "email", valid ? "" : "Enter a valid email address.");
  if (!valid) return form.email.focus();
  state.contact = { email, marketingOptIn: form.marketingOptIn.checked };
  goTo("shipping");
}

async function submitShipping(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const value = (name) => form[name].value.trim();
  const shipping = {
    firstName: value("firstName"),
    lastName: value("lastName"),
    street: value("street"),
    street2: value("street2"),
    city: value("city"),
    state: value("state"),
    zip: value("zip"),
  };
  const errors = {
    firstName: shipping.firstName ? "" : "Enter your first name.",
    lastName: shipping.lastName ? "" : "Enter your last name.",
    street: shipping.street ? "" : "Enter a street address.",
    city: shipping.city ? "" : "Enter a city.",
    state: shipping.state ? "" : "Choose a state.",
    zip: ZIP_PATTERN.test(shipping.zip) ? "" : "Enter a 5-digit ZIP.",
  };
  for (const [name, message] of Object.entries(errors)) setFieldError(form, name, message);
  const firstInvalid = Object.keys(errors).find((name) => errors[name]);
  if (firstInvalid) return form[firstInvalid].focus();

  state.shipping = shipping;
  const quote = await refreshQuote();
  if (!quote) return;
  track("add_shipping_info", { shipping_tier: state.method, value: quote.totalCents / 100, currency: quote.currency });
  goTo("payment");
}

// ---------- Airwallex card elements ----------

function loadAirwallexSdk() {
  if (window.AirwallexComponentsSDK) return Promise.resolve(window.AirwallexComponentsSDK);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = AIRWALLEX_SDK_URL;
    script.async = true;
    script.onload = () => (window.AirwallexComponentsSDK ? resolve(window.AirwallexComponentsSDK) : reject(new Error("sdk_missing")));
    script.onerror = () => reject(new Error("sdk_load_failed"));
    document.head.append(script);
  });
}

// Airwallex renders inside iframes, so styles are literal values, not CSS variables.
const CARD_STYLE = {
  base: { color: "#FBF8F4", fontFamily: "Barlow, system-ui, sans-serif", fontSize: "16px", "::placeholder": { color: "#7d858f" } },
  invalid: { color: "#E99495" },
};

// One SDK init shared by the card fields and the wallet buttons.
function getSdk() {
  state.sdk ??= loadAirwallexSdk().then(async (sdk) => {
    await sdk.init({ env: state.config.airwallexEnv, enabledElements: ["payments"] });
    return sdk;
  });
  state.sdk.catch(() => { state.sdk = null; });
  return state.sdk;
}

async function mountCardElements() {
  if (state.card) return state.card.ready;
  const form = $('[data-step="payment"]');
  state.card = {};
  state.card.ready = (async () => {
    try {
      const sdk = await getSdk();
      const specs = [
        ["cardNumber", "card-number"],
        ["expiry", "card-expiry"],
        ["cvc", "card-cvc"],
      ];
      for (const [type, containerId] of specs) {
        const element = await sdk.createElement(type, { style: CARD_STYLE });
        element.mount(containerId);
        element.on("change", (event) => {
          // The docs name the flag `completed`; the live SDK (Sep 2026) sends `complete`.
          const { completed, complete, error } = event.detail ?? {};
          state.cardStatus[type] = Boolean(completed ?? complete);
          setFieldError(form, type, error?.message ?? "");
        });
        state.card[type] = element;
      }
    } catch (error) {
      state.card = null;
      $("[data-payment-message]").replaceChildren(
        notice("warning", "Card form unavailable", "We couldn't load the secure card form. Refresh the page to try again."),
      );
      throw error;
    }
  })();
  return state.card.ready.catch(() => {});
}


// ---------- Apple Pay / Google Pay ----------
//
// Probe first, pay later. On the payment step each wallet element is created and
// mounted into a collapsed slot WITHOUT a PaymentIntent (Airwallex.js lets
// intent_id / client_secret be supplied later through update()). Only when an
// element reports `ready` (this device/wallet can really pay) do we create the
// session (order + PaymentIntent, the same one the card form reuses), hand it to the
// element with update(), and reveal the button. Shoppers without a wallet never
// create an extra order, and every failure path leaves the button hidden and the
// card form untouched. `wallets.eagerSession` (WALLET_EAGER_SESSION) switches to
// creating the session first, as a fallback if a wallet needs an intent up front.

function payMethodChoices() {
  const choices = [];
  if (airwallexPayEnabled(state.config)) {
    choices.push({
      id: "airwallex_pay",
      label: "Airwallex Pay",
      description: "Pay with your Airwallex balance. No card details stay on this page.",
    });
  }
  choices.push({
    id: "card",
    label: "Card",
    description: "Visa, Mastercard and other cards, encrypted by Airwallex.",
  });
  if (paypalEnabled(state.config)) {
    choices.push({
      id: "paypal",
      label: "PayPal",
      description: "Check out with your PayPal account.",
    });
  }
  return choices;
}

function defaultPayMethod() {
  return "card";
}

function renderPayMethods() {
  const choices = payMethodChoices();
  const fieldset = $("[data-pay-methods]");
  const host = $("[data-pay-options]");
  if (!fieldset || !host) return;
  if (choices.length < 2) {
    fieldset.hidden = true;
    host.replaceChildren();
    return;
  }
  fieldset.hidden = false;
  if (!choices.some((choice) => choice.id === state.payMethod)) state.payMethod = defaultPayMethod();
  host.replaceChildren(
    ...choices.map((choice) =>
      el(
        "div",
        { class: "ship-option" },
        el(
          "label",
          { class: "check" },
          el(
            "span",
            { class: "check__control" },
            el("input", {
              type: "radio",
              name: "payMethod",
              value: choice.id,
              checked: choice.id === state.payMethod,
              onchange: () => applyPayMethod(choice.id),
            }),
            el("span", { class: "check__box", "aria-hidden": "true" }),
          ),
          el("span", { class: "check__label" }, choice.label),
          el("span", { class: "check__description" }, choice.description),
        ),
      ),
    ),
  );
}

function applyPayMethod(id) {
  const choices = payMethodChoices();
  state.payMethod = choices.some((choice) => choice.id === id) ? id : defaultPayMethod();
  for (const panel of document.querySelectorAll("[data-pay-panel]")) {
    panel.hidden = panel.dataset.payPanel !== state.payMethod;
  }
  const place = $("[data-place-order]");
  if (place) place.hidden = state.payMethod !== "card";
  setPaypalVisible(state.payMethod === "paypal");
  if (state.payMethod === "airwallex_pay") mountAirwallexPay();
  if (state.payMethod === "paypal") mountPaypalButtons();
}

function syncExpressDivider() {
  const any = state.wallets.visible.size > 0;
  $("[data-wallets]")?.classList.toggle("is-active", any);
  const divider = $("[data-wallet-divider]");
  if (divider) divider.hidden = !any;
}

function setPaypalVisible(visible) {
  const slot = $("[data-paypal]");
  if (slot) slot.hidden = !visible;
  const panel = $('[data-pay-panel="paypal"]');
  if (panel && state.payMethod === "paypal") panel.hidden = !visible;
  syncExpressDivider();
}

function setWalletVisible(id, visible) {
  const slot = $(`[data-wallet-slot="${id}"]`);
  if (!slot) return;
  slot.classList.toggle("is-ready", visible);
  if (visible) state.wallets.visible.add(id);
  else state.wallets.visible.delete(id);
  syncExpressDivider();
}

async function onWalletSuccess() {
  const orderId = state.session?.orderId;
  if (!orderId) return;
  // Like the card path: while "placing", clearing the cart must not trigger the
  // "cart emptied in another tab" reload.
  state.placing = true;
  cart.clear();
  history.replaceState(null, "", `checkout.html?order=${encodeURIComponent(orderId)}`);
  await showConfirmation(orderId);
}

// Makes sure a session exists and gives it to every element that is ready.
async function refreshWalletSession() {
  const session = await ensureSession();
  for (const id of state.wallets.ready) {
    await state.wallets.elements[id]?.update?.(walletUpdate(id, session, state.config));
  }
  return session;
}

function attachWalletEvents(id, element) {
  const timer = setTimeout(() => setWalletVisible(id, false), WALLET_READY_TIMEOUT_MS);
  element.on("ready", async () => {
    clearTimeout(timer);
    state.wallets.ready.add(id);
    try {
      await refreshWalletSession();
      setWalletVisible(id, true);
    } catch {
      state.wallets.ready.delete(id);
      setWalletVisible(id, false);
    }
  });
  element.on("click", () => {
    const quote = state.session?.quote;
    if (quote) track("add_payment_info", { payment_type: id === "applePay" ? "apple_pay" : "google_pay", value: quote.totalCents / 100, currency: quote.currency });
    $("[data-payment-message]").replaceChildren();
  });
  element.on("success", () => onWalletSuccess());
  element.on("cancel", () => $("[data-payment-message]").replaceChildren());
  element.on("error", (event) => {
    const detail = event?.detail?.error;
    // The intent may be expired or consumed: drop it so the next tap uses a fresh one.
    state.session = null;
    refreshWalletSession().catch(() => {});
    $("[data-payment-message]").replaceChildren(
      notice("warning", "Payment not completed", detail?.message && detail.code !== "UNKNOWN_ERROR" ? detail.message : "The wallet payment didn't go through. Try again or pay by card."),
    );
  });
}

async function syncWallets() {
  const candidates = candidateWallets(state.config);
  if (candidates.length === 0 || !state.contact.email || !state.shipping) return;
  try {
    if (state.wallets.started) {
      // Back on this step after editing shipping: re-arm ready wallets with the new session.
      if (state.wallets.ready.size) await refreshWalletSession();
      return;
    }
    state.wallets.started = true;
    const eager = state.config.wallets.eagerSession ? await ensureSession() : null;
    const source = { session: eager, quote: state.quote };
    const sdk = await getSdk();
    for (const wallet of WALLETS.filter((w) => candidates.includes(w.id))) {
      try {
        const element = await sdk.createElement(wallet.element, walletOptions(wallet.id, source, state.config, window.location.origin));
        if (!element) continue;
        element.mount(wallet.containerId);
        state.wallets.elements[wallet.id] = element;
        attachWalletEvents(wallet.id, element);
      } catch {
        setWalletVisible(wallet.id, false);
      }
    }
  } catch {
    // No wallet buttons; the card form is unaffected.
    state.wallets.started = false;
  }
}

// ---------- PayPal ----------
//
// Shown on the payment step when GET /api/store/config.paypal.enabled and storeReady,
// as a choose-one option next to Card and Airwallex Pay.
// createOrder / onApprove follow docs/paypal.md. Apple/Google Pay stay off unless
// their own flags turn them on. Card checkout is unchanged.

function loadPaypalSdk() {
  if (window.paypal?.Buttons) return Promise.resolve(window.paypal);
  state.paypal.sdk ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = paypalSdkUrl(state.config.paypal.clientId);
    script.async = true;
    script.onload = () => (window.paypal?.Buttons ? resolve(window.paypal) : reject(new Error("sdk_missing")));
    script.onerror = () => reject(new Error("sdk_load_failed"));
    document.head.append(script);
  });
  state.paypal.sdk.catch(() => { state.paypal.sdk = null; });
  return state.paypal.sdk;
}

function applyPaymentCopy() {
  const intro = $("[data-payment-intro]");
  const note = $("[data-summary-note]");
  const pay = airwallexPayEnabled(state.config);
  const paypal = paypalEnabled(state.config);
  if (intro) {
    if (pay && paypal) {
      intro.textContent = "Choose Airwallex Pay, PayPal, or a card. Card details are encrypted by Airwallex and never stored by APGO.";
    } else if (pay) {
      intro.textContent = "Pay with Airwallex Pay, or enter a card. Card details are encrypted by Airwallex and never stored by APGO.";
    } else if (paypal) {
      intro.textContent = "Pay with PayPal, or enter a card. Card details are encrypted by Airwallex and never stored by APGO.";
    }
  }
  if (note) {
    if (pay && paypal) note.textContent = "Secure checkout · Payments by Airwallex and PayPal";
    else if (paypal) note.textContent = "Secure checkout · Payments by Airwallex and PayPal";
    else if (pay) note.textContent = "Secure checkout · Payments by Airwallex";
  }
}

async function mountAirwallexPay() {
  if (!airwallexPayEnabled(state.config) || !state.contact.email || !state.shipping) return;
  if (state.airwallexPay.mounted) {
    try {
      const session = await ensureSession();
      await state.airwallexPay.element?.update?.(dropInUpdate(session));
    } catch {
      state.session = null;
    }
    return;
  }
  const host = $(`#${AIRWALLEX_PAY_CONTAINER_ID}`);
  if (!host) return;
  try {
    const session = await ensureSession();
    track("add_payment_info", { payment_type: "airwallex_pay", value: session.quote.totalCents / 100, currency: session.quote.currency });
    const sdk = await getSdk();
    const element = await sdk.createElement(
      AIRWALLEX_PAY_ELEMENT,
      dropInOptions(session, {
        email: state.contact.email,
        shipping: state.shipping,
        countryCode: state.config.wallets?.countryCode,
      }),
    );
    if (!element) throw new Error("element_missing");
    element.mount(AIRWALLEX_PAY_CONTAINER_ID);
    element.on("success", () => onWalletSuccess());
    element.on("error", (event) => {
      const detail = event?.detail?.error;
      state.session = null;
      state.airwallexPay.mounted = false;
      state.airwallexPay.element = null;
      $("[data-payment-message]").replaceChildren(
        notice("warning", "Payment not completed", detail?.message && detail.code !== "UNKNOWN_ERROR" ? detail.message : "Airwallex Pay didn't go through. Try again or choose another method."),
      );
    });
    state.airwallexPay.element = element;
    state.airwallexPay.mounted = true;
  } catch {
    state.airwallexPay.mounted = false;
    state.airwallexPay.element = null;
    $("[data-payment-message]").replaceChildren(
      notice("warning", "Airwallex Pay unavailable", "We couldn't load Airwallex Pay. Choose card or another method."),
    );
    if (payMethodChoices().some((choice) => choice.id === "card")) {
      applyPayMethod("card");
      renderPayMethods();
    }
  }
}

async function createPaypalOrder() {
  if (!state.contact?.email) throw new Error("Enter a valid email address.");
  const data = await api("/api/checkout/paypal/order", {
    method: "POST",
    body: paypalOrderPayload({
      items: cart.items(),
      contact: state.contact,
      shipping: state.shipping,
      method: state.method,
      attribution: readAttribution(),
    }),
  });
  storePaypalOrder(data);
  state.paypal.order = data;
  if (data.quote) {
    state.quote = data.quote;
    renderSummary(data.quote);
  }
  // Same InitiateCheckout moment as the card session: eventID is ic_<orderId>
  // (data.eventIds.initiateCheckout). Do not invent a new id.
  track("checkout_session_created", {
    order_id: data.orderId,
    value: data.quote.totalCents / 100,
    currency: data.quote.currency,
    items: analyticsItems(data.quote.lines),
  });
  return data.paypal.id;
}

function firePaidPurchase(orderId, quote) {
  if (!quote) return false;
  try {
    sessionStorage.setItem(`apgo_us_purchase_tracked_${orderId}`, "1");
  } catch {
    // Confirmation page may send a second dataLayer event; Meta still dedupes on eventID.
  }
  track("purchase", {
    transaction_id: orderId,
    value: quote.totalCents / 100,
    currency: quote.currency,
    items: analyticsItems(quote.lines),
  });
  return true;
}

async function onPaypalApprove(data) {
  const result = await api("/api/checkout/paypal/capture", {
    method: "POST",
    body: { paypalOrderId: data.orderID },
  });
  // Only `paid` is a Pixel Purchase. `review` is a captured-but-unverified store
  // order — show the existing confirmation UX, never treat it as Purchase.
  if (result.status === "paid") {
    const quote = state.paypal.order?.quote ?? readPaypalOrder()?.quote;
    firePaidPurchase(result.orderId, quote);
    state.placing = true;
    cart.clear();
    history.replaceState(null, "", `checkout.html?order=${encodeURIComponent(result.orderId)}`);
    await showConfirmation(result.orderId);
    return;
  }
  if (result.status === "review" && result.orderId) {
    history.replaceState(null, "", `checkout.html?order=${encodeURIComponent(result.orderId)}`);
    await showConfirmation(result.orderId);
    return;
  }
  throw new Error(result.error?.message || "Payment could not be completed.");
}

function onPaypalCancel() {
  setPlacing(false);
  $("[data-payment-message]").replaceChildren(
    notice("info", "PayPal checkout cancelled", "No payment was taken. You can try PayPal again or pay by card."),
  );
}

async function mountPaypalButtons() {
  if (!paypalEnabled(state.config) || !state.contact.email || state.payMethod !== "paypal") {
    setPaypalVisible(false);
    return;
  }
  if (state.paypal.mounted) {
    setPaypalVisible(true);
    return;
  }
  const host = $("#paypal-button");
  if (!host) return;
  try {
    setPaypalVisible(true);
    const paypal = await loadPaypalSdk();
    if (state.payMethod !== "paypal") {
      setPaypalVisible(false);
      return;
    }
    await paypal.Buttons({
      style: { layout: "vertical", color: "gold", shape: "rect", label: "paypal", height: 48 },
      createOrder: async () => {
        $("[data-payment-message]").replaceChildren();
        setPlacing(true);
        try {
          return await createPaypalOrder();
        } catch (error) {
          setPlacing(false);
          $("[data-payment-message]").replaceChildren(
            notice("warning", "PayPal unavailable", error.message || "Could not start PayPal."),
          );
          throw error;
        }
      },
      onApprove: async (data) => {
        try {
          await onPaypalApprove(data);
        } catch (error) {
          setPlacing(false);
          $("[data-payment-message]").replaceChildren(
            notice("warning", "Payment not completed", error.message || "Payment could not be completed."),
          );
        }
      },
      onCancel: () => onPaypalCancel(),
      onError: () => {
        setPlacing(false);
        $("[data-payment-message]").replaceChildren(
          notice("warning", "PayPal unavailable", "PayPal couldn't complete checkout. Try again or pay by card."),
        );
      },
    }).render("#paypal-button");
    state.paypal.mounted = true;
    setPaypalVisible(state.payMethod === "paypal");
  } catch {
    state.paypal.mounted = false;
    setPaypalVisible(false);
  }
}

async function handlePaypalReturn(orderId) {
  // Redirect fallback: Worker registered {origin}/checkout.html?order=<id>&paypal=return.
  // Capture if the popup's onApprove did not run; GET /api/orders/:id also auto-captures
  // an APPROVED PayPal order with a usable US address.
  try {
    const result = await api("/api/checkout/paypal/capture", { method: "POST", body: { orderId } });
    if (result.status === "paid") {
      const quote = readPaypalOrder()?.quote;
      firePaidPurchase(result.orderId, quote);
    }
  } catch {
    // Poll below still settles when the order is already captured or still APPROVED.
  }
  history.replaceState(null, "", `checkout.html?order=${encodeURIComponent(orderId)}`);
  await showConfirmation(orderId);
}

// ---------- Place order ----------

function setPlacing(placing) {
  state.placing = placing;
  const button = $("[data-place-order]");
  button.disabled = placing;
  button.replaceChildren(placing ? "Processing…" : `Place order · ${money(state.quote?.totalCents ?? 0)}`);
}

function readCookie(name) {
  const hit = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!hit) return "";
  const raw = hit.slice(name.length + 1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// Meta attribution for the server-side Conversions API (worker). Every field is optional and
// absent fields are omitted. fbclid comes from the URL, else from the _fbc cookie
// ("fb.1.<ms>.<fbclid>") because checkout.html is normally reached without the query string.
function readAttribution() {
  const fbp = readCookie("_fbp");
  const fbc = readCookie("_fbc");
  const fbclid = new URLSearchParams(window.location.search).get("fbclid") || fbc.split(".").slice(3).join(".");
  const attribution = { fbp, fbc, fbclid, sourceUrl: window.location.href };
  return Object.fromEntries(Object.entries(attribution).filter(([, value]) => value));
}

// GA4-style item list for the analytics event; prices are the server's (quote line unit price).
const analyticsItems = (lines) =>
  lines.map((line) => ({ item_id: line.sku, item_name: line.name, quantity: line.qty, price: line.unitCents / 100 }));

async function ensureSession() {
  const payload = { items: cart.items(), contact: state.contact, shipping: state.shipping, method: state.method };
  // The cache key is the order content only: attribution (cookies, URL) must never force a new PaymentIntent.
  const key = JSON.stringify(payload);
  const fresh = state.session && state.sessionKey === key && Date.now() - state.session.createdAt < SESSION_MAX_AGE_MS;
  if (fresh) return state.session;

  const session = await api("/api/checkout/session", { method: "POST", body: { ...payload, attribution: readAttribution() } });
  state.session = { ...session, createdAt: Date.now() };
  state.sessionKey = key;
  state.quote = session.quote;
  renderSummary(session.quote);
  // The order (merchant_order_id) now exists: this is the InitiateCheckout moment for Meta.
  track("checkout_session_created", {
    order_id: session.orderId,
    value: session.quote.totalCents / 100,
    currency: session.quote.currency,
    items: analyticsItems(session.quote.lines),
  });
  return state.session;
}

async function placeOrder(event) {
  event.preventDefault();
  if (state.placing || state.payMethod !== "card") return;
  const message = $("[data-payment-message]");
  message.replaceChildren();

  if (!state.card?.cardNumber) {
    message.replaceChildren(notice("warning", "Card form unavailable", "The secure card form is still loading. Try again in a moment."));
    return;
  }
  const missing = Object.entries(state.cardStatus).filter(([, done]) => !done).map(([type]) => type);
  if (missing.length) {
    const form = event.currentTarget;
    const labels = { cardNumber: "Enter your card number.", expiry: "Enter the expiry date.", cvc: "Enter the security code." };
    for (const type of missing) setFieldError(form, type, labels[type]);
    return;
  }

  setPlacing(true);
  try {
    const session = await ensureSession();
    track("add_payment_info", { payment_type: "card", value: session.quote.totalCents / 100, currency: session.quote.currency });
    await state.card.cardNumber.confirm({ intent_id: session.intent.id, client_secret: session.intent.clientSecret });
    cart.clear();
    history.replaceState(null, "", `checkout.html?order=${encodeURIComponent(session.orderId)}`);
    await showConfirmation(session.orderId);
  } catch (error) {
    const text = error?.message || "Your payment didn't go through. Check your card details or try another card.";
    message.replaceChildren(notice("warning", "Payment not completed", text));
    setPlacing(false);
  }
}

// ---------- Confirmation ----------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchOrderUntilSettled(orderId) {
  let order = null;
  for (let attempt = 0; attempt < ORDER_POLL_ATTEMPTS; attempt += 1) {
    order = await api(`/api/orders/${encodeURIComponent(orderId)}`);
    const failedAttempt = order.paymentStatus === "REQUIRES_PAYMENT_METHOD" && attempt > 0;
    if (order.status !== "pending" || failedAttempt) return order;
    await sleep(ORDER_POLL_INTERVAL_MS);
  }
  return order;
}

function trackPurchaseOnce(order) {
  const key = `apgo_us_purchase_tracked_${order.id}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // Without storage a refresh may re-send; acceptable for analytics.
  }
  // GET /api/orders/:id lines carry lineCents but no unit price, so the unit price is derived.
  const items = (order.lines ?? []).map((line) => ({
    item_id: line.sku,
    item_name: line.name,
    quantity: line.qty,
    price: line.lineCents / line.qty / 100,
  }));
  track("purchase", { transaction_id: order.id, value: order.totalCents / 100, currency: order.currency, ...(items.length ? { items } : {}) });
}

async function showConfirmation(orderId) {
  $("[data-checkout-flow]").hidden = true;
  const section = $("[data-confirmation]");
  section.hidden = false;
  section.replaceChildren(notice("info", "Confirming payment", "One moment while we confirm your order."));
  $("[data-checkout-title]").textContent = "Order placed.";

  let order;
  try {
    order = await fetchOrderUntilSettled(orderId);
  } catch (error) {
    $("[data-checkout-title]").textContent = "Order status";
    section.replaceChildren(notice("warning", error.status === 404 ? "Order not found" : "Status unavailable", error.message));
    return;
  }
  renderSummary(order);

  const home = el("a", { class: "btn", href: "./" }, "Back to APGO ", el("span", { "aria-hidden": "true" }, "→"));
  if (order.status === "paid") {
    clearCheckoutDraft();
    cart.clear();
    trackPurchaseOnce(order);
    section.replaceChildren(
      notice("success", "Order confirmed", `Order ${order.id} · Payment received.`),
      el("h2", { class: "heading-guide-h2" }, "Thanks for your order."),
      el("p", { class: "body body--sm" }, `Keep your order number for support. Order details are linked to ${order.email}.`),
      el("div", { class: "actions" }, home),
    );
  } else if (order.status === "review") {
    clearCheckoutDraft();
    section.replaceChildren(
      notice("info", "Order received", `Order ${order.id} · We're verifying the payment. No action is needed.`),
      el("div", { class: "actions" }, home),
    );
  } else if (order.status === "cancelled" || order.paymentStatus === "REQUIRES_PAYMENT_METHOD") {
    $("[data-checkout-title]").textContent = "Payment not completed.";
    section.replaceChildren(
      notice("warning", "Payment didn't go through", "Your card was not charged. Return to checkout to try again."),
      el("div", { class: "actions" }, el("a", { class: "btn", href: "checkout.html" }, "Return to checkout ", el("span", { "aria-hidden": "true" }, "→"))),
    );
  } else {
    section.replaceChildren(
      notice("info", "Payment processing", `Order ${order.id} · We're confirming your payment. Refresh this page in a minute.`),
    );
  }
}

// ---------- Boot ----------

async function init() {
  renderCartCount();
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("order");
  const paypalFlag = params.get("paypal");

  if (paypalFlag === "return" && orderId) return handlePaypalReturn(orderId);
  if (orderId && paypalFlag !== "cancel") return showConfirmation(orderId);

  const paypalCancelled = paypalFlag === "cancel";
  if (paypalCancelled) history.replaceState(null, "", "checkout.html");

  if (cart.items().length === 0) {
    $("[data-checkout-title]").textContent = "Your cart is empty.";
    showMessage("info", "Nothing to check out", "Add a coating to your cart first.", el("a", { href: "./#compare" }, "Choose Dry or Wet →"));
    return;
  }

  try {
    state.config = await api("/api/store/config");
  } catch (error) {
    showMessage("warning", "Checkout unavailable", error.message);
    return;
  }

  state.payMethod = defaultPayMethod();
  applyPaymentCopy();
  renderShippingOptions();
  $("[data-checkout-flow]").hidden = false;
  $('[data-step="contact"]').addEventListener("submit", submitContact);
  $('[data-step="shipping"]').addEventListener("submit", submitShipping);
  $('[data-step="payment"]').addEventListener("submit", placeOrder);
  for (const back of document.querySelectorAll("[data-back]")) back.addEventListener("click", () => goTo(back.dataset.back));
  for (const form of document.querySelectorAll('[data-step="contact"], [data-step="shipping"]')) {
    form.addEventListener("input", scheduleDraftSave);
    form.addEventListener("change", scheduleDraftSave);
  }

  const restoredStep = restoreDraft();

  if (paypalCancelled) {
    showMessage("info", "PayPal checkout cancelled", "No payment was taken. Continue below or pay by card.");
  }

  const quote = await refreshQuote();
  if (quote) track("begin_checkout", { value: quote.subtotalCents / 100, currency: quote.currency, items: quote.lines.length });
  goTo(restoredStep ?? "contact", { focus: false });
}

// Focus inside an Airwallex iframe makes the iframe the activeElement here, which
// is enough to give its container the same focus border as native inputs.
document.addEventListener("focusin", () => {
  for (const container of document.querySelectorAll(".card-input")) {
    container.classList.toggle("is-focused", container.contains(document.activeElement));
  }
});
document.addEventListener("focusout", () => {
  setTimeout(() => {
    for (const container of document.querySelectorAll(".card-input")) {
      container.classList.toggle("is-focused", container.contains(document.activeElement));
    }
  });
});

// The cart changed in another tab: prices and the pending session are stale.
window.addEventListener("apgo:cart-updated", () => {
  if (state.placing || !state.config) return;
  state.session = null;
  if (cart.items().length === 0) window.location.reload();
  else refreshQuote();
});

init();
