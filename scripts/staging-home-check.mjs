#!/usr/bin/env node
// Staging home check: "/" must be the store entry (cart badge, Add to cart for D204 and D215) and adding must reach cart + checkout.
//   node scripts/staging-home-check.mjs --base https://<host> --credentials FILE   (FILE: STAGING_BASIC_AUTH_USER / _PASSWORD lines)
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : ""; };
const base = option("base").replace(/\/$/, "");
const file = option("credentials").replace(/^~(?=\/)/, process.env.HOME || "~");
if (!base || !file) { console.error("Usage: --base <url> --credentials <file>"); process.exit(2); }
const vars = Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1)]));
const tag = option("tag") || new URL(base).hostname.split(".")[0];
let failed = 0;
const check = (name, pass, detail = "") => { console.log(`  ${pass ? "✔" : "✖"} ${name}${detail ? ` — ${detail}` : ""}`); if (!pass) failed += 1; };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, httpCredentials: { username: vars.STAGING_BASIC_AUTH_USER, password: vars.STAGING_BASIC_AUTH_PASSWORD } });
const page = await context.newPage();
await page.goto(`${base}/`, { waitUntil: "load" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "load" });
check("/ title is the v3 store entry", /Choose Your Application/.test(await page.title()), await page.title());
check("header cart badge present", (await page.locator("[data-cart-badge], [data-cart-count], a[href*='cart']").count()) > 0);
for (const sku of ["d204", "d215"]) {
  const btn = page.locator(`button[data-add-to-cart="${sku}"]`);
  check(`Add to cart button for ${sku.toUpperCase()}`, (await btn.count()) > 0, `${await btn.count()} buttons`);
}
await page.screenshot({ path: path.join(root, "review", `${tag}-home-cart-badge.png`) });
await page.locator('label[for="selector-d204"]').scrollIntoViewIfNeeded();
await page.locator('label[for="selector-d204"]').click();
const add = page.locator('button[data-add-to-cart="d204"][data-placement="selected"]');
await add.scrollIntoViewIfNeeded();
await add.click();
await page.locator('[data-cart-status][data-sku="d204"][data-placement="selected"]').filter({ hasText: /in cart/i }).waitFor({ timeout: 10_000 });
check("D204 added (status: in cart)", true);
await page.locator('label[for="selector-d215"]').click();
const add2 = page.locator('button[data-add-to-cart="d215"][data-placement="selected"]');
await add2.scrollIntoViewIfNeeded();
await add2.click();
await page.locator('[data-cart-status][data-sku="d215"][data-placement="selected"]').filter({ hasText: /in cart/i }).waitFor({ timeout: 10_000 });
check("D215 added (status: in cart)", true);
await page.goto(`${base}/cart.html`, { waitUntil: "load" });
await page.locator("[data-cart-lines] li").first().waitFor({ timeout: 10_000 });
const lines = await page.locator("[data-cart-lines] li").count();
check("cart shows both lines", lines === 2, `${lines} lines`);
await page.screenshot({ path: path.join(root, "review", `${tag}-home-cart.png`), fullPage: true });
await page.locator("[data-checkout-button]").click();
await page.waitForURL(/\/checkout(\.html)?(\?|$)/);
await page.waitForLoadState("networkidle");
check("checkout opens", await page.locator("#email").isVisible());
await page.screenshot({ path: path.join(root, "review", `${tag}-home-checkout.png`), fullPage: true });
await browser.close();
console.log(failed ? `\n✖ ${failed} check(s) failed` : "\n✔ home/cart flow passed");
process.exitCode = failed ? 1 : 0;
