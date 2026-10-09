// Who is using the back office, and with which role (M9 §1, D33, D44; tests M9-01, M9-02, M9-11).
//
// Two modes, switched by the plain var ADMIN_ACCESS:
//
//   ADMIN_ACCESS="true"  Cloudflare Access signs people in (Google, or a one-time email code) and sends a signed token
//                        with every request. The Worker checks that token itself (signature against the team's public
//                        keys, the application's AUD, issuer, expiry), then looks the email up in admin_members on
//                        EVERY request: not on the list, or removed a minute ago = no entry. Needs ACCESS_TEAM_DOMAIN
//                        (https://<team>.cloudflareaccess.com) and ACCESS_AUD (the Access application's audience tag).
//                        Cloudflare's ctx.access is not used: this Worker serves static assets, and Cloudflare does not
//                        pass ctx.access to such Workers, so the token check is the standard way here.
//   otherwise            the existing logins (worker/admin-auth.js) until Access is switched on: the shared
//                        ADMIN_LOGIN_EMAIL / ADMIN_LOGIN_PASSWORD (acts as the owner, recorded under that email) and,
//                        on staging only, the website's Basic login ("staging-login", owner).
//
// In both modes ADMIN_TOKEN (scripts) is accepted as "token", with the member role (it cannot manage members).
// Every action is then recorded under actor.id (M9-02).
import { adminConfigured, adminLogin, matchesAdminLogin, matchesAdminToken } from "./admin-auth.js";
import { siteBasicOpensAdmin } from "./staging.js";
import { activeMember, ensureOwner, normalizeEmail } from "./members.js";

const NO_INDEX = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" };
const CHALLENGE = { "WWW-Authenticate": 'Basic realm="APGO orders", charset="UTF-8"' };
const CERT_TTL_MS = 60 * 60_000;
const REFRESH_GAP_MS = 60_000;
const SKEW_S = 60;

export const accessMode = (env = {}) => String(env.ADMIN_ACCESS ?? "").trim().toLowerCase() === "true";

