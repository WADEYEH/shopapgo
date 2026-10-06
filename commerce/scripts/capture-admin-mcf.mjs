// Back-office Amazon MCF screenshots (failed + retry, sent, shipped by Amazon), mobile and desktop.
// /admin/api is stubbed (tests/helpers/admin-mock.mjs): no Worker, secrets or Amazon needed.
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
const failed = { status: "failed", mcfStatus: null, sellerOrderId: ORDER, attempts: 1, serviceTier: "EXPEDITED", errorKind: "invalid", errorMessage: "destination.deliveryAddress.postalCode is invalid", note: null, carrier: null, trackingNumber: null, submittedAt: null, lastSyncedAt: null, updatedAt: "2026-10-01T02:00:00.000Z" };

try {
  for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: "en-US", timezoneId: "America/Los_Angeles", reducedMotion: "reduce" });
    let page = await context.newPage();
    const shot = async (name) => {
      await page.evaluate(() => document.fonts?.ready);
      await page.screenshot({ path: path.join(out, `admin-mcf-${name}-${label}.png`), fullPage: true, animations: "disabled" });
    };

    // 1. default: MCF switched off -> "not enabled, ship manually"
    await mockAdminApi(page);
    await page.goto(`${BASE_URL}/admin/index.html#${ORDER}`, { waitUntil: "networkidle" });
    await page.locator('[data-admin-mcf="off"]').waitFor();
    await shot("off");
    await page.close();
    page = await context.newPage(); // fresh page: a hash-only navigation would not reload the script

    // 2. on, send failed -> error + retry button; retry -> sent + sync; sync -> shipped by Amazon
    const requests = await mockAdminApi(page, { mcf: { mode: "ready" }, mcfRecords: { [ORDER]: failed } });
    await page.goto(`${BASE_URL}/admin/index.html#${ORDER}`, { waitUntil: "networkidle" });
    await page.locator('[data-mcf-record="failed"]').waitFor();
    await shot("failed");
    await page.locator("[data-mcf-submit]").click();
    await page.locator('[data-mcf-record="submitted"]').waitFor();
    await shot("sent");
    requests.mcfState.amazonShipped = true;
    await page.locator("[data-mcf-sync]").click();
    await page.locator('[data-mcf-record="shipped"]').waitFor();
    await shot("shipped");
    await context.close();
  }
  console.log("Wrote review/admin-mcf-{off,failed,sent,shipped}-{desktop,mobile}.png");
} finally {
  await browser.close();
  await stopServer();
}
