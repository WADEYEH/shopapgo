// Shared admin credential checks. Used by worker/admin.js (the back office) and
// worker/staging.js (the staging site gate, plus optional site Basic on ADMIN_HOST).
//
// Auth matrix (constant-time SHA-256 compare; nothing here is a default password):
//   1. Primary: HTTP Basic where username = ADMIN_LOGIN_EMAIL and password = ADMIN_LOGIN_PASSWORD.
//      Works on every environment (production included); does not need SITE_ENV=staging.
//   2. Fallback: ADMIN_TOKEN (>= 16 chars) as Bearer, or as the Basic password (any username).
//   3. Optional staging path: ADMIN_ACCEPT_SITE_BASIC="true" + SITE_ENV=staging + admin host
//      accepts STAGING_BASIC_AUTH_USER / STAGING_BASIC_AUTH_PASSWORD (see siteBasicOpensAdmin).
// If neither the login pair nor a long-enough ADMIN_TOKEN is set, the back office is 503.

export const MIN_ADMIN_TOKEN_LENGTH = 16;

export async function sameSecret(a, b) {
  const [x, y] = await Promise.all(
    [a, b].map(async (value) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))),
  );
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

export function presentedBasic(request) {
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

export function presentedBearer(request) {
  const header = request.headers.get("Authorization") || "";
  const [scheme, value = ""] = header.split(/\s+/, 2);
  return /^bearer$/i.test(scheme) ? value : "";
}

export function adminLogin(env = {}) {
  const email = String(env.ADMIN_LOGIN_EMAIL || "").trim();
  const password = env.ADMIN_LOGIN_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

export function adminToken(env = {}) {
  const token = env.ADMIN_TOKEN;
  return token && token.length >= MIN_ADMIN_TOKEN_LENGTH ? token : null;
}

export const adminConfigured = (env = {}) => Boolean(adminLogin(env) || adminToken(env));

export async function matchesAdminLogin(request, env) {
  const login = adminLogin(env);
  const given = presentedBasic(request);
  if (!login || !given) return false;
  const [userOk, passwordOk] = await Promise.all([
    sameSecret(given.user.trim().toLowerCase(), login.email.toLowerCase()),
    sameSecret(given.password, login.password),
  ]);
  return userOk && passwordOk;
}

export async function matchesAdminToken(request, env) {
  const token = adminToken(env);
  if (!token) return false;
  const bearer = presentedBearer(request);
  if (bearer && (await sameSecret(bearer, token))) return true;
  const given = presentedBasic(request);
  return Boolean(given && (await sameSecret(given.password, token)));
}
