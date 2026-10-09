// Back-office sign-in, members and the activity log (PR 3-2; M9-01, M9-02, M9-09, M9-10, M9-11, M9-19). Cloudflare
// Access tokens are signed here with a throwaway RSA key and the team's key endpoint is stubbed; the Cloudflare list API
// and the email API are stubbed too. Nothing reaches the network.
import assert from "node:assert/strict";
import test from "node:test";

import worker from "../worker/index.js";
import { resetAccessKeyCache, verifyAccessToken } from "../worker/admin-identity.js";
import { listActivity } from "../worker/activity.js";
import { createD1, sqliteAvailable } from "./helpers/d1.mjs";

const skip = (await sqliteAvailable()) ? false : "node:sqlite unavailable";

const TEAM = "https://apgo-test.cloudflareaccess.com";
const AUD = "aud-0123456789abcdef";
const MAIL_URL = "https://mail.example/send";
const CF_API = "https://cf-api.example/client/v4";
const OWNER = "owner@apgo.example";
const COLLEAGUE = "colleague@apgo.example";
const TOKEN = "test-admin-token-0123456789";
const SHARED = { email: "Shared@APGO.example", password: "shared-password-123" };
const basic = (user, password) => ({ Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}` });

const keyPair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const otherPair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const publicJwk = { ...(await crypto.subtle.exportKey("jwk", keyPair.publicKey)), kid: "kid-1" };
const b64url = (value) => Buffer.from(value).toString("base64url");
const nowS = () => Math.floor(Date.now() / 1000);

async function accessToken(claims = {}, { kid = "kid-1", key = keyPair.privateKey, alg = "RS256" } = {}) {
  const header = b64url(JSON.stringify({ alg, kid, typ: "JWT" }));
  const payload = b64url(JSON.stringify({ aud: [AUD], iss: TEAM, exp: nowS() + 3600, iat: nowS(), nbf: nowS(), type: "app", ...claims }));
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${payload}`)));
  return `${header}.${payload}.${b64url(signature)}`;
}
const as = async (email, claims) => ({ "Cf-Access-Jwt-Assertion": await accessToken({ email, ...claims }) });

const baseEnv = (db, extra = {}) => ({
  DB: db,
  ADMIN_LOGIN_EMAIL: SHARED.email,
  ADMIN_LOGIN_PASSWORD: SHARED.password,
  ADMIN_TOKEN: TOKEN,
  ADMIN_OWNER_EMAIL: OWNER,
  RESEND_API_KEY: "rk_test_key",
  CUSTOMER_EMAIL_FROM: "APGO <orders@shop.example>",
  ORDER_NOTIFY_EMAIL_API_URL: MAIL_URL,
  ASSETS: { fetch: async () => new Response("<h1>back office</h1>", { headers: { "Content-Type": "text/html" } }) },
  ...extra,
});
const accessEnv = (db, extra = {}) => baseEnv(db, { ADMIN_ACCESS: "true", ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD, ...extra });
const listEnv = (db, extra = {}) => accessEnv(db, { CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef", ACCESS_LIST_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", ACCESS_LIST_API_TOKEN: "cf-list-token", CLOUDFLARE_API_BASE: CF_API, ...extra });

// Stubs the network for one test: the team's keys, the email API and (optionally) the Cloudflare list API.
async function withWorld(run, { certs = () => Response.json({ keys: [publicJwk] }), cloudflare = null } = {}) {
  const original = globalThis.fetch;
  const calls = { certs: 0, mails: [], cloudflare: [] };
  resetAccessKeyCache();
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href === `${TEAM}/cdn-cgi/access/certs`) {
      calls.certs += 1;
      return certs();
    }
    if (href === MAIL_URL) {
      calls.mails.push({ body: JSON.parse(init.body), headers: init.headers });
      return Response.json({ id: crypto.randomUUID() });
    }
    if (cloudflare && href.startsWith(CF_API)) {
      calls.cloudflare.push({ method: init.method, url: href, body: init.body ? JSON.parse(init.body) : null, auth: init.headers?.Authorization });
      return cloudflare(href, init);
    }
    throw new Error(`unexpected network call: ${href}`);
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

