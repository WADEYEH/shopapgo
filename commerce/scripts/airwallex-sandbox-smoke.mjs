#!/usr/bin/env node
// One-command Airwallex SANDBOX smoke test of the real payment flow.
//
//   npm run smoke:airwallex            # starts wrangler dev (local D1), runs the flow
//   npm run smoke:airwallex -- --base http://127.0.0.1:8799   # use a server you already started
//   npm run smoke:airwallex -- --card declined                # sandbox risk decline at any amount
//   npm run smoke:airwallex -- --env smoke                    # read .dev.vars.smoke instead
//
// It needs AIRWALLEX_CLIENT_ID / AIRWALLEX_API_KEY in .dev.vars (sandbox keys) and
// refuses to run against production. Values are read locally and never printed.
//
// Flow: POST /api/checkout/session (real PaymentIntent in the sandbox) →
//       confirm it server-side with the sandbox test card →
//       GET /api/orders/:id (the retrieve fallback) until the order is "paid" →
//       POST a signed payment_intent.succeeded webhook to the local Worker
//         (proves AIRWALLEX_WEBHOOK_SECRET is wired; it is signed by this script,
//          so it does NOT prove the secret matches the one in the Airwallex web app) →
//       if ADMIN_TOKEN is set, check the order shows as paid in /admin/api/orders.
//
// Exit codes: 0 passed · 1 failed · 2 blocked (missing credentials / not sandbox).

import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};

const CARDS = {
  success: { number: "4035501000000008", expects: "paid", note: "Visa, approves" },
  // Official sandbox risk-decline card (not the Shopify plugin's test-card list).
  declined: { number: "4646464646464644", expects: "unpaid", note: "risk declined", errorCode: "risk_declined" },
};
const cardName = option("card", "success");
const card = CARDS[cardName];
const envName = option("env", "");
const port = option("port", "8799");
const externalBase = option("base", "");

const log = (message = "") => console.log(message);
const step = (name, detail = "") => log(`  ✔ ${name}${detail ? ` — ${detail}` : ""}`);
function fatal(message, code = 1) {
  log(`\n✖ ${message}`);
  process.exit(code);
}
if (!card) fatal(`Unknown --card "${cardName}". Use: ${Object.keys(CARDS).join(", ")}`);

// ---------- read local secrets (never printed) ----------

function parseVars(file) {
  const vars = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    vars[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return vars;
}

const varsFile = path.join(root, envName ? `.dev.vars.${envName}` : ".dev.vars");
if (!existsSync(varsFile)) {
  fatal(`${path.basename(varsFile)} not found. Run: cp .dev.vars.example .dev.vars  and fill in the Airwallex SANDBOX keys.`, 2);
}
const vars = { ...parseVars(varsFile) };

const required = ["AIRWALLEX_CLIENT_ID", "AIRWALLEX_API_KEY"];
const empty = required.filter((name) => !vars[name]);
log("Airwallex sandbox smoke test");
log(`  credentials in ${path.basename(varsFile)}:`);
for (const name of [...required, "AIRWALLEX_WEBHOOK_SECRET", "ADMIN_TOKEN"]) {
  log(`    ${name.padEnd(26)} ${vars[name] ? "set" : "EMPTY"}`);
}
if (empty.length) {
  fatal(`Blocked: ${empty.join(", ")} ${empty.length > 1 ? "are" : "is"} empty in ${path.basename(varsFile)}. Fill in your Airwallex sandbox API key (Airwallex web app → Developer → API keys) and re-run.`, 2);
}
if ((vars.AIRWALLEX_ENV || "demo") === "prod") fatal("Refusing to run: AIRWALLEX_ENV is prod. This test only runs against the sandbox.", 2);
if (vars.AIRWALLEX_API_BASE && !/sandbox|demo|localhost|127\.0\.0\.1/.test(vars.AIRWALLEX_API_BASE)) {
  fatal("Refusing to run: AIRWALLEX_API_BASE does not look like the sandbox.", 2);
}
const wranglerToml = readFileSync(path.join(root, "wrangler.toml"), "utf8");
if (/^\s*AIRWALLEX_ENV\s*=\s*"prod"/m.test(wranglerToml) && !vars.AIRWALLEX_ENV) fatal("Refusing to run: wrangler.toml sets AIRWALLEX_ENV to prod.", 2);

const sandboxApi = vars.AIRWALLEX_API_BASE || "https://api.sandbox.airwallex.com";

// ---------- start (or reuse) the Worker ----------

let worker = null;
async function waitFor(url, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return true;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

const base = externalBase || `http://127.0.0.1:${port}`;
async function startWorker() {
  if (externalBase) {
    if (!(await waitFor(`${base}/api/store/config`, 5_000))) fatal(`No Worker answering at ${base}.`);
    return step("Using running Worker", base);
  }
  const wrangler = path.join(root, "node_modules", ".bin", "wrangler");
  const envArgs = envName ? ["--env", envName] : [];
  const migrate = spawnSync(wrangler, ["d1", "execute", "apgo-us-store", "--local", "--file", "worker/schema.sql", ...envArgs], { cwd: root, encoding: "utf8" });
  if (migrate.status !== 0) fatal(`Local D1 migration failed:\n${(migrate.stderr || migrate.stdout).slice(-800)}`);
  step("Local D1 schema applied");
  let output = "";
  worker = spawn(wrangler, ["dev", "--port", port, "--ip", "127.0.0.1", ...envArgs], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [worker.stdout, worker.stderr]) stream.on("data", (chunk) => { output = (output + chunk).slice(-4000); });
  const up = await waitFor(`${base}/api/store/config`, 60_000);
  if (!up) fatal(`wrangler dev did not start on port ${port}.\n${output.slice(-800)}`);
  step("Worker started", base);
}

function stopWorker() {
  if (worker && worker.exitCode === null) worker.kill("SIGTERM");
}
process.on("exit", stopWorker);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopWorker(); process.exit(130); });

