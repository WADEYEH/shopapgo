// Back-office fulfilment screenshots (shipping form + shipped record), mobile and desktop.
// /admin/api is stubbed (tests/helpers/admin-mock.mjs): no Worker, secrets or email needed.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { BASE_URL, ensurePrototypeServer } from "./server-utils.mjs";
import { mockAdminApi } from "../tests/helpers/admin-mock.mjs";

const out = path.resolve("review");
await mkdir(out, { recursive: true });
const stopServer = await ensurePrototypeServer();
const browser = await chromium.launch({ headless: true });
const ORDER = "APGO-US-0123456789AB";

try {
  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "en-US", timezoneId: "America/Los_Angeles", reducedMotion: "reduce" });
    const page = await context.newPage();
    await mockAdminApi(page);
    await page.goto(`${BASE_URL}/admin/index.html#${ORDER}`, { waitUntil: "networkidle" });
    const form = page.locator("[data-ship-form]");
    await form.waitFor();
    await form.getByLabel(/Carrier/).fill("UPS");
    await form.getByLabel(/Tracking number/).fill("1Z999AA10123456784");
    await form.getByLabel(/Tracking link/).fill("https://www.ups.com/track?tracknum=1Z999AA10123456784");
    await page.evaluate(() => document.fonts?.ready);
    const shot = async (name) => {
      const target = label === "mobile" ? page : page;
      await target.screenshot({ path: path.join(out, `admin-fulfillment-${name}-${label}.png`), fullPage: true, animations: "disabled" });
    };
    await shot("form");
    await page.getByRole("button", { name: "Mark as shipped" }).click();
    await page.locator('[data-admin-fulfillment="shipped"]').waitFor();
    await page.evaluate(() => document.fonts?.ready);
    await shot("shipped");
    await context.close();
  }
  console.log("Wrote review/admin-fulfillment-{form,shipped}-{desktop,mobile}.png");
} finally {
  await browser.close();
  await stopServer();
}