// The team domain as an https origin on cloudflareaccess.com, or null.
function teamOrigin(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.protocol === "https:" && /^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(url.hostname) ? url.origin.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function accessSettings(env = {}) {
  const team = teamOrigin(env.ACCESS_TEAM_DOMAIN);
  const aud = String(env.ACCESS_AUD ?? "").trim();
  const problem = !team ? "ACCESS_TEAM_DOMAIN must be https://<team>.cloudflareaccess.com" : !aud ? "ACCESS_AUD is not set" : null;
  return { team, aud, problem };
}

// ---------- the Access token ----------

const base64UrlBytes = (text) => {
  const normal = text.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normal.padEnd(Math.ceil(normal.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
};
const base64UrlJson = (text) => JSON.parse(new TextDecoder().decode(base64UrlBytes(text)));

// The team's signing keys, cached for an hour; an unknown key id refreshes them (at most once a minute).
const certCache = { team: null, keys: [], fetchedAt: 0 };
export const resetAccessKeyCache = () => Object.assign(certCache, { team: null, keys: [], fetchedAt: 0 });

async function signingKey(team, kid, { fetchImpl, nowMs }) {
  const fresh = certCache.team === team && nowMs - certCache.fetchedAt < CERT_TTL_MS;
  let jwk = fresh ? certCache.keys.find((key) => key.kid === kid) : null;
  if (!jwk && (!fresh || nowMs - certCache.fetchedAt >= REFRESH_GAP_MS)) {
    const response = await fetchImpl(`${team}/cdn-cgi/access/certs`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Access certs answered HTTP ${response.status}`);
    const data = await response.json();
    Object.assign(certCache, { team, keys: Array.isArray(data?.keys) ? data.keys : [], fetchedAt: nowMs });
    jwk = certCache.keys.find((key) => key.kid === kid);
  }
  if (!jwk || jwk.kty !== "RSA") return null;
  return crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
}

// The token's claims when it is a valid Access token for this application, otherwise null. Throws only when the
// team's keys cannot be fetched (the caller answers 503 rather than locking people out as "not signed in").
export async function verifyAccessToken(token, { team, aud, nowMs = Date.now(), fetchImpl = fetch }) {
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
  let header;
  let claims;
  try {
    header = base64UrlJson(parts[0]);
    claims = base64UrlJson(parts[1]);
  } catch {
    return null;
  }
  if (header?.alg !== "RS256" || typeof header.kid !== "string" || !claims || typeof claims !== "object") return null;
  const key = await signingKey(team, header.kid, { fetchImpl, nowMs });
  if (!key) return null;
  const signed = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!signed) return null;
  const now = Math.floor(nowMs / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(aud)) return null;
  if (String(claims.iss ?? "").toLowerCase() !== team) return null;
  if (!(Number(claims.exp) > now - SKEW_S)) return null;
  if (claims.nbf != null && Number(claims.nbf) > now + SKEW_S) return null;
  return claims;
}

function presentedAccessToken(request) {
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header.trim();
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

// ---------- who is this ----------

const denied = (status, code, message, extra = {}) => ({
  response: new Response(JSON.stringify({ error: { code, message } }), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...NO_INDEX, ...extra } }),
});

// The active member for an email; the ADMIN_OWNER_EMAIL person becomes the first owner on their first visit.
async function memberFor(env, email) {
  const member = await activeMember(env.DB, email);
  if (member) return member;
  if (normalizeEmail(env.ADMIN_OWNER_EMAIL) === email && (await ensureOwner(env))) return activeMember(env.DB, email);
  return null;
}

// { actor: { id, email, role, via } } when the request may proceed, otherwise { response }.
export async function resolveAdmin(request, env, { nowMs = Date.now(), fetchImpl = fetch } = {}) {
  const access = accessMode(env);
  if (!access && !adminConfigured(env)) return denied(503, "admin_not_configured", "The order back office is not configured.");
  if (await matchesAdminToken(request, env)) return { actor: { id: "token", email: null, role: "member", via: "token" } };

  if (access) {
    const settings = accessSettings(env);
    if (settings.problem) {
      console.error("admin_access_not_configured", { problem: settings.problem });
      return denied(503, "admin_access_not_configured", "Back-office sign-in is not configured.");
    }
    let claims = null;
    try {
      const token = presentedAccessToken(request);
      claims = token ? await verifyAccessToken(token, { ...settings, nowMs, fetchImpl }) : null;
    } catch (error) {
      console.error("admin_access_keys_unavailable", { message: String(error?.message ?? error).slice(0, 200) });
      return denied(503, "access_unavailable", "Sign-in could not be checked right now. Try again in a minute.");
    }
    const email = normalizeEmail(claims?.email);
    if (!email) return denied(403, "access_required", "Sign in through Cloudflare Access to use the back office.");
    let member;
    try {
      member = await memberFor(env, email);
    } catch (error) {
      console.error("admin_members_unreadable", { message: String(error?.message ?? error).slice(0, 200) });
      return denied(503, "members_unavailable", "The member list could not be read. Try again in a minute.");
    }
    if (!member) return denied(403, "not_a_member", `${email} is not on the back-office member list. Ask an owner to add you.`);
    return { actor: { id: email, email, role: member.role, via: "access" } };
  }

  if (await matchesAdminLogin(request, env)) {
    const email = adminLogin(env).email.toLowerCase();
    return { actor: { id: email, email, role: "owner", via: "password" } };
  }
  // Staging only (ADMIN_ACCEPT_SITE_BASIC): the website's Basic user + password opens the admin host too.
  if (await siteBasicOpensAdmin(request, env)) return { actor: { id: "staging-login", email: null, role: "owner", via: "staging-login" } };
  return denied(401, "unauthorized", "Authentication required.", CHALLENGE);
}
