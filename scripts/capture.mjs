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

async function settleLazyMedia(page, returnToTop = true) {
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  let scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);

  for (let top = 0; top < scrollHeight; top += Math.max(480, viewportHeight - 120)) {
    await page.evaluate((scrollTop) => window.scrollTo(0, scrollTop), top);
    await page.waitForTimeout(60);
    scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  }

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(160);
  await page.waitForFunction(() =>
    [...document.images].every((image) => image.complete && image.naturalWidth > 0),
  );
  await page.waitForLoadState("networkidle");

  if (returnToTop) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(120);
  }
}

try {
  {
    const { context, page } = await openPage({ width: 1440, height: 900 });
    await settleLazyMedia(page);
    await page.screenshot({
      path: path.join(outputDirectory, "desktop-1440-full.png"),
      fullPage: true,
      animations: "disabled",
    });
    await context.close();
  }

  {
    const { context, page } = await openPage({ width: 390, height: 844 });
    await settleLazyMedia(page);
    await page.addStyleTag({
      content: ".mobile-purchase { display: none !important; }",
    });
    await page.screenshot({
      path: path.join(outputDirectory, "mobile-390-full.png"),
      fullPage: true,
      animations: "disabled",
    });
    await context.close();
  }

  {
    const { context, page } = await openPage({ width: 390, height: 844 });
    await settleLazyMedia(page, false);
    const d215 = page.locator(
      'input[data-routine-option][value="d215"], input[name="application-routine"][value="d215"]',
    );
    if ((await d215.count()) > 0) await d215.first().check({ force: true });

    const selector = page.locator("#routine-selector").first();
    await selector.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    const selectorState = await page.screenshot({ animations: "disabled" });

    const hero = page.locator("[data-hero], #hero, .hero, #top").first();
    if ((await hero.count()) > 0) {
      await hero.evaluate((element) => {
        window.scrollTo(0, element.offsetTop + element.offsetHeight + 24);
      });
      await page.waitForTimeout(250);
    }
    const stickyState = await page.screenshot({ animations: "disabled" });

    const faq = page
      .locator("details[data-faq-item], [data-faq] details, .faq-list details, #faq details")
      .first();
    if ((await faq.count()) > 0) {
      await faq.evaluate((element) => {
        element.open = true;
      });
      await faq.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
    }
    const faqState = await page.screenshot({ animations: "disabled" });

    const report = await context.newPage();
    const panels = [
      ["D215 selected", selectorState],
      ["Mobile sticky CTA", stickyState],
      ["FAQ opened", faqState],
    ];
    const panelMarkup = panels
      .map(
        ([label, image]) => `
          <section>
            <h2>${label}</h2>
            <img src="data:image/png;base64,${image.toString("base64")}" alt="${label}">
          </section>`,
      )
      .join("");
    await report.setContent(`<!doctype html>
      <html lang="en"><head><meta charset="utf-8"><style>
        * { box-sizing: border-box; }
        html, body { margin: 0; background: #080a0c; color: #fff; font-family: Arial, sans-serif; }
        section { margin: 0; border-bottom: 1px solid #30343a; }
        h2 { margin: 0; padding: 14px 18px; color: #f08417; font-size: 15px; letter-spacing: .08em; text-transform: uppercase; }
        img { display: block; width: 390px; height: auto; }
      </style></head><body>${panelMarkup}</body></html>`);

    await report.screenshot({
      path: path.join(outputDirectory, "interaction-states.png"),
      fullPage: true,
      animations: "disabled",
    });
    await report.close();
    await context.close();
  }

  console.log(`Review captures written to ${outputDirectory}`);
} finally {
  await browser.close();
  await stopServer();
}