const call = (env, path, { method = "GET", headers = {}, body, host = "https://shop.example" } = {}) =>
  worker.fetch(
    new Request(`${host}${path}`, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
    { waitUntil() {} },
  );
const read = async (response) => ({ status: response.status, body: await response.json() });
const rows = (db, sql, ...args) => db.raw.prepare(sql).all(...args).map((row) => ({ ...row }));

// ---------- signing in ----------

test("before Access: the shared login is the owner under its email, the script token is a member, wrong passwords get the prompt", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db);
  await withWorld(async () => {
    const shared = await read(await call(env, "/admin/api/me", { headers: basic(SHARED.email, SHARED.password) }));
    assert.deepEqual(shared, { status: 200, body: { actor: { id: "shared@apgo.example", email: "shared@apgo.example", role: "owner", via: "password" }, accessSignIn: false } });
    const token = await read(await call(env, "/admin/api/me", { headers: { Authorization: `Bearer ${TOKEN}` } }));
    assert.deepEqual(token.body.actor, { id: "token", email: null, role: "member", via: "token" });
    assert.equal((await call(env, "/admin/api/members", { headers: { Authorization: `Bearer ${TOKEN}` } })).status, 403, "the token cannot manage members");
    const wrong = await call(env, "/admin/api/me", { headers: basic(SHARED.email, "nope") });
    assert.equal(wrong.status, 401);
    assert.match(wrong.headers.get("WWW-Authenticate"), /^Basic/);
  });
});

test("staging: the website's Basic login opens the admin host as the owner 'staging-login'", { skip }, async () => {
  const db = await createD1();
  const env = baseEnv(db, { SITE_ENV: "staging", ADMIN_HOST: "admin.example", ADMIN_ACCEPT_SITE_BASIC: "true", STAGING_BASIC_AUTH_USER: "tester", STAGING_BASIC_AUTH_PASSWORD: "staging-pass" });
  await withWorld(async () => {
    const me = await read(await call(env, "/admin/api/me", { host: "https://admin.example", headers: basic("tester", "staging-pass") }));
    assert.deepEqual(me.body.actor, { id: "staging-login", email: null, role: "owner", via: "staging-login" });
  });
});

test("Access: a member's token gets in with their role; the first owner comes from ADMIN_OWNER_EMAIL on their first visit", { skip }, async () => {
  const db = await createD1();
  const env = accessEnv(db);
  await withWorld(async (calls) => {
    const me = await read(await call(env, "/admin/api/me", { headers: await as("Owner@APGO.example") }));
    assert.deepEqual(me.body, { actor: { id: OWNER, email: OWNER, role: "owner", via: "access" }, accessSignIn: true });
    assert.deepEqual(rows(db, "SELECT email, role, status, added_by FROM admin_members"), [{ email: OWNER, role: "owner", status: "active", added_by: "system" }]);
    assert.deepEqual(rows(db, "SELECT actor, action, target FROM admin_audit"), [{ actor: "system", action: "member.bootstrap", target: OWNER }]);
    // The keys are fetched once and reused.
    await call(env, "/admin/api/me", { headers: await as(OWNER) });
    assert.equal(calls.certs, 1);
    // The cookie Access sets works the same as the header.
    const cookie = await read(await call(env, "/admin/api/me", { headers: { Cookie: `theme=dark; CF_Authorization=${await accessToken({ email: OWNER })}` } }));
    assert.equal(cookie.body.actor.id, OWNER);
  });
});

