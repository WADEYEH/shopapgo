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
  await page.goto(`${BASE_URL}/v3.html${hash}`, { waitUntil: "networkidle" });
  await page.locator("html[data-apgo-v3-ready='true']").waitFor();
  await page.evaluate(() => document.fonts?.ready);
  return { context, page };
}

async function loadVisibleImages(page) {
  await page.waitForFunction(() =>
    [...document.images].every(
      (image) => image.getClientRects().length === 0 || (image.complete && image.naturalWidth > 0),
    ),
  );
}

async function loadAllImages(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let top = 0; top < height; top += 720) {
    await page.evaluate((value) => window.scrollTo(0, value), top);
    await page.waitForTimeout(30);
  }
  await loadVisibleImages(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
}

async function screenshotElement(page, selector, filename) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  await loadVisibleImages(page);
  await page.locator(selector).screenshot({
    path: path.join(outputDirectory, filename),
    animations: "disabled",
  });
}

try {
  {
    const { context, page } = await openPage({ width: 1440, height: 900 });
    await loadAllImages(page);
    await page.screenshot({
      path: path.join(outputDirectory, "v3-desktop-full-neutral.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(outputDirectory, "v3-desktop-hero-1440.png"),
      animations: "disabled",
    });
    await page.addStyleTag({
      content: ".v3-header,.skip-link,.mobile-sticky{display:none!important}",
    });
    await screenshotElement(page, "#choose", "v3-selector-neutral-desktop.png");
    await context.close();
  }

  for (const sku of ["d204", "d215"]) {
    const { context, page } = await openPage({ width: 1440, height: 900 }, `#${sku}`);
    await page.addStyleTag({ content: ".v3-header,.skip-link{display:none!important}" });
    await screenshotElement(
      page,
      `[data-product-panel="${sku}"]`,
      `v3-${sku}-selected-desktop.png`,
    );
    await context.close();
  }

  {
    const { context, page } = await openPage({ width: 390, height: 844 });
    await loadAllImages(page);
    await page.screenshot({
      path: path.join(outputDirectory, "v3-mobile-full-neutral.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: path.join(outputDirectory, "v3-mobile-hero-390.png"),
      animations: "disabled",
    });
    await page.addStyleTag({
      content: ".v3-header,.skip-link,.mobile-sticky{display:none!important}",
    });
    await screenshotElement(page, "#choose", "v3-selector-neutral-mobile.png");
    await context.close();
  }

  for (const sku of ["d204", "d215"]) {
    const { context, page } = await openPage({ width: 390, height: 844 }, `#${sku}`);
    await page.addStyleTag({ content: ".v3-header,.skip-link{display:none!important}" });
    const hideSticky = await page.addStyleTag({
      content: ".mobile-sticky{display:none!important}",
    });
    await screenshotElement(
      page,
      `[data-product-panel="${sku}"]`,
      `v3-${sku}-selected-mobile.png`,
    );

    if (sku === "d204") {
      await hideSticky.evaluate((style) => style.remove());
      await page.locator("#why").scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
      await page.screenshot({
        path: path.join(outputDirectory, "v3-d204-mobile-sticky.png"),
        animations: "disabled",
      });
    }

    await context.close();
  }

  console.log(`V3 interactive review captures written to ${outputDirectory}`);
} finally {
  await browser.close();
  await stopServer();
}
