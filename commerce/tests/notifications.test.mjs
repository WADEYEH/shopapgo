// Notifications (PR 3-7, M8): the new customer emails (cancellation, address change, second payment refunded), each
// once (M8-01, M8-04); the team emails for an address the check service could not check (M8-07); the daily summary
// (M8-08); and each person's team-email switch, which can never leave nobody getting them (M9-20). Airwallex, Google
// address validation and the email API are in-memory fakes; nothing reaches the network.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import worker from "../worker/index.js";
import { resetAirwallexTokenCache } from "../worker/airwallex.js";
import { cancelOrder, SYSTEM } from "../worker/order-core.js";
import { refundDuplicate } from "../worker/checkouts.js";
import { sendNotice } from "../worker/customer-email.js";
import { alertTeam } from "../worker/team-alerts.js";
import { addMember, setTeamAlerts } from "../worker/members.js";
import { digestSections, scheduledDigest, waitingLists } from "../worker/team-digest.js";
import { createD1, sqliteAvailable } from "./helpers/d1.mjs";

globalThis.fetch = async (url) => { throw new Error(`unexpected real network call: ${url}`); };
const skip = (await sqliteAvailable()) ? false : "node:sqlite unavailable";

const WEBHOOK_SECRET = "whsec_unit_test";
const MAIL_URL = "https://mail.example/send";
const OWNER = "owner@apgo.example";
const TOKEN = "test-admin-token-0123456789";
const LOGIN = { email: "owner@apgo.example", password: "owner-password-123" };
const ownerLogin = { Authorization: `Basic ${Buffer.from(`${LOGIN.email}:${LOGIN.password}`).toString("base64")}` };
const bearer = { Authorization: `Bearer ${TOKEN}` };
const DAY = 24 * 60 * 60_000;
const iso = (ms) => new Date(ms).toISOString();

const env0 = (db, extra = {}) => ({
  DB: db,
  AIRWALLEX_CLIENT_ID: "cid", AIRWALLEX_API_KEY: "key", AIRWALLEX_WEBHOOK_SECRET: WEBHOOK_SECRET, AIRWALLEX_ENV: "demo", AIRWALLEX_RETRY_DELAY_MS: "0",
  ADMIN_TOKEN: TOKEN, ADMIN_OWNER_EMAIL: OWNER, ADMIN_LOGIN_EMAIL: LOGIN.email, ADMIN_LOGIN_PASSWORD: LOGIN.password,
  RESEND_API_KEY: "rk_test_key", CUSTOMER_EMAIL_FROM: "APGO <orders@shop.example>", ORDER_NOTIFY_EMAIL_API_URL: MAIL_URL,
  ASSETS: { fetch: async () => new Response("ok") },
  ...extra,
});
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function createWorld({ addressCheckDown = false } = {}) {
  const intents = new Map();
  const calls = { mails: [], refunds: [], addressChecks: 0 };
  let n = 0;
  async function handler(href, init) {
    if (href === MAIL_URL) { calls.mails.push(JSON.parse(init.body)); return json(200, { id: crypto.randomUUID() }); }
    if (href.startsWith("https://addressvalidation.googleapis.com/")) {
      calls.addressChecks += 1;
      return addressCheckDown ? json(503, { error: "unavailable" }) : json(200, { result: { verdict: { addressComplete: true, validationGranularity: "PREMISE" }, address: {}, uspsData: { dpvConfirmation: "Y" } } });
    }
    if (href.endsWith("/authentication/login")) return json(201, { token: "tok", expires_at: new Date(Date.now() + 1_800_000).toISOString().replace(/\.\d+Z$/, "+0000") });
    if (href.endsWith("/payment_intents/create")) {
      const body = JSON.parse(init.body);
      n += 1;
      const intent = { id: `int_${n}`, client_secret: `cs_${n}`, status: "REQUIRES_PAYMENT_METHOD", amount: body.amount, currency: body.currency, merchant_order_id: body.merchant_order_id };
      intents.set(intent.id, intent);
      return json(201, intent);
    }
    if (href.endsWith("/refunds/create")) {
      const body = JSON.parse(init.body);
      calls.refunds.push(body);
      return json(201, { id: `rfd_${calls.refunds.length}`, status: "RECEIVED" });
    }
    throw new Error(`unexpected network call: ${href}`);
  }
  return { intents, calls, handler };
}

async function withWorld(options, run) {
  const world = createWorld(options);
  const original = globalThis.fetch;
  globalThis.fetch = (url, init = {}) => world.handler(String(url), init);
  resetAirwallexTokenCache();
  try {
    return await run(world);
  } finally {
    globalThis.fetch = original;
  }
}