test("Access: not on the list, removed a moment ago, or a bad token = no entry (M9-01, M9-11)", { skip }, async () => {
  const db = await createD1();
  const env = accessEnv(db);
  await withWorld(async (calls) => {
    const stranger = await read(await call(env, "/admin/api/orders", { headers: await as("someone@gmail.example") }));
    assert.equal(stranger.status, 403);
    assert.equal(stranger.body.error.code, "not_a_member");
    assert.match(stranger.body.error.message, /not on the back-office member list/);

    const owner = await as(OWNER);
    assert.equal((await call(env, "/admin/api/members", { method: "POST", headers: owner, body: { email: COLLEAGUE, role: "member" } })).status, 200);
    assert.equal((await call(env, "/admin/api/orders", { headers: await as(COLLEAGUE) })).status, 200);
    assert.equal((await call(env, "/admin/api/members/remove", { method: "POST", headers: owner, body: { email: COLLEAGUE, reason: "left the team" } })).status, 200);
    const removed = await read(await call(env, "/admin/api/orders", { headers: await as(COLLEAGUE) }));
    assert.equal(removed.status, 403, "removal works on the very next request, before their Access session ends");

    const bad = [
      ["expired", await accessToken({ email: OWNER, exp: nowS() - 3600 })],
      ["another application", await accessToken({ email: OWNER, aud: ["someone-else"] })],
      ["another team", await accessToken({ email: OWNER, iss: "https://evil.cloudflareaccess.com" })],
      ["signed with another key", await accessToken({ email: OWNER }, { key: otherPair.privateKey })],
      ["not yet valid", await accessToken({ email: OWNER, nbf: nowS() + 3600 })],
      ["a service token (no email)", await accessToken({ common_name: "script.access" })],
      ["garbage", "not.a.token"],
    ];
    for (const [label, token] of bad) {
      const response = await read(await call(env, "/admin/api/orders", { headers: { "Cf-Access-Jwt-Assertion": token } }));
      assert.equal(response.status, 403, label);
      assert.equal(response.body.error.code, "access_required", label);
    }
    // alg "none" is never accepted.
    const [, payload] = (await accessToken({ email: OWNER })).split(".");
    assert.equal((await call(env, "/admin/api/orders", { headers: { "Cf-Access-Jwt-Assertion": `${b64url(JSON.stringify({ alg: "none", kid: "kid-1" }))}.${payload}.` } })).status, 403);
    // The shared password no longer opens anything once Access is on.
    assert.equal((await call(env, "/admin/api/orders", { headers: basic(SHARED.email, SHARED.password) })).status, 403);
    // Unknown key ids refresh the keys at most once a minute, so junk tokens cannot hammer Cloudflare.
    const before = calls.certs;
    for (let i = 0; i < 5; i += 1) await call(env, "/admin/api/orders", { headers: { "Cf-Access-Jwt-Assertion": await accessToken({ email: OWNER }, { kid: `rotated-${i}` }) } });
    assert.ok(calls.certs - before <= 1);

    // The page itself answers with a readable sentence.
    const page = await call(env, "/admin/", { headers: await as("someone@gmail.example") });
    assert.equal(page.status, 403);
    assert.match(page.headers.get("Content-Type"), /^text\/plain/);
    assert.match(await page.text(), /Ask an owner to add you/);
  });
});

test("Access misconfigured or the team's keys unreachable: 503, never open", { skip }, async () => {
  const db = await createD1();
  await withWorld(async () => {
    for (const extra of [{ ACCESS_TEAM_DOMAIN: "" }, { ACCESS_TEAM_DOMAIN: "https://evil.example" }, { ACCESS_AUD: "" }]) {
      const response = await read(await call(accessEnv(db, extra), "/admin/api/me", { headers: await as(OWNER) }));
      assert.equal(response.status, 503, JSON.stringify(extra));
      assert.equal(response.body.error.code, "admin_access_not_configured");
    }
  });
  await withWorld(async () => {
    const response = await read(await call(accessEnv(db), "/admin/api/me", { headers: await as(OWNER) }));
    assert.equal(response.status, 503);
    assert.equal(response.body.error.code, "access_unavailable");
  }, { certs: () => new Response("down", { status: 502 }) });
  // The team domain may be given without the scheme.
  await withWorld(async () => {
    assert.equal((await call(accessEnv(db, { ACCESS_TEAM_DOMAIN: "apgo-test.cloudflareaccess.com" }), "/admin/api/me", { headers: await as(OWNER) })).status, 200);
  });
  const claims = await verifyAccessToken(await accessToken({ email: OWNER }), { team: TEAM, aud: AUD, fetchImpl: async () => Response.json({ keys: [publicJwk] }) });
  assert.equal(claims.email, OWNER);
});

