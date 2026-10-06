// Apple Pay / Google Pay express block on the cart page (UI states only).
//
// FRONT-END ONLY and OFF BY DEFAULT. The block appears only when ALL of these hold:
//   1. /api/store/config says `expressCheckout: true` (absent / false = off, the default).
//   2. The cart has items and the server quote succeeded.
//   3. The device passes the cheap pre-check (wallets.js candidateWallets) and Airwallex
//      fires the element's `ready` event within 10 s.
// Anything else leaves the block collapsed and invisible (no space, not focusable).
//
// States on [data-express] (data-state): "hidden" | "ready" | "updating" | "error".
//   hidden   collapsed; also while probing, so nothing shows before the wallet is ready
//   ready    wallet buttons + "Or checkout with card" divider
//   updating skeleton over the buttons while the cart quote is being refreshed
//   error    a wallet that was ready failed: message shown, card Checkout stays below
//
// There is no cart-page order/PaymentIntent flow yet (shipping and tax are undecided), so
// this module never creates an order. It only mounts the wallet elements the same way
// checkout.js does (probe without intent) and shows their state. Amounts come from the
// server quote, never from this file.

import { WALLETS, candidateWallets, walletAmount, walletOptions } from "./wallets.js";

const SDK_URL = "https://static.airwallex.com/components/sdk/v1/index.js";
const READY_TIMEOUT_MS = 10_000;
const ERROR_TEXT = "Express checkout didn't go through. Use Checkout below to pay by card.";

const $ = (selector) => document.querySelector(selector);

const st = {
  config: null,
  quote: null,
  pending: false,
  started: false,
  sdk: null,
  elements: {},
  ready: new Set(),
  timers: {},
  error: "",
};

function loadSdk() {
  if (window.AirwallexComponentsSDK) return Promise.resolve(window.AirwallexComponentsSDK);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => (window.AirwallexComponentsSDK ? resolve(window.AirwallexComponentsSDK) : reject(new Error("sdk_missing")));
    script.onerror = () => reject(new Error("sdk_load_failed"));
    document.head.append(script);
  });
}

function getSdk() {
  st.sdk ??= loadSdk().then(async (sdk) => {
    await sdk.init({ env: st.config.airwallexEnv, enabledElements: ["payments"] });
    return sdk;
  });
  st.sdk.catch(() => { st.sdk = null; });
  return st.sdk;
}

const flagOn = () => st.config?.expressCheckout === true;
const canShow = () => flagOn() && st.quote !== null && st.ready.size > 0;

function render() {
  const root = $("[data-express]");
  if (!root) return;
  const show = canShow();
  let state = "hidden";
  if (show) state = st.error ? "error" : st.pending ? "updating" : "ready";
  root.dataset.state = state;
  root.classList.toggle("is-active", show);
  root.setAttribute("aria-busy", state === "updating" ? "true" : "false");
  for (const wallet of WALLETS) {
    $(`[data-express] [data-wallet-slot="${wallet.id}"]`)?.classList.toggle("is-ready", show && st.ready.has(wallet.id));
  }
  const message = $("[data-express-message]");
  message.replaceChildren();
  if (state === "error") {
    const note = document.createElement("p");
    note.className = "express__error";
    note.setAttribute("role", "alert");
    note.textContent = st.error;
    message.append(note);
  }
}

async function pushAmount() {
  if (!st.quote) return;
  const amount = walletAmount(st.quote.totalCents, st.quote.currency);
  for (const id of st.ready) {
    try {
      await st.elements[id]?.update?.({ amount });
    } catch {
      // A failed amount refresh must not break the page; the button stays as it was.
    }
  }
}

function attach(id, element) {
  st.timers[id] = setTimeout(() => {
    st.ready.delete(id);
    render();
  }, READY_TIMEOUT_MS);
  element.on("ready", async () => {
    clearTimeout(st.timers[id]);
    st.ready.add(id);
    await pushAmount();
    render();
  });
  element.on("click", () => {
    st.error = "";
    render();
  });
  element.on("cancel", () => {
    st.error = "";
    render();
  });
  element.on("error", () => {
    st.error = ERROR_TEXT;
    render();
  });
}

async function start() {
  if (st.started) return;
  const candidates = candidateWallets(st.config);
  if (candidates.length === 0) return;
  st.started = true;
  try {
    const sdk = await getSdk();
    for (const wallet of WALLETS.filter((w) => candidates.includes(w.id))) {
      try {
        const options = walletOptions(wallet.id, { quote: st.quote }, st.config, window.location.origin);
        const element = await sdk.createElement(wallet.element, options);
        if (!element) continue;
        const container = `cart-${wallet.containerId}`;
        element.mount(container);
        st.elements[wallet.id] = element;
        attach(wallet.id, element);
      } catch {
        // This wallet stays hidden.
      }
    }
  } catch {
    // SDK failed: no express block, plain Checkout button is unaffected.
    st.started = false;
  }
}

function evaluate() {
  if (flagOn() && st.quote) start();
  render();
}

// Store config from /api/store/config (missing or without the flag = off).
export function configureExpress(config) {
  st.config = config && typeof config === "object" ? config : null;
  evaluate();
}

// A refresh of the server quote has begun (keeps the block from jumping).
export function expressPending() {
  st.pending = true;
  render();
}

// The latest server quote, or null for an empty cart / a failed quote.
export function syncExpress(quote) {
  st.pending = false;
  st.quote = quote ?? null;
  if (!st.quote) st.error = "";
  else pushAmount();
  evaluate();
}
