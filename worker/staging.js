// Staging-only protections, switched on by the plain env var SITE_ENV=staging.
// With SITE_ENV unset (local dev, production) every function here is a pass-through, so prod behaviour is unchanged.
//
//   * every response carries  X-Robots-Tag: noindex, nofollow, noarchive
//   * GET /robots.txt answers "Disallow: /" (no credentials needed, so crawlers can read it)
//   * the whole site sits behind HTTP Basic auth (secrets STAGING_BASIC_AUTH_USER / STAGING_BASIC_AUTH_PASSWORD);
//     if either secret is missing the gate fails closed with 503; a valid ADMIN_TOKEN password also passes (see basicGate)
//   * NOT behind the Basic gate: /api/webhooks/airwallex (Airwallex cannot send our credentials; the handler verifies
//     its own signature), /admin, /admin/* (their own ADMIN_TOKEN check also uses the Authorization header, so a second
//     gate in front would make the back office unusable) and the whole ADMIN_HOST hostname (worker/hosts.js: only the
//     back office + its css/js are reachable there; one login: ADMIN_TOKEN, or (ADMIN_ACCEPT_SITE_BASIC="true") the same
//     Basic user/password as the website - never two prompts).

import { isAdminHost } from "./hosts.js";

export const STAGING_ROBOTS_TAG = "noindex, nofollow, noarchive";
export const STAGING_ROBOTS_TXT = "User-agent: *\nDisallow: /\n";

export const isStaging = (env = {}) => env.SITE_ENV === "staging";

const BASIC_EXEMPT_EXACT = new Set(["/api/webhooks/airwallex", "/admin"]);
export const isBasicExempt = (pathname) => BASIC_EXEMPT_EXACT.has(pathname) || pathname.startsWith("/admin/");

// Comparing SHA-256 digests keeps the comparison constant-time regardless of length.
async function sameSecret(a, b) {
  const [x, y] = await Promise.all(
    [a, b].map(async (value) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))),
  );
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

function presentedBasic(request) {
  const header = request.headers.get("Authorization") || "";
  const [scheme, value = ""] = header.split(/\s+/, 2);
  if (!/^basic$/i.test(scheme)) return null;
  try {
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(value), (c) => c.charCodeAt(0)));
    const colon = decoded.indexOf(":");
    return colon < 0 ? null : { user: decoded.slice(0, colon), password: decoded.slice(colon + 1) };
  } catch {
    return null;
  }
}

// Back-office host only, and only where ADMIN_ACCEPT_SITE_BASIC="true" (plain var, staging): the website's own Basic credentials
// (secrets STAGING_BASIC_AUTH_USER / STAGING_BASIC_AUTH_PASSWORD, compared in constant time) also open /admin, next to ADMIN_TOKEN.
// Default everywhere else (production, local dev): false, so only ADMIN_TOKEN works.
export async function siteBasicOpensAdmin(request, env) {
  if (!isStaging(env) || env.ADMIN_ACCEPT_SITE_BASIC !== "true" || !isAdminHost(request, env)) return false;
  const user = env.STAGING_BASIC_AUTH_USER;
  const password = env.STAGING_BASIC_AUTH_PASSWORD;
  if (!user || !password) return false;
  const given = presentedBasic(request);
  if (!given) return false;
  const [userOk, passwordOk] = await Promise.all([sameSecret(given.user, user), sameSecret(given.password, password)]);
  return userOk && passwordOk;
}

const textResponse = (body, status, headers = {}) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": STAGING_ROBOTS_TAG, ...headers },
  });

// Returns null when the request may proceed, otherwise the response to send.
async function basicGate(request, env) {
  const user = env.STAGING_BASIC_AUTH_USER;
  const password = env.STAGING_BASIC_AUTH_PASSWORD;
  if (!user || !password) return textResponse("Staging is locked: access credentials are not configured.", 503);
  const given = presentedBasic(request);
  const [userOk, passwordOk] = given
    ? await Promise.all([sameSecret(given.user, user), sameSecret(given.password, password)])
    : [false, false];
  if (userOk && passwordOk) return null;
  // The /admin/ page loads its CSS/JS from gated paths, and the browser only holds the ADMIN_TOKEN credentials at that point:
  // a valid ADMIN_TOKEN (any username, >= 16 chars) therefore also passes this gate.
  const adminToken = env.ADMIN_TOKEN;
  if (given && adminToken && adminToken.length >= 16 && (await sameSecret(given.password, adminToken))) return null;
  return textResponse("Authentication required.", 401, { "WWW-Authenticate": 'Basic realm="APGO staging", charset="UTF-8"' });
}

// Wraps the normal handler: `next()` produces the regular response.
export async function withStaging(request, env, next) {
  if (!isStaging(env)) return next();
  const { pathname } = new URL(request.url);
  if (pathname === "/robots.txt" && (request.method === "GET" || request.method === "HEAD")) {
    return textResponse(request.method === "HEAD" ? null : STAGING_ROBOTS_TXT, 200);
  }
  if (!isBasicExempt(pathname) && !isAdminHost(request, env)) {
    const denied = await basicGate(request, env);
    if (denied) return denied;
  }
  const response = await next();
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", STAGING_ROBOTS_TAG);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
