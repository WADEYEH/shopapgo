import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { BASE_URL, ensurePrototypeServer } from "./server-utils.mjs";

const outputDirectory = path.resolve("review");
await mkdir(outputDirectory, { recursive: true });

const stopServer = await ensurePrototypeServer();
const browser = await chromium.launch({ headless: true });

async function openPage(viewport) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.locator("html[data-apgo-ready='true']").waitFor();
  await page.evaluate(() => document.fonts?.ready);
  return { context, page };
}

try {
  {
    const { context, page } = await openPage({ width: 1440, height: 900 });
    await page.screenshot({
      path: path.join(outputDirectory, "desktop-1440-full.png"),
      fullPage: true,
      animations: "disabled",
    });
    await context.close();
  }

  {
    const { context, page } = await openPage({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(outputDirectory, "mobile-390-full.png"),
      fullPage: true,
      animations: "disabled",
    });
    await context.close();
  }

  {
    const { context, page } = await openPage({ width: 390, height: 844 });
    const d215 = page.locator(
      'input[data-routine-option][value="d215"], input[name="application-routine"][value="d215"]',
    );
    if ((await d215.count()) > 0) await d215.first().check({ force: true });

    const faq = page
      .locator("details[data-faq-item], [data-faq] details, .faq-list details, #faq details")
      .first();
    if ((await faq.count()) > 0) {
      await faq.evaluate((element) => {
        element.open = true;
      });
    }

    const hero = page.locator("[data-hero], #hero, .hero, #top").first();
    if ((await hero.count()) > 0) {
      await hero.evaluate((element) => {
        window.scrollTo(0, element.offsetTop + element.offsetHeight + 24);
      });
      await page.waitForTimeout(250);
    }

    await page.screenshot({
      path: path.join(outputDirectory, "interaction-states.png"),
      fullPage: true,
      animations: "disabled",
    });
    await context.close();
  }

  console.log(`Review captures written to ${outputDirectory}`);
} finally {
  await browser.close();
  await stopServer();
}
