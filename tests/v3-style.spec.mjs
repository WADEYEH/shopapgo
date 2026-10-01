import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function openStyle(page, hash = "") {
  await page.goto(`/v3-style.html${hash}`);
  await page.locator("html[data-apgo-v3-style-ready='true']").waitFor();
  await page.evaluate(() => document.fonts?.ready);
}

test("V3 style board starts neutral with both application routes in the first view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openStyle(page);

  await expect(page.locator("body")).toHaveAttribute("data-v3-selected", "none");
  await expect(page.locator("[data-v3-hero]")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Professional paint protection, made simple to apply.",
  );
  await expect(page.locator(".hero-product--d204")).toContainText("Dry paint");
  await expect(page.locator(".hero-product--d215")).toContainText("Wet paint");
  await expect(page.locator("[data-v3-hero]")).toContainText("8–10 full-car applications");

  for (const selector of [".hero-product--d204 img", ".hero-product--d215 img"]) {
    const image = page.locator(selector);
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((item) => item.complete && item.naturalWidth > 0))
      .toBe(true);
  }
});

for (const selected of ["d204", "d215"]) {
  test(`V3 ${selected} review state keeps its approved product story visible`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStyle(page, `#${selected}`);

    await expect(page.locator("body")).toHaveAttribute("data-v3-selected", selected);
    const frame = page.locator(`[data-style-frame="${selected}"]`);
    await expect(frame).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(frame.locator(".process-visual > img")).toBeVisible();
    await expect(frame.locator(".product-story-heading > img")).toBeVisible();
    await expect(frame.locator('[role="button"][aria-disabled="true"]')).toHaveCount(1);
    await expect(frame.locator('[role="button"][aria-disabled="true"]')).not.toHaveAttribute(
      "href",
      /.+/,
    );

    if (selected === "d204") {
      await expect(frame).toContainText("180 days");
      await expect(frame).toContainText("30+ washes");
      await expect(frame).toContainText("8–10 full cars");
    } else {
      await expect(frame).toContainText("120 days");
      await expect(frame).toContainText("20+ washes");
      await expect(frame).toContainText("8–10 full cars");
    }

    await page.reload();
    await page.locator("html[data-apgo-v3-style-ready='true']").waitFor();
    await expect(page.locator("body")).toHaveAttribute("data-v3-selected", selected);
  });
}

for (const width of [390, 768, 1440]) {
  test(`V3 style board has no horizontal overflow at ${width}px`, async ({ page }) => {
    const height = width === 390 ? 844 : 900;
    await page.setViewportSize({ width, height });
    await openStyle(page);

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
          className: String(element.className).slice(0, 80),
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right),
        })),
    }));

    expect(result.overflow, JSON.stringify(result.offenders)).toBeLessThanOrEqual(1);
  });
}

test("390px hero keeps both products, promise, and choice action inside the first viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStyle(page);

  const selectors = [
    ".hero-product--d204 img",
    ".hero-product--d215 img",
    ".v3-hero h1",
    ".v3-hero-deck",
    ".v3-hero-actions .button",
  ];

  for (const selector of selectors) {
    const rect = await page.locator(selector).boundingBox();
    expect(rect, `${selector} should have a rendered box`).not.toBeNull();
    expect(rect.y, `${selector} should start inside the viewport`).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.height, `${selector} should end inside the viewport`).toBeLessThanOrEqual(844);
  }
});

test("V3 style review is noindex and has no serious accessibility violations", async ({ page }) => {
  await openStyle(page);
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
