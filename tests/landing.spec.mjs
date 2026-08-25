import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const targetViewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

function routineOption(page, sku) {
  return page
    .locator(
      `input[data-routine-option][value="${sku}"], input[name="application-routine"][value="${sku}"], input[name="routine"][value="${sku}"]`,
    )
    .first();
}

async function selectRoutine(page, sku) {
  await routineOption(page, sku).check({ force: true });
}

async function waitForRuntime(page) {
  await page.locator("html[data-apgo-ready='true']").waitFor();
}

async function enableAmazonLinks(page) {
  await page.evaluate(() => {
    window.APGO_CONFIG.products.d204.amazonUrl =
      "https://www.amazon.com/dp/APGOD204?tag=e2e-d204-20";
    window.APGO_CONFIG.products.d204.linkReady = true;
    window.APGO_CONFIG.products.d215.amazonUrl =
      "https://www.amazon.com/dp/APGOD215?tag=e2e-d215-20";
    window.APGO_CONFIG.products.d215.linkReady = true;
    window.dispatchEvent(new Event("apgo:config-updated"));
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await waitForRuntime(page);
});

for (const viewport of targetViewports) {
  test(`has no horizontal overflow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.reload();
    await waitForRuntime(page);

    const result = await page.evaluate(() => {
      const root = document.documentElement;
      const overflow = root.scrollWidth - root.clientWidth;
      const offenders = [...document.querySelectorAll("body *")]
        .filter((element) => {
          const style = getComputedStyle(element);
          if (style.display === "none" || style.visibility === "hidden") return false;
          const rect = element.getBoundingClientRect();
          return rect.width > 1 && (rect.right > window.innerWidth + 1 || rect.left < -1);
        })
        .slice(0, 10)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            id: element.id,
            className: String(element.className).slice(0, 100),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        });
      return { overflow, offenders };
    });

    expect(
      result.overflow,
      `Horizontal overflow at ${viewport.width}px. Potential offenders: ${JSON.stringify(result.offenders)}`,
    ).toBeLessThanOrEqual(1);
  });
}

test("defaults to D204 and supports a D215 hash deep link", async ({ page }) => {
  await expect(page.locator("body")).toHaveAttribute("data-selected-sku", "d204");
  await expect(routineOption(page, "d204")).toBeChecked();

  await page.goto("/#d215");
  await waitForRuntime(page);
  await expect(page.locator("body")).toHaveAttribute("data-selected-sku", "d215");
  await expect(routineOption(page, "d215")).toBeChecked();
});

test("radio selection updates state, hash, live region, and dynamic CTAs", async ({
  page,
}) => {
  await enableAmazonLinks(page);
  await selectRoutine(page, "d215");

  await expect(page.locator("body")).toHaveAttribute("data-selected-sku", "d215");
  await expect(page).toHaveURL(/#d215$/);
  await expect(page.locator("[data-selection-live]")).toContainText("D215 selected");
  await expect(page.locator('[data-product-card="d204"]')).toHaveAttribute(
    "aria-current",
    "false",
  );
  await expect(page.locator('[data-product-card="d215"]')).toHaveAttribute(
    "aria-current",
    "true",
  );

  const dynamicCtas = page.locator("[data-selected-amazon-cta]");
  await expect(dynamicCtas.first()).toHaveAttribute("data-sku", "d215");
  await expect(dynamicCtas.first()).toHaveAttribute("href", /APGOD215/);
  await expect(dynamicCtas.first().locator("[data-selected-cta-label]")).toHaveText(
    "Buy D215 on Amazon",
  );

  const selectionEvent = await page.evaluate(() =>
    window.dataLayer.find((item) => item.event === "fit_selector_answer"),
  );
  expect(selectionEvent).toMatchObject({
    selected_sku: "d215",
    application_mode: "wet",
  });
});

test("missing or invalid Amazon URLs never become clickable links", async ({ page }) => {
  const unavailable = await page.locator(
    "[data-amazon-cta][data-sku], [data-selected-amazon-cta]",
  ).evaluateAll((elements) =>
    elements.map((element) => ({
      href: element.getAttribute("href"),
      disabled: element.getAttribute("aria-disabled"),
      state: element.dataset.linkState,
    })),
  );
  expect(unavailable.length).toBeGreaterThan(0);
  for (const item of unavailable) {
    expect(item.href).toBeNull();
    expect(item.disabled).toBe("true");
    expect(item.state).toBe("unavailable");
  }

  await page.evaluate(() => {
    window.APGO_CONFIG.products.d204.amazonUrl = "javascript:alert(1)";
    window.APGO_CONFIG.products.d204.linkReady = true;
    window.dispatchEvent(new Event("apgo:config-updated"));
  });
  const d204Links = page.locator('[data-amazon-cta][data-sku="d204"]');
  await expect(d204Links.first()).not.toHaveAttribute("href", /.+/);
  await expect(d204Links.first()).toHaveAttribute("aria-disabled", "true");
});

test("fixed and selected CTAs preserve exact SKU mapping", async ({ page }) => {
  await enableAmazonLinks(page);

  const fixed = await page.locator("[data-amazon-cta][data-sku]").evaluateAll(
    (elements) =>
      elements.map((element) => ({
        sku: element.dataset.sku,
        href: element.getAttribute("href"),
        target: element.getAttribute("target"),
        rel: element.getAttribute("rel"),
      })),
  );
  expect(fixed.length).toBeGreaterThan(0);
  for (const cta of fixed) {
    expect(cta.href).toContain(cta.sku === "d204" ? "APGOD204" : "APGOD215");
    expect(cta.target).toBe("_blank");
    expect(cta.rel).toContain("noopener");
    expect(cta.rel).toContain("sponsored");
  }

  const hero = page.locator('[data-amazon-cta][data-placement="hero"]').first();
  await expect(hero).toHaveAttribute("data-sku", "d204");
  await selectRoutine(page, "d215");
  await expect(hero).toHaveAttribute("href", /APGOD204/);

  const selected = page.locator("[data-selected-amazon-cta]");
  await expect(selected.first()).toHaveAttribute("href", /APGOD215/);
});

test("an enabled referral click emits exactly one mapped analytics event", async ({
  page,
}) => {
  await enableAmazonLinks(page);
  const cta = page.locator('[data-amazon-cta][data-placement="hero"]').first();
  await cta.evaluate((element) => {
    document.addEventListener(
      "click",
      (event) => {
        if (event.target.closest("[data-amazon-cta]")) event.preventDefault();
      },
      { capture: true, once: true },
    );
    element.click();
  });

  const events = await page.evaluate(() =>
    window.dataLayer.filter((item) => item.event === "amazon_referral_click"),
  );
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ sku: "d204" });
  expect(["hero", "selector", "product", "final"]).toContain(events[0].placement);
});

test("mobile sticky follows selection and respects hero/final visibility", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await waitForRuntime(page);
  await enableAmazonLinks(page);
  await selectRoutine(page, "d215");

  const sticky = page.locator("[data-mobile-sticky], [data-mobile-purchase]");
  const hero = page.locator("[data-hero], #hero, .hero, #top").first();
  const finalChoice = page
    .locator("[data-final-cta], #final-choice, .final-choice, #shop")
    .first();
  await expect(sticky).toHaveCount(1);
  await expect(sticky).toHaveAttribute("data-visible", "false");

  await hero.evaluate((element) => {
    window.scrollTo(0, element.offsetTop + element.offsetHeight + 24);
  });
  await expect(sticky).toHaveAttribute("data-visible", "true");
  await expect(sticky.locator("[data-selected-amazon-cta]")).toHaveAttribute(
    "href",
    /APGOD215/,
  );

  await finalChoice.scrollIntoViewIfNeeded();
  await expect(sticky).toHaveAttribute("data-visible", "false");
});

test("video cards do not autoplay or request media on initial load", async ({ page }) => {
  const cards = page.locator("[data-video-card]");
  await expect(cards).toHaveCount(2);

  const videos = await cards.evaluateAll((elements) =>
    elements.map((card) => {
      const video = card.querySelector("video");
      return {
        state: card.dataset.videoState,
        autoplay: video?.autoplay ?? false,
        autoplayAttribute: video?.hasAttribute("autoplay") ?? false,
        src: video?.getAttribute("src") || "",
        sourceCount: video?.querySelectorAll("source[src]").length || 0,
      };
    }),
  );
  for (const video of videos) {
    expect(video.state).toBe("ready");
    expect(video.autoplay).toBe(false);
    expect(video.autoplayAttribute).toBe(false);
    expect(video.src).toBe("");
    expect(video.sourceCount).toBe(0);
  }
});

test("ready videos hydrate only after click and a new play pauses the other", async ({
  page,
}) => {
  await page.route("**/e2e-*.mp4", (route) => route.abort());
  await page.evaluate(() => {
    window.APGO_CONFIG.products.d204.videoReady = true;
    window.APGO_CONFIG.products.d215.videoReady = true;
    document.querySelector('[data-video-card="d204"]').dataset.videoSrc =
      "/e2e-d204.mp4";
    document.querySelector('[data-video-card="d215"]').dataset.videoSrc =
      "/e2e-d215.mp4";
    window.dispatchEvent(new Event("apgo:config-updated"));
  });

  const d204Trigger = page.locator(
    '[data-video-card="d204"] [data-video-trigger]',
  );
  const d215Trigger = page.locator(
    '[data-video-card="d215"] [data-video-trigger]',
  );
  await expect(d204Trigger).toBeEnabled();
  await expect(d215Trigger).toBeEnabled();

  await d204Trigger.click();
  await d215Trigger.click();
  await expect(page.locator('[data-video-card="d204"] video')).toHaveCount(1);
  await expect(page.locator('[data-video-card="d215"] video')).toHaveCount(1);
  await expect(
    page.locator('[data-video-card="d204"] track[kind="captions"]'),
  ).toHaveAttribute("srclang", "en");
  await expect(
    page.locator('[data-video-card="d215"] track[kind="captions"]'),
  ).toHaveAttribute("label", "English");

  const pauseObserved = await page.evaluate(() => {
    const first = document.querySelector('[data-video-card="d204"] video');
    const second = document.querySelector('[data-video-card="d215"] video');
    let pausedByCoordinator = false;
    Object.defineProperty(first, "paused", {
      configurable: true,
      get: () => false,
    });
    first.pause = () => {
      pausedByCoordinator = true;
    };
    second.dispatchEvent(new Event("play"));
    return pausedByCoordinator;
  });
  expect(pauseObserved).toBe(true);
});

test("FAQ remains usable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  const item = page
    .locator("details[data-faq-item], [data-faq] details, .faq-list details, #faq details")
    .first();
  await expect(item).toBeVisible();
  await item.locator("summary").click();
  await expect(item).toHaveAttribute("open", "");
  await context.close();
});

test("FAQ analytics, support email, current year, and mobile menu hooks integrate", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.APGO_CONFIG.supportEmail = "support@example.com";
    window.dispatchEvent(new Event("apgo:config-updated"));
  });

  const supportFields = page.locator("[data-support-email]");
  expect(await supportFields.count()).toBeGreaterThan(0);
  for (let index = 0; index < (await supportFields.count()); index += 1) {
    await expect(supportFields.nth(index)).toHaveText("support@example.com");
    await expect(supportFields.nth(index)).not.toHaveAttribute("hidden", "");
  }
  await expect(page.locator("[data-support-answer] a")).toHaveAttribute(
    "href",
    "mailto:support@example.com",
  );
  await expect(page.locator("[data-current-year]")).toHaveText(
    String(new Date().getFullYear()),
  );

  const faq = page
    .locator("details[data-faq-item], [data-faq] details, .faq-list details, #faq details")
    .first();
  await faq.locator("summary").click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.dataLayer.filter((item) => item.event === "faq_expand").length,
      ),
    )
    .toBe(1);

  await page.setViewportSize({ width: 390, height: 844 });
  const toggle = page.locator("[data-menu-toggle], [data-nav-toggle]").first();
  const menu = page.locator("[data-mobile-menu], [data-site-nav]").first();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toHaveClass(/is-open/);
  await expect(menu).toHaveAttribute("data-open", "true");
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toHaveAttribute("data-open", "false");
});

test("rendered page excludes local-market UI and unverified claims", async ({ page }) => {
  const text = (await page.locator("body").innerText()).toLowerCase();
  const prohibited = [
    /\bmyr\b/i,
    /\btwd\b/i,
    /malaysia shipping/i,
    /\badd to cart\b/i,
    /\bshopify cart\b/i,
    /\bprime\b/i,
    /\bgraphene\b/i,
    /\bsio2\b/i,
    /\bceramic\b/i,
    /\b9h\b/i,
    /\b10h\b/i,
    /\bstronger\b/i,
    /\bfaster\b/i,
    /\beasier\b/i,
    /\bflagship\b/i,
    /\bmore durable\b/i,
    /\b110\s*(?:°|degrees?)/i,
    /\b(?:120|180)\s*days?\b/i,
  ];
  for (const pattern of prohibited) {
    expect(text, `Rendered page contains prohibited text: ${pattern}`).not.toMatch(
      pattern,
    );
  }
});

test("images have dimensions, alt attributes, and loading policy", async ({ page }) => {
  const images = await page.locator("img").evaluateAll((elements) =>
    elements.map((image) => ({
      alt: image.getAttribute("alt"),
      width: image.getAttribute("width"),
      height: image.getAttribute("height"),
      loading: image.getAttribute("loading"),
      inHero: Boolean(image.closest("[data-hero], #hero, .hero, #top")),
      aboveFoldBrand: Boolean(image.closest(".site-header")),
    })),
  );
  expect(images.length).toBeGreaterThan(0);
  for (const image of images) {
    expect(image.alt).not.toBeNull();
    expect(Number(image.width)).toBeGreaterThan(0);
    expect(Number(image.height)).toBeGreaterThan(0);
    if (!image.inHero && !image.aboveFoldBrand) expect(image.loading).toBe("lazy");
  }
});

test("preview is noindex and has no serious or critical axe violations", async ({
  page,
}) => {
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex,nofollow",
  );

  const results = await new AxeBuilder({ page }).analyze();
  const blockers = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact),
  );
  expect(
    blockers,
    blockers
      .map((item) => `${item.id}: ${item.help} (${item.nodes.length} nodes)`)
      .join("\n"),
  ).toEqual([]);
});
