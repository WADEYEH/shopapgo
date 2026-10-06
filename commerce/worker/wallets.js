// Apple Pay / Google Pay configuration shared by the Worker and the checkout page.
//
// Airwallex-native approach (docs reviewed Oct 2026): Airwallex.js "Apple Pay
// element" (createElement('applePayButton')) and "Google Pay element"
// (createElement('googlePayButton')) take the PaymentIntent's intent_id +
// client_secret, open the wallet sheet themselves and confirm the intent when the
// shopper authorises. There is no separate confirm() call. Our server therefore
// only needs to create the PaymentIntent (already amount-checked server side) and
// settle the order from the webhook / Retrieve API exactly as for cards.

const isOn = (value, fallback = true) => {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "" ? fallback : text !== "false" && text !== "0";
};

// PAYMENT_AUTO_CAPTURE=false places a hold instead of capturing immediately. It
// must match on the PaymentIntent options and on the wallet elements (both read
// this one switch), otherwise cards and wallets would behave differently.
export const autoCaptureEnabled = (env = {}) => isOn(env.PAYMENT_AUTO_CAPTURE, true);

// Sent as `payment_method_options` on Create PaymentIntent. Airwallex documents the
// card options as applying to cards including wallet cards; wallet elements also
// receive the same flag client-side (`autoCapture`).
export function paymentMethodOptions(env = {}) {
  return { card: { auto_capture: autoCaptureEnabled(env) } };
}

// What the browser is told. `applePay` / `googlePay` only say "the operator allows
// it"; the page still hides a button the device or Airwallex cannot offer.
export function walletConfig(env = {}) {
  return {
    applePay: isOn(env.APPLE_PAY_ENABLED, true),
    googlePay: isOn(env.GOOGLE_PAY_ENABLED, true),
    countryCode: "US",
    merchantName: String(env.WALLET_MERCHANT_NAME || "APGO").trim().slice(0, 60) || "APGO",
    autoCapture: autoCaptureEnabled(env),
    // false (default): probe the wallet first, create the order/PaymentIntent only once
    // the wallet reports it can pay (no orphan orders for shoppers without a wallet).
    // true: create the session as soon as the payment step opens and pass it to the
    // element up front (fallback if Airwallex.js does not fire `ready` without an intent).
    eagerSession: isOn(env.WALLET_EAGER_SESSION, false),
  };
}

// Apple requires this file at /.well-known/ on the domain (it must be served as
// application/octet-stream). Wrangler skips dot-directories when uploading static
// assets, so the file lives in a normal folder and the Worker serves it at the
// well-known path. It is a public domain-verification token, not a secret.
export const APPLE_PAY_DOMAIN_PATH = "/.well-known/apple-developer-merchantid-domain-association";
export const APPLE_PAY_ASSET_PATH = "/apple-pay/apple-developer-merchantid-domain-association";

export async function serveAppleDomainAssociation(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  let asset;
  try {
    asset = await env.ASSETS.fetch(new Request(new URL(APPLE_PAY_ASSET_PATH, request.url), { method: "GET" }));
  } catch {
    return notFound();
  }
  // A static host may answer a missing path with an HTML fallback; never serve that to Apple.
  if (!asset.ok || /text\/html/i.test(asset.headers.get("Content-Type") ?? "")) return notFound();
  return new Response(request.method === "HEAD" ? null : asset.body, {
    status: 200,
    headers: { "Content-Type": "application/octet-stream", "Cache-Control": "public, max-age=300" },
  });
}
