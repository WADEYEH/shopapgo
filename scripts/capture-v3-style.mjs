import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { BASE_URL, ensurePrototypeServer } from "./server-utils.mjs";

const outputDirectory = path.resolve("review");
await mkdir(outputDirectory, { recursive: true });

const stopServer = await ensurePrototypeServer();
const browser = await chromium.launch({ headless: true });

async function captureFrame({ viewport, hash = "", filename }) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/v3-style.html${hash}`, { waitUntil: "networkidle" });
  await page.locator("html[data-apgo-v3-style-ready='true']").waitFor();
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForFunction(() =>
    [...document.images].every(
      (item) => item.getClientRects().length === 0 || (item.complete && item.naturalWidth > 0),
    ),
  );
  await page.screenshot({
    path: path.join(outputDirectory, filename),
    animations: "disabled",
  });
  await context.close();
}

try {
  await captureFrame({
    viewport: { width: 1440, height: 900 },
    filename: "v3-style-desktop-hero-1440.png",
  });
  await captureFrame({
    viewport: { width: 390, height: 844 },
    filename: "v3-style-mobile-hero-390.png",
  });
  await captureFrame({
    viewport: { width: 1440, height: 900 },
    hash: "#d204",
    filename: "v3-style-d204-desktop-1440.png",
  });
  await captureFrame({
    viewport: { width: 1440, height: 900 },
    hash: "#d215",
    filename: "v3-style-d215-desktop-1440.png",
  });

  console.log(`V3 style review captures written to ${outputDirectory}`);
} finally {
  await browser.close();
  await stopServer();
}
