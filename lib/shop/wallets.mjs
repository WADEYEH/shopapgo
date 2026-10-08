// Apple Pay / Google Pay helpers for checkout. DOM-free on purpose so node:test can
// import it. The page (components/shop/checkout/CheckoutPage.js) owns mounting; this file owns the decisions:
// which wallets are worth trying on this device, and the exact Airwallex.js options.
//
// Airwallex.js elements used (docs: developer docs "Apple Pay button" / "Google Pay
// button", Oct 2026):
//   createElement("applePayButton",  { intent_id, client_secret, countryCode, amount, ... })
//   createElement("googlePayButton", { intent_id, client_secret, countryCode, amount, merchantInfo, origin, ... })
// The element opens the wallet sheet and confirms the PaymentIntent itself; the page
// only listens to `ready` / `success` / `error` / `cancel`.

export const WALLETS = [
  { id: "applePay", element: "applePayButton", label: "Apple Pay", containerId: "wallet-applepay" },
  { id: "googlePay", element: "googlePayButton", label: "Google Pay", containerId: "wallet-googlepay" },
];

// Apple Pay: only where the browser exposes Apple Pay JS AND the device can pay.
export function detectApplePay(win = globalThis.window) {
  try {
    const session = win?.ApplePaySession;
    return Boolean(session && typeof session.canMakePayments === "function" && session.canMakePayments());
  } catch {
    return false;
  }
}

// Google Pay has no synchronous "can this device pay" check (Airwallex asks Google
// inside the element and only fires `ready` when it can), so the pre-check is just
// "secure context" (required by Google Pay). The real gate is the `ready` event.
export function detectGooglePay(win = globalThis.window) {
  return Boolean(win) && win.isSecureContext !== false;
}

// Which wallets to try: the operator allows it (store config) and the device passes
// the cheap pre-check. Anything else never creates an element.
export function candidateWallets(config, win = globalThis.window) {
  const allowed = config?.wallets ?? {};
  const list = [];
  if (allowed.applePay && detectApplePay(win)) list.push("applePay");
  if (allowed.googlePay && detectGooglePay(win)) list.push("googlePay");
  return list;
}

// PaymentIntent amount as Airwallex.js expects it: the intent's major-unit amount as a string.
export const walletAmount = (totalCents, currency) => ({
  value: String(Number((totalCents / 100).toFixed(2))),
  currency,
});

// `session` is optional: Airwallex.js allows intent_id / client_secret to be omitted
// at creation and supplied later with update(), which lets us probe the device
// without creating an order. `quote` is the on-screen server quote.
function common({ session, quote }, config) {
  const priced = session?.quote ?? quote;
  return {
    ...(session ? { intent_id: session.intent.id, client_secret: session.intent.clientSecret } : {}),
    countryCode: config.wallets.countryCode || "US",
    amount: walletAmount(priced.totalCents, priced.currency),
    autoCapture: config.wallets.autoCapture !== false,
  };
}

export function walletOptions(id, source, config, origin) {
  const name = config.wallets.merchantName || "APGO";
  if (id === "applePay") {
    return {
      ...common(source, config),
      totalPriceLabel: name,
      buttonType: "buy",
      buttonColor: "white",
    };
  }
  if (id === "googlePay") {
    return {
      ...common(source, config),
      origin,
      merchantInfo: { merchantName: name },
      buttonType: "buy",
      buttonColor: "white",
      buttonSizeMode: "fill",
    };
  }
  throw new Error(`unknown wallet: ${id}`);
}

// Hands a replacement session to a mounted element (the shopper changed shipping or
// the old PaymentIntent was used/expired). Airwallex.js supports this via update().
export function walletUpdate(id, session, config) {
  return {
    intent_id: session.intent.id,
    client_secret: session.intent.clientSecret,
    amount: walletAmount(session.quote.totalCents, session.quote.currency),
  };
}
