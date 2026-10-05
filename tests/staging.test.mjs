// Staging gate (worker/staging.js): noindex header, /robots.txt, Basic auth, and that other envs are untouched.
import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.js";
import { isBasicExempt } from "../worker/staging.js";

globalThis.fetch = async (url) => { throw new Error(`unexpected real network call: ${url}`); };

const USER = "staging-user";
const PASS = "staging-pass-0123456789abcdef";
const basic = (user = USER, pass = PASS) => `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

const assets = async (request) => new Response(`asset:${new URL(request.url).pathname}`, { headers: { "Content-Type": "text/html" } });
const env = (extra = {}) => ({
  ASSETS: { fetch: assets },
  AIRWALLEX_ENV: "demo",
  SITE_ENV: "staging",
  STAGING_BASIC_AUTH_USER: USER,
  STAGING_BASIC_AUTH_PASSWORD: PASS,
  ADMIN_TOKEN: "admin-token-0123456789abcdef",
  ...extra,
});
const call = (path, { method = "GET", headers = {}, e = env() } = {}) =>
  worker.fetch(new Request(`https://staging.example${path}`, { method, headers }), e, { waitUntil() {} });

const NOINDEX = "noindex, nofollow, noarchive";

test("staging: no credentials -> 401 with a Basic challenge and the noindex header", async () => {
  for (const path of ["/", "/v3.html", "/cart.html", "/checkout.html", "/privacy.html", "/api/store/config"]) {
    const res = await call(path);
    assert.equal(res.status, 401, path);
    assert.match(res.headers.get("www-authenticate"), /^Basic /);
    assert.equal(res.headers.get("x-robots-tag"), NOINDEX);
  }
});

test("staging: wrong user or password -> 401", async () => {
  assert.equal((await call("/", { headers: { Authorization: basic(USER, "nope") } })).status, 401);
  assert.equal((await call("/", { headers: { Authorization: basic("other", PASS) } })).status, 401);
  assert.equal((await call("/", { headers: { Authorization: "Bearer xyz" } })).status, 401);
  assert.equal((await call("/", { headers: { Authorization: "Basic !!!notbase64" } })).status, 401);
});

test("staging: correct credentials reach pages and the API, every response has X-Robots-Tag", async () => {
  const page = await call("/v3.html", { headers: { Authorization: basic() } });
  assert.equal(page.status, 200);
  assert.equal(await page.text(), "asset:/v3.html");
  assert.equal(page.headers.get("x-robots-tag"), NOINDEX);
  const cfg = await call("/api/store/config", { headers: { Authorization: basic() } });
  assert.equal(cfg.status, 200);
  assert.equal(cfg.headers.get("x-robots-tag"), NOINDEX);
  const missing = await call("/api/nope", { headers: { Authorization: basic() } });
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("x-robots-tag"), NOINDEX);
});

test("staging: /robots.txt is public and disallows everything", async () => {
  const res = await call("/robots.txt");
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "User-agent: *\nDisallow: /\n");
  assert.equal(res.headers.get("x-robots-tag"), NOINDEX);
  const head = await call("/robots.txt", { method: "HEAD" });
  assert.equal(head.status, 200);
});

test("staging: missing Basic secrets fail closed (503), never open", async () => {
  const res = await call("/", { e: env({ STAGING_BASIC_AUTH_PASSWORD: "" }) });
  assert.equal(res.status, 503);
  const res2 = await call("/", { headers: { Authorization: basic("", "") }, e: env({ STAGING_BASIC_AUTH_USER: "", STAGING_BASIC_AUTH_PASSWORD: "" }) });
  assert.equal(res2.status, 503);
});

