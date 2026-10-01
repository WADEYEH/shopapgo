#!/usr/bin/env node
// Browser smoke test of the REAL Airwallex SANDBOX payment flow (Airwallex.js split card iframes).
//
//   npm run dev                      # in another terminal (wrangler dev, port 8799)
//   npm run smoke:airwallex:browser  # [-- --base http://127.0.0.1:8799] [--headed] [--card success|declined]
//
// Against a deployed STAGING Worker (Basic-auth gate, see docs/commerce.md):
//   node scripts/airwallex-browser-smoke.mjs --base https://<staging>.workers.dev --credentials ~/.apgo-staging-credentials
// --credentials FILE (KEY=VALUE lines) supplies STAGING_BASIC_AUTH_USER / STAGING_BASIC_AUTH_PASSWORD (whole-site Basic gate) and
// ADMIN_TOKEN (for /admin/); with it, .dev.vars is not read. Screenshots then get the prefix "staging-" (--shot-prefix to override).
//
// Flow: /v3.html Add to cart → cart.html → checkout (contact → shipping → payment) →
//       type the sandbox test card into the Airwallex iframes → Place order →
//       confirmation page → /admin/ (Basic auth with ADMIN_TOKEN) shows the order as "paid".
// Screenshots: review/airwallex-browser-*.png. ADMIN_TOKEN is read from .dev.vars and never printed
// or screenshotted (only sent as Basic-auth credentials). Uses fake recipient data only.
// Exit codes: 0 passed · 1 failed · 2 blocked (missing config / server / prod env).

import { readFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const base = option("base", "http://127.0.0.1:8799").replace(/\/$/, "");
// Staging serves the back office on its own host (ADMIN_HOST): pass --admin-base https://admin-staging.shopapgo.com. Default: same host as --base.
const adminBase = option("admin-base", base).replace(/\/$/, "");
const headed = args.includes("--headed");
const CARDS = {
  success: { number: "4035501000000008", expects: "paid" },
  declined: { number: "4000000000000002", expects: "unpaid" },
};
const cardName = option("card", "success");
const card = CARDS[cardName];
const credentialsOption = option("credentials", "");
const shotPrefix = option("shot-prefix", credentialsOption ? "staging-" : "");
const shotDir = path.join(root, "review");
mkdirSync(shotDir, { recursive: true });

const log = (m = "") => console.log(m);
const ok = (name, detail = "") => log(`  ✔ ${name}${detail ? ` — ${detail}` : ""}`);
function fatal(message, code = 1) {
  log(`\n✖ ${message}`);
  process.exitCode = code;
  throw Object.assign(new Error(message), { handled: true });
}
if (!card) fatal(`Unknown --card "${cardName}". Use: ${Object.keys(CARDS).join(", ")}`, 2);

function parseVars(file) {
  const vars = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) vars[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return vars;
}
let vars;
let basicUser = "";
let basicPassword = "";
if (credentialsOption) {
  const credentialsFile = credentialsOption.replace(/^~(?=\/)/, process.env.HOME || "~");
  if (!existsSync(credentialsFile)) fatal(`Credentials file not found: ${credentialsOption}`, 2);
  vars = parseVars(credentialsFile);
  basicUser = vars.STAGING_BASIC_AUTH_USER || "";
  basicPassword = vars.STAGING_BASIC_AUTH_PASSWORD || "";
} else {
  const varsFile = path.join(root, ".dev.vars");
  if (!existsSync(varsFile)) fatal(".dev.vars not found (see .dev.vars.example).", 2);
  vars = parseVars(varsFile);
  if ((vars.AIRWALLEX_ENV || "demo") === "prod") fatal("Refusing to run: AIRWALLEX_ENV is prod.", 2);
  if (!vars.AIRWALLEX_CLIENT_ID || !vars.AIRWALLEX_API_KEY) fatal("AIRWALLEX_CLIENT_ID / AIRWALLEX_API_KEY are empty in .dev.vars.", 2);
}
const adminToken = vars.ADMIN_TOKEN || "";
const gateHeaders = basicUser ? { Authorization: `Basic ${Buffer.from(`${basicUser}:${basicPassword}`).toString("base64")}` } : {};
log("Airwallex sandbox BROWSER smoke test");
log(`  ADMIN_TOKEN ${adminToken ? "set" : "EMPTY (admin check skipped)"}`);

try {
  const r = await fetch(`${base}/api/store/config`, { headers: gateHeaders });
  const cfg = await r.json();
  if (cfg.airwallexEnv !== "demo") fatal(`Refusing to run: store reports airwallexEnv=${cfg.airwallexEnv}.`, 2);
} catch (e) {
  if (e.handled) throw e;
  fatal(`No Worker answering at ${base}. Start it with: npm run dev`, 2);
}

const shot = async (page, name) => {
  const file = path.join(shotDir, `airwallex-browser-${shotPrefix}${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  ok(`screenshot`, path.relative(root, file));
};

const browser = await chromium.launch({ headless: !headed });
const context = await browser.newContext({
  ...(basicUser ? { httpCredentials: { username: basicUser, password: basicPassword } } : {}),
  viewport: { width: 1280, height: 1000 },
  locale: "en-US",
  timezoneId: "America/Los_Angeles",
});
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)); });

// Find the Airwallex iframe input for one element (cardNumber / expiry / cvc).
async function typeInElement(containerSelector, text) {
  const iframeHandle = await page.waitForSelector(`${containerSelector} iframe`, { timeout: 30_000 });
  const frame = await iframeHandle.contentFrame();
  const input = frame.locator("input").first();
  await input.waitFor({ state: "visible", timeout: 20_000 });
  await input.click();
  await page.keyboard.type(text, { delay: 40 });
}

try {
  // 1. v3 → add to cart
  await page.goto(`${base}/v3.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('label[for="selector-d204"]').scrollIntoViewIfNeeded();
  await page.locator('label[for="selector-d204"]').click(); // choose the dry route → reveals its panel
  const add = page.locator('button[data-add-to-cart="d204"][data-placement="selected"]');
  await add.scrollIntoViewIfNeeded();
  await add.click();
  await page.locator('[data-cart-status][data-sku="d204"][data-placement="selected"]').filter({ hasText: /in cart/i }).waitFor({ timeout: 10_000 });
  await shot(page, "1-v3-added");
  ok("v3 Add to cart");

  // 2. cart
  await page.goto(`${base}/cart.html`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-cart-lines] li").first().waitFor({ timeout: 10_000 });
  await shot(page, "2-cart");
  ok("cart shows line item");
  await page.locator("[data-checkout-button]").click();
  await page.waitForURL(/\/checkout(\.html)?(\?|$)/);
  // A deployed Worker redirects /checkout.html -> /checkout: wait for the page to finish loading and the flow to render.
  await page.waitForLoadState("load");
  await page.locator("[data-checkout-flow]:not([hidden]) #email").waitFor({ timeout: 15_000 });
  // checkout.js un-hides the form, awaits /api/cart/quote, THEN calls goTo("contact"): on a slow network, typing earlier
  // is bounced back to step 1. Wait for the network to go quiet first.
  await page.waitForLoadState("networkidle");

  // 3. checkout: contact → shipping → payment
  await page.locator("#email").fill("sandbox-buyer@example.com");
  await page.locator('[data-step="contact"] button[type="submit"]').click();
  await page.locator("#firstName").waitFor({ state: "visible" });
  await page.fill("#firstName", "Test");
  await page.fill("#lastName", "Buyer");
  await page.fill("#street", "123 Test Street");
  await page.fill("#city", "Los Angeles");
  await page.selectOption("#state", "CA");
  await page.fill("#zip", "90001");
  await shot(page, "3-checkout-shipping");
  await page.locator('[data-step="shipping"] button[type="submit"]').click();
  await page.locator('[data-step="payment"]').waitFor({ state: "visible" });
  ok("checkout contact + shipping");

  // 4. Airwallex card iframes
  await typeInElement("#card-number", card.number);
  await typeInElement("#card-expiry", "1230");
  await typeInElement("#card-cvc", "123");
  await page.waitForTimeout(1000);
  const card_errors = await page.locator('[data-step="payment"] [data-error]:not([hidden])').allTextContents();
  if (card_errors.length) fatal(`Card fields reported errors: ${card_errors.join(" | ")}`);
  await shot(page, "4-card-filled");
  ok("Airwallex card iframes filled", `iframes: ${page.frames().length - 1}`);

  // 5. pay
  const sessionResponse = page.waitForResponse((r) => r.url().includes("/api/checkout/session"), { timeout: 30_000 });
  await page.locator("[data-place-order]").click();
  const session = await sessionResponse;
  ok("POST /api/checkout/session", `HTTP ${session.status()}`);
  if (session.status() >= 400) fatal(`checkout session failed: ${(await session.text()).slice(0, 300)}`);

  const outcome = await Promise.race([
    page.waitForURL(/checkout(\.html)?\?order=/, { timeout: 60_000 }).then(() => "confirmation"),
    page.locator("[data-payment-message] .notice").waitFor({ state: "visible", timeout: 60_000 }).then(() => "message"),
  ]);
  if (outcome === "message") {
    const text = (await page.locator("[data-payment-message]").innerText()).replace(/\s+/g, " ");
    await shot(page, "5-payment-message");
    if (card.expects === "unpaid") ok("declined card rejected as expected", text);
    else fatal(`Payment not completed in the browser: ${text}`);
  } else {
    const orderId = new URL(page.url()).searchParams.get("order");
    await page.locator("[data-confirmation] .notice").filter({ hasNotText: /Confirming payment/i }).first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(500);
    await shot(page, "5-confirmation");
    const text = (await page.locator("[data-confirmation]").innerText()).replace(/\s+/g, " ");
    log(`  order ${orderId}: ${text.slice(0, 160)}`);
    if (card.expects === "paid" && !/Order confirmed/i.test(text)) fatal(`Confirmation page did not show "Order confirmed".`);
    ok("confirmation page", "Order confirmed");

    // 6. order state via public API + admin UI
    const order = await (await fetch(`${base}/api/orders/${encodeURIComponent(orderId)}`, { headers: gateHeaders })).json();
    ok("GET /api/orders/:id", `status=${order.status} paymentStatus=${order.paymentStatus}`);
    if (order.status !== "paid") fatal(`Order status is "${order.status}", expected "paid".`);

    if (adminToken) {
      const authed = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        httpCredentials: { username: "admin", password: adminToken },
      });
      const admin = await authed.newPage();
      await admin.goto(`${adminBase}/admin/`, { waitUntil: "domcontentloaded" });
      await admin.locator("[data-admin-list] li").first().waitFor({ timeout: 15_000 });
      const row = admin.locator("[data-admin-list] li", { hasText: orderId }).first();
      await row.locator("button, a").first().click().catch(() => row.click());
      await admin.locator("[data-admin-detail-body]").waitFor({ state: "visible", timeout: 10_000 });
      const detail = (await admin.locator("[data-admin-detail-body]").innerText()).replace(/\s+/g, " ");
      await shot(admin, "6-admin-order");
      if (!/paid/i.test(detail)) fatal("Admin detail does not show the order as paid.");
      ok("/admin/ shows order as paid");
      await authed.close();
    }
  }
  log("\n✔ Browser smoke test passed");
} catch (error) {
  if (!error.handled) {
    process.exitCode = 1;
    log(`\n✖ ${error.message.split("\n").slice(0, 6).join("\n  ")}`);
  }
  try { await shot(page, "failure"); } catch { /* ignore */ }
  if (consoleErrors.length) log(`  browser console errors:\n    ${consoleErrors.slice(-5).join("\n    ")}`);
} finally {
  await browser.close();
}
