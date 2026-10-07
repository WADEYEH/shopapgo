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
  assert.equal((await call(STORE, "/cart.html", { headers: { Authorization: BASIC } })).status, 200);
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
  for (const path of ["/css/commerce.css", "/css/admin.css", "/js/admin.js", "/js/commerce/shared.js", "/js/commerce/product-data.js", "/assets/brand/apgo-logo.png"]) {
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
  assert.equal((await call("localhost", "/cart.html", { e })).status, 200);
  assert.equal((await call(ADMIN, "/cart.html", { e })).status, 200);
});

// One [env.<name>] block with its sub-tables, up to the next environment.
const envSection = (toml, name) => {
  const start = toml.indexOf(`[env.${name}]`);
  assert.notEqual(start, -1, `[env.${name}] exists`);
  const end = toml.slice(start + 1).search(new RegExp(`^\\[\\[?env\\.(?!${name}[.\\]])`, "m"));
  return end === -1 ? toml.slice(start) : toml.slice(start, start + 1 + end);
};

test("wrangler.toml binds both staging custom domains and sets ADMIN_HOST; production binds store + admin hosts without site-Basic", async () => {
  const { readFile } = await import("node:fs/promises");
  const toml = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  const staging = envSection(toml, "staging");
  assert.match(staging, /pattern = "staging\.shopapgo\.com", custom_domain = true/);
  assert.match(staging, /pattern = "admin-staging\.shopapgo\.com", custom_domain = true/);
  assert.match(staging, /^ADMIN_HOST = "admin-staging\.shopapgo\.com"/m);
  assert.match(staging, /^ADMIN_ACCEPT_SITE_BASIC = "true"/m);
  assert.match(staging, /^SITE_ENV = "staging"/m, "the test site keeps the Basic-auth gate and noindex");
  assert.match(staging, /^AIRWALLEX_ENV = "demo"/m);
  assert.ok(!/^\s*(PRICING_APPROVED|META_DATASET_ID|MCF_AUTO_SUBMIT)\s*=/m.test(staging), "the test site never takes live payments, sends Meta events or ships through Amazon");
  assert.ok(!toml.includes("[env.next"), "next.shopapgo.com was retired (plan D38)");
  // Staging is the single site: brand export + store pages (scripts/build-site.mjs), "/" is the brand home.
  assert.match(staging, /^directory = "\.\/site"/m);
  assert.match(staging, /^not_found_handling = "404-page"/m);
  assert.ok(!/^\s*ROOT_PAGE\s*=/m.test(staging), "the brand export has its own index.html");
  assert.match(staging, /^SITE_HOME_URL = "https:\/\/staging\.shopapgo\.com"/m);
  const production = envSection(toml, "production");
  assert.match(production, /pattern = "store\.shopapgo\.com", custom_domain = true/);
  assert.match(production, /pattern = "admin\.shopapgo\.com", custom_domain = true/);
  assert.match(production, /^ADMIN_HOST = "admin\.shopapgo\.com"/m);
  // The live www/apex store routes (Cloudflare Workers Routes, 2026-10-06). Wrangler replaces dashboard routes with the
  // configured list on deploy, so dropping one here would take that store path off the live site.
  const storePaths = ["/products*", "/cart*", "/checkout*", "/api/*", "/terms*", "/privacy*", "/returns*", "/contact*", "/css/*", "/js/*", "/assets/*", "/.well-known/*"];
  const zoneRoutes = [...production.matchAll(/\{ pattern = "([^"]+)", zone_name = "shopapgo\.com" \}/g)].map((match) => match[1]);
  assert.deepEqual(zoneRoutes.sort(), ["www.shopapgo.com", "shopapgo.com"].flatMap((host) => storePaths.map((path) => host + path)).sort());
  assert.match(production, /^directory = "\.\/prototype"/m, "production serves the store pages only until the cutover");
  assert.match(production, /^ROOT_PAGE = "\/v3"/m, "this repo has no legacy index.html, so / must serve the v3 store entry");
  for (const section of [toml.slice(0, toml.indexOf("[env.")), staging, production]) {
    assert.match(section, /run_worker_first = true/, "all assets must pass the Worker host/auth gates");
  }
  assert.ok(!/^\s*(PRICING_APPROVED|EXPRESS_CHECKOUT|MCF_AUTO_SUBMIT|SITE_ENV)\s*=/m.test(production), "no flag that would open payments or the staging gate in production");
  assert.ok(!/^\s*ADMIN_ACCEPT_SITE_BASIC\s*=/m.test(production),"production has no website Basic login; admin uses ADMIN_LOGIN_* + ADMIN_TOKEN");
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

test("ADMIN_ACCEPT_SITE_BASIC unset or not exactly \"true\" (production default): site Basic is off; ADMIN_TOKEN still works", async () => {
  for (const extra of [{ ADMIN_ACCEPT_SITE_BASIC: undefined }, { ADMIN_ACCEPT_SITE_BASIC: "false" }, { ADMIN_ACCEPT_SITE_BASIC: "1" }, { ADMIN_ACCEPT_SITE_BASIC: "" }, { SITE_ENV: undefined }, { SITE_ENV: "production" }]) {
    const e = env(extra);
    assert.equal((await call(ADMIN, "/admin/api/orders", { headers: { Authorization: BASIC }, e })).status, 401, JSON.stringify(extra));
    assert.equal((await call(ADMIN, "/admin/api/orders", { headers: bearer, e })).status, 200, JSON.stringify(extra));
  }
});

const LOGIN_EMAIL = "owner@example.com";
const LOGIN_PASSWORD = "owner-login-password-test";

test("admin host: owner email/password Basic works without SITE_ENV=staging or ADMIN_ACCEPT_SITE_BASIC", async () => {
  const e = env({
    SITE_ENV: undefined,
    ADMIN_ACCEPT_SITE_BASIC: undefined,
    ADMIN_LOGIN_EMAIL: LOGIN_EMAIL,
    ADMIN_LOGIN_PASSWORD: LOGIN_PASSWORD,
    ADMIN_TOKEN: "",
  });
  assert.equal((await call(ADMIN, "/admin/", { headers: basicOf(LOGIN_EMAIL, LOGIN_PASSWORD), e })).status, 200);
  assert.equal((await call(ADMIN, "/admin/", { headers: basicOf("Owner@Example.com", LOGIN_PASSWORD), e })).status, 200);
  assert.equal((await call(ADMIN, "/admin/", { headers: basicOf("anyone", LOGIN_PASSWORD), e })).status, 401);
  assert.equal((await call(ADMIN, "/admin/", { headers: basicOf(LOGIN_EMAIL, "nope"), e })).status, 401);
  assert.equal((await call(ADMIN, "/admin/", { headers: { Authorization: `Bearer ${LOGIN_PASSWORD}` }, e })).status, 401);
});

test("admin host: email/password and ADMIN_TOKEN both work when both are configured", async () => {
  const e = env({ ADMIN_LOGIN_EMAIL: LOGIN_EMAIL, ADMIN_LOGIN_PASSWORD: LOGIN_PASSWORD });
  assert.equal((await call(ADMIN, "/admin/api/orders", { headers: basicOf(LOGIN_EMAIL, LOGIN_PASSWORD), e })).status, 200);
  assert.equal((await call(ADMIN, "/admin/api/orders", { headers: bearer, e })).status, 200);
  assert.equal((await call(ADMIN, "/admin/api/orders", { headers: basicOf("ops", TOKEN), e })).status, 200);
});

test("missing website Basic secrets never open the back office with empty credentials", async () => {
  const e = env({ STAGING_BASIC_AUTH_USER: "", STAGING_BASIC_AUTH_PASSWORD: "" });
  assert.equal((await call(ADMIN, "/admin/api/orders", { headers: basicOf("", ""), e })).status, 401);
  assert.equal((await call(ADMIN, "/admin/api/orders", { headers: bearer, e })).status, 200);
});
