// Host split (worker/hosts.js): the back office only lives on ADMIN_HOST; the store hosts answer 404 for /admin*.
import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.js";
import { createD1, sqliteAvailable } from "./helpers/d1.mjs";

const DB = (await sqliteAvailable()) ? await createD1() : null;
const skip = DB ? false : "node:sqlite unavailable";

globalThis.fetch = async (url) => { throw new Error(`unexpected real network call: ${url}`); };

const STORE = "staging.shop.example";
const ADMIN = "admin-staging.shop.example";
const TOKEN = "admin-token-0123456789abcdef";
const BASIC = "Basic " + Buffer.from("user:basic-pass-0123456789").toString("base64");
const bearer = { Authorization: `Bearer ${TOKEN}` };
const NOINDEX = "noindex, nofollow, noarchive";

const env = (extra = {}) => ({
  ASSETS: { fetch: async (request) => new Response(`asset:${new URL(request.url).pathname}`, { headers: { "Content-Type": "text/html" } }) },
  DB,
  AIRWALLEX_ENV: "demo",
  SITE_ENV: "staging",
  STAGING_BASIC_AUTH_USER: "user",
  STAGING_BASIC_AUTH_PASSWORD: "basic-pass-0123456789",
  ADMIN_TOKEN: TOKEN,
  ADMIN_HOST: ADMIN,
  ADMIN_ACCEPT_SITE_BASIC: "true",
  ...extra,
});
const call = (host, path, { method = "GET", headers = {}, body, e = env() } = {}) =>
  worker.fetch(new Request(`https://${host}${path}`, { method, headers, body }), e, { waitUntil() {} });

test("store host: /admin and /admin/api/* answer 404 (even with the right token), the store keeps working", { skip }, async () => {
  for (const path of ["/admin", "/admin/", "/admin/index.html", "/admin/api/orders", "/admin/api/mcf/sync"]) {
    for (const headers of [{ Authorization: BASIC }, bearer, {}]) {
      const res = await call(STORE, path, { headers });
      assert.equal(res.status, 404, `${path} ${Object.keys(headers)}`);
    }
  }
  assert.equal((await call(STORE, "/v3.html", { headers: { Authorization: BASIC } })).status, 200);
  assert.equal((await call(STORE, "/", {})).status, 401, "store stays behind the Basic gate");
  // workers.dev is a store host too
  assert.equal((await call("apgo-us-store-staging.acct.workers.dev", "/admin/", { headers: bearer })).status, 404);
});

test("admin host: no token -> 401, token -> page and API, everything noindex", { skip }, async () => {
  const noTok = await call(ADMIN, "/admin/");
  assert.equal(noTok.status, 401);
  assert.match(noTok.headers.get("www-authenticate"), /^Basic /);
  assert.ok(noTok.headers.get("x-robots-tag").includes("noindex"));
  assert.equal((await call(ADMIN, "/admin/api/orders")).status, 401);
  assert.equal((await call(ADMIN, "/admin/", { headers: { Authorization: "Basic " + Buffer.from("user:wrong-pass-0123456789").toString("base64") } })).status, 401);

  const page = await call(ADMIN, "/admin/", { headers: bearer });
  assert.equal(page.status, 200);
  assert.ok(page.headers.get("x-robots-tag").includes("noindex"));
  const api = await call(ADMIN, "/admin/api/orders", { headers: bearer });
  assert.equal(api.status, 200);
  assert.ok(Array.isArray((await api.json()).orders));
  assert.equal((await call(ADMIN, "/admin", { headers: bearer })).status, 301);
});

