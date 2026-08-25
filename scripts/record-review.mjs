import { copyFile, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";
import { BASE_URL, ensurePrototypeServer } from "./server-utils.mjs";

const outputDirectory = path.resolve("review");
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "apgo-review-"));
await mkdir(outputDirectory, { recursive: true });

const stopServer = await ensurePrototypeServer();
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    recordVideo: {
      dir: temporaryDirectory,
      size: { width: 390, height: 844 },
    },
  });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.locator("html[data-apgo-ready='true']").waitFor();
  await page.waitForTimeout(2_000);

  const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const stops = 11;
  for (let index = 1; index <= stops; index += 1) {
    const top = Math.round((documentHeight - 844) * (index / stops));
    await page.evaluate((scrollTop) => {
      window.scrollTo({ top: scrollTop, behavior: "smooth" });
    }, top);
    await page.waitForTimeout(1_800);

    if (index === 2) {
      const d215 = page.locator(
        'input[data-routine-option][value="d215"], input[name="application-routine"][value="d215"]',
      );
      if ((await d215.count()) > 0) await d215.first().check();
    }
  }

  const faq = page.locator("details[data-faq-item], [data-faq] details").first();
  if ((await faq.count()) > 0) {
    await faq.scrollIntoViewIfNeeded();
    await faq.locator("summary").click();
    await page.waitForTimeout(3_000);
  }

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await page.waitForTimeout(3_000);
  await context.close();

  const files = await readdir(temporaryDirectory);
  const sourceVideo = files.find((file) => file.endsWith(".webm"));
  if (!sourceVideo) throw new Error("Playwright did not produce a review video.");
  const destination = path.join(outputDirectory, "interaction-walkthrough.webm");
  await copyFile(path.join(temporaryDirectory, sourceVideo), destination);
  console.log(`Review walkthrough written to ${destination}`);
} finally {
  await browser.close();
  await stopServer();
  await rm(temporaryDirectory, { recursive: true, force: true });
}
