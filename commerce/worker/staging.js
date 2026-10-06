// Staging-only protections, switched on by the plain env var SITE_ENV=staging.
// With SITE_ENV unset (local dev, production) every function here is a pass-through, so prod behaviour is unchanged.
//
//   * every response carries  X-Robots-Tag: noindex, nofollow, noarchive
//   * GET /robots.txt answers "Disallow: /" (no credentials needed, so crawlers can read it)
//   * the whole site sits behind HTTP Basic auth (secrets STAGING_BASIC_AUTH_USER / STAGING_BASIC_AUTH_PASSWORD);
//     if either secret is missing the gate fails closed with 503; a valid owner email/password or ADMIN_TOKEN also passes (see basicGate)
//   * NOT behind the Basic gate: /api/webhooks/airwallex and /api/webhooks/paypal (providers cannot send our
//     credentials; each handler verifies its own signature), /admin, /admin/* (their own admin-auth check also uses
//     the Authorization header, so a second
//     gate in front would make the back office unusable) and the whole ADMIN_HOST hostname (worker/hosts.js: only the
//     back office + its css/js are reachable there; one login: ADMIN_LOGIN_EMAIL/PASSWORD, ADMIN_TOKEN, or
//     (ADMIN_ACCEPT_SITE_BASIC="true") the same Basic user/password as the website - never two prompts).

import { isAdminHost } from "./hosts.js";
import { matchesAdminLogin, matchesAdminToken, presentedBasic, sameSecret } from "./admin-auth.js";

export const STAGING_ROBOTS_TAG = "noindex, nofollow, noarchive";
export const STAGING_ROBOTS_TXT = "User-agent: *\nDisallow: /\n";

export const isStaging = (env = {}) => env.SITE_ENV === "staging";

const BASIC_EXEMPT_EXACT = new Set(["/api/webhooks/airwallex", "/api/webhooks/resend", "/api/webhooks/paypal", "/admin"]);
export const isBasicExempt = (pathname) => BASIC_EXEMPT_EXACT.has(pathname) || pathname.startsWith("/admin/");

// Back-office host only, and only where ADMIN_ACCEPT_SITE_BASIC="true" (plain var, staging): the website's own Basic credentials
// (secrets STAGING_BASIC_AUTH_USER / STAGING_BASIC_AUTH_PASSWORD, compared in constant time) also open /admin, next to
// ADMIN_LOGIN_EMAIL/PASSWORD and ADMIN_TOKEN. Default elsewhere: the flag is unset, so this extra path is off
// (production uses the same ADMIN_LOGIN_* secrets without needing SITE_ENV=staging).
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
  // The /admin/ page loads its CSS/JS from gated paths when ADMIN_HOST is unset; the same owner
  // email/password or ADMIN_TOKEN the back office accepts therefore also pass this gate.
  if (await matchesAdminLogin(request, env)) return null;
  if (given && (await matchesAdminToken(request, env))) return null;
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
