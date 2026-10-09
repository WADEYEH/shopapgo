// Copies the back-office member list to the Cloudflare Zero Trust email list that the Access policy allows (D44,
// phase3-plan §3.1). The list in admin_members is the only one people edit; this keeps Cloudflare's copy equal to it,
// so Access lets in exactly the active members.
//
// Settings (all four, or the sync is "not configured" and the Members page says to add people in Cloudflare too):
//   CLOUDFLARE_ACCOUNT_ID   plain var
//   ACCESS_LIST_ID          plain var: the Zero Trust list (type Email) the Access policy uses
//   ACCESS_LIST_API_TOKEN   secret: an API token that can only edit Zero Trust lists
//   (the Cloudflare API base can be overridden with CLOUDFLARE_API_BASE for tests)
//
// The sync reads the list, then appends the missing emails and removes the extra ones in one PATCH. It never throws;
// a failure is shown on the Members page and logged in the activity log, and the owner can retry.
import { recordAdminAudit } from "./activity.js";

const API = "https://api.cloudflare.com/client/v4";
const ID = /^[0-9a-f-]{8,64}$/i;

export function accessListConfig(env = {}) {
  const account = String(env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const list = String(env.ACCESS_LIST_ID ?? "").trim();
  const token = String(env.ACCESS_LIST_API_TOKEN ?? "").trim();
  const configured = Boolean(account && list && token);
  const valid = configured && ID.test(account) && ID.test(list);
  return { configured, valid, account, list, token, base: String(env.CLOUDFLARE_API_BASE ?? "").trim() || API };
}

// Flattens the items endpoint's result (an array, sometimes an array of pages) into lowercase email values.
function itemValues(result) {
  const values = [];
  const walk = (value) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value.value === "string") values.push(value.value.trim().toLowerCase());
  };
  walk(result);
  return values;
}

async function call(config, fetchImpl, method, path, body) {
  const response = await fetchImpl(`${config.base}/accounts/${config.account}/gateway/lists/${config.list}${path}`, {
    method,
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok || data?.success === false) {
    const code = data?.errors?.[0]?.code;
    throw new Error(`Cloudflare answered HTTP ${response.status}${code ? ` (error ${code})` : ""}.`);
  }
  return data;
}

// { status: "synced" | "not_configured" | "failed", added, removed, detail }
export async function syncAccessList(env, { actor = { id: "system", via: "system" }, fetchImpl = fetch } = {}) {
  const config = accessListConfig(env);
  if (!config.configured) return { status: "not_configured", added: 0, removed: 0, detail: "The Cloudflare Access list sync is not set up." };
  let outcome;
  try {
    if (!config.valid) throw new Error("CLOUDFLARE_ACCOUNT_ID or ACCESS_LIST_ID is not a valid id.");
    const { results } = await env.DB.prepare("SELECT email FROM admin_members WHERE status = 'active'").all();
    const wanted = new Set(results.map((row) => row.email));
    // Never empty Cloudflare's list (that would lock everyone out): there is always an owner once ensureOwner ran.
    if (!wanted.size) throw new Error("The member list is empty, so the Cloudflare list was left as it is.");
    const current = new Set();
    for (let page = 1; page <= 20; page += 1) {
      const data = await call(config, fetchImpl, "GET", `/items?page=${page}&per_page=1000`);
      const values = itemValues(data?.result);
      values.forEach((value) => current.add(value));
      const info = data?.result_info;
      if (!values.length || !info || page >= Number(info.total_pages || 1)) break;
    }
    const append = [...wanted].filter((email) => !current.has(email)).sort();
    const remove = [...current].filter((email) => !wanted.has(email)).sort();
    if (append.length || remove.length) {
      await call(config, fetchImpl, "PATCH", "", { append: append.map((value) => ({ value })), remove });
    }
    outcome = { status: "synced", added: append.length, removed: remove.length, detail: "" };
  } catch (error) {
    const detail = error?.name === "TimeoutError" ? "Cloudflare did not answer in time." : String(error?.message ?? error).slice(0, 200);
    console.error("access_list_sync_failed", { detail });
    outcome = { status: "failed", added: 0, removed: 0, detail };
  }
  try {
    await recordAdminAudit(env.DB, { actor, action: outcome.status === "synced" ? "access_list.synced" : "access_list.sync_failed", target: "cloudflare-access-list", detail: outcome });
  } catch (error) {
    console.error("access_list_audit_failed", { message: String(error?.message ?? error).slice(0, 200) });
  }
  return outcome;
}

// The last sync result for the Members page: { configured, last: { status, at, detail } | null }.
export async function accessListStatus(env) {
  const config = accessListConfig(env);
  const row = await env.DB.prepare(
    "SELECT at, action, detail_json FROM admin_audit WHERE action IN ('access_list.synced', 'access_list.sync_failed') ORDER BY at DESC, id DESC LIMIT 1",
  ).first();
  let detail = {};
  try {
    detail = JSON.parse(row?.detail_json ?? "{}");
  } catch {
    detail = {};
  }
  return {
    configured: config.configured,
    last: row ? { status: row.action === "access_list.synced" ? "synced" : "failed", at: row.at, detail: detail.detail || "" } : null,
  };
}