test("staging: webhook and /admin skip the Basic gate and keep their own checks", async () => {
  assert.equal(isBasicExempt("/api/webhooks/airwallex"), true);
  assert.equal(isBasicExempt("/api/webhooks/paypal"), true);
  assert.equal(isBasicExempt("/admin"), true);
  assert.equal(isBasicExempt("/admin/api/orders"), true);
  assert.equal(isBasicExempt("/api/webhooks/airwallex/extra"), false);
  assert.equal(isBasicExempt("/api/webhooks/paypal/extra"), false);
  assert.equal(isBasicExempt("/administrator"), false);
  assert.equal(isBasicExempt("/api/orders/x"), false);

  // Webhook without a valid signature: rejected by the handler (400), not by the Basic gate (401).
  const hook = await call("/api/webhooks/airwallex", { method: "POST", e: env({ AIRWALLEX_WEBHOOK_SECRET: "whsec_x", DB: {} }) });
  assert.equal(hook.status, 400);
  assert.equal(hook.headers.get("x-robots-tag"), NOINDEX);
  const paypalHook = await call("/api/webhooks/paypal", { method: "POST", e: env({ PAYPAL_WEBHOOK_ID: "wh", DB: {} }) });
  assert.equal(paypalHook.status, 400);
  assert.equal(paypalHook.headers.get("x-robots-tag"), NOINDEX);

  // /admin still needs ADMIN_TOKEN.
  const noTok = await call("/admin/api/orders");
  assert.equal(noTok.status, 401);
  assert.equal(noTok.headers.get("x-robots-tag"), NOINDEX);
  const page = await call("/admin/", { headers: { Authorization: basic("admin", "admin-token-0123456789abcdef") } });
  assert.equal(page.status, 200);
  // The admin page's own CSS/JS sit behind the gate, so a valid ADMIN_TOKEN also passes it (but a short / wrong one does not).
  const css = await call("/css/commerce.css", { headers: { Authorization: basic("admin", "admin-token-0123456789abcdef") } });
  assert.equal(css.status, 200);
  assert.equal((await call("/css/commerce.css", { headers: { Authorization: basic("admin", "wrong-token-0123456789abcdef") } })).status, 401);
  assert.equal((await call("/css/commerce.css", { e: env({ ADMIN_TOKEN: "short" }), headers: { Authorization: basic("admin", "short") } })).status, 401);
  // The staging Basic credentials are NOT an admin token.
  assert.equal((await call("/admin/", { headers: { Authorization: basic() } })).status, 401);
});

test("non-staging (prod / local dev): pass-through, no gate, no robots override, no forced header", async () => {
  for (const extra of [{ SITE_ENV: undefined }, { SITE_ENV: "production" }, { SITE_ENV: "" }]) {
    const e = env(extra);
    const page = await call("/v3.html", { e });
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("x-robots-tag"), null);
    const robots = await call("/robots.txt", { e });
    assert.equal(await robots.text(), "asset:/robots.txt");
    assert.equal((await call("/api/store/config", { e })).status, 200);
  }
});

test("ROOT_PAGE: '/' serves that page only for GET/HEAD on '/', everything else untouched", async () => {
  const e = env({ ROOT_PAGE: "/v3" });
  const auth = { Authorization: basic() };
  const home = await call("/", { headers: auth, e });
  assert.equal(home.status, 200);
  assert.equal(await home.text(), "asset:/v3");
  assert.equal(home.headers.get("x-robots-tag"), NOINDEX);
  assert.equal(await (await call("/", { headers: auth, e: env() })).text(), "asset:/");
  assert.equal(await (await call("/cart.html", { headers: auth, e })).text(), "asset:/cart.html");
  assert.equal(await (await call("/v2.html", { headers: auth, e })).text(), "asset:/v2.html");
  assert.equal((await call("/", { e })).status, 401); // still behind the gate
  for (const bad of ["v3", "/a/b", "//evil.example", "/v3?x", ""]) {
    assert.equal(await (await call("/", { headers: auth, e: env({ ROOT_PAGE: bad }) })).text(), "asset:/", JSON.stringify(bad));
  }
});
