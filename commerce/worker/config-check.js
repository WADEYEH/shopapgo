// The Worker checks its own settings against the repo (J6, M12-03; D59): someone changing a setting in the Cloudflare
// dashboard instead of the repo is found within a day, or at once after a deploy, and the team is emailed.
//
//   * CONFIG_MANIFEST is what commerce/wrangler.toml sets for each environment (tests/config-check.test.mjs keeps the
//     two equal): every plain var with its value, the secrets that must exist (names only; their values are never read
//     or sent) and the bindings.
//   * Cron job "config": the first run of each UTC day, and the first run of every new version (CF_VERSION_METADATA),
//     compares and, when something differs, emails the team once per version and difference. CONFIG_PROFILE says which
//     environment this is; local dev has none and is not checked.
//   * A var added only in the dashboard looks like a secret to the Worker and cannot be told apart; cron triggers and
//     routes are not visible from inside either. Those are checked by deploying only from CI (M12).
import { alertTeam } from "./team-alerts.js";

const BINDINGS = ["DB", "ASSETS", "CHECKOUT_LIMITER", "ADDRESS_LIMITER", "QUOTE_LIMITER", "PRODUCT_IMAGES"];
export const CONFIG_MANIFEST = {
  staging: {
    vars: {
      AIRWALLEX_ENV: "demo",
      SITE_ENV: "staging",
      CONFIG_PROFILE: "staging",
      ADMIN_HOST: "admin-staging.shopapgo.com",
      SITE_HOST: "staging.shopapgo.com",
      MOVED_HOSTS: "store-staging.shopapgo.com",
      ADMIN_ACCEPT_SITE_BASIC: "true",
      ADMIN_OWNER_EMAIL: "wadeyeh@apgo.com.tw",
      CUSTOMER_EMAIL_FROM: "APGO <orders@shopapgo.com>",
      CUSTOMER_EMAIL_REPLY_TO: "services@apgo.com.tw",
      CUSTOMER_EMAIL_TEST_RECIPIENTS: "wadeyeh@apgo.com.tw",
      CONTACT_EMAIL_TO: "wadeyeh@apgo.com.tw",
      CUSTOMER_EMAIL_POLICY_NOTE: "TEST EMAIL - Sample order and shipping details only. No payment or shipment took place.",
      CUSTOMER_EMAIL_ENABLED: "true",
      CUSTOMER_EMAIL_RETRY_CRON: "true",
      REFUND_ALERT_EMAIL_TO: "wadeyeh@apgo.com.tw",
      MCF_FAKE: "true",
      MCF_AUTO_SUBMIT: "true",
      MCF_SYNC_CRON: "true",
    },
    secrets: ["ADMIN_TOKEN", "AIRWALLEX_CLIENT_ID", "AIRWALLEX_API_KEY", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "RESEND_API_KEY", "STAGING_BASIC_AUTH_USER", "STAGING_BASIC_AUTH_PASSWORD"],
    bindings: BINDINGS,
  },
  production: {
    vars: {
      AIRWALLEX_ENV: "prod",
      CONFIG_PROFILE: "production",
      ADMIN_HOST: "admin.shopapgo.com",
      SITE_HOST: "www.shopapgo.com",
      MOVED_HOSTS: "store.shopapgo.com,shopapgo.com",
      ADMIN_OWNER_EMAIL: "wadeyeh@apgo.com.tw",
      META_DATASET_ID: "2606879866471418",
      GA4_MEASUREMENT_ID: "G-YM10YMKE30",
      CONTACT_EMAIL_TO: "wadeyeh@apgo.com.tw",
    },
    // 10/12: the live store (landing's) has none of RESEND_*, PAYPAL_WEBHOOK_ID, the Amazon shipping connection or the
    // address check key yet; they are set at the cutover (docs/commerce-plan.md §8.1), and this check says so if not.
    secrets: [
      "ADMIN_TOKEN", "AIRWALLEX_CLIENT_ID", "AIRWALLEX_API_KEY", "AIRWALLEX_WEBHOOK_SECRET", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET",
      "PAYPAL_WEBHOOK_ID", "RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "META_CAPI_ACCESS_TOKEN",
      "AMAZON_OUTBOUND_BASE_URL", "OUTBOUND_INTERNAL_TOKEN", "MCF_SKU_MAP_JSON", "GOOGLE_ADDRESS_VALIDATION_KEY",
    ],
    bindings: BINDINGS,
  },
};

const STATE_KEY = "config.checked";
const iso = (ms) => new Date(ms).toISOString();
const shown = (value) => (value === undefined ? "(not set)" : JSON.stringify(String(value)));

// What differs from the manifest: [{ kind: "var" | "secret" | "binding", name, expected?, actual? }].
export function configProblems(env, manifest) {
  const problems = [];
  for (const [name, expected] of Object.entries(manifest.vars)) {
    if (env[name] !== expected) problems.push({ kind: "var", name, expected, actual: env[name] === undefined ? undefined : String(env[name]) });
  }
  for (const name of manifest.secrets) if (!String(env[name] ?? "").trim()) problems.push({ kind: "secret", name });
  for (const name of manifest.bindings) if (!env[name] || typeof env[name] !== "object") problems.push({ kind: "binding", name });
  return problems;
}

async function fingerprint(problems) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(problems)));
  return [...new Uint8Array(digest)].slice(0, 6).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// Cron job "config". Returns { ran, problems? }.
export async function scheduledConfigCheck(env, { nowMs = Date.now() } = {}) {
  const manifest = CONFIG_MANIFEST[env.CONFIG_PROFILE];
  if (!manifest) return { ran: false };
  const db = env.DB;
  const version = String(env.CF_VERSION_METADATA?.id ?? "unknown");
  const mark = `${version}|${iso(nowMs).slice(0, 10)}`;
  const last = (await db.prepare("SELECT value FROM ops_state WHERE key = ?").bind(STATE_KEY).first())?.value ?? null;
  if (last === mark) return { ran: false };
  const claimed = await db
    .prepare(`INSERT INTO ops_state (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE ops_state.value IS ?`)
    .bind(STATE_KEY, mark, iso(nowMs), last)
    .run();
  if (!(claimed.meta?.changes > 0)) return { ran: false };
  const problems = configProblems(env, manifest);
  if (!problems.length) return { ran: true, problems: 0 };
  await alertTeam(env, {
    key: `config:${version}:${await fingerprint(problems)}`,
    kind: "config_drift",
    subject: `Live settings differ from the repo (${env.CONFIG_PROFILE})`,
    lines: [
      `The ${env.CONFIG_PROFILE} Worker (version ${version}) does not have the settings commerce/wrangler.toml gives it:`,
      ...problems.map((p) => p.kind === "var" ? `  - ${p.name}: expected ${shown(p.expected)}, live ${shown(p.actual)}`
        : p.kind === "secret" ? `  - secret ${p.name} is missing` : `  - binding ${p.name} is missing`),
      "",
      "Settings change only through the repo and CI (docs/ops/runbook.md section 21). If the change was meant, put it in wrangler.toml and deploy; otherwise deploy again to undo it.",
    ],
  });
  return { ran: true, problems: problems.length };
}
