// Local preview screenshots of the product pages (desktop 1440 and mobile 390) for both SKUs,
// with /api stubbed by the real Worker modules (no Worker or secrets needed).
//   node scripts/capture-product-pages.mjs [outDir]      default outDir: review/ (PNGs are git-ignored)
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

import { mockStore } from "../tests/helpers/store-mock.mjs";
import { BASE_URL, ensurePrototypeServer } from "./server-utils.mjs";

const out = path.resolve(process.argv[2] || "review");
await mkdir(out, { recursive: true });
const stopServer = await ensurePrototypeServer();
const browser = await chromium.launch({ headless: true });
try {
  for (const sku of ["d204", "d215"]) {
    for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
      const context = await browser.newContext({ viewport, locale: "en-US", reducedMotion: "reduce" });
      const page = await context.newPage();
      await mockStore(page, { env: {} });
      await page.goto(`${BASE_URL}/products/${sku}.html`, { waitUntil: "networkidle" });
      await page.waitForSelector("html[data-pdp-ready]");
      await page.evaluate(() => document.fonts?.ready);
      const file = path.join(out, `product-${sku}-${label}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(file);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await stopServer();
}