test("admin host: only the back office and its own css/js/logo; the storefront is 404 and there is one password only", { skip }, async () => {
  for (const path of ["/css/commerce.css", "/css/admin.css", "/js/admin.js", "/js/commerce/shared.js", "/assets/brand/apgo-logo.png"]) {
    const res = await call(ADMIN, path);
    assert.equal(res.status, 200, path);
    assert.ok(res.headers.get("x-robots-tag").includes("noindex"), path);
  }
  for (const path of ["/", "/v3.html", "/cart.html", "/checkout.html", "/privacy.html", "/js/v3.js", "/api/store/config", "/api/orders/APGO-US-0123456789AB", "/api/webhooks/airwallex", "/adminx", "/.well-known/apple-developer-merchantid-domain-association"]) {
    for (const headers of [{}, bearer, { Authorization: BASIC }]) {
      const res = await call(ADMIN, path, { headers, method: path.startsWith("/api/webhooks") ? "POST" : "GET" });
      assert.equal(res.status, 404, path);
      assert.ok(res.headers.get("x-robots-tag").includes("noindex"), path);
    }
  }
  const robots = await call(ADMIN, "/robots.txt");
  assert.equal(robots.status, 200);
  assert.equal(await robots.text(), "User-agent: *\nDisallow: /\n");
});

test("admin host is case-insensitive; a lookalike host is a store host", { skip }, async () => {
  assert.equal((await call(ADMIN.toUpperCase(), "/admin/", { headers: bearer })).status, 200);
  assert.equal((await call(`x.${ADMIN}`, "/admin/", { headers: bearer })).status, 404);
  assert.equal((await call(`${ADMIN}.evil.example`, "/admin/api/orders", { headers: bearer })).status, 404);
});