const ctxStub = () => ({ waitUntil(promise) { (this.pending ||= []).push(promise); }, async settled() { await Promise.all(this.pending ?? []); } });
const call = async (env, path, init = {}) => {
  const ctx = ctxStub();
  const response = await worker.fetch(new Request(`https://www.shopapgo.com${path}`, init), env, ctx);
  await ctx.settled();
  return response;
};
const post = (body, headers = {}) => ({ method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const adminPost = (env, path, body = {}, auth = bearer) => call(env, path, post(body, { ...auth, Origin: "https://www.shopapgo.com" }));
const cart = () => ({
  items: [{ sku: "d204", qty: 1 }],
  contact: { email: "ada@example.com", phone: "(512) 555-0134", marketingOptIn: false },
  shipping: { firstName: "Ada", lastName: "Lee", street: "100 Example Ave", street2: "Apt 4", city: "Austin", state: "TX", zip: "78701" },
  method: "standard",
});
const row = (db, sql, ...args) => { const found = db.raw.prepare(sql).get(...args); return found ? { ...found } : null; };
const customerMails = (calls, pattern) => calls.mails.filter((m) => m.to.includes("ada@example.com") && pattern.test(m.subject));
const teamMails = (calls, to, pattern) => calls.mails.filter((m) => m.to.includes(to) && pattern.test(m.subject));

async function paidOrder(env, world) {
  const started = await (await call(env, "/api/checkout/session", post(cart()))).json();
  const intent = world.intents.get(started.intent.id);
  intent.status = "SUCCEEDED";
  const body = JSON.stringify({ id: `evt_${Math.random().toString(36).slice(2)}`, name: "payment_intent.succeeded", data: { object: intent } });
  const timestamp = String(Date.now());
  assert.equal((await call(env, "/api/webhooks/airwallex", { method: "POST", headers: { "x-timestamp": timestamp, "x-signature": createHmac("sha256", WEBHOOK_SECRET).update(`${timestamp}${body}`).digest("hex") }, body })).status, 200);
  return { orderId: started.orderId, totalCents: started.quote.totalCents, intentId: started.intent.id };
}

// ---------- M8-01, M8-04: the new customer emails ----------

test("M8-01: a cancelled order gets one cancellation email saying why and how the payment comes back; none after a chargeback", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withWorld({}, async (world) => {
    const { orderId } = await paidOrder(env, world);
    const response = await adminPost(env, `/admin/api/orders/${orderId}/cancel`, { reason: "customer_request" });
    assert.equal(response.status, 200);
    const mails = customerMails(world.calls, /has been cancelled/);
    assert.equal(mails.length, 1);
    assert.equal(mails[0].subject, `Your APGO order ${orderId} has been cancelled`);
    // The plain Cancel does not refund (owner, 10/16): the email says the refund follows, never that it was made.
    assert.match(mails[0].text, /As you asked, we've cancelled your order\. It will not ship\. We'll refund your payment in full to your original payment method shortly/);
    assert.doesNotMatch(mails[0].text, /Your payment is refunded in full/);
    // Until it is refunded, the dashboard and the daily summary list it.
    const waiting = (await waitingLists(env)).find((list) => list.key === "unrefunded").rows.map((item) => item.order_id);
    assert.ok(waiting.includes(orderId), "cancelled without a refund is listed");
    assert.match(mails[0].text, new RegExp(`Order number: ${orderId}`));
    assert.equal((await sendNotice(env, orderId, "cancelled", { reason: "customer_request" })).status, "duplicate", "once per order");
    assert.equal(customerMails(world.calls, /has been cancelled/).length, 1);
    const view = await (await call(env, `/admin/api/orders/${orderId}`, { headers: bearer })).json();
    assert.ok(view.emails.some((email) => email.kind === "cancelled"));

    // Cancelled because of a refund (or with Cancel and refund): the refund is under way.
    const refunded = await paidOrder(env, world);
    await cancelOrder(env, refunded.orderId, { actor: SYSTEM, reasonCode: "full_refund" });
    const refundedMail = customerMails(world.calls, new RegExp(`${refunded.orderId} has been cancelled`));
    assert.equal(refundedMail.length, 1);
    assert.match(refundedMail[0].text, /Your payment is refunded in full/);

    const other = await paidOrder(env, world);
    await cancelOrder(env, other.orderId, { actor: SYSTEM, reasonCode: "chargeback" });
    assert.equal(customerMails(world.calls, new RegExp(`${other.orderId} has been cancelled`)).length, 0, "the bank handles a chargeback");
  });
});

test("M8-01: an address changed in the cooling-off period gets a confirmation with the new address", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withWorld({}, async (world) => {
    const { orderId } = await paidOrder(env, world);
    const shipping = { firstName: "Ada", lastName: "Lee", street: "200 Example Ave", street2: "Unit 9", city: "Austin", state: "TX", zip: "78702" };
    const response = await adminPost(env, `/admin/api/orders/${orderId}/address`, { shipping, reason: "customer emailed a new apartment" });
    assert.equal(response.status, 200);
    const mails = customerMails(world.calls, /shipping address updated/);
    assert.equal(mails.length, 1);
    assert.match(mails[0].text, /200 Example Ave/);
    assert.match(mails[0].text, /If this isn't right, reply to this email right away/);
  });
});

test("M8-01: a second payment refunded automatically gets one email with the amount", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withWorld({}, async (world) => {
    const { orderId } = await paidOrder(env, world);
    const order = row(db, "SELECT * FROM orders WHERE id = ?", orderId);
    const result = await refundDuplicate(env, { order, provider: "airwallex", ref: "int_second", amountCents: 6798, currency: "USD" });
    assert.equal(result.outcome, "refunded");
    const mails = customerMails(world.calls, /your second payment was refunded/);
    assert.equal(mails.length, 1);
    assert.match(mails[0].text, /We refunded the second payment \(\$67\.98\) in full to the card you used\. Your order was paid once and ships as usual/);
    assert.equal((await refundDuplicate(env, { order, provider: "airwallex", ref: "int_second", amountCents: 6798, currency: "USD" })).outcome, "duplicate_already_handled");
    assert.equal(customerMails(world.calls, /your second payment was refunded/).length, 1);
  });
});

