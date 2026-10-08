// The Contact us form's Worker side (worker/contact.js, D28, M12-06) against the real schema in node:sqlite.
import assert from "node:assert/strict";
import test from "node:test";

import { createD1, sqliteAvailable } from "./helpers/d1.mjs";
import { CONTACT_LIMITS, CONTACT_MESSAGES, checkContactMessage, handleContact, listContactMessages } from "../worker/contact.js";
import { QuoteError, publicConfig } from "../worker/catalog.js";

const skip = !(await sqliteAvailable()) && "node:sqlite unavailable";
const GOOD = { name: "Ada Lee", email: "Ada@Example.com", message: "Where is my order APGO-US-0123456789AB?" };
const MAIL = { RESEND_API_KEY: "re_test", CUSTOMER_EMAIL_FROM: "APGO <orders@apgo.tw>", CONTACT_EMAIL_TO: "services@apgo.com.tw" };

const request = (body, ip = "203.0.113.7") =>
  new Request("https://www.shopapgo.com/api/contact", { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip }, body: JSON.stringify(body) });

function emailService(status = 200) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), headers: init.headers, body: init.body instanceof FormData ? Object.fromEntries(init.body) : JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: "email_1", success: true }), { status, headers: { "Content-Type": "application/json" } });
  };
  return { calls, fetchImpl };
}

const rows = async (db) => (await db.prepare("SELECT * FROM contact_messages ORDER BY created_at").all()).results;

async function rejects(promise, field) {
  await assert.rejects(promise, (error) => error instanceof QuoteError && error.field === field);
}

test("the field rules: name, a valid email, a message of 10–5000 characters; control characters out, line breaks kept", () => {
  assert.deepEqual(checkContactMessage({}).errors, { name: CONTACT_MESSAGES.name, email: CONTACT_MESSAGES.email, message: CONTACT_MESSAGES.message });
  const { value, errors } = checkContactMessage({ name: "  Ada \n Lee ", email: " ADA@EXAMPLE.COM ", message: "Line one\r\nline two\u0007 here" });
  assert.deepEqual(errors, {});
  assert.deepEqual(value, { name: "Ada Lee", email: "ada@example.com", message: "Line one\nline two here" });
  assert.equal(checkContactMessage({ ...GOOD, name: "x".repeat(101) }).errors.name, "Keep this under 100 characters.");
  assert.equal(checkContactMessage({ ...GOOD, message: "x".repeat(5001) }).errors.message, "Keep this under 5000 characters.");
  assert.equal(checkContactMessage({ ...GOOD, message: "too short" }).errors.message, CONTACT_MESSAGES.message);
  assert.deepEqual(CONTACT_LIMITS, { name: 100, email: 254, message: 5000, minMessage: 10, perAddressHour: 5, allHour: 60 });
});

test("a message is saved, then emailed to the support inbox with the shopper as Reply-To", { skip }, async () => {
  const db = await createD1();
  const mail = emailService();
  const response = await handleContact(request(GOOD), { DB: db, ...MAIL }, { fetchImpl: mail.fetchImpl });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  const [row] = await rows(db);
  assert.match(row.id, /^CM-[0-9a-f-]{36}$/);
  assert.equal(row.email, "ada@example.com");
  assert.equal(row.email_status, "sent");
  assert.match(row.ip_hash, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(row).includes("203.0.113.7"), false, "the address itself is never stored");
  assert.equal(mail.calls.length, 1);
  const [sent] = mail.calls;
  assert.equal(sent.url, "https://api.resend.com/emails");
  assert.equal(sent.headers["Idempotency-Key"], `contact-${row.id}`);
  assert.deepEqual(sent.body.to, ["services@apgo.com.tw"]);
  assert.equal(sent.body.reply_to, "ada@example.com");
  assert.equal(sent.body.subject, "Website message from Ada Lee");
  assert.match(sent.body.text, /Where is my order APGO-US-0123456789AB\?/);
});

test("no email set up, or a failed send: the message is still saved and the shopper sees success", { skip }, async () => {
  const db = await createD1();
  assert.equal((await handleContact(request(GOOD), { DB: db })).status, 200);
  const failing = emailService(500);
  assert.equal((await handleContact(request(GOOD, "198.51.100.2"), { DB: db, ...MAIL }, { fetchImpl: failing.fetchImpl })).status, 200);
  assert.deepEqual((await rows(db)).map((row) => row.email_status), ["skipped", "failed"]);
});

test("staging: only the approved test recipient gets mail", { skip }, async () => {
  const db = await createD1();
  const mail = emailService();
  const staging = { DB: db, ...MAIL, SITE_ENV: "staging", CUSTOMER_EMAIL_TEST_RECIPIENTS: "wadeyeh@apgo.com.tw" };
  await handleContact(request(GOOD), staging, { fetchImpl: mail.fetchImpl });
  assert.equal(mail.calls.length, 0, "the real support inbox is not on the staging allowlist");
  await handleContact(request(GOOD, "198.51.100.3"), { ...staging, CONTACT_EMAIL_TO: "wadeyeh@apgo.com.tw" }, { fetchImpl: mail.fetchImpl });
  assert.equal(mail.calls.length, 1);
  assert.deepEqual((await rows(db)).map((row) => row.email_status), ["skipped", "sent"]);
});

