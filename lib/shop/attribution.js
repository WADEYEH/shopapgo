// Meta attribution sent with the checkout for the server-side Conversions API (commerce/worker/meta-capi.js). Every
// field is optional and empty ones are left out. fbclid comes from the URL, else from the _fbc cookie
// ("fb.1.<ms>.<fbclid>"), because shoppers normally reach the checkout without the ad's query string.
import { shareBlocked } from "@/lib/us/privacy";

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

// What the checkout request carries for Meta: the attribution, or, when the browser sends Global Privacy Control and
// the site honours it (D46), only { privacy: { gpc: true } } so the Worker sends nothing to Meta for this order.
export function checkoutTracking() {
  return shareBlocked() ? { privacy: { gpc: true } } : { attribution: readAttribution() };
}

export function readAttribution() {
  const fbp = readCookie("_fbp");
  const fbc = readCookie("_fbc");
  const fbclid = new URLSearchParams(window.location.search).get("fbclid") || fbc.split(".").slice(3).join(".");
  const attribution = { fbp, fbc, fbclid, sourceUrl: window.location.href };
  return Object.fromEntries(Object.entries(attribution).filter(([, value]) => value));
}