// ---------- M8-07: the address could not be checked ----------

test("M8-07: an order paid while the address check service was down is reported to the team once; a missing key is not", { skip }, async () => {
  const db = await createD1();
  await withWorld({ addressCheckDown: true }, async (world) => {
    const env = env0(db, { GOOGLE_ADDRESS_VALIDATION_KEY: "test-key" });
    const { orderId } = await paidOrder(env, world);
    assert.ok(world.calls.addressChecks >= 1);
    const alerts = teamMails(world.calls, OWNER, /the address could not be checked/);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].subject, `Order ${orderId}: the address could not be checked`);
  });
  await withWorld({}, async (world) => {
    await paidOrder(env0(db), world);
    assert.equal(teamMails(world.calls, OWNER, /the address could not be checked/).length, 0, "not set up is not an outage");
  });
});

// ---------- M9-20: each person's team emails ----------

test("M9-20: people turn their own team emails on or off; the last one cannot turn them off; member changes still reach every owner", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withWorld({}, async (world) => {
    // The shared login (an owner) opens the back office: not on the list yet, so no setting.
    assert.equal((await (await call(env, "/admin/api/me", { headers: ownerLogin })).json()).teamAlerts, null);
    db.raw.prepare("INSERT INTO admin_members (email, role, status, added_by, added_at, updated_by, updated_at) VALUES (?, 'owner', 'active', 'system', ?, 'system', ?)").run(OWNER, iso(Date.now()), iso(Date.now()));
    assert.equal((await (await call(env, "/admin/api/me", { headers: ownerLogin })).json()).teamAlerts, true, "owners get them by default");

    const alone = await adminPost(env, "/admin/api/me/alerts", { on: false }, ownerLogin);
    assert.equal(alone.status, 409);
    assert.equal((await alone.json()).error.code, "last_recipient");

    const owner = { id: OWNER, email: OWNER, role: "owner", via: "password" };
    await addMember(env, owner, { email: "colleague@apgo.example", role: "member" });
    await alertTeam(env, { key: "test:1", kind: "test", subject: "First alert", lines: ["x"] });
    assert.deepEqual(world.calls.mails.filter((m) => m.subject === "First alert").map((m) => m.to[0]), [OWNER], "members do not get them until they turn them on");

    await setTeamAlerts(env, { id: "colleague@apgo.example", email: "colleague@apgo.example", role: "member", via: "access" }, { on: true });
    const off = await adminPost(env, "/admin/api/me/alerts", { on: false }, ownerLogin);
    assert.deepEqual([off.status, (await off.json()).teamAlerts], [200, false]);
    await alertTeam(env, { key: "test:2", kind: "test", subject: "Second alert", lines: ["x"] });
    assert.deepEqual(world.calls.mails.filter((m) => m.subject === "Second alert").map((m) => m.to[0]), ["colleague@apgo.example"]);
    assert.ok(row(db, "SELECT action FROM admin_audit WHERE action = 'member.alerts_changed' AND target = ?", OWNER), "logged in Activity");

    // A member change is a security matter: every owner hears about it, whatever they chose.
    await addMember(env, owner, { email: "another@apgo.example", role: "member" });
    assert.equal(world.calls.mails.filter((m) => m.to.includes(OWNER) && /another@apgo\.example was added/.test(m.subject)).length, 1);
    const members = await (await call(env, "/admin/api/members", { headers: ownerLogin })).json();
    assert.deepEqual(members.members.filter((m) => m.status === "active").map((m) => [m.email, m.teamAlerts]), [[OWNER, false], ["another@apgo.example", false], ["colleague@apgo.example", true]]);
    assert.equal((await adminPost(env, "/admin/api/me/alerts", { on: "yes" }, ownerLogin)).status, 400);
    assert.equal((await adminPost(env, "/admin/api/me/alerts", { on: true })).status, 409, "the script token has no setting");
  });
});

