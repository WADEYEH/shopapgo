import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { BASE_URL, ensurePrototypeServer } from "./server-utils.mjs";

const outputDirectory = path.resolve("review");
await mkdir(outputDirectory, { recursive: true });

const stopServer = await ensurePrototypeServer();
const browser = await chromium.launch({ headless: true });

async function openPage(viewport, hash = "") {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/v2.html${hash}`, { waitUntil: "networkidle" });
  await page.locator("html[data-apgo-v2-ready='true']").waitFor();
  await page.evaluate(() => document.fonts?.ready);
  return { context, page };
}

async function loadAllImages(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let top = 0; top < height; top += 700) {
    await page.evaluate((value) => window.scrollTo(0, value), top);
    await page.waitForTimeout(35);
  }
  await page.waitForFunction(() =>
    [...document.images].every(
      (image) => image.getClientRects().length === 0 || (image.complete && image.naturalWidth > 0),
    ),
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
}

try {
  {
    const { context, page } = await openPage({ width: 1440, height: 900 });
    await loadAllImages(page);
    await page.screenshot({
      path: path.join(outputDirectory, "v2-desktop-full.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.screenshot({
      path: path.join(outputDirectory, "v2-desktop-hero.png"),
      animations: "disabled",
    });

    await page.locator('[data-product-radio][value="d204"]').check({ force: true });
    await page.locator("#choose").scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    await page.addStyleTag({ content: ".v2-header,.skip-link{display:none!important}" });
    await page.locator(".v2-choice-stage").screenshot({
      path: path.join(outputDirectory, "v2-choice-d204.png"),
      animations: "disabled",
    });
    await page.locator("#process").screenshot({
      path: path.join(outputDirectory, "v2-process-d204.png"),
      animations: "disabled",
    });
    await page.locator('[data-final-state="d204"]').screenshot({
      path: path.join(outputDirectory, "v2-final-d204.png"),
      animations: "disabled",
    });

    await page.locator('[data-product-radio][value="d215"]').check({ force: true });
    await page.waitForTimeout(120);
    await page.locator(".v2-choice-stage").screenshot({
      path: path.join(outputDirectory, "v2-choice-d215.png"),
      animations: "disabled",
    });
    await page.locator("#process").screenshot({
      path: path.join(outputDirectory, "v2-process-d215.png"),
      animations: "disabled",
    });
    await context.close();
  }

  {
    const { context, page } = await openPage({ width: 390, height: 844 });
    await loadAllImages(page);
    await page.screenshot({
      path: path.join(outputDirectory, "v2-mobile-full.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.screenshot({
      path: path.join(outputDirectory, "v2-mobile-hero.png"),
      animations: "disabled",
    });
    await context.close();
  }

  console.log(`V2 review captures written to ${outputDirectory}`);
} finally {
  await browser.close();
  await stopServer();
}