// ---------- members ----------

test("members: only owners manage; reasons and before/after are logged; every owner is emailed (M9-09, M9-10)", { skip }, async () => {
  const db = await createD1();
  const env = accessEnv(db);
  await withWorld(async (calls) => {
    const owner = await as(OWNER);
    const added = await read(await call(env, "/admin/api/members", { method: "POST", headers: owner, body: { email: " Colleague@APGO.example ", role: "member", reason: "Handles shipping" } }));
    assert.equal(added.status, 200);
    assert.equal(added.body.member.email, COLLEAGUE);
    assert.deepEqual(added.body.notified, { sent: 1, skipped: 0, failed: 0 });
    assert.deepEqual(added.body.sync, { status: "not_configured", added: 0, removed: 0, detail: "The Cloudflare Access list sync is not set up." });
    assert.deepEqual(added.body.members.map((m) => [m.email, m.role, m.status]), [[OWNER, "owner", "active"], [COLLEAGUE, "member", "active"]]);
    const [entry] = rows(db, "SELECT * FROM admin_audit WHERE action = 'member.added'");
    assert.equal(entry.actor, OWNER);
    assert.equal(entry.actor_via, "access");
    assert.equal(entry.target, COLLEAGUE);
    assert.equal(entry.before_json, null);
    assert.deepEqual(JSON.parse(entry.after_json), { email: COLLEAGUE, role: "member", status: "active" });
    assert.equal(entry.reason, "Handles shipping");
    assert.deepEqual(JSON.parse(entry.detail_json), { notified: { sent: 1, skipped: 0, failed: 0 } });
    const mail = calls.mails.at(-1);
    assert.deepEqual(mail.body.to, [OWNER]);
    assert.match(mail.body.subject, /colleague@apgo\.example was added as a member/);
    assert.match(mail.body.text, /By: owner@apgo\.example/);
    assert.match(mail.body.text, /Reason: Handles shipping/);

    // A member cannot see or change the list.
    const colleague = await as(COLLEAGUE);
    assert.equal((await call(env, "/admin/api/members", { headers: colleague })).status, 403);
    assert.equal((await call(env, "/admin/api/members", { method: "POST", headers: colleague, body: { email: "x@apgo.example" } })).status, 403);
    assert.equal((await call(env, "/admin/api/me", { headers: colleague })).status, 200);

    // Input checks.
    for (const [body, code] of [[{ email: COLLEAGUE }, "already_member"], [{ email: "not-an-email" }, "invalid_email"], [{ email: "y@apgo.example", role: "admin" }, "invalid_role"]]) {
      const response = await read(await call(env, "/admin/api/members", { method: "POST", headers: owner, body }));
      assert.equal(response.body.error.code, code);
    }
    assert.equal((await call(env, "/admin/api/members", { method: "POST", headers: { ...owner, "Content-Type": "text/plain" }, body: { email: "z@apgo.example" } })).status, 403, "JSON only (CSRF guard)");
    assert.equal((await call(env, "/admin/api/members", { method: "POST", headers: { ...owner, Origin: "https://evil.example" }, body: { email: "z@apgo.example" } })).status, 403);
  });
});