test("admin host: CSRF same-origin check is relative to the admin host", { skip }, async () => {
  const post = (headers) =>
    call(ADMIN, "/admin/api/mcf/sync", { method: "POST", body: "{}", headers: { ...bearer, "Content-Type": "application/json", ...headers } });
  assert.equal((await post({ Origin: `https://${STORE}` })).status, 403, "store origin is cross-origin for the admin host");
  assert.equal((await post({ Origin: "https://evil.example" })).status, 403);
  assert.equal((await post({ "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await post({ "Sec-Fetch-Site": "same-site" })).status, 403);
  assert.equal((await post({ Origin: `https://${ADMIN}`, "Sec-Fetch-Site": "same-origin" })).status, 200);
  assert.equal((await post({ "Content-Type": "text/plain" })).status, 403);
  // and the store host cannot be used as a same-origin vector for admin writes
  const viaStore = await call(STORE, "/admin/api/mcf/sync", { method: "POST", body: "{}", headers: { ...bearer, "Content-Type": "application/json", Origin: `https://${STORE}` } });
  assert.equal(viaStore.status, 404);
});

test("ADMIN_HOST unset (local dev / tests): one host serves store and back office as before", { skip }, async () => {
  const e = env({ ADMIN_HOST: undefined, SITE_ENV: undefined });
  assert.equal((await call("localhost", "/admin/", { headers: bearer, e })).status, 200);
  assert.equal((await call("localhost", "/v3.html", { e })).status, 200);
  assert.equal((await call(ADMIN, "/v3.html", { e })).status, 200);
});

test("wrangler.toml binds both staging custom domains and sets ADMIN_HOST; production stays unbound", async () => {
  const { readFile } = await import("node:fs/promises");
  const toml = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  const staging = toml.slice(toml.indexOf("[env.staging]"), toml.indexOf("[env.production]"));
  assert.match(staging, /pattern = "staging\.shopapgo\.com", custom_domain = true/);
  assert.match(staging, /pattern = "admin-staging\.shopapgo\.com", custom_domain = true/);
  assert.match(staging, /^ADMIN_HOST = "admin-staging\.shopapgo\.com"/m);
  assert.match(staging, /^ADMIN_ACCEPT_SITE_BASIC = "true"/m);
  const production = toml.slice(toml.indexOf("[env.production]"));
  assert.ok(!/^\s*routes\s*=/m.test(production), "production routes stay commented out (planned: admin.shopapgo.com)");
  assert.ok(!/^\s*ADMIN_HOST\s*=/m.test(production));
  assert.ok(!/^\s*ADMIN_ACCEPT_SITE_BASIC\s*=/m.test(production), "prod admin accepts ADMIN_TOKEN only unless the owner decides otherwise");
});

const basicOf = (user, pass) => ({ Authorization: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64") });

test("admin host also accepts the website Basic login (staging secrets), ADMIN_TOKEN keeps working", async () => {
  for (const path of ["/admin/", "/admin/api/orders"]) {
    assert.equal((await call(ADMIN, path, { headers: { Authorization: BASIC } })).status, 200, path);
    assert.equal((await call(ADMIN, path, { headers: bearer })).status, 200, path);
    assert.equal((await call(ADMIN, path, { headers: basicOf("anyone", TOKEN) })).status, 200, path);
  }
  const ok = await call(ADMIN, "/admin/api/orders", { headers: { Authorization: BASIC } });
  assert.ok(ok.headers.get("x-robots-tag").includes("noindex"));
  assert.equal((await call(ADMIN, "/admin/api/mcf/sync", { method: "POST", body: "{}", headers: { Authorization: BASIC, "Content-Type": "application/json", Origin: `https://${ADMIN}` } })).status, 200, "writes work with the site login + same-origin");
  assert.equal((await call(ADMIN, "/admin/api/mcf/sync", { method: "POST", body: "{}", headers: { Authorization: BASIC, "Content-Type": "application/json", Origin: `https://${STORE}` } })).status, 403, "CSRF guard still applies");
});

test("admin host: wrong or partial website credentials -> 401", async () => {
  const cases = [basicOf("user", "wrong-pass-0123456789"), basicOf("other", "basic-pass-0123456789"), basicOf("", ""), basicOf("user", ""), { Authorization: "Basic !!!" }, { Authorization: "Bearer basic-pass-0123456789" }, {}];
  for (const headers of cases) {
    for (const path of ["/admin/", "/admin/api/orders"]) {
      const res = await call(ADMIN, path, { headers });
      assert.equal(res.status, 401, `${path} ${JSON.stringify(Object.keys(headers))}`);
      assert.match(res.headers.get("www-authenticate"), /^Basic /);
    }
  }
});

test("site Basic login only works on the admin host; the store host still 404s /admin", async () => {
  for (const path of ["/admin", "/admin/", "/admin/api/orders"]) {
    assert.equal((await call(STORE, path, { headers: { Authorization: BASIC } })).status, 404, path);
  }
  assert.equal((await call("apgo-us-store-staging.acct.workers.dev", "/admin/", { headers: { Authorization: BASIC } })).status, 404);
});

test("ADMIN_ACCEPT_SITE_BASIC unset or not exactly \"true\" (production default): only ADMIN_TOKEN opens the back office", async () => {
  for (const extra of [{ ADMIN_ACCEPT_SITE_BASIC: undefined }, { ADMIN_ACCEPT_SITE_BASIC: "false" }, { ADMIN_ACCEPT_SITE_BASIC: "1" }, { ADMIN_ACCEPT_SITE_BASIC: "" }, { SITE_ENV: undefined }, { SITE_ENV: "production" }]) {
    const e = env(extra);
    assert.equal((await call(ADMIN, "/admin/api/orders", { headers: { Authorization: BASIC }, e })).status, 401, JSON.stringify(extra));
    assert.equal((await call(ADMIN, "/admin/api/orders", { headers: bearer, e })).status, 200, JSON.stringify(extra));
  }
});

test("missing website Basic secrets never open the back office with empty credentials", async () => {
  const e = env({ STAGING_BASIC_AUTH_USER: "", STAGING_BASIC_AUTH_PASSWORD: "" });
  assert.equal((await call(ADMIN, "/admin/api/orders", { headers: basicOf("", ""), e })).status, 401);
  assert.equal((await call(ADMIN, "/admin/api/orders", { headers: bearer, e })).status, 200);
});
