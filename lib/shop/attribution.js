// Meta attribution sent with the checkout for the server-side Conversions API (commerce/worker/meta-capi.js). Every
// field is optional and empty ones are left out. fbclid comes from the URL, else from the _fbc cookie
// ("fb.1.<ms>.<fbclid>"), because shoppers normally reach the checkout without the ad's query string.

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

export function readAttribution() {
  const fbp = readCookie("_fbp");
  const fbc = readCookie("_fbc");
  const fbclid = new URLSearchParams(window.location.search).get("fbclid") || fbc.split(".").slice(3).join(".");
  const attribution = { fbp, fbc, fbclid, sourceUrl: window.location.href };
  return Object.fromEntries(Object.entries(attribution).filter(([, value]) => value));
}
