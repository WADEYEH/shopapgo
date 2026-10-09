"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/shop/api";
import { readAttribution } from "@/lib/shop/attribution";
import { CART_KEY, CART_UPDATED, cartItems, clearCart } from "@/lib/shop/cart";
import {
  AIRWALLEX_PAY_CONTAINER_ID,
  AIRWALLEX_PAY_ELEMENT,
  WALLETS,
  airwallexPayEnabled,
  candidateWallets,
  checkContact,
  checkShipping,
  clearCheckoutDraft,
  clearCheckoutId,
  dropInOptions,
  dropInUpdate,
  formatUsPhone,
  paypalEnabled,
  paypalOrderPayload,
  paypalSdkUrl,
  readCheckoutDraft,
  readCheckoutId,
  readPaypalOrder,
  resolveDraftStep,
  shippingComplete,
  storeCheckoutId,
  storePaypalOrder,
  suggestEmail,
  walletOptions,
  walletUpdate,
  writeCheckoutDraft,
} from "@/lib/shop/checkout";
import { loadAirwallex, loadPaypal } from "@/lib/shop/payment-sdk";
import { fetchStoreConfig, isEstimate, money } from "@/lib/shop/store-config";
import { track } from "@/lib/us/analytics";
import { Estimate, Notice } from "@/components/shop/ui";
import { AddressCheck, CardField, CheckOption, Field, OrderStatus, OrderSummary, STEPS, describedBy } from "./parts";

// /checkout (M3): contact → shipping (with the address check) → payment, then the order page (/checkout?order=…).
// - Every price comes from the Worker: the quote, then the checkout session (order + Airwallex PaymentIntent).
// - The field rules are the ones the Worker applies again (lib/shop/checkout.js → address-rules.js).
// - Payment: Airwallex card fields, Apple Pay / Google Pay (only once the device reports it can pay), Airwallex Pay,
//   PayPal. The providers' scripts mount into empty containers here and confirm the payment themselves.
// - The order exists only once paid (D36); the order page asks the Worker until the payment has settled.
// Values the payment flows read after an await live in `s` (a ref); React state only drives what is shown.

const SHIPPING_FIELDS = ["firstName", "lastName", "street", "street2", "city", "state", "zip"];
const ADDRESS_FIELDS = ["street", "street2", "city", "state", "zip"];
const EMPTY_CONTACT = { email: "", phone: "", marketingOptIn: false };
const EMPTY_SHIPPING = Object.fromEntries(SHIPPING_FIELDS.map((name) => [name, ""]));
const CARD_FIELDS = [
  ["cardNumber", "card-number", "Card number"],
  ["expiry", "card-expiry", "Expiry"],
  ["cvc", "card-cvc", "Security code"],
];
const CARD_MISSING = { cardNumber: "Enter your card number.", expiry: "Enter the expiry date.", cvc: "Enter the security code." };
// Airwallex renders inside iframes, so styles are literal values, not CSS variables.
const CARD_STYLE = {
  base: { color: "#FBF8F4", fontFamily: "Barlow, system-ui, sans-serif", fontSize: "16px", "::placeholder": { color: "#7d858f" } },
  invalid: { color: "#E99495" },
};
// Airwallex client secrets expire 60 minutes after the PaymentIntent is created.
const SESSION_MAX_AGE_MS = 50 * 60 * 1000;
// A wallet button that has not reported `ready` by then stays hidden.
const WALLET_READY_TIMEOUT_MS = 10_000;
const ORDER_POLL_ATTEMPTS = 8;
const ORDER_POLL_INTERVAL_MS = 1500;
const DRAFT_SAVE_MS = 200;

