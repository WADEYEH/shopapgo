import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { createD1 } from "./helpers/d1.mjs";
import { resolveAdmin } from "../worker/admin-identity.js";
import worker from "../worker/index.js";
import { BODY_LIMITS, boundRequestBody } from "../worker/request-body.js";

globalThis.fetch = async () => { throw new Error("Unexpected network request in security regression test"); };

const token = "synthetic-security-test-token";
const adminRequest = () => new Request("https://admin.example/admin/api/me", { headers: { Authorization: `Bearer ${token}` } });
test("production: legacy tokens do not bypass Access or a missing member list", async () => {
  const env = { CONFIG_PROFILE: "production", ADMIN_ACCESS: "true", ADMIN_TOKEN: token, ACCESS_TEAM_DOMAIN: "https://example.cloudflareaccess.com", ACCESS_AUD: "test-audience" };
  const denied = await resolveAdmin(adminRequest(), env);
  assert.equal(denied.response.status, 403);
  assert.equal(denied.actor, undefined);
  const disabled = await resolveAdmin(adminRequest(), { ...env, ADMIN_ACCESS: "false" });
  assert.equal(disabled.response.status, 503);
});

test("Access script token requires an explicit staging-only opt-in", async () => {
  const env = { ADMIN_ACCESS: "true", ADMIN_TOKEN: token, ACCESS_TEAM_DOMAIN: "https://example.cloudflareaccess.com", ACCESS_AUD: "test-audience" };
  assert.equal((await resolveAdmin(adminRequest(), env)).response.status, 403);
  const staging = { ...env, SITE_ENV: "staging", CONFIG_PROFILE: "staging", ADMIN_SCRIPT_TOKEN_ENABLED: "true" };
  assert.equal((await resolveAdmin(adminRequest(), staging)).actor.role, "member");
  assert.equal((await resolveAdmin(adminRequest(), { ...staging, CONFIG_PROFILE: "production" })).response.status, 403);
});

for (const declaration of [null, "1", String(BODY_LIMITS.json + 1)]) {
  test(`JSON stream cap: content-length ${declaration ?? "missing"} cannot bypass the byte limit`, async () => {
    let cancelled = false;
    const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(16 * 1024)); }, cancel() { cancelled = true; } }, { highWaterMark: 0 });
    const headers = declaration ? { "Content-Length": declaration } : {};
    const response = await boundRequestBody(new Request("https://shop.example/api/contact", { method: "POST", headers, body: stream, duplex: "half" }));
    assert.equal(response.status, 413);
    assert.equal(cancelled, true);
  });
}

test("body limits count UTF-8 bytes and preserve exact webhook signature bytes", async () => {
  const body = "é".repeat(BODY_LIMITS.json / 2);
  const bounded = await boundRequestBody(new Request("https://shop.example/api/contact", { method: "POST", body }));
  assert.equal(await bounded.text(), body);
  assert.equal((await boundRequestBody(new Request("https://shop.example/api/contact", { method: "POST", body: body + "é" }))).status, 413);
  const db = await createD1();
  const raw = '{ "id": "body-test", "name": "unhandled.event", "padding": "' + "é".repeat(40_000) + '" }';
  const timestamp = String(Date.now());
  const secret = "synthetic-webhook-secret";
  const response = await worker.fetch(new Request("https://shop.example/api/webhooks/airwallex", { method: "POST", headers: {
    "x-timestamp": timestamp, "x-signature": createHmac("sha256", secret).update(timestamp + raw).digest("hex"),
  }, body: raw }), { DB: db, AIRWALLEX_WEBHOOK_SECRET: secret }, {});
  assert.equal(response.status, 200);
});

test("oversize webhook is rejected before provider verification or database writes", async () => {
  const response = await worker.fetch(new Request("https://shop.example/api/webhooks/paypal", { method: "POST", body: "x".repeat(BODY_LIMITS.paymentWebhook + 1) }), {
    DB: { prepare() { assert.fail("oversize requests must not touch the database"); } },
  }, {});
  assert.equal(response.status, 413);
});

test("webhook rate limits are separated by provider and return a retryable response", async () => {
  const keys = [];
  for (const provider of ["airwallex", "paypal", "resend"]) {
    const response = await worker.fetch(new Request(`https://shop.example/api/webhooks/${provider}`, { method: "POST", body: "{}", headers: { "CF-Connecting-IP": "192.0.2.1" } }), {
      WEBHOOK_LIMITER: { async limit({ key }) { keys.push(key); return { success: false }; } },
    }, {});
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "60");
  }
  assert.equal(new Set(keys).size, 3);
});