test("invalid fields answer 400 with the field; the robot field is accepted silently and nothing is kept", { skip }, async () => {
  const db = await createD1();
  await rejects(handleContact(request({ ...GOOD, email: "nope" }), { DB: db }), "email");
  await rejects(handleContact(request({ ...GOOD, name: "" }), { DB: db }), "name");
  const trap = await handleContact(request({ ...GOOD, company: "Spam Inc" }), { DB: db, ...MAIL }, { fetchImpl: () => assert.fail("no email for robots") });
  assert.equal(trap.status, 200);
  assert.equal((await rows(db)).length, 0);
});

test("at most 5 an hour from one address and 60 an hour overall; the hash changes every day", { skip }, async () => {
  const db = await createD1();
  const now = Date.parse("2026-10-08T10:00:00Z");
  for (let i = 0; i < 5; i += 1) assert.equal((await handleContact(request(GOOD), { DB: db }, { nowMs: now + i })).status, 200);
  const sixth = await handleContact(request(GOOD), { DB: db }, { nowMs: now + 10 });
  assert.equal(sixth.status, 429);
  assert.equal((await sixth.json()).error.code, "too_many_messages");
  assert.equal((await handleContact(request(GOOD, "198.51.100.9"), { DB: db }, { nowMs: now + 11 })).status, 200, "another address is fine");
  assert.equal((await handleContact(request(GOOD), { DB: db }, { nowMs: now + 61 * 60 * 1000 })).status, 200, "an hour later is fine");
  const hashes = new Set((await rows(db)).map((row) => row.ip_hash));
  assert.equal(hashes.size, 2);
  await handleContact(request(GOOD), { DB: db }, { nowMs: Date.parse("2026-10-09T10:00:00Z") });
  assert.equal(new Set((await rows(db)).map((row) => row.ip_hash)).size, 3, "a new day, a new hash for the same address");

  const busy = await createD1();
  for (let i = 0; i < 60; i += 1) await handleContact(request(GOOD, `198.51.100.${i}`), { DB: busy }, { nowMs: now + i });
  assert.equal((await handleContact(request(GOOD, "192.0.2.1"), { DB: busy }, { nowMs: now + 100 })).status, 429);
});

test("Turnstile: off until both keys are set; then every message needs a token Cloudflare accepts", { skip }, async () => {
  assert.equal(publicConfig({}).contact.turnstileSiteKey, null);
  assert.equal(publicConfig({ TURNSTILE_SITE_KEY: "0x4AAA" }).contact.turnstileSiteKey, null, "no secret, no widget");
  assert.equal(publicConfig({ TURNSTILE_SITE_KEY: "0x4AAA", TURNSTILE_SECRET_KEY: "s" }).contact.turnstileSiteKey, "0x4AAA");

  const db = await createD1();
  const env = { DB: db, TURNSTILE_SITE_KEY: "0x4AAA", TURNSTILE_SECRET_KEY: "turnstile-secret" };
  const verdicts = [];
  const fetchImpl = async (url, init) => {
    const form = Object.fromEntries(init.body);
    verdicts.push({ url: String(url), form });
    return new Response(JSON.stringify({ success: form.response === "good-token" }), { headers: { "Content-Type": "application/json" } });
  };
  await rejects(handleContact(request(GOOD), env, { fetchImpl }), "turnstile");
  await rejects(handleContact(request({ ...GOOD, turnstileToken: "bad-token" }), env, { fetchImpl }), "turnstile");
  assert.equal((await handleContact(request({ ...GOOD, turnstileToken: "good-token" }), env, { fetchImpl })).status, 200);
  assert.equal(verdicts.at(-1).url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.deepEqual(verdicts.at(-1).form, { secret: "turnstile-secret", response: "good-token", remoteip: "203.0.113.7" });
  assert.equal((await rows(db)).length, 1);
});

test("the back office lists messages newest first, 50 at a time", { skip }, async () => {
  const db = await createD1();
  const start = Date.parse("2026-10-08T00:00:00Z");
  for (let i = 0; i < 53; i += 1) await handleContact(request({ ...GOOD, name: `Shopper ${i}` }, `198.51.100.${i}`), { DB: db }, { nowMs: start + i * 1000 });
  const first = await listContactMessages(db);
  assert.equal(first.messages.length, 50);
  assert.equal(first.messages[0].name, "Shopper 52");
  assert.deepEqual(Object.keys(first.messages[0]).sort(), ["createdAt", "email", "emailDetail", "emailStatus", "id", "message", "name"]);
  const second = await listContactMessages(db, { before: first.nextBefore });
  assert.deepEqual(second.messages.map((m) => m.name), ["Shopper 2", "Shopper 1", "Shopper 0"]);
  assert.equal(second.nextBefore, null);
});