const addressKey = (shipping) => JSON.stringify(ADDRESS_FIELDS.map((name) => String(shipping[name] ?? "").trim().toLowerCase()));
const orderUrl = (orderId) => `/checkout?order=${encodeURIComponent(orderId)}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// GA4-style item list; prices are the server's (quote line unit price).
const analyticsItems = (lines) => lines.map((line) => ({ item_id: line.sku, item_name: line.name, quantity: line.qty, price: line.unitCents / 100 }));

function payMethodChoices(config) {
  const choices = [];
  if (airwallexPayEnabled(config)) {
    choices.push({ id: "airwallex_pay", label: "Airwallex Pay", description: "Pay with your Airwallex balance. No card details stay on this page." });
  }
  choices.push({ id: "card", label: "Card", description: "Visa, Mastercard and other cards, encrypted by Airwallex." });
  if (paypalEnabled(config)) choices.push({ id: "paypal", label: "PayPal", description: "Check out with your PayPal account." });
  return choices;
}

function paymentCopy(config) {
  const pay = airwallexPayEnabled(config);
  const paypal = paypalEnabled(config);
  const card = "Card details are encrypted by Airwallex and never stored by APGO.";
  let intro = card;
  if (pay && paypal) intro = `Choose Airwallex Pay, PayPal, or a card. ${card}`;
  else if (pay) intro = `Pay with Airwallex Pay, or enter a card. ${card}`;
  else if (paypal) intro = `Pay with PayPal, or enter a card. ${card}`;
  return { intro, note: paypal ? "Secure checkout · Payments by Airwallex and PayPal" : "Secure checkout · Payments by Airwallex" };
}

export default function CheckoutPage() {
  const [view, setView] = useState("loading"); // loading | empty | unavailable | flow | order
  const [title, setTitle] = useState("Almost there.");
  const [message, setMessage] = useState(null);
  const [config, setConfig] = useState(null);
  const [step, setStepState] = useState("contact");
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT);
  const [shippingForm, setShippingForm] = useState(EMPTY_SHIPPING);
  const [method, setMethodState] = useState(null);
  const [errors, setErrors] = useState({});
  const [emailHint, setEmailHint] = useState("");
  const [addressCheck, setAddressCheckState] = useState(null);
  const [checkingAddress, setCheckingAddress] = useState(false);
  const [summary, setSummary] = useState(null);
  const [payMethod, setPayMethodState] = useState("card");
  const [paymentMessage, setPaymentMessage] = useState(null);
  const [placing, setPlacingState] = useState(false);
  const [walletsShown, setWalletsShown] = useState(() => new Set());
  const [paypalShown, setPaypalShown] = useState(false);
  const [order, setOrder] = useState(null);
  const [focusTick, setFocusTick] = useState(0);

  const ref = useRef(null);
  ref.current ??= {
    started: false,
    config: null,
    step: "contact",
    contactForm: EMPTY_CONTACT,
    shippingForm: EMPTY_SHIPPING,
    contact: { ...EMPTY_CONTACT }, // accepted contact details (phone as +1 digits)
    shipping: null, // accepted, checked address
    addressCheck: null, // { key, status, suggestion?, message?, review?, entered? } for the address in the form
    addressReview: {}, // the shopper's answer, sent with the payment: { choice } or { noUnit: true }
    method: null,
    payMethod: "card",
    quote: null, // the latest quote shown
    session: null,
    sessionKey: null,
    card: null,
    cardStatus: { cardNumber: false, expiry: false, cvc: false },
    wallets: { started: false, elements: {}, ready: new Set() },
    paypal: { mounted: false, order: null },
    airwallexPay: { element: null, mounted: false },
    placing: false,
    confirming: false,
    moved: false,
    draftTimer: 0,
    focus: null,
  };
  const s = ref.current;

  // ---------- small state helpers (state for the screen, `s` for the flows) ----------

  const setStep = (next) => {
    s.step = next;
    setStepState(next);
  };
  const setMethod = (next) => {
    s.method = next;
    setMethodState(next);
  };
  const setPayMethod = (next) => {
    s.payMethod = next;
    setPayMethodState(next);
  };
  const setPlacing = (next) => {
    s.placing = next;
    setPlacingState(next);
  };
  const setAddressCheck = (next) => {
    s.addressCheck = next;
    setAddressCheckState(next);
  };
  const showQuote = (quote) => {
    s.quote = quote;
    setSummary(quote);
  };
  const setFieldError = (name, text) => setErrors((all) => (all[name] === (text || "") ? all : { ...all, [name]: text || "" }));
  const showMessage = (tone, heading, body, action) => setMessage(tone ? { tone, heading, body, action } : null);
  const showPaymentMessage = (tone, heading, body) => setPaymentMessage(tone ? { tone, heading, body } : null);
  const showWallet = (id, shown) =>
    setWalletsShown((current) => {
      if (current.has(id) === shown) return current;
      const next = new Set(current);
      if (shown) next.add(id);
      else next.delete(id);
      return next;
    });
  // Focus after the next render (the element may be in a form that is about to be shown).
  const focusLater = (selector) => {
    s.focus = selector;
    setFocusTick((n) => n + 1);
  };

  useEffect(() => {
    if (!s.focus) return;
    const target = document.querySelector(s.focus);
    s.focus = null;
    target?.focus();
  }, [focusTick, s]);

  // ---------- draft (contact + shipping survive a refresh, M3) ----------

  const collectDraft = () => ({
    step: s.step,
    contact: { email: s.contactForm.email.trim(), phone: s.contactForm.phone.trim(), marketingOptIn: Boolean(s.contactForm.marketingOptIn) },
    shipping: Object.fromEntries(SHIPPING_FIELDS.map((name) => [name, String(s.shippingForm[name] ?? "").trim()])),
    method: s.method,
  });
  // Once the order page shows, the draft is gone for good: a save still waiting must not bring it back.
  const saveDraftNow = () => {
    clearTimeout(s.draftTimer);
    if (s.confirming) return;
    writeCheckoutDraft(collectDraft());
  };
  const scheduleDraftSave = () => {
    clearTimeout(s.draftTimer);
    s.draftTimer = setTimeout(saveDraftNow, DRAFT_SAVE_MS);
  };

  const updateContact = (patch, { save = true } = {}) => {
    s.contactForm = { ...s.contactForm, ...patch };
    setContactForm(s.contactForm);
    if (save) scheduleDraftSave();
  };
  const updateShipping = (patch, { save = true } = {}) => {
    s.shippingForm = { ...s.shippingForm, ...patch };
    setShippingForm(s.shippingForm);
    if (save) scheduleDraftSave();
  };

  function restoreDraft(loaded) {
    const draft = readCheckoutDraft();
    if (!draft) return null;
    updateContact(draft.contact, { save: false });
    if (draft.shipping) updateShipping(draft.shipping, { save: false });
    if (draft.method && loaded.shippingMethods.some((option) => option.id === draft.method)) setMethod(draft.method);
    if (draft.contact.email) {
      const { value } = checkContact(draft.contact);
      s.contact = { email: value.email, phone: value.phone, marketingOptIn: draft.contact.marketingOptIn };
    }
    const restored = resolveDraftStep(draft);
    if (restored === "payment" && shippingComplete(draft.shipping)) s.shipping = { ...draft.shipping };
    return restored;
  }

  // ---------- steps ----------

  // initial: the step restored when the page opens. Any other call is the shopper moving on, which that one must
  // never undo (it runs only after the first quote, and on a slow connection the shopper may already be on step 2).
  function goTo(next, { focus = true, initial = false } = {}) {
    if (!initial) s.moved = true;
    setStep(next);
    if (focus) focusLater(`[data-step="${next}"] h2`);
    saveDraftNow();
  }

  async function refreshQuote() {
    const body = { items: cartItems(), method: s.method ?? undefined, state: s.shipping?.state };
    try {
      const quote = await api("/api/cart/quote", { method: "POST", body });
      showQuote(quote);
      return quote;
    } catch (error) {
      showMessage("warning", "Pricing unavailable", error.message);
      return null;
    }
  }

  function submitContact(event) {
    event.preventDefault();
    const form = s.contactForm;
    const { value, errors: found } = checkContact({ email: form.email, phone: form.phone });
    for (const name of ["email", "phone"]) setFieldError(name, found[name] ?? "");
    setEmailHint(suggestEmail(form.email) || "");
    const firstInvalid = ["email", "phone"].find((name) => found[name]);
    if (firstInvalid) return document.getElementById(firstInvalid)?.focus();
    updateContact({ phone: formatUsPhone(value.phone) }, { save: false });
    s.contact = { email: value.email, phone: value.phone, marketingOptIn: form.marketingOptIn };
    goTo("shipping");
  }

  // ---------- address check (M3 §4) ----------
  //
  // Before the payment step the Worker checks the address (POST /api/checkout/address). It may come back with a
  // corrected spelling to choose, a missing apartment number to add or confirm, or an address that cannot be delivered.
  // The Worker checks again when the payment is created, so this step is for the shopper's benefit only.

  function resolveAddress(shipping, review) {
    setAddressCheck({ key: addressKey(shipping), status: "resolved", review });
    return { shipping, review };
  }

  // Returns { shipping, review } to continue with, or null while the shopper has something to fix or answer.
  async function reviewAddress(shipping) {
    const key = addressKey(shipping);
    const known = s.addressCheck?.key === key ? s.addressCheck : null;
    const answers = document.querySelector('[data-step="shipping"]')?.elements;
    if (known?.status === "resolved") return { shipping, review: known.review };
    if (known?.status === "suggest") {
      if (answers?.addressChoice?.value === "original") return resolveAddress(shipping, { choice: "original" });
      const corrected = { ...shipping, ...known.suggestion };
      updateShipping(Object.fromEntries(ADDRESS_FIELDS.map((name) => [name, corrected[name]])), { save: false });
      return resolveAddress(corrected, { choice: "suggested" });
    }
    if (known?.status === "missing_unit") {
      if (answers?.noUnit?.checked) return resolveAddress(shipping, { noUnit: true });
      document.getElementById("street2")?.focus();
      return null;
    }
    if (known?.status === "undeliverable") {
      document.getElementById("street")?.focus();
      return null;
    }

    let check;
    try {
      check = await api("/api/checkout/address", { method: "POST", body: { shipping } });
    } catch (error) {
      if (error.status === 400 && SHIPPING_FIELDS.includes(error.field)) {
        setFieldError(error.field, error.message);
        document.getElementById(error.field)?.focus();
        return null;
      }
      check = { status: "unverified" }; // no answer: the payment step checks again
    }
    if (check.status === "po_box") {
      setFieldError("street", check.message);
      document.getElementById("street")?.focus();
      return null;
    }
    setAddressCheck({ key, ...check, entered: shipping });
    if (check.status === "suggest") {
      focusLater("[data-address-check] input");
      return null;
    }
    if (check.status === "missing_unit") {
      document.getElementById("street2")?.focus();
      return null;
    }
    if (check.status === "undeliverable") return null;
    return resolveAddress(shipping, {});
  }

  function changeShipping(name, value) {
    updateShipping({ [name]: value });
    // The address changed: an earlier check (and the shopper's answer to it) no longer applies.
    if (ADDRESS_FIELDS.includes(name) && s.addressCheck && addressKey(s.shippingForm) !== s.addressCheck.key) setAddressCheck(null);
  }

  async function submitShipping(event) {
    event.preventDefault();
    const { value: shipping, errors: found } = checkShipping({ ...s.shippingForm });
    for (const name of SHIPPING_FIELDS) setFieldError(name, found[name] ?? "");
    const firstInvalid = SHIPPING_FIELDS.find((name) => found[name]);
    if (firstInvalid) return document.getElementById(firstInvalid)?.focus();

    setCheckingAddress(true);
    let reviewed;
    try {
      reviewed = await reviewAddress(shipping);
    } finally {
      setCheckingAddress(false);
    }
    if (!reviewed) return;
    s.shipping = reviewed.shipping;
    s.addressReview = reviewed.review;
    saveDraftNow();
    const quote = await refreshQuote();
    if (!quote) return;
    track("add_shipping_info", { shipping_tier: s.method, value: quote.totalCents / 100, currency: quote.currency });
    goTo("payment");
  }

  function chooseMethod(id) {
    setMethod(id);
    saveDraftNow();
    refreshQuote();
  }

  // The Worker refused the contact details or the address when the payment was being created (it checks everything
  // again): back to that step with the message on the field.
  function returnToFix(error) {
    if (error?.status !== 400 || !error.field) return false;
    const contactField = ["email", "phone"].includes(error.field);
    if (!contactField && !SHIPPING_FIELDS.includes(error.field)) return false;
    s.session = null;
    setAddressCheck(null);
    setPlacing(false);
    goTo(contactField ? "contact" : "shipping");
    setFieldError(error.field, error.message);
    focusLater(`#${error.field}`);
    return true;
  }

  // ---------- checkout session: order + PaymentIntent, shared by every Airwallex method ----------

  async function ensureSession() {
    const payload = { items: cartItems(), contact: s.contact, shipping: s.shipping, method: s.method, addressReview: s.addressReview };
    // The cache key is the order content only: attribution (cookies, URL) must never force a new PaymentIntent.
    const key = JSON.stringify(payload);
    const fresh = s.session && s.sessionKey === key && Date.now() - s.session.createdAt < SESSION_MAX_AGE_MS;
    if (fresh) return s.session;

    const session = await api("/api/checkout/session", { method: "POST", body: { ...payload, checkoutId: readCheckoutId(), attribution: readAttribution() } });
    storeCheckoutId(session.orderId);
    // This checkout was already paid (another tab, an earlier try) or its payment is processing: show the order.
    if (session.settled) {
      s.placing = true;
      window.history.replaceState(null, "", orderUrl(session.orderId));
      await showOrder(session.orderId);
      throw Object.assign(new Error("This checkout is already paid."), { settled: true });
    }
    s.session = { ...session, createdAt: Date.now() };
    s.sessionKey = key;
    showQuote(session.quote);
    // The order (merchant_order_id) now exists: this is the InitiateCheckout moment for Meta.
    track("checkout_session_created", {
      order_id: session.orderId,
      value: session.quote.totalCents / 100,
      currency: session.quote.currency,
      items: analyticsItems(session.quote.lines),
    });
    return s.session;
  }

  // ---------- Airwallex card fields ----------

  async function mountCardElements() {
    if (s.card) return s.card.ready;
    s.card = {};
    s.card.ready = (async () => {
      try {
        const sdk = await loadAirwallex(s.config.airwallexEnv);
        for (const [type, containerId] of CARD_FIELDS) {
          const element = await sdk.createElement(type, { style: CARD_STYLE });
          element.mount(containerId);
          element.on("change", (event) => {
            // The docs name the flag `completed`; the live SDK (Sep 2026) sends `complete`.
            const { completed, complete, error } = event.detail ?? {};
            s.cardStatus[type] = Boolean(completed ?? complete);
            setFieldError(type, error?.message ?? "");
          });
          s.card[type] = element;
        }
      } catch (error) {
        s.card = null;
        showPaymentMessage("warning", "Card form unavailable", "We couldn't load the secure card form. Refresh the page to try again.");
        throw error;
      }
    })();
    return s.card.ready.catch(() => {});
  }

  // ---------- Apple Pay / Google Pay ----------
  //
  // Probe first, pay later. On the payment step each wallet element is created and mounted into a collapsed slot
  // WITHOUT a PaymentIntent (Airwallex.js lets intent_id / client_secret be supplied later through update()). Only when
  // an element reports `ready` (this device/wallet can really pay) is the session created (order + PaymentIntent, the
  // same one the card form reuses), handed to the element with update(), and the button revealed. Shoppers without a
  // wallet never create an extra order, and every failure leaves the button hidden and the card form untouched.
  // `wallets.eagerSession` (WALLET_EAGER_SESSION) creates the session first instead.

  async function onPaymentSucceeded() {
    const orderId = s.session?.orderId;
    if (!orderId) return;
    // Keep the cart until the server confirms settlement.
    s.placing = true;
    window.history.replaceState(null, "", orderUrl(orderId));
    await showOrder(orderId);
  }

  // Makes sure a session exists and gives it to every wallet element that is ready.
  async function refreshWalletSession() {
    const session = await ensureSession();
    for (const id of s.wallets.ready) await s.wallets.elements[id]?.update?.(walletUpdate(id, session, s.config));
    return session;
  }

  function attachWalletEvents(id, element) {
    const timer = setTimeout(() => showWallet(id, false), WALLET_READY_TIMEOUT_MS);
    element.on("ready", async () => {
      clearTimeout(timer);
      s.wallets.ready.add(id);
      try {
        await refreshWalletSession();
        showWallet(id, true);
      } catch {
        s.wallets.ready.delete(id);
        showWallet(id, false);
      }
    });
    element.on("click", () => {
      const quote = s.session?.quote;
      if (quote) track("add_payment_info", { payment_type: id === "applePay" ? "apple_pay" : "google_pay", value: quote.totalCents / 100, currency: quote.currency });
      showPaymentMessage(null);
    });
    element.on("success", () => onPaymentSucceeded());
    element.on("cancel", () => showPaymentMessage(null));
    element.on("error", () => {
      // The intent may be expired or used: drop it so the next tap uses a fresh one.
      s.session = null;
      refreshWalletSession().catch(() => {});
      showPaymentMessage("warning", "Payment not completed", "The wallet payment didn't go through. Try again or pay by card.");
    });
  }

  async function syncWallets() {
    const candidates = candidateWallets(s.config);
    if (candidates.length === 0 || !s.contact.email || !s.shipping) return;
    try {
      if (s.wallets.started) {
        // Back on this step after editing shipping: re-arm ready wallets with the new session.
        if (s.wallets.ready.size) await refreshWalletSession();
        return;
      }
      s.wallets.started = true;
      const eager = s.config.wallets.eagerSession ? await ensureSession() : null;
      const source = { session: eager, quote: s.quote };
      const sdk = await loadAirwallex(s.config.airwallexEnv);
      for (const wallet of WALLETS.filter((w) => candidates.includes(w.id))) {
        try {
          const element = await sdk.createElement(wallet.element, walletOptions(wallet.id, source, s.config, window.location.origin));
          if (!element) continue;
          element.mount(wallet.containerId);
          s.wallets.elements[wallet.id] = element;
          attachWalletEvents(wallet.id, element);
        } catch {
          showWallet(wallet.id, false);
        }
      }
    } catch {
      // No wallet buttons; the card form is unaffected.
      s.wallets.started = false;
    }
  }

  // ---------- Airwallex Pay ----------

  async function mountAirwallexPay() {
    if (!airwallexPayEnabled(s.config) || !s.contact.email || !s.shipping) return;
    if (s.airwallexPay.mounted) {
      try {
        const session = await ensureSession();
        await s.airwallexPay.element?.update?.(dropInUpdate(session));
      } catch {
        s.session = null;
      }
      return;
    }
    if (!document.getElementById(AIRWALLEX_PAY_CONTAINER_ID)) return;
    try {
      const session = await ensureSession();
      track("add_payment_info", { payment_type: "airwallex_pay", value: session.quote.totalCents / 100, currency: session.quote.currency });
      const sdk = await loadAirwallex(s.config.airwallexEnv);
      const element = await sdk.createElement(
        AIRWALLEX_PAY_ELEMENT,
        dropInOptions(session, { email: s.contact.email, shipping: s.shipping, countryCode: s.config.wallets?.countryCode }),
      );
      if (!element) throw new Error("element_missing");
      element.mount(AIRWALLEX_PAY_CONTAINER_ID);
      element.on("success", () => onPaymentSucceeded());
      element.on("error", (event) => {
        const detail = event?.detail?.error;
        s.session = null;
        s.airwallexPay.mounted = false;
        s.airwallexPay.element = null;
        showPaymentMessage(
          "warning",
          "Payment not completed",
          detail?.message && detail.code !== "UNKNOWN_ERROR" ? detail.message : "Airwallex Pay didn't go through. Try again or choose another method.",
        );
      });
      s.airwallexPay.element = element;
      s.airwallexPay.mounted = true;
    } catch (error) {
      s.airwallexPay.mounted = false;
      s.airwallexPay.element = null;
      if (returnToFix(error)) return;
      showPaymentMessage("warning", "Airwallex Pay unavailable", "We couldn't load Airwallex Pay. Choose card or another method.");
      setPayMethod("card");
    }
  }

  // ---------- PayPal (commerce/docs/paypal.md) ----------

  async function createPaypalOrder() {
    if (!s.contact?.email) throw new Error("Enter a valid email address.");
    const data = await api("/api/checkout/paypal/order", {
      method: "POST",
      body: paypalOrderPayload({
        items: cartItems(),
        contact: s.contact,
        shipping: s.shipping,
        method: s.method,
        addressReview: s.addressReview,
        attribution: readAttribution(),
        checkoutId: readCheckoutId(),
      }),
    });
    storeCheckoutId(data.orderId);
    storePaypalOrder(data);
    s.paypal.order = data;
    if (data.quote) showQuote(data.quote);
    // Same InitiateCheckout moment as the card session: eventID ic_<orderId> (data.eventIds.initiateCheckout).
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
      // The order page may send a second dataLayer event; Meta still dedupes on eventID.
    }
    track("purchase", { transaction_id: orderId, value: quote.totalCents / 100, currency: quote.currency, items: analyticsItems(quote.lines) });
    return true;
  }

  async function onPaypalApprove(data) {
    const result = await api("/api/checkout/paypal/capture", { method: "POST", body: { paypalOrderId: data.orderID } });
    // Only `paid` is a Purchase. `review` is a captured but unverified order: the order page, never a Purchase.
    if (result.status === "paid") {
      firePaidPurchase(result.orderId, s.paypal.order?.quote ?? readPaypalOrder()?.quote);
      s.placing = true;
      clearCart();
      window.history.replaceState(null, "", orderUrl(result.orderId));
      await showOrder(result.orderId);
      return;
    }
    if (result.status === "review" && result.orderId) {
      window.history.replaceState(null, "", orderUrl(result.orderId));
      await showOrder(result.orderId);
      return;
    }
    throw new Error(result.error?.message || "Payment could not be completed.");
  }

  async function mountPaypalButtons() {
    if (!paypalEnabled(s.config) || !s.contact.email || s.payMethod !== "paypal") {
      setPaypalShown(false);
      return;
    }
    if (s.paypal.mounted) {
      setPaypalShown(true);
      return;
    }
    if (!document.getElementById("paypal-button")) return;
    try {
      setPaypalShown(true);
      const paypal = await loadPaypal(paypalSdkUrl(s.config.paypal.clientId));
      if (s.payMethod !== "paypal") {
        setPaypalShown(false);
        return;
      }
      await paypal
        .Buttons({
          style: { layout: "vertical", color: "gold", shape: "rect", label: "paypal", height: 48 },
          createOrder: async () => {
            showPaymentMessage(null);
            setPlacing(true);
            try {
              return await createPaypalOrder();
            } catch (error) {
              setPlacing(false);
              if (returnToFix(error)) throw error;
              showPaymentMessage("warning", "PayPal unavailable", error.message || "Could not start PayPal.");
              throw error;
            }
          },
          onApprove: async (data) => {
            try {
              await onPaypalApprove(data);
            } catch (error) {
              setPlacing(false);
              // Paid another way meanwhile (another tab): PayPal was not charged; show the order instead.
              const orderId = s.paypal.order?.orderId ?? readPaypalOrder()?.orderId;
              if (error.code === "checkout_closed" && orderId) {
                window.history.replaceState(null, "", orderUrl(orderId));
                await showOrder(orderId);
                return;
              }
              showPaymentMessage("warning", "Payment not completed", error.message || "Payment could not be completed.");
            }
          },
          onCancel: () => {
            setPlacing(false);
            showPaymentMessage("info", "PayPal checkout cancelled", "No payment was taken. You can try PayPal again or pay by card.");
          },
          onError: () => {
            setPlacing(false);
            showPaymentMessage("warning", "PayPal unavailable", "PayPal couldn't complete checkout. Try again or pay by card.");
          },
        })
        .render("#paypal-button");
      s.paypal.mounted = true;
      setPaypalShown(s.payMethod === "paypal");
    } catch {
      s.paypal.mounted = false;
      setPaypalShown(false);
    }
  }

  // Redirect fallback: the Worker registered /checkout?order=<id>&paypal=return. Capture here if the popup's onApprove
  // did not run; GET /api/orders/:id also captures an approved PayPal order with a usable US address.
  async function handlePaypalReturn(orderId) {
    try {
      const result = await api("/api/checkout/paypal/capture", { method: "POST", body: { orderId } });
      if (result.status === "paid") firePaidPurchase(result.orderId, readPaypalOrder()?.quote);
    } catch {
      // The order page below still settles when the order is already captured or still approved.
    }
    window.history.replaceState(null, "", orderUrl(orderId));
    await showOrder(orderId);
  }

  // ---------- card: place order ----------

  async function placeOrder(event) {
    event.preventDefault();
    if (s.placing || s.payMethod !== "card") return;
    showPaymentMessage(null);
    if (!s.card?.cardNumber) {
      showPaymentMessage("warning", "Card form unavailable", "The secure card form is still loading. Try again in a moment.");
      return;
    }
    const missing = Object.entries(s.cardStatus).filter(([, done]) => !done).map(([type]) => type);
    if (missing.length) {
      for (const type of missing) setFieldError(type, CARD_MISSING[type]);
      return;
    }

    setPlacing(true);
    try {
      const session = await ensureSession();
      track("add_payment_info", { payment_type: "card", value: session.quote.totalCents / 100, currency: session.quote.currency });
      await s.card.cardNumber.confirm({ intent_id: session.intent.id, client_secret: session.intent.clientSecret });
      window.history.replaceState(null, "", orderUrl(session.orderId));
      await showOrder(session.orderId);
    } catch (error) {
      if (returnToFix(error)) return;
      showPaymentMessage("warning", "Payment not completed", "Your payment wasn't completed. Check your card details or try another payment method.");
      setPlacing(false);
    }
  }

  // ---------- the order page ----------

  async function fetchOrderUntilSettled(orderId) {
    let result = null;
    for (let attempt = 0; attempt < ORDER_POLL_ATTEMPTS; attempt += 1) {
      result = await api(`/api/orders/${encodeURIComponent(orderId)}`);
      const failedAttempt = (result.paymentStatus === "REQUIRES_PAYMENT_METHOD" && attempt > 0) || result.paymentStatus === "CANCELLED";
      if (result.status !== "pending" || failedAttempt) return result;
      await sleep(ORDER_POLL_INTERVAL_MS);
    }
    return result;
  }

  function trackPurchaseOnce(paid) {
    const key = `apgo_us_purchase_tracked_${paid.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Without storage a refresh may send it again; acceptable for analytics.
    }
    // GET /api/orders/:id lines carry lineCents but no unit price, so the unit price is derived.
    const items = (paid.lines ?? []).map((line) => ({ item_id: line.sku, item_name: line.name, quantity: line.qty, price: line.lineCents / line.qty / 100 }));
    track("purchase", { transaction_id: paid.id, value: paid.totalCents / 100, currency: paid.currency, ...(items.length ? { items } : {}) });
  }

  async function showOrder(orderId) {
    s.confirming = true;
    clearTimeout(s.draftTimer);
    setView("order");
    setOrder({ kind: "pending" });
    setTitle("Order placed.");

    let result;
    try {
      result = await fetchOrderUntilSettled(orderId);
    } catch (error) {
      setTitle("Order status");
      setOrder({ kind: "error", title: error.status === 404 ? "Order not found" : "Status unavailable", body: error.message });
      return;
    }
    setSummary(result);
    if (result.status === "paid") {
      clearCheckoutDraft();
      clearCheckoutId();
      clearCart();
      trackPurchaseOnce(result);
      setOrder({ kind: "paid", order: result });
    } else if (result.status === "review") {
      clearCheckoutDraft();
      clearCheckoutId();
      setOrder({ kind: "review", order: result });
    } else if (["cancelled", "expired"].includes(result.status) || ["REQUIRES_PAYMENT_METHOD", "CANCELLED"].includes(result.paymentStatus)) {
      setTitle("Payment not completed.");
      setOrder({ kind: "failed", order: result });
    } else {
      setOrder({ kind: "processing", order: result });
    }
  }

  // ---------- start ----------

  async function start() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("order");
    const paypalFlag = params.get("paypal");
    if (paypalFlag === "return" && orderId) return handlePaypalReturn(orderId);
    if (orderId && paypalFlag !== "cancel") return showOrder(orderId);

    const paypalCancelled = paypalFlag === "cancel";
    if (paypalCancelled) window.history.replaceState(null, "", "/checkout");

    if (cartItems().length === 0) {
      setTitle("Your cart is empty.");
      showMessage("info", "Nothing to check out", "Add a coating to your cart first.", { href: "/products", text: "Choose Dry or Wet →" });
      setView("empty");
      return;
    }

    let loaded;
    try {
      loaded = await fetchStoreConfig();
    } catch (error) {
      showMessage("warning", "Checkout unavailable", error.message);
      setView("unavailable");
      return;
    }
    s.config = loaded;
    setConfig(loaded);
    setMethod(loaded.defaultShippingMethod);
    setPayMethod("card");
    setView("flow");
    const restored = restoreDraft(loaded);
    if (paypalCancelled) showMessage("info", "PayPal checkout cancelled", "No payment was taken. Continue below or pay by card.");

    const quote = await refreshQuote();
    if (quote) track("begin_checkout", { value: quote.subtotalCents / 100, currency: quote.currency, items: quote.lines.length });
    if (!s.moved) goTo(restored ?? "contact", { focus: false, initial: true });
  }

  useEffect(() => {
    if (s.started) return;
    s.started = true;
    start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The payment step was entered: card fields, the method in use, wallets. Runs after the step is on screen, so the
  // providers mount into visible containers.
  useEffect(() => {
    if (view !== "flow" || step !== "payment") return;
    mountCardElements();
    if (!payMethodChoices(s.config).some((choice) => choice.id === s.payMethod)) setPayMethod("card");
    syncWallets();
  }, [view, step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view !== "flow" || step !== "payment") return;
    if (payMethod === "airwallex_pay") mountAirwallexPay();
    if (payMethod === "paypal") mountPaypalButtons();
    else setPaypalShown(false);
  }, [view, step, payMethod]); // eslint-disable-line react-hooks/exhaustive-deps

  // The cart changed in another tab: prices and the pending session are stale.
  useEffect(() => {
    const onChange = () => {
      if (s.placing || s.confirming || !s.config) return;
      s.session = null;
      if (cartItems().length === 0) window.location.reload();
      else refreshQuote();
    };
    const onStorage = (event) => {
      if (event.key === null || event.key === CART_KEY) onChange();
    };
    window.addEventListener(CART_UPDATED, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CART_UPDATED, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus inside an Airwallex iframe makes the iframe the active element here: enough to give its box the same focus
  // border as the other inputs.
  useEffect(() => {
    const sync = () => {
      for (const box of document.querySelectorAll(".card-input")) box.classList.toggle("is-focused", box.contains(document.activeElement));
    };
    const later = () => setTimeout(sync);
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", later);
    return () => {
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", later);
    };
  }, []);

  // ---------- screen ----------

  const choices = payMethodChoices(config);
  const copy = paymentCopy(config);
  const estimate = isEstimate(config);
  const stepIndex = STEPS.findIndex(([id]) => id === step);
  const contactError = (name) => errors[name] || "";

  return (
    <main className="shop-main" id="main">
      <div className="shop-intro">
        <p className="eyebrow">Checkout</p>
        <h1 className="heading-guide-h1" data-checkout-title="">{title}</h1>
      </div>

      <div data-checkout-message="" aria-live="polite">
        {message && (
          <Notice tone={message.tone} title={message.heading} after={message.action && <span><a href={message.action.href}>{message.action.text}</a></span>}>
            {message.body}
          </Notice>
        )}
      </div>

      <div className="shop-grid" data-checkout-grid="">
        <div className="stack" data-checkout-flow="" hidden={view !== "flow"}>
          <ol className="steps">
            {STEPS.map(([id, label], i) => (
              <li key={id} data-step-indicator={id} className={i < stepIndex ? "is-done" : undefined} aria-current={i === stepIndex ? "step" : undefined}>
                <span className="steps__dot" aria-hidden="true">{i < stepIndex ? "✓" : String(i + 1)}</span>
                {label}
              </li>
            ))}
          </ol>

          <form className="stack" data-step="contact" noValidate hidden={step !== "contact"} onSubmit={submitContact}>
            <div className="shop-intro">
              <h2 className="heading-guide-h2" tabIndex={-1}>Contact</h2>
              <p className="body body--sm">We&apos;ll only use this for order updates.</p>
            </div>
            <Field
              name="email"
              label="Email"
              error={contactError("email")}
              after={
                <p className="field__hint" data-email-suggestion="" hidden={!emailHint}>
                  {emailHint && (
                    <>
                      Did you mean{" "}
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => {
                          updateContact({ email: emailHint });
                          setEmailHint("");
                          document.getElementById("email")?.focus();
                        }}
                      >
                        {emailHint}
                      </button>
                      ?
                    </>
                  )}
                </p>
              }
            >
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={contactForm.email}
                aria-invalid={contactError("email") ? "true" : "false"}
                aria-describedby={describedBy("email", contactError("email"))}
                onChange={(event) => updateContact({ email: event.target.value })}
                onBlur={(event) => setEmailHint(suggestEmail(event.target.value) || "")}
              />
            </Field>
            <Field name="phone" label="Phone" error={contactError("phone")}>
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                required
                value={contactForm.phone}
                aria-invalid={contactError("phone") ? "true" : "false"}
                aria-describedby={describedBy("phone", contactError("phone"), "phone-hint")}
                onChange={(event) => updateContact({ phone: event.target.value })}
              />
              <span className="field__hint" id="phone-hint">For delivery questions. US numbers only.</span>
            </Field>
            <CheckOption
              type="checkbox"
              name="marketingOptIn"
              checked={contactForm.marketingOptIn}
              onChange={(event) => updateContact({ marketingOptIn: event.target.checked })}
              label="Email me when new application guides go live"
            />
            <div className="actions">
              <button className="btn" type="submit">Continue to shipping <span aria-hidden="true">→</span></button>
            </div>
          </form>

          <form className="stack" data-step="shipping" noValidate hidden={step !== "shipping"} onSubmit={submitShipping}>
            <div className="shop-intro">
              <h2 className="heading-guide-h2" tabIndex={-1}>Shipping address</h2>
              <p className="body body--sm">We ship to the 48 contiguous states and DC. No PO boxes or military addresses.</p>
            </div>
            <div className="row-2">
              <ShippingInput name="firstName" label="First name" autoComplete="shipping given-name" form={shippingForm} errors={errors} onChange={changeShipping} />
              <ShippingInput name="lastName" label="Last name" autoComplete="shipping family-name" form={shippingForm} errors={errors} onChange={changeShipping} />
            </div>
            <ShippingInput name="street" label="Street address" autoComplete="shipping address-line1" placeholder="123 Main St" form={shippingForm} errors={errors} onChange={changeShipping} />
            <ShippingInput name="street2" label="Apt, suite, unit" required={false} autoComplete="shipping address-line2" form={shippingForm} errors={errors} onChange={changeShipping} />
            <div className="row-2">
              <ShippingInput name="city" label="City" autoComplete="shipping address-level2" form={shippingForm} errors={errors} onChange={changeShipping} />
              <Field name="state" label="State" error={errors.state || ""}>
                <div className="select">
                  <select
                    id="state"
                    name="state"
                    autoComplete="shipping address-level1"
                    required
                    data-state-select=""
                    value={shippingForm.state}
                    aria-invalid={errors.state ? "true" : "false"}
                    aria-describedby={describedBy("state", errors.state)}
                    onChange={(event) => changeShipping("state", event.target.value)}
                  >
                    <option value="">Select</option>
                    {config?.states.map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
                  </select>
                </div>
              </Field>
              <ShippingInput name="zip" label="ZIP code" autoComplete="shipping postal-code" inputMode="numeric" maxLength={10} form={shippingForm} errors={errors} onChange={changeShipping} />
            </div>
            <fieldset>
              <legend className="label label--xs">Shipping method</legend>
              <div className="ship-options" data-ship-options="">
                {config?.shippingMethods.map((option) => (
                  <div key={option.id} className="ship-option">
                    <CheckOption
                      type="radio"
                      name="method"
                      value={option.id}
                      checked={method === option.id}
                      onChange={() => chooseMethod(option.id)}
                      label={option.label}
                      description={<Estimate estimate={estimate}>{`${option.detail} · ${option.amountCents ? money(option.amountCents) : "Free"}`}</Estimate>}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
            <div className="address-check" data-address-check="" aria-live="polite">
              <AddressCheck key={addressCheck ? `${addressCheck.key}:${addressCheck.status}` : "none"} check={addressCheck} />
            </div>
            <div className="actions">
              <button className="btn" type="submit" disabled={checkingAddress}>Continue to payment <span aria-hidden="true">→</span></button>
              <button className="btn btn--text" type="button" data-back="contact" onClick={() => goTo("contact")}>← Back</button>
            </div>
          </form>

          <form className="stack" data-step="payment" noValidate hidden={step !== "payment"} onSubmit={placeOrder}>
            <div className="shop-intro">
              <h2 className="heading-guide-h2" tabIndex={-1}>Payment</h2>
              <p className="body body--sm" data-payment-intro="">{copy.intro}</p>
            </div>
            {/* Apple / Google Pay stay collapsed unless ready. Card / Airwallex Pay / PayPal are choose-one. */}
            <div className={`wallets${walletsShown.size ? " is-active" : ""}`} data-wallets="" role="group" aria-label="Express payment">
              {WALLETS.map((wallet) => (
                <div key={wallet.id} className={`wallet-slot${walletsShown.has(wallet.id) ? " is-ready" : ""}`} data-wallet-slot={wallet.id}>
                  <div id={wallet.containerId} />
                </div>
              ))}
              <p className="wallets__divider label label--xs" data-wallet-divider="" hidden={!walletsShown.size}><span>Or pay another way</span></p>
            </div>
            <fieldset data-pay-methods="" hidden={choices.length < 2}>
              <legend className="label label--xs">Payment method</legend>
              <div className="ship-options pay-options" data-pay-options="">
                {choices.length >= 2 &&
                  choices.map((choice) => (
                    <div key={choice.id} className="ship-option">
                      <CheckOption
                        type="radio"
                        name="payMethod"
                        value={choice.id}
                        checked={payMethod === choice.id}
                        onChange={() => setPayMethod(choice.id)}
                        label={choice.label}
                        description={choice.description}
                      />
                    </div>
                  ))}
              </div>
            </fieldset>
            <div data-pay-panel="airwallex_pay" hidden={payMethod !== "airwallex_pay"}>
              <div className="airwallex-pay" id={AIRWALLEX_PAY_CONTAINER_ID} />
            </div>
            <div data-pay-panel="paypal" hidden={payMethod !== "paypal" || !paypalShown}>
              <div className="paypal" data-paypal="" hidden={!paypalShown}>
                <div id="paypal-button" />
              </div>
            </div>
            <div data-pay-panel="card" hidden={payMethod !== "card"}>
              <CardField name="cardNumber" label="Card number" containerId="card-number" error={errors.cardNumber || ""} />
              <div className="row-2">
                <CardField name="expiry" label="Expiry" containerId="card-expiry" error={errors.expiry || ""} />
                <CardField name="cvc" label="Security code" containerId="card-cvc" error={errors.cvc || ""} />
              </div>
            </div>
            <div data-payment-message="" aria-live="assertive">
              {paymentMessage && <Notice tone={paymentMessage.tone} title={paymentMessage.heading}>{paymentMessage.body}</Notice>}
            </div>
            <div className="notice notice--info" role="note">
              <span className="notice__title">Before you order</span>
              <span className="notice__body">Use only as directed. Read and follow the current product label before use.</span>
            </div>
            <div className="actions">
              <button className="btn" type="submit" data-place-order="" disabled={placing} hidden={payMethod !== "card"}>
                {placing ? "Processing…" : summary ? `Place order · ${money(summary.totalCents)}` : <>Place order <span aria-hidden="true">→</span></>}
              </button>
              <button className="btn btn--text" type="button" data-back="shipping" onClick={() => goTo("shipping")}>← Back</button>
            </div>
          </form>
        </div>

        <section className="stack" data-confirmation="" hidden={view !== "order"} aria-live="polite">
          {order && <OrderStatus state={order} />}
        </section>

        <OrderSummary source={summary} estimate={estimate} note={copy.note} />
      </div>
    </main>
  );
}

function ShippingInput({ name, label, form, errors, onChange, required = true, ...input }) {
  const error = errors[name] || "";
  return (
    <Field name={name} label={label} error={error} required={required}>
      <input
        id={name}
        name={name}
        required={required}
        value={form[name]}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={describedBy(name, error)}
        onChange={(event) => onChange(name, event.target.value)}
        {...input}
      />
    </Field>
  );
}
