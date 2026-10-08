// The payment providers' browser scripts, loaded only when the payment step needs them, once per page.
// - Airwallex.js: card fields, Apple Pay / Google Pay buttons and the Airwallex Pay drop-in, one init for all of them.
// - PayPal JS SDK: the PayPal buttons, with the store's public client id.
// A failed load is forgotten, so the next attempt tries again.

const AIRWALLEX_SDK_URL = "https://static.airwallex.com/components/sdk/v1/index.js";

function loadScript(src, ready) {
  if (ready()) return Promise.resolve(ready());
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => (ready() ? resolve(ready()) : reject(new Error("sdk_missing")));
    script.onerror = () => reject(new Error("sdk_load_failed"));
    document.head.append(script);
  });
}

let airwallexSdk = null;
let paypalSdk = null;

export function loadAirwallex(env) {
  airwallexSdk ??= loadScript(AIRWALLEX_SDK_URL, () => window.AirwallexComponentsSDK).then(async (sdk) => {
    await sdk.init({ env, enabledElements: ["payments"] });
    return sdk;
  });
  airwallexSdk.catch(() => {
    airwallexSdk = null;
  });
  return airwallexSdk;
}

// url: paypalSdkUrl(clientId) from lib/shop/checkout.js.
export function loadPaypal(url) {
  paypalSdk ??= loadScript(url, () => (window.paypal?.Buttons ? window.paypal : null));
  paypalSdk.catch(() => {
    paypalSdk = null;
  });
  return paypalSdk;
}