test("members: the last owner can never be removed or made a member; with two owners either can go (M9-10)", { skip }, async () => {
  const db = await createD1();
  const env = accessEnv(db);
  await withWorld(async () => {
    const owner = await as(OWNER);
    await call(env, "/admin/api/me", { headers: owner });
    for (const [path, body] of [["/admin/api/members/remove", { email: OWNER }], ["/admin/api/members/role", { email: OWNER, role: "member" }]]) {
      const response = await read(await call(env, path, { method: "POST", headers: owner, body }));
      assert.equal(response.status, 409, path);
      assert.equal(response.body.error.code, "last_owner");
    }
    await call(env, "/admin/api/members", { method: "POST", headers: owner, body: { email: COLLEAGUE, role: "member" } });
    const promoted = await read(await call(env, "/admin/api/members/role", { method: "POST", headers: owner, body: { email: COLLEAGUE, role: "owner", reason: "Second owner" } }));
    assert.equal(promoted.status, 200);
    assert.equal((await read(await call(env, "/admin/api/members/role", { method: "POST", headers: owner, body: { email: COLLEAGUE, role: "owner" } }))).body.error.code, "no_change");
    // Now the first owner can step down, and the new owner can no longer.
    assert.equal((await call(env, "/admin/api/members/role", { method: "POST", headers: owner, body: { email: OWNER, role: "member" } })).status, 200);
    const colleague = await as(COLLEAGUE);
    assert.equal((await read(await call(env, "/admin/api/members/remove", { method: "POST", headers: colleague, body: { email: COLLEAGUE } }))).body.error.code, "last_owner");
    assert.deepEqual(rows(db, "SELECT action, target, before_json, after_json FROM admin_audit WHERE action = 'member.role_changed' ORDER BY id").map((r) => [r.target, JSON.parse(r.before_json).role, JSON.parse(r.after_json).role]), [[COLLEAGUE, "member", "owner"], [OWNER, "owner", "member"]]);
    // Removing keeps the row; adding again reactivates it.
    assert.equal((await call(env, "/admin/api/members/remove", { method: "POST", headers: colleague, body: { email: OWNER, reason: "Test" } })).status, 200);
    assert.deepEqual(rows(db, "SELECT status FROM admin_members WHERE email = ?", OWNER), [{ status: "removed" }]);
    assert.equal((await call(env, "/admin/api/members", { method: "POST", headers: colleague, body: { email: OWNER, role: "owner" } })).status, 200);
    assert.deepEqual(rows(db, "SELECT role, status FROM admin_members WHERE email = ?", OWNER), [{ role: "owner", status: "active" }]);
  });
});

test("members on staging: owner emails go only to the staging allowlist", { skip }, async () => {
  const db = await createD1();
  const env = accessEnv(db, { SITE_ENV: "staging", STAGING_BASIC_AUTH_USER: "tester", STAGING_BASIC_AUTH_PASSWORD: "staging-pass", CUSTOMER_EMAIL_TEST_RECIPIENTS: "someone-else@apgo.example" });
  await withWorld(async (calls) => {
    const added = await read(await call(env, "/admin/api/members", { method: "POST", headers: await as(OWNER), body: { email: COLLEAGUE } }));
    assert.deepEqual(added.body.notified, { sent: 0, skipped: 1, failed: 0 });
    assert.equal(calls.mails.length, 0);
  });
});

// ---------- actions under the real name ----------

test("order actions are recorded under the signed-in person (M9-02)", { skip }, async () => {
  const db = await createD1();
  const env = accessEnv(db);
  const at = new Date().toISOString();
  db.raw.prepare(
    `INSERT INTO orders (id, status, email, shipping_json, shipping_method, lines_json, currency, subtotal_cents, shipping_cents, tax_cents, total_cents, created_at, updated_at, paid_at)
     VALUES ('APGO-US-01D000000001', 'paid', 'ada@example.com', ?, 'standard', ?, 'USD', 5999, 799, 0, 6798, ?, ?, ?)`,
  ).run(
    JSON.stringify({ firstName: "Ada", lastName: "Lee", street: "100 Example Ave", city: "Austin", state: "TX", zip: "78701" }),
    JSON.stringify([{ id: "d204", sku: "D204", name: "APGO Atomic Colored Glaze", size: "300 mL", qty: 1, unitCents: 5999, lineCents: 5999 }]),
    at, at, at,
  );
  await withWorld(async () => {
    const owner = await as(OWNER);
    const shipped = await call(env, "/admin/api/orders/APGO-US-01D000000001/ship", { method: "POST", headers: owner, body: { carrier: "UPS", trackingNumber: "1Z999AA10123456784" } });
    assert.equal(shipped.status, 200);
    assert.deepEqual(rows(db, "SELECT action, actor FROM order_audit"), [{ action: "order.shipped", actor: OWNER }]);
    assert.deepEqual(rows(db, "SELECT shipped_by FROM order_fulfillments"), [{ shipped_by: OWNER }]);
    const detail = await read(await call(env, "/admin/api/orders/APGO-US-01D000000001", { headers: owner }));
    assert.deepEqual(detail.body.audit.map((entry) => entry.actor), [OWNER]);
  });
});

