import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function openV3(page, path = "/v3.html") {
  await page.goto(path);
  await page.locator("html[data-apgo-v3-ready='true']").waitFor();
  await page.evaluate(() => document.fonts?.ready);
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

test("V3 starts neutral and exposes the complete six-section story", async ({ page }) => {
  await openV3(page);

  await expect(page.locator("body")).toHaveAttribute("data-v3-selected", "none");
  await expect(page.locator('[data-selector-radio][value="d204"]')).not.toBeChecked();
  await expect(page.locator('[data-selector-radio][value="d215"]')).not.toBeChecked();
  await expect(page.locator("[data-product-empty]")).toBeVisible();
  await expect(page.locator("[data-product-panel]:visible")).toHaveCount(0);
  await expect(page.locator('[data-final-state="none"]')).toBeVisible();
  await expect(page.locator("[data-mobile-sticky]")).toHaveAttribute("data-visible", "false");

  await expect(page.locator(".v3-nav a")).toHaveText(["How It Works", "Choose", "Why APGO"]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Professional paint protection, made simple to apply.",
  );
  await expect(page.locator(".v3-hero")).toContainText("8–10 full-car applications");
  await expect(page.locator(".selector-option--d204")).toContainText("After drying.");
  await expect(page.locator(".selector-option--d215")).toContainText("While still wet.");
  expect(await page.locator(".selector-card").first().evaluate((card) => card.clientHeight))
    .toBeLessThanOrEqual(556);
  await expect
    .poll(() =>
      page.locator(".selector-card__body > img").first().evaluate((image) => image.clientHeight),
    )
    .toBeLessThan(400);
  await expect(page.locator("#why")).toContainText("precision-manufacturing discipline");
  await expect(page.locator("[data-faq-item]")).toHaveCount(4);
  await expect(page.locator("#shop")).toBeAttached();
});

for (const width of [390, 768, 1440]) {
  test(`V3 has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await openV3(page);

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

test("390px hero keeps both bottles, promise, and choice action inside the first viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openV3(page);

  for (const selector of [
    ".hero-product--d204 img",
    ".hero-product--d215 img",
    ".v3-hero h1",
    ".v3-hero-deck",
    ".v3-hero-actions .button",
  ]) {
    const box = await page.locator(selector).boundingBox();
    expect(box, `${selector} should have a rendered box`).not.toBeNull();
    expect(box.y, `${selector} should start inside the viewport`).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, `${selector} should end inside the viewport`).toBeLessThanOrEqual(844);
  }
});

test("selector, alternate route, ordinary anchors, final handoff, and reset stay synchronized", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openV3(page);
  await page.locator('[data-selector-radio][value="d204"]').check({ force: true });

  await expect(page.locator("body")).toHaveAttribute("data-v3-selected", "d204");
  await expect(page).toHaveURL(/#d204$/);
  await expect(page.locator('[data-product-panel="d204"]')).toBeVisible();
  await expect(page.locator('[data-product-panel="d215"]')).toBeHidden();
  await expect(page.locator('[data-final-state="d204"]')).toBeVisible();
  await expect(page.locator('[data-final-state="d215"]')).toBeHidden();

  const firstSelection = await page.evaluate(() =>
    window.dataLayer.find((item) => item.event === "fit_selector_answer"),
  );
  expect(firstSelection).toMatchObject({
    selected_sku: "d204",
    previous_sku: "none",
    selection_source: "selector_card",
    application_mode: "dry",
  });

  await page.locator('[data-product-panel="d204"] [data-selector-switch]').click();
  await expect(page.locator("body")).toHaveAttribute("data-v3-selected", "d215");
  await expect(page).toHaveURL(/#d215$/);

  await page.locator('.v3-nav a[href="#why"]').click();
  await expect(page).toHaveURL(/#why$/);
  await expect(page.locator("body")).toHaveAttribute("data-v3-selected", "d215");

  await page.locator('[data-final-state="d215"] [data-routine-reset]').click();
  await expect(page.locator("body")).toHaveAttribute("data-v3-selected", "none");
  await expect(page).not.toHaveURL(/#d204|#d215/);
  await expect(page.locator("#choose-title")).toBeFocused();
  await expect(page.locator("[data-product-empty]")).toBeVisible();
});

test("product hash deep links select without pretending the visitor answered", async ({ page }) => {
  await openV3(page, "/v3.html#d215");

  await expect(page.locator("body")).toHaveAttribute("data-v3-selected", "d215");
  await expect(page.locator('[data-selector-radio][value="d215"]')).toBeChecked();
  await expect(page.locator('[data-product-panel="d215"]')).toBeVisible();
  const events = await page.evaluate(() => window.dataLayer);
  expect(events.some((item) => item.event === "fit_selector_answer")).toBe(false);
  expect(events.find((item) => item.event === "us_referral_landing_view")).toMatchObject({
    selected_sku: "d215",
    selection_source: "hash",
  });

  await page.evaluate(() => {
    window.location.hash = "";
  });
  await expect(page.locator("body")).toHaveAttribute("data-v3-selected", "none");
});

test("ordinary deep links remain neutral and do not become product choices", async ({ page }) => {
  await openV3(page, "/v3.html#faq");
  await expect(page.locator("body")).toHaveAttribute("data-v3-selected", "none");
  await expect(page.locator("[data-product-empty]")).toBeVisible();
  await expect(page.locator('[data-selector-radio][value="d204"]')).not.toBeChecked();
  await expect(page.locator('[data-selector-radio][value="d215"]')).not.toBeChecked();
});

test("Amazon links fail closed, enforce SKU mapping, and report selected, sticky, and final", async ({
  page,
}) => {
  await openV3(page);
  await expect(page.locator("[data-amazon-cta]").first()).not.toHaveAttribute("href", /.+/);
  await expect(page.locator("[data-amazon-cta]").first()).toHaveAttribute("aria-disabled", "true");

  await page.evaluate(() => {
    window.APGO_CONFIG.products.d204.amazonUrl = "https://www.amazon.com/dp/B0D204TEST";
    window.APGO_CONFIG.products.d204.linkReady = true;
    delete window.APGO_CONFIG.products.d204.expectedAsin;
    window.dispatchEvent(new Event("apgo:config-updated"));
  });
  await expect(page.locator('[data-amazon-cta][data-sku="d204"]').first()).not.toHaveAttribute(
    "href",
    /.+/,
  );

  await enableLinks(page);
  for (const placement of ["selected", "sticky", "final"]) {
    await expect(
      page.locator(`[data-amazon-cta][data-sku="d204"][data-placement="${placement}"]`),
    ).toHaveAttribute("href", /B0D204TEST\?tag=apgo-d204-20/);
    await expect(
      page.locator(`[data-amazon-cta][data-sku="d215"][data-placement="${placement}"]`),
    ).toHaveAttribute("href", /B0D215TEST\?tag=apgo-d215-20/);
  }

  await page.locator('[data-selector-radio][value="d204"]').check({ force: true });
  await page.evaluate(() => {
    const link = document.querySelector(
      '[data-amazon-cta][data-sku="d204"][data-placement="selected"]',
    );
    link.addEventListener("click", (event) => event.preventDefault(), { once: true });
    link.click();
  });
  const clickEvent = await page.evaluate(() =>
    window.dataLayer.find((item) => item.event === "amazon_referral_click"),
  );
  expect(clickEvent).toMatchObject({ sku: "d204", placement: "selected" });

  await page.evaluate(() => {
    window.APGO_CONFIG.products.d204.amazonUrl =
      "https://www.amazon.com/dp/B0D215TEST?tag=wrong-product";
    window.dispatchEvent(new Event("apgo:config-updated"));
  });
  await expect(page.locator('[data-amazon-cta][data-sku="d204"]').first()).not.toHaveAttribute(
    "href",
    /.+/,
  );
});

test("mobile sticky appears only after selection and stays out of the final handoff", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openV3(page);
  await enableLinks(page);
  const sticky = page.locator("[data-mobile-sticky]");

  await expect(sticky).toHaveAttribute("data-visible", "false");
  await expect(sticky).toHaveAttribute("aria-hidden", "true");
  await expect(sticky).toHaveAttribute("inert", "");
  await page.locator('[data-selector-radio][value="d215"]').check({ force: true });
  await expect.poll(() => sticky.getAttribute("data-visible")).toBe("true");
  await expect(sticky).toHaveAttribute("aria-hidden", "false");
  await expect(sticky).not.toHaveAttribute("inert", "");
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => sticky.getAttribute("data-visible")).toBe("false");

  await page.locator("#why").scrollIntoViewIfNeeded();
  await expect.poll(() => sticky.getAttribute("data-visible")).toBe("true");
  await expect(sticky.locator('[data-sticky-state="d215"]')).toBeVisible();
  await expect(sticky.locator('[data-amazon-cta][data-sku="d215"]')).toHaveAttribute(
    "href",
    /B0D215TEST/,
  );

  await page.locator("[data-final-handoff]").scrollIntoViewIfNeeded();
  await expect.poll(() => sticky.getAttribute("data-visible")).toBe("false");
  await page.locator(".v3-footer").scrollIntoViewIfNeeded();
  await expect.poll(() => sticky.getAttribute("data-visible")).toBe("false");
});

test("preview video loads only for a selected in-view product and pauses offscreen", async ({ page }) => {
  await openV3(page, "/v3.html#d204");
  const card = page.locator('[data-product-panel="d204"] [data-video-card]');
  const video = card.locator("video");
  const previewToggle = card.locator("[data-preview-toggle]");

  await expect(video).not.toHaveAttribute("src", /.+/);
  await expect(previewToggle).toBeHidden();
  await card.scrollIntoViewIfNeeded();
  await expect(video).toHaveAttribute("src", /d204-loop\.mp4/);
  await expect.poll(() => video.evaluate((item) => item.muted && item.loop)).toBe(true);
  await expect.poll(() => card.getAttribute("data-video-state")).toBe("playing");
  await expect(previewToggle).toBeVisible();
  await previewToggle.click();
  await expect(card).toHaveAttribute("data-video-state", "paused");

  await page.locator("#why").scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((item) => item.paused)).toBe(true);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toHaveAttribute("data-video-state", "paused");
  await expect(previewToggle).toBeVisible();
});

test("reduced-motion mode keeps the real poster and never hydrates preview video", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openV3(page, "/v3.html#d215");
  const card = page.locator('[data-product-panel="d215"] [data-video-card]');
  const video = card.locator("video");
  await card.scrollIntoViewIfNeeded();

  await expect(card).toHaveAttribute("data-video-state", "reduced");
  await expect(video).not.toHaveAttribute("src", /.+/);
  await expect(video).toHaveAttribute("poster", /d215-v3-poster\.jpg/);
});

test("full process uses native controls and captions, then tracks an actual play", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openV3(page, "/v3.html#d204");
  const card = page.locator('[data-product-panel="d204"] [data-video-card]');
  const video = card.locator("video");
  await card.scrollIntoViewIfNeeded();
  await card.locator("[data-video-trigger]").click();

  await expect(card).toHaveAttribute("data-video-mode", "full");
  await expect(video).toHaveAttribute("src", /d204-application\.mp4/);
  await expect.poll(() => video.evaluate((item) => item.controls)).toBe(true);
  await expect(card.locator("[data-caption-track]")).toHaveAttribute(
    "src",
    /d204-v3-captions-en\.vtt/,
  );
  await expect.poll(() =>
    page.evaluate(() => window.dataLayer.filter((item) => item.event === "video_start").length),
  ).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(() => window.dataLayer.find((item) => item.event === "video_start")),
    )
    .toMatchObject({ sku: "d204", placement: "process" });

  await page.evaluate(() => {
    window.APGO_CONFIG.products.d204.videoReady = false;
    window.dispatchEvent(new Event("apgo:config-updated"));
  });
  await expect(card).toHaveAttribute("data-video-state", "unavailable");
  await expect(card).toHaveAttribute("data-video-mode", "preview");
  await expect(video).not.toHaveAttribute("src", /.+/);
  await expect(video).not.toHaveAttribute("controls", "");
});

test("FAQ retains native disclosure behavior and emits its stable question id", async ({ page }) => {
  await openV3(page);
  const item = page.locator('[data-faq-item][data-question-id="surface-preparation"]');
  await item.locator("summary").click();
  await expect(item).toHaveAttribute("open", "");
  await expect
    .poll(() =>
      page.evaluate(() => window.dataLayer.find((entry) => entry.event === "faq_expand")),
    )
    .toMatchObject({ question_id: "surface-preparation", selected_sku: "none" });
});

test("keyboard choice works and V3 has no serious or critical accessibility violations", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openV3(page);
  const radio = page.locator('[data-selector-radio][value="d204"]');
  await radio.focus();
  await radio.press("Space");
  await expect(radio).toBeChecked();
  await expect(page.locator("body")).toHaveAttribute("data-v3-selected", "d204");
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
