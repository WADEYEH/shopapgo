// Airwallex Pay helpers for the payment step. DOM-free so node:test can import
// it. checkout.js owns mounting; this file owns the documented Drop-in options.
//
// Airwallex.js has no dedicated createElement("airwallexPay") type. Current docs
// (Drop-in Element, Oct 2026) list `airwallex_pay` as a Drop-in method and let
// `methods[]` restrict the iframe to that one type. Same PaymentIntent the card
// fields already use (`intent_id` + `client_secret` + `currency`).

export const AIRWALLEX_PAY_METHOD = "airwallex_pay";
export const AIRWALLEX_PAY_ELEMENT = "dropIn";
export const AIRWALLEX_PAY_CONTAINER_ID = "airwallex-pay";

// Off only when the operator sets AIRWALLEX_PAY_ENABLED=false. Missing config
// (older Worker) still offers the method — production needs it while Cards are
// unavailable. Honour storeReady the same way PayPal does.
export function airwallexPayEnabled(config) {
  if (!config || config.storeReady === false) return false;
  return config.airwallexPay?.enabled !== false;
}

export function shopperName(shipping) {
  return [shipping?.firstName, shipping?.lastName].filter(Boolean).join(" ").trim();
}

// Drop-in options restricted to Airwallex Pay. `session` is required: Drop-in
// needs the PaymentIntent up front (unlike wallet buttons, which can probe first).
export function dropInOptions(session, { email, shipping, countryCode } = {}) {
  const intent = session?.intent;
  if (!intent?.id || !intent.clientSecret) throw new Error("airwallex_pay_session_required");
  const currency = intent.currency || session.quote?.currency;
  if (!currency) throw new Error("airwallex_pay_currency_required");
  const name = shopperName(shipping);
  return {
    intent_id: intent.id,
    client_secret: intent.clientSecret,
    currency,
    country_code: countryCode || "US",
    methods: [AIRWALLEX_PAY_METHOD],
    alwaysShowMethodLabel: true,
    submitType: "pay",
    appearance: { mode: "dark" },
    ...(email ? { shopper_email: email } : {}),
    ...(name ? { shopper_name: name } : {}),
  };
}

export function dropInUpdate(session) {
  return {
    intent_id: session.intent.id,
    client_secret: session.intent.clientSecret,
    currency: session.intent.currency || session.quote?.currency,
    methods: [AIRWALLEX_PAY_METHOD],
  };
}
