import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const viewports = [320, 390, 768, 1024, 1440];

async function openV2(page, path = "/v2.html") {
  await page.goto(path);
  await page.locator("html[data-apgo-v2-ready='true']").waitFor();
}

async function enableLinks(page) {
  await page.evaluate(() => {
    window.APGO_CONFIG.products.d204.amazonUrl =
      "https://www.amazon.com/dp/B0D204TEST?tag=apgo-d204-20";
    window.APGO_CONFIG.products.d204.expectedAsin = "B0D204TEST";
    window.APGO_CONFIG.products.d204.linkReady = true;
    window.APGO_CONFIG.products.d215.amazonUrl =
      "https://www.amazon.com/gp/product/B0D215TEST?tag=apgo-d215-20";
    window.APGO_CONFIG.products.d215.expectedAsin = "B0D215TEST";
    window.APGO_CONFIG.products.d215.linkReady = true;
    window.dispatchEvent(new Event("apgo:config-updated"));
  });
}

test("V2 starts neutral and exposes the complete conversion story", async ({ page }) => {
  await openV2(page);
  await expect(page.locator("body")).toHaveAttribute("data-v2-selected", "none");
  await expect(page.locator('[data-product-radio][value="d204"]')).not.toBeChecked();
  await expect(page.locator('[data-product-radio][value="d215"]')).not.toBeChecked();
  await expect(page.locator("[data-process-empty]")).toBeVisible();
  await expect(page.locator('[data-final-state="none"]')).toBeVisible();
  await expect(page.locator("body")).toContainText("180 days");
  await expect(page.locator("body")).toContainText("110°");
  await expect(page.locator("body")).toContainText("30+ washes");
  await expect(page.locator("body")).toContainText("6–8 vehicles");
  await expect(page.locator("body")).toContainText("120 days");
  await expect(page.locator("body")).toContainText("20 washes");
  await expect(page.locator("body")).toContainText("Water-based");
  await expect(page.locator("body")).toContainText("pH neutral");
});