// ---------- M8-08: the daily summary ----------

function insertOrder(db, id, { status = "paid", paidAt = iso(Date.now() - 3 * DAY), shipping = {} } = {}) {
  const at = iso(Date.now() - 3 * DAY);
  db.raw.prepare(`INSERT INTO orders (id, status, email, shipping_json, shipping_method, lines_json, currency, subtotal_cents, shipping_cents, tax_cents, total_cents, payment_intent_id, created_at, updated_at, paid_at)
    VALUES (?, ?, 'ada@example.com', ?, 'standard', '[]', 'USD', 1000, 0, 0, 1000, ?, ?, ?, ?)`)
    .run(id, status, JSON.stringify({ firstName: "Ada", lastName: "Lee", state: "TX", ...shipping }), `int_${id}`, at, at, status === "review" ? null : paidAt);
}

test("M8-08: the daily summary lists what is still waiting, once a day, and is not sent when nothing waits", { skip }, async () => {
  const db = await createD1();
  const env = env0(db);
  await withWorld({}, async (world) => {
    const now = Date.parse("2026-10-13T00:05:00Z");
    assert.deepEqual(await scheduledDigest(env, { nowMs: now }), { digest: "nothing" });
    assert.equal(world.calls.mails.length, 0, "nothing waiting: no email");

    insertOrder(db, "APGO-US-REVIEW000001", { status: "review" });
    insertOrder(db, "APGO-US-FAILED000001");
    insertOrder(db, "APGO-US-STOCK0000001");
    insertOrder(db, "APGO-US-NOTRACK00001");
    insertOrder(db, "APGO-US-DISPUTE00001");
    insertOrder(db, "APGO-US-UNCHECKED001", { paidAt: iso(now - 60 * 60_000), shipping: { addressCheck: { status: "unverified", reason: "unavailable" } } });
    const at = iso(now - 4 * DAY);
    const mcf = db.raw.prepare("INSERT INTO order_mcf (order_id, seller_order_id, status, mcf_status, submitted_at, stockout_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    mcf.run("APGO-US-FAILED000001", "APGO-US-FAILED000001", "failed", "", null, null, at, at);
    mcf.run("APGO-US-STOCK0000001", "APGO-US-STOCK0000001", "rejected", "UNFULFILLABLE", at, at, at, at);
    mcf.run("APGO-US-NOTRACK00001", "APGO-US-NOTRACK00001", "submitted", "PROCESSING", "2026-10-08T10:00:00.000Z", null, at, at);
    db.raw.prepare("INSERT INTO order_disputes (provider, dispute_id, order_id, status, amount_cents, currency, due_at, provider_updated_at, created_at, updated_at) VALUES ('paypal', 'PP-D-1', 'APGO-US-DISPUTE00001', 'open', 1000, 'USD', '2026-10-15T00:00:00.000Z', ?, ?, ?)").run(at, at, at);

    const sections = await digestSections(env, { nowMs: now });
    assert.deepEqual(sections.map((s) => [s.count, s.detail]), [
      [1, "APGO-US-REVIEW000001"],
      [1, "APGO-US-FAILED000001"],
      [1, "APGO-US-STOCK0000001 (4 days)"],
      [1, "APGO-US-NOTRACK00001 (sent Thu, 08 Oct 2026)"],
      [1, "APGO-US-DISPUTE00001 (PayPal, respond by Thu, 15 Oct 2026)"],
      [1, "APGO-US-UNCHECKED001"],
    ]);
    // Already claimed today (the "nothing" run): tomorrow's run sends it.
    assert.deepEqual(await scheduledDigest(env, { nowMs: now + 60_000 }), { digest: "not_due" });
    const sent = await scheduledDigest(env, { nowMs: now + DAY });
    assert.deepEqual(sent, { digest: "sent", sections: 5, total: 5 }, "the unchecked address was paid more than a day before this run");
    const mails = teamMails(world.calls, OWNER, /Daily summary/);
    assert.equal(mails.length, 1);
    assert.equal(mails[0].subject, "Daily summary: 5 things waiting");
    assert.match(mails[0].text, /Needs review \(the amount paid did not match\): confirm or cancel \(1\):\n  APGO-US-REVIEW000001/);
    assert.match(mails[0].text, /Open disputes: respond in the provider's dashboard \(1\):/);
    assert.deepEqual(await scheduledDigest(env, { nowMs: now + DAY + 60_000 }), { digest: "not_due" }, "once a day");
  });
});
