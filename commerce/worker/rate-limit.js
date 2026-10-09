// Per-address limits on the store endpoints that cost money or invite abuse (M12-06, scenarios C14 and J4): starting a
// payment (Airwallex / PayPal objects, card testing), the address check (each call is a paid Google API request) and the
// cart quote. Uses Cloudflare's rate limiting binding (wrangler.toml [[ratelimits]], one namespace per environment);
// the Contact us form has its own limits in D1 (worker/contact.js).
//
// Limits are per client address, per endpoint, per minute. The binding is local to each Cloudflare location and slightly
// permissive by design, which is fine for abuse control. Without a binding (unit tests, an older config) nothing is
// limited: a limiter outage must never stop real shoppers from paying.
import { fail } from "./http.js";

export const RATE_LIMITED_ROUTES = new Map([
  ["/api/checkout/session", "CHECKOUT_LIMITER"],
  ["/api/checkout/paypal/order", "CHECKOUT_LIMITER"],
  ["/api/checkout/address", "ADDRESS_LIMITER"],
  ["/api/cart/quote", "QUOTE_LIMITER"],
]);

export const RATE_LIMIT_MESSAGE = "Too many attempts. Please wait a minute and try again.";

// The client address Cloudflare saw; requests without one (local tools) share a single key.
const clientKey = (request) => request.headers.get("CF-Connecting-IP") || "unknown";

// Returns a 429 response when this request is over its limit, otherwise null.
export async function rateLimited(request, env) {
  if (request.method !== "POST") return null;
  const { pathname } = new URL(request.url);
  const limiter = env[RATE_LIMITED_ROUTES.get(pathname)];
  if (typeof limiter?.limit !== "function") return null;
  let outcome;
  try {
    outcome = await limiter.limit({ key: `${pathname}:${clientKey(request)}` });
  } catch (error) {
    console.error("rate_limit_unavailable", { path: pathname, message: String(error?.message ?? error).slice(0, 200) });
    return null;
  }
  if (outcome?.success !== false) return null;
  console.warn("rate_limited", { path: pathname });
  return fail(429, "rate_limited", RATE_LIMIT_MESSAGE, { "Retry-After": "60" });
}