for (const width of viewports) {
  test(`V2 has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
    await openV2(page);
    const result = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      offenders: [...document.querySelectorAll("body *")]
        .filter((element) => {
          const style = getComputedStyle(element);
          if (style.display === "none" || style.visibility === "hidden") return false;
          const rect = element.getBoundingClientRect();
          return rect.width > 1 && (rect.right > innerWidth + 1 || rect.left < -1);
        })
        .slice(0, 8)
        .map((element) => ({
          tag: element.tagName,
          className: String(element.className).slice(0, 90),
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right),
        })),
    }));
    expect(result.overflow, JSON.stringify(result.offenders)).toBeLessThanOrEqual(1);
  });
}

test("hash, product selection, process, final handoff, and reset stay synchronized", async ({ page }) => {
  await openV2(page, "/v2.html#d215");
  await expect(page.locator("body")).toHaveAttribute("data-v2-selected", "d215");
  await expect(page.locator('[data-product-radio][value="d215"]')).toBeChecked();
  await expect(page.locator('[data-process-panel="d215"]')).toBeVisible();
  await expect(page.locator('[data-process-panel="d204"]')).toBeHidden();
  await expect(page.locator('[data-final-state="d215"]')).toBeVisible();
  await expect(page.locator('[data-final-state="d204"]')).toBeHidden();

  await page.locator('[data-routine-reset][data-placement="final"]').last().click();
  await expect(page.locator("body")).toHaveAttribute("data-v2-selected", "none");
  await expect(page).not.toHaveURL(/#d204|#d215/);
  await expect(page.locator('[data-product-radio][value="d204"]')).not.toBeChecked();
  await expect(page.locator('[data-product-radio][value="d215"]')).not.toBeChecked();
  await expect(page.locator("[data-process-empty]")).toBeVisible();
  await expect(page.locator('[data-final-state="none"]')).toBeVisible();
});

test("process covers select a product without automatically loading video", async ({ page }) => {
  await openV2(page);
  await page.locator('[data-process-choice][data-sku="d204"]').click();
  await expect(page.locator("body")).toHaveAttribute("data-v2-selected", "d204");
  await expect(page.locator('[data-process-panel="d204"]')).toBeVisible();
  const video = page.locator('[data-process-panel="d204"] video');
  await expect(video).not.toHaveAttribute("src", /.+/);
  const event = await page.evaluate(() =>
    window.dataLayer.find((item) => item.event === "fit_selector_answer"),
  );
  expect(event).toMatchObject({ selected_sku: "d204", selection_source: "process_tab" });
});

test("Amazon links fail closed, validate ASIN mapping, and keep placement fixed", async ({ page }) => {
  await openV2(page);
  const all = page.locator("[data-amazon-cta]");
  await expect(all.first()).not.toHaveAttribute("href", /.+/);
  await expect(all.first()).toHaveAttribute("aria-disabled", "true");

  await enableLinks(page);
  for (const placement of ["choice", "sticky", "final"]) {
    await expect(
      page.locator(`[data-amazon-cta][data-sku="d204"][data-placement="${placement}"]`),
    ).toHaveAttribute("href", /B0D204TEST\?tag=apgo-d204-20/);
    await expect(
      page.locator(`[data-amazon-cta][data-sku="d215"][data-placement="${placement}"]`),
    ).toHaveAttribute("href", /B0D215TEST\?tag=apgo-d215-20/);
  }

  await page.evaluate(() => {
    window.APGO_CONFIG.products.d204.amazonUrl =
      "https://www.amazon.com/dp/B0D215TEST?tag=wrong-20";
    window.dispatchEvent(new Event("apgo:config-updated"));
  });
  await expect(page.locator('[data-amazon-cta][data-sku="d204"]').first()).not.toHaveAttribute(
    "href",
    /.+/,
  );
});

test("mobile sticky appears only for a selected, ready product between hero and final", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openV2(page);
  await enableLinks(page);
  await page.locator('[data-product-radio][value="d215"]').check({ force: true });
  const sticky = page.locator("[data-mobile-sticky]");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => sticky.getAttribute("data-visible")).toBe("false");

  await page.locator("#benefits").scrollIntoViewIfNeeded();
  await expect.poll(() => sticky.getAttribute("data-visible")).toBe("true");
  await expect(sticky.locator('[data-sticky-state="d215"]')).toBeVisible();
  await expect(sticky.locator('[data-amazon-cta][data-sku="d215"]')).toHaveAttribute(
    "href",
    /B0D215TEST/,
  );

  await page.locator("[data-final-handoff]").scrollIntoViewIfNeeded();
  await expect.poll(() => sticky.getAttribute("data-visible")).toBe("false");
});

test("videos are lazy and only hydrate after an explicit play action", async ({ page }) => {
  await page.route("**/d204-application.mp4", (route) => route.abort());
  await openV2(page, "/v2.html#d204");
  const card = page.locator('[data-process-panel="d204"] [data-video-card]');
  const video = card.locator("video");
  await expect(card).toHaveAttribute("data-video-state", "ready");
  await expect(video).not.toHaveAttribute("src", /.+/);
  await card.locator("[data-video-trigger]").click();
  await expect(video).toHaveAttribute("src", /d204-application\.mp4/);
  await expect.poll(() =>
    page.evaluate(() => window.dataLayer.filter((item) => item.event === "video_start").length),
  ).toBe(1);
});

test("V2 remains noindex and has no serious or critical accessibility violations", async ({ page }) => {
  await openV2(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
  const results = await new AxeBuilder({ page }).analyze();
  const blockers = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact),
  );
  expect(
    blockers,
    blockers.map((item) => `${item.id}: ${item.help} (${item.nodes.length})`).join("\n"),
  ).toEqual([]);
});