// ---------- activity ----------

test("activity: member changes and order actions together, newest first, by person and time, paged without gaps (M9-19)", { skip }, async () => {
  const db = await createD1();
  const env = accessEnv(db);
  const insertOrder = db.raw.prepare("INSERT INTO order_audit (order_id, action, actor, detail_json, created_at) VALUES (?, ?, ?, '{}', ?)");
  const insertAdmin = db.raw.prepare("INSERT INTO admin_audit (at, actor, actor_via, action, target, reason) VALUES (?, ?, 'access', ?, ?, ?)");
  insertOrder.run("APGO-US-A", "order.shipped", COLLEAGUE, "2026-10-01T10:00:00.000Z");
  insertAdmin.run("2026-10-02T10:00:00.000Z", OWNER, "member.added", COLLEAGUE, "Handles shipping");
  insertOrder.run("APGO-US-B", "mcf.submitted", "mcf-auto", "2026-10-03T10:00:00.000Z");
  insertOrder.run("APGO-US-C", "order.email.retry", OWNER, "2026-10-03T10:00:00.000Z"); // same time as the one above
  insertAdmin.run("2026-10-04T10:00:00.000Z", OWNER, "member.removed", COLLEAGUE, "Left");
  await withWorld(async () => {
    const owner = await as(OWNER);
    const all = await read(await call(env, "/admin/api/activity", { headers: owner }));
    assert.equal(all.status, 200);
    const events = all.body.entries.filter((e) => e.action !== "member.bootstrap");
    assert.deepEqual(events.map((e) => [e.at.slice(0, 10), e.action, e.actor]), [
      ["2026-10-04", "member.removed", OWNER],
      ["2026-10-03", "order.email.retry", OWNER], // same time: the one written later first
      ["2026-10-03", "mcf.submitted", "mcf-auto"],
      ["2026-10-02", "member.added", OWNER],
      ["2026-10-01", "order.shipped", COLLEAGUE],
    ]);
    assert.equal(events[0].reason, "Left");
    assert.equal(events.find((e) => e.action === "order.shipped").target, "APGO-US-A");
    assert.ok(all.body.actors.includes(COLLEAGUE) && all.body.actors.includes("mcf-auto"));

    const mine = await read(await call(env, `/admin/api/activity?actor=${encodeURIComponent(OWNER)}&from=2026-10-02T00:00:00.000Z&to=2026-10-04T00:00:00.000Z`, { headers: owner }));
    assert.deepEqual(mine.body.entries.map((e) => e.action), ["order.email.retry", "member.added"]);

    // A member may read the log too.
    assert.equal((await call(env, "/admin/api/activity", { headers: await as(OWNER) })).status, 200);
  });

  // Paging two at a time visits every entry once, ties included.
  const seen = [];
  let cursor = null;
  do {
    const page = await listActivity(db, { cursor, limit: 2, to: "2026-10-05T00:00:00.000Z" });
    seen.push(...page.entries.map((e) => e.action));
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(seen, ["member.removed", "order.email.retry", "mcf.submitted", "member.added", "order.shipped"]);
});

// ---------- the Cloudflare Access list ----------

test("Cloudflare list: added and removed emails are copied over in one change; failures show and can be retried", { skip }, async () => {
  const db = await createD1();
  const env = listEnv(db);
  let current = [OWNER, "old-colleague@apgo.example"];
  let failNext = false;
  const cloudflare = (href, init) => {
    if (failNext) {
      failNext = false;
      return Response.json({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }, { status: 403 });
    }
    if (init.method === "GET") return Response.json({ success: true, result: [current.map((value) => ({ value, created_at: "2026-10-01T00:00:00Z" }))], result_info: { page: 1, total_pages: 1 } });
    const body = JSON.parse(init.body);
    current = [...current.filter((value) => !body.remove.includes(value)), ...body.append.map((item) => item.value)];
    return Response.json({ success: true, result: {} });
  };
  await withWorld(async (calls) => {
    const owner = await as(OWNER);
    const added = await read(await call(env, "/admin/api/members", { method: "POST", headers: owner, body: { email: COLLEAGUE } }));
    assert.deepEqual(added.body.sync, { status: "synced", added: 1, removed: 1, detail: "" });
    const patch = calls.cloudflare.find((c) => c.method === "PATCH");
    assert.match(patch.url, /\/accounts\/0123456789abcdef0123456789abcdef\/gateway\/lists\/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee$/);
    assert.deepEqual(patch.body, { append: [{ value: COLLEAGUE }], remove: ["old-colleague@apgo.example"] });
    assert.equal(patch.auth, "Bearer cf-list-token");
    assert.deepEqual(current.sort(), [COLLEAGUE, OWNER]);

    // Nothing to change: no PATCH.
    const patches = calls.cloudflare.filter((c) => c.method === "PATCH").length;
    const again = await read(await call(env, "/admin/api/members/sync", { method: "POST", headers: owner, body: {} }));
    assert.deepEqual(again.body.sync, { status: "synced", added: 0, removed: 0, detail: "" });
    assert.equal(calls.cloudflare.filter((c) => c.method === "PATCH").length, patches);

    // A failure is reported, logged, and the retry button fixes it.
    failNext = true;
    const removed = await read(await call(env, "/admin/api/members/remove", { method: "POST", headers: owner, body: { email: COLLEAGUE } }));
    assert.equal(removed.status, 200, "the member is removed even when Cloudflare is down");
    assert.equal(removed.body.sync.status, "failed");
    assert.match(removed.body.sync.detail, /HTTP 403 \(error 10000\)/);
    assert.equal(removed.body.accessList.last.status, "failed");
    assert.equal((await call(env, "/admin/api/orders", { headers: await as(COLLEAGUE) })).status, 403, "and the back office refuses them anyway");
    const retried = await read(await call(env, "/admin/api/members/sync", { method: "POST", headers: owner, body: {} }));
    assert.deepEqual(retried.body.sync, { status: "synced", added: 0, removed: 1, detail: "" });
    assert.deepEqual(current, [OWNER]);
    const listed = await read(await call(env, "/admin/api/members", { headers: owner }));
    assert.equal(listed.body.accessList.configured, true);
    assert.equal(listed.body.accessList.last.status, "synced");
    assert.deepEqual(rows(db, "SELECT action FROM admin_audit WHERE action LIKE 'access_list.%' ORDER BY id").map((r) => r.action), ["access_list.synced", "access_list.synced", "access_list.sync_failed", "access_list.synced"]);
  }, { cloudflare });

  // Never empties Cloudflare's list.
  const empty = await createD1();
  await withWorld(async (calls) => {
    const { syncAccessList } = await import("../worker/access-list.js");
    const result = await syncAccessList(listEnv(empty, { ADMIN_OWNER_EMAIL: "" }));
    assert.equal(result.status, "failed");
    assert.match(result.detail, /member list is empty/);
    assert.equal(calls.cloudflare.filter((c) => c.method === "PATCH").length, 0);
  }, { cloudflare });
});

test("wrangler: the first owner is set for staging and production; Access stays off until it is set up", async () => {
  const { readFile } = await import("node:fs/promises");
  const toml = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  const staging = toml.slice(toml.indexOf("[env.staging]"), toml.indexOf("[env.production]"));
  const production = toml.slice(toml.indexOf("[env.production]"));
  for (const section of [staging, production]) {
    assert.match(section, /^ADMIN_OWNER_EMAIL = "wadeyeh@apgo\.com\.tw"$/m);
    assert.doesNotMatch(section, /^\s*ADMIN_ACCESS\s*=/m, "switched on only after Zero Trust is configured (docs/ops/runbook.md)");
  }
  assert.doesNotMatch(toml, /^\s*ACCESS_LIST_API_TOKEN\s*=/m, "the list token is a secret");
});
