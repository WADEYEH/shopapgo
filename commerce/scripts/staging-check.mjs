#!/usr/bin/env node
// Checks a deployed staging Worker: every page opens with Basic auth, no credentials -> 401, noindex header, robots.txt.
//   node scripts/staging-check.mjs --base https://staging.shopapgo.com --admin-base https://admin-staging.shopapgo.com --credentials ~/.apgo-staging-credentials
// Screenshots: review/staging-<page>.png (no secrets are ever displayed). Exit 0 = all good, 1 = a check failed, 2 = bad usage.
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : ""; };
const base = (option("base") || "").replace(/\/$/, "");
// Optional: the back-office host (ADMIN_HOST). Store hosts then answer 404 for /admin*; the admin host needs ADMIN_TOKEN (401 without).
const adminBase = (option("admin-base") || "").replace(/\/$/, "");
const credentialsFile = (option("credentials") || "").replace(/^~(?=\/)/, process.env.HOME || "~");
if (!base || !credentialsFile) { console.error("Usage: --base <url> --credentials <file>"); process.exit(2); }
const vars = Object.fromEntries(readFileSync(credentialsFile, "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1)]));
const auth = `Basic ${Buffer.from(`${vars.STAGING_BASIC_AUTH_USER}:${vars.STAGING_BASIC_AUTH_PASSWORD}`).toString("base64")}`;
const NOINDEX = "noindex, nofollow, noarchive";
let failed = 0;
const check = (name, pass, detail = "") => { console.log(`  ${pass ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`); if (!pass) failed += 1; };

const pages = ["/", "/products", "/privacy", "/terms", "/returns", "/shipping", "/contact", "/cart", "/checkout"];
mkdirSync(path.join(root, "review"), { recursive: true });
for (const p of [...pages, "/api/store/config", "/js/meta-pixel.js", ...(adminBase ? [] : ["/admin/"])]) {
  const anon = await fetch(base + p, { redirect: "manual" });
  check(`no credentials -> 401  ${p}`, anon.status === 401 && anon.headers.get("x-robots-tag") === NOINDEX, `HTTP ${anon.status}`);
}
for (const p of [...pages, "/api/store/config"]) {
  const res = await fetch(base + p, { headers: { Authorization: auth } });
  check(`Basic auth -> 200 + X-Robots-Tag  ${p}`, res.status === 200 && res.headers.get("x-robots-tag") === NOINDEX, `HTTP ${res.status}`);
}
const robots = await fetch(`${base}/robots.txt`);
check("robots.txt is Disallow: /", robots.status === 200 && /^Disallow: \/$/m.test(await robots.text()));
const cfg = await (await fetch(`${base}/api/store/config`, { headers: { Authorization: auth } })).json();
check("/api/store/config sandbox + ready", cfg.airwallexEnv === "demo" && cfg.storeReady === true, `airwallexEnv=${cfg.airwallexEnv} storeReady=${cfg.storeReady}`);
const hook = await fetch(`${base}/api/webhooks/airwallex`, { method: "POST", body: "{}" });
check("webhook skips Basic gate (own signature check -> 400)", hook.status === 400, `HTTP ${hook.status}`);
if (adminBase) {
  const onStore = await fetch(`${base}/admin/`, { redirect: "manual" });
  check("store host: /admin/ -> 404", onStore.status === 404, `HTTP ${onStore.status}`);
  const adminPage = await fetch(`${adminBase}/admin/`, { redirect: "manual" });
  check("admin host: /admin/ without ADMIN_TOKEN -> 401 + noindex", adminPage.status === 401 && /noindex/.test(adminPage.headers.get("x-robots-tag") || ""), `HTTP ${adminPage.status}`);
  const adminApi = await fetch(`${adminBase}/admin/api/orders`);
  check("admin host: API without ADMIN_TOKEN -> 401", adminApi.status === 401, `HTTP ${adminApi.status}`);
  const adminShop = await fetch(`${adminBase}/products`);
  check("admin host: storefront page -> 404", adminShop.status === 404, `HTTP ${adminShop.status}`);
} else {
  const adminApi = await fetch(`${base}/admin/api/orders`);
  check("admin API without ADMIN_TOKEN -> 401", adminApi.status === 401, `HTTP ${adminApi.status}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, httpCredentials: { username: vars.STAGING_BASIC_AUTH_USER, password: vars.STAGING_BASIC_AUTH_PASSWORD } });
const page = await context.newPage();
for (const p of pages) {
  const response = await page.goto(base + p, { waitUntil: "load" });
  const name = p === "/" ? "home" : p.replace(/^\/|\.html$/g, "");
  check(`browser opens ${p}`, response.ok() && (await page.locator("h1, h2").count()) > 0, `HTTP ${response.status()} -> ${new URL(page.url()).pathname}`);
  await page.screenshot({ path: path.join(root, "review", `staging-${name}.png`), fullPage: true });
}
await browser.close();
console.log(failed ? `\n✖ ${failed} check(s) failed` : "\n✔ staging checks passed");
process.exitCode = failed ? 1 : 0;
