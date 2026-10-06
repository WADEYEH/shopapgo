// Screenshots of the v3 "Add to cart" entry points (desktop + mobile) and the
// order back office, with /api and /admin/api stubbed so no Worker or secrets are
// needed. Output goes to review/.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { BASE_URL, ensurePrototypeServer } from "./server-utils.mjs";
import { mockAdminApi } from "../tests/helpers/admin-mock.mjs";

const out = path.resolve("review");
await mkdir(out, { recursive: true });
const stopServer = await ensurePrototypeServer();
const browser = await chromium.launch({ headless: true });

async function open(viewport, url, { seedCart } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "en-US", timezoneId: "America/Los_Angeles", reducedMotion: "reduce" });
  const page = await context.newPage();
  if (seedCart) await page.addInitScript((v) => localStorage.setItem("apgo_us_cart_v1", JSON.stringify(v)), seedCart);
  await page.goto(`${BASE_URL}${url}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts?.ready);
  return { context, page };
}

try {
  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    for (const sku of ["d204", "d215"]) {
      const { context, page } = await open(viewport, `/v3.html#${sku}`);
      await page.locator("html[data-apgo-v3-ready='true']").waitFor();
      const panel = page.locator(`[data-product-panel="${sku}"]`);
      await panel.scrollIntoViewIfNeeded();
      await page.locator(`[data-product-panel="${sku}"] [data-add-to-cart]`).click();
      await page.waitForTimeout(150);
      await page.addStyleTag({ content: ".mobile-sticky{display:none!important}" });
      await panel.screenshot({ path: path.join(out, `v3-cart-${sku}-${label}.png`), animations: "disabled" });
      await context.close();
    }
    const { context, page } = await open(viewport, "/v3.html#d204");
    await page.locator("html[data-apgo-v3-ready='true']").waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator(".v3-header").screenshot({ path: path.join(out, `v3-cart-header-${label}.png`), animations: "disabled" });
    await context.close();
  }

  {
    const { context, page } = await open({ width: 390, height: 844 }, "/v3.html#d215");
    await page.locator("html[data-apgo-v3-ready='true']").waitFor();
    await page.locator("#why").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, "v3-cart-sticky-mobile.png"), animations: "disabled" });
    await context.close();
  }

  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "en-US", timezoneId: "America/Los_Angeles", reducedMotion: "reduce" });
    const page = await context.newPage();
    await mockAdminApi(page);
    await page.goto(`${BASE_URL}/admin/index.html#APGO-US-0123456789AB`, { waitUntil: "networkidle" });
    await page.locator("[data-admin-detail-body] h3").waitFor();
    await page.evaluate(() => document.fonts?.ready);
    await page.screenshot({ path: path.join(out, `admin-orders-${label}.png`), fullPage: true, animations: "disabled" });
    await context.close();
  }
  console.log(`Cart + admin captures written to ${out}`);
} finally {
  await browser.close();
  await stopServer();
}
