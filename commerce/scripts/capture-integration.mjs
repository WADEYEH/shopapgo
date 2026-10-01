import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fillToPayment, mockStore } from "../tests/helpers/store-mock.mjs";

const brand = process.env.APGO_BRAND_URL || "http://127.0.0.1:3012/us";
const store = process.env.APGO_STORE_URL || "http://127.0.0.1:8799";
await mkdir("review", { recursive: true });
const browser = await chromium.launch();
try {
  for (const [name, width] of [["desktop", 1440], ["mobile", 390]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(`${brand}#d215`);
    await page.locator('#d215 [data-store-add="d215"]').waitFor();
    await page.locator("#d215").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `review/brand-store-${name}.png` });
    await page.locator('#d215 [data-store-add="d215"]').click();
    await page.locator('[data-line="d215"]').waitFor();
    await page.screenshot({ path: `review/cart-${name}.png`, fullPage: true });
    await mockStore(page, { env: { SITE_HOME_URL: brand } });
    await page.locator("[data-checkout-button]").click();
    await fillToPayment(page);
    await page.screenshot({ path: `review/checkout-${name}.png`, fullPage: true });
    await context.close();
  }
} finally {
  await browser.close();
}
console.log("Saved desktop/mobile brand entries, cart and mocked checkout under commerce/review/.");