// ---------- helpers ----------

async function json(url, init) {
  const response = await fetch(url, init);
  let body = null;
  try {
    body = await response.json();
  } catch {
    // leave null
  }
  return { response, body };
}

async function airwallexLogin() {
  const headers = { "Content-Type": "application/json", "x-client-id": vars.AIRWALLEX_CLIENT_ID, "x-api-key": vars.AIRWALLEX_API_KEY };
  if (vars.AIRWALLEX_LOGIN_AS) headers["x-login-as"] = vars.AIRWALLEX_LOGIN_AS;
  const { response, body } = await json(`${sandboxApi}/api/v1/authentication/login`, { method: "POST", headers });
  if (!response.ok || !body?.token) {
    fatal(`Airwallex sandbox login failed (HTTP ${response.status}, ${body?.code ?? "no code"}). Check the client id / API key are SANDBOX credentials.`);
  }
  return body.token;
}

async function pollOrder(orderId, wanted, { tries = 12, delayMs = 1500 } = {}) {
  let last = null;
  for (let i = 0; i < tries; i += 1) {
    const { response, body } = await json(`${base}/api/orders/${orderId}`);
    if (!response.ok) fatal(`GET /api/orders/${orderId} → HTTP ${response.status}`);
    last = body;
    if (wanted.includes(body.status)) return body;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return last;
}

// ---------- the flow ----------

const checks = [];
const expect = (name, ok, detail = "") => {
  checks.push({ name, ok });
  log(`  ${ok ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`);
};

try {
  log("\n1. Start");
  await startWorker();
  const token = await airwallexLogin();
  step("Airwallex sandbox login");

  log("\n2. Create order + PaymentIntent (POST /api/checkout/session)");
  const payload = {
    items: [{ sku: "d204", qty: 1 }, { sku: "d215", qty: 1 }],
    contact: { email: "smoke.test@example.com", marketingOptIn: false },
    shipping: { firstName: "Smoke", lastName: "Test", street: "100 Example Ave", street2: "", city: "Austin", state: "TX", zip: "78701" },
    method: "standard",
  };
  const created = await json(`${base}/api/checkout/session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!created.response.ok) {
    fatal(`Checkout session failed (HTTP ${created.response.status}, ${created.body?.error?.code}). Look at the wrangler dev output for the Airwallex error code.`);
  }
  const { orderId, quote, intent } = created.body;
  expect("PaymentIntent created", Boolean(intent?.id && intent?.clientSecret), `${orderId} · ${intent?.id} · $${(quote.totalCents / 100).toFixed(2)}`);

  log(`\n3. Pay with the sandbox test card (${card.note})`);
  const confirmed = await json(`${sandboxApi}/api/v1/pa/payment_intents/${intent.id}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      request_id: randomUUID(),
      payment_method: {
        type: "card",
        card: {
          number: card.number,
          expiry_month: "12",
          expiry_year: String(new Date().getFullYear() + 3),
          cvc: "123",
          name: "Smoke Test",
          billing: { first_name: "Smoke", last_name: "Test", email: "smoke.test@example.com", address: { country_code: "US", state: "TX", city: "Austin", street: "100 Example Ave", postcode: "78701" } },
        },
      },
    }),
  });
  const intentStatus = confirmed.body?.status;
  if (card.expects === "paid") {
    if (intentStatus === "REQUIRES_CUSTOMER_ACTION") {
      fatal("Airwallex asked for 3-D Secure on this test card, which a script cannot complete. Finish the payment in the browser at /checkout.html, or check your sandbox 3DS settings.");
    }
    if (!confirmed.response.ok) {
      fatal(`Server-side confirm was rejected (HTTP ${confirmed.response.status}, ${confirmed.body?.code}: ${confirmed.body?.message ?? "no message"}). Raw card confirm may need to be enabled for your sandbox account; the browser flow (Airwallex.js) does not need it.`);
    }
    expect("Card payment succeeded at Airwallex", intentStatus === "SUCCEEDED", `intent status ${intentStatus}`);
  } else {
    expect("Expected sandbox decline returned", !confirmed.response.ok && confirmed.body?.code === card.errorCode, `HTTP ${confirmed.response.status}, code ${confirmed.body?.code ?? "missing"}`);
  }

  log("\n4. Order status through the Worker (retrieve fallback)");
  const settled = await pollOrder(orderId, card.expects === "paid" ? ["paid", "review"] : ["cancelled", "review"], { tries: card.expects === "paid" ? 12 : 2 });
  if (card.expects === "paid") {
    expect("Order is paid", settled.status === "paid", `status ${settled.status}`);
    expect("Amounts match the quote", settled.totalCents === quote.totalCents);
  } else {
    expect("Order is not paid", settled.status !== "paid", `status ${settled.status}`);
  }

  if (card.expects === "paid") {
    log("\n5. Webhook path (signed locally with AIRWALLEX_WEBHOOK_SECRET)");
    if (!vars.AIRWALLEX_WEBHOOK_SECRET) {
      log("  – skipped: AIRWALLEX_WEBHOOK_SECRET is empty (create the sandbox webhook, then fill it in)");
    } else {
      const retrieved = await json(`${sandboxApi}/api/v1/pa/payment_intents/${intent.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const event = { id: `evt_smoke_${randomUUID()}`, name: "payment_intent.succeeded", data: { object: retrieved.body } };
      const raw = JSON.stringify(event);
      const timestamp = String(Date.now());
      const signature = createHmac("sha256", vars.AIRWALLEX_WEBHOOK_SECRET).update(`${timestamp}${raw}`).digest("hex");
      const send = (headers) => json(`${base}/api/webhooks/airwallex`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: raw });
      const good = await send({ "x-timestamp": timestamp, "x-signature": signature });
      expect("Signed webhook accepted", good.response.status === 200 && good.body?.received === true);
      const bad = await send({ "x-timestamp": timestamp, "x-signature": "0".repeat(64) });
      expect("Bad signature rejected", bad.response.status === 400);
      const again = await send({ "x-timestamp": timestamp, "x-signature": signature });
      expect("Redelivery is idempotent", again.body?.duplicate === true);
    }

    log("\n6. Back office");
    if (!vars.ADMIN_TOKEN) {
      log("  – skipped: ADMIN_TOKEN is empty");
    } else {
      const { response, body } = await json(`${base}/admin/api/orders/${orderId}`, { headers: { Authorization: `Bearer ${vars.ADMIN_TOKEN}` } });
      expect("Admin API shows the order as paid", response.ok && body?.status === "paid", response.ok ? `notification: ${body.notification?.status ?? "none"}` : `HTTP ${response.status}`);
      expect("Admin shows the shipping address", body?.shipping?.zip === "78701");
      const anonymous = await fetch(`${base}/admin/api/orders`);
      expect("Admin API rejects anonymous requests", anonymous.status === 401);
    }
  }
} finally {
  stopWorker();
}

const failed = checks.filter((check) => !check.ok);
log(`\n${failed.length ? "✖" : "✔"} ${checks.length - failed.length}/${checks.length} checks passed${failed.length ? ` — failed: ${failed.map((c) => c.name).join("; ")}` : ""}`);
log("  Test data stays in the local D1 database and the Airwallex sandbox only.");
process.exit(failed.length ? 1 : 0);
