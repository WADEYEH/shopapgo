// Admin auth matrix (worker/admin.js + worker/admin-auth.js): email/password Basic,
// ADMIN_TOKEN fallback, optional staging site Basic, 503 when nothing is configured.
import assert from "node:assert/strict";
import test from "node:test";

import { requireAdmin } from "../worker/admin.js";
import { adminConfigured, matchesAdminLogin, matchesAdminToken } from "../worker/admin-auth.js";

const EMAIL = "owner@example.com";
const PASSWORD = "owner-login-password-test";
const TOKEN = "admin-token-0123456789abcdef";
const SITE_USER = "staging-user";
const SITE_PASS = "staging-pass-0123456789abcdef";
const ADMIN_HOST = "admin.shop.example";

const basic = (user, pass) => ({ Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` });
const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const req = (headers = {}, host = ADMIN_HOST) => new Request(`https://${host}/admin/api/orders`, { headers });

const loginEnv = (extra = {}) => ({
  ADMIN_LOGIN_EMAIL: EMAIL,
  ADMIN_LOGIN_PASSWORD: PASSWORD,
  ...extra,
});
const tokenEnv = (extra = {}) => ({
  ADMIN_TOKEN: TOKEN,
  ...extra,
});
const bothEnv = (extra = {}) => loginEnv(tokenEnv(extra));

async function statusOf(request, env) {
  const denied = await requireAdmin(request, env);
  return denied ? denied.status : 200;
}

async function errorOf(request, env) {
  const denied = await requireAdmin(request, env);
  assert.ok(denied, "expected a deny response");
  const body = await denied.json();
  return { status: denied.status, code: body.error?.code, challenge: denied.headers.get("WWW-Authenticate") };
}

test("adminConfigured: needs the login pair or a long-enough ADMIN_TOKEN", () => {
  assert.equal(adminConfigured({}), false);
  assert.equal(adminConfigured({ ADMIN_TOKEN: "short" }), false);
  assert.equal(adminConfigured({ ADMIN_LOGIN_EMAIL: EMAIL }), false);
  assert.equal(adminConfigured({ ADMIN_LOGIN_PASSWORD: PASSWORD }), false);
  assert.equal(adminConfigured({ ADMIN_LOGIN_EMAIL: "  ", ADMIN_LOGIN_PASSWORD: PASSWORD }), false);
  assert.equal(adminConfigured(loginEnv()), true);
  assert.equal(adminConfigured(tokenEnv()), true);
  assert.equal(adminConfigured(bothEnv()), true);
});

test("503 admin_not_configured when neither login password nor ADMIN_TOKEN is set properly", async () => {
  for (const env of [{}, { ADMIN_TOKEN: "" }, { ADMIN_TOKEN: "short" }, { ADMIN_LOGIN_EMAIL: EMAIL }, { ADMIN_LOGIN_PASSWORD: PASSWORD }]) {
    const result = await errorOf(req(basic(EMAIL, PASSWORD)), env);
    assert.equal(result.status, 503, JSON.stringify(env));
    assert.equal(result.code, "admin_not_configured");
  }
});

test("primary: Basic email + password is accepted (case-insensitive email, production-like env)", async () => {
  const env = loginEnv();
  assert.equal(await statusOf(req(basic(EMAIL, PASSWORD)), env), 200);
  assert.equal(await statusOf(req(basic("Owner@Example.com", PASSWORD)), env), 200);
  assert.equal(await statusOf(req(basic(` ${EMAIL} `, PASSWORD)), env), 200);
  assert.equal(await matchesAdminLogin(req(basic(EMAIL, PASSWORD)), env), true);
});

test("primary: email/password works without ADMIN_TOKEN and without SITE_ENV=staging", async () => {
  const env = loginEnv({ SITE_ENV: undefined, ADMIN_TOKEN: "", ADMIN_ACCEPT_SITE_BASIC: undefined });
  assert.equal(await statusOf(req(basic(EMAIL, PASSWORD)), env), 200);
  assert.equal(await statusOf(req(bearer(PASSWORD)), env), 401, "login password is not a Bearer token");
  assert.equal(await statusOf(req(basic("anyone", PASSWORD)), env), 401, "username must be the email");
});

test("primary: wrong email, wrong password, or broken Basic is 401 with a challenge", async () => {
  const env = loginEnv();
  const cases = [
    {},
    basic("other@example.com", PASSWORD),
    basic(EMAIL, "wrong-password-value"),
    basic("", PASSWORD),
    basic(EMAIL, ""),
    { Authorization: "Basic !!!notbase64" },
    bearer(PASSWORD),
  ];
  for (const headers of cases) {
    const result = await errorOf(req(headers), env);
    assert.equal(result.status, 401, JSON.stringify(headers));
    assert.equal(result.code, "unauthorized");
    assert.match(result.challenge, /^Basic /);
  }
});

test("fallback: ADMIN_TOKEN still works as Bearer or Basic password (any username)", async () => {
  const env = tokenEnv();
  assert.equal(await statusOf(req(bearer(TOKEN)), env), 200);
  assert.equal(await statusOf(req(basic("admin", TOKEN)), env), 200);
  assert.equal(await statusOf(req(basic("", TOKEN)), env), 200);
  assert.equal(await statusOf(req(basic(EMAIL, TOKEN)), env), 200);
  assert.equal(await matchesAdminToken(req(bearer(TOKEN)), env), true);
  assert.equal(await statusOf(req(bearer("wrong-wrong-wrong-wrong")), env), 401);
  assert.equal(await statusOf(req(basic("admin", "wrong-wrong-wrong-wrong")), env), 401);
});

test("fallback: a short ADMIN_TOKEN never opens the office even when presented", async () => {
  const env = { ADMIN_TOKEN: "short" };
  const result = await errorOf(req(bearer("short")), env);
  assert.equal(result.status, 503);
  assert.equal(result.code, "admin_not_configured");
});

test("login pair + ADMIN_TOKEN: both paths work; a short token does not block the login pair", async () => {
  assert.equal(await statusOf(req(basic(EMAIL, PASSWORD)), bothEnv()), 200);
  assert.equal(await statusOf(req(bearer(TOKEN)), bothEnv()), 200);
  const shortToken = loginEnv({ ADMIN_TOKEN: "short" });
  assert.equal(await statusOf(req(basic(EMAIL, PASSWORD)), shortToken), 200);
  assert.equal(await statusOf(req(bearer("short")), shortToken), 401);
});

test("optional staging site Basic still opens the admin host when the flag is on", async () => {
  const env = tokenEnv({
    SITE_ENV: "staging",
    ADMIN_HOST,
    ADMIN_ACCEPT_SITE_BASIC: "true",
    STAGING_BASIC_AUTH_USER: SITE_USER,
    STAGING_BASIC_AUTH_PASSWORD: SITE_PASS,
  });
  assert.equal(await statusOf(req(basic(SITE_USER, SITE_PASS)), env), 200);
  assert.equal(await statusOf(req(bearer(TOKEN)), env), 200);
  assert.equal(await statusOf(req(basic("other", SITE_PASS)), env), 401);
});

test("staging site Basic does not open admin without the flag, staging env, or admin host", async () => {
  const base = {
    ADMIN_TOKEN: TOKEN,
    SITE_ENV: "staging",
    ADMIN_HOST,
    ADMIN_ACCEPT_SITE_BASIC: "true",
    STAGING_BASIC_AUTH_USER: SITE_USER,
    STAGING_BASIC_AUTH_PASSWORD: SITE_PASS,
  };
  assert.equal(await statusOf(req(basic(SITE_USER, SITE_PASS), ADMIN_HOST), { ...base, ADMIN_ACCEPT_SITE_BASIC: undefined }), 401);
  assert.equal(await statusOf(req(basic(SITE_USER, SITE_PASS), ADMIN_HOST), { ...base, SITE_ENV: "production" }), 401);
  assert.equal(await statusOf(req(basic(SITE_USER, SITE_PASS), "store.shop.example"), base), 401);
});

test("email/password is independent of ADMIN_ACCEPT_SITE_BASIC", async () => {
  const env = loginEnv({
    SITE_ENV: "production",
    ADMIN_HOST,
    ADMIN_ACCEPT_SITE_BASIC: undefined,
    STAGING_BASIC_AUTH_USER: SITE_USER,
    STAGING_BASIC_AUTH_PASSWORD: SITE_PASS,
  });
  assert.equal(await statusOf(req(basic(EMAIL, PASSWORD)), env), 200);
  assert.equal(await statusOf(req(basic(SITE_USER, SITE_PASS)), env), 401);
});
