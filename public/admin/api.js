// Calls to /admin/api/* (commerce/worker/admin.js). The Worker checks who is signed in on every call (Cloudflare Access,
// or until then the shared login the browser re-sends by itself); this page keeps no credentials. Writes are JSON
// POSTs, which the Worker also requires (its CSRF guard).
import { lang, t } from "./i18n.js";

// image: a product photo to upload ({ blob, width, height }), sent as itself instead of JSON (worker/product-content.js).
export async function adminApi(path, { method = "GET", body, image } = {}) {
  let response;
  try {
    response = await fetch(path, image
      ? { method, headers: { Accept: "application/json", "Content-Type": image.blob.type, "X-Image-Width": String(image.width), "X-Image-Height": String(image.height) }, body: image.blob }
      : {
        method,
        headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
  } catch {
    throw Object.assign(new Error(t("error.network")), { status: 0, code: "network_error" });
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    // not JSON (a static server without the Worker)
  }
  if (!response.ok || !data) {
    const code = data?.error?.code;
    // The Worker's own English sentence, or in Chinese its translation when there is one for that code.
    const translated = lang() === "zh" && code && t(`error.${code}`) !== `error.${code}` ? t(`error.${code}`) : null;
    const reason =
      response.status === 503 ? t("error.notConfigured")
      : response.status === 401 ? t("error.signedOut")
      : translated ?? (data?.error?.message || t("error.unavailable"));
    throw Object.assign(new Error(reason), { status: response.status, code });
  }
  return data;
}

// A file from the Worker (CSV exports, a customer's data): fetched with the same sign-in, then saved by the browser
// under the name the Worker gives. Nothing is kept by the page.
export async function downloadFile(path) {
  let response;
  try {
    response = await fetch(path, { headers: { Accept: "text/csv, application/json" } });
  } catch {
    throw Object.assign(new Error(t("error.network")), { status: 0, code: "network_error" });
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const code = data?.error?.code;
    const translated = lang() === "zh" && code && t(`error.${code}`) !== `error.${code}` ? t(`error.${code}`) : null;
    throw Object.assign(new Error(response.status === 401 ? t("error.signedOut") : translated ?? (data?.error?.message || t("error.unavailable"))), { status: response.status, code });
  }
  const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "apgo-export";
  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement("a"), { href: url, download: name, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}
