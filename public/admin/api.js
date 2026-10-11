// Calls to /admin/api/* (commerce/worker/admin.js). The Worker checks who is signed in on every call (Cloudflare Access,
// or until then the shared login the browser re-sends by itself); this page keeps no credentials. Writes are JSON
// POSTs, which the Worker also requires (its CSRF guard).
import { lang, t } from "./i18n.js";

export async function adminApi(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(path, {
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
