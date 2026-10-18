// Back office v1 (PR 3-8, M9, D49, D50): the frame, the dashboard, the order list and one order, the language switch,
// with /admin/api stubbed (tests/helpers/admin-mock.mjs). English unless a test asks for Chinese.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { mockAdminApi } from "./helpers/admin-mock.mjs";

const PAID = "APGO-US-0123456789AB";
const PENDING = "APGO-US-7K3M9Q2W4XZ8";
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const width of [360, 390, 1440]) {
  test(`payment failure history escapes provider text and fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockAdminApi(page, { paymentFailures: { [PENDING]: [{
      attemptId: "att_failure_sample", event: "payment_attempt.authorization_failed", code: "authorization_failed",
      providerCode: "issuer_declined", message: '<img src=x onerror="window.__unsafe=true">' + " Reason".repeat(50),
      traceId: "trace_" + "a".repeat(110), occurredAt: "2026-10-02T01:00:00Z",
    }] } });
    await page.goto(`/admin/index.html#${PENDING}`);
    const failures = page.locator("[data-payment-failures]");
    await expect(failures).toContainText("issuer_declined");
    await expect(failures).toContainText('<img src=x onerror="window.__unsafe=true">');
    await expect(failures.locator("img")).toHaveCount(0);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
}

test("the dashboard: four numbers, what needs someone, shipping, latest orders, connections and products; noindex", async ({ page }) => {
  await mockAdminApi(page, { team: { site: "staging" }, orderCore: { [PAID]: { stage: "review" } } });
  await page.goto("/admin/index.html");
  await expect(page).toHaveTitle("Dashboard · APGO back office");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
  await expect(page.locator('[data-nav="dashboard"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator("[data-admin-env]").last()).toBeVisible();
  await expect(page.locator('[data-kpi="today"]')).toContainText("$128.97");
  await expect(page.locator('[data-kpi="today"]')).toContainText("1 order");
  await expect(page.locator('[data-kpi="month"]')).toContainText("$188.96");
  await expect(page.locator('[data-kpi="average"]')).toContainText("$94.48");
  await expect(page.locator('[data-kpi="refunded"]')).toContainText("$0.00");
  await expect(page.locator('[data-pipeline="waiting"]')).toContainText("1");
  await expect(page.locator('[data-dashboard-latest] a[href="#/orders/APGO-US-0123456789AB"]')).toBeVisible();
  await expect(page.locator('[data-health="paypal"]')).toContainText("PAYPAL_WEBHOOK_ID");
  await expect(page.locator("[data-dashboard-products]")).toContainText("Atomic Colored Glaze");
  await expect(page.locator("[data-dashboard-attention]")).toContainText("All clear:");
  await page.locator("[data-dashboard-search] input").fill("portland");
  await page.locator("[data-dashboard-search] input").press("Enter");
  await expect(page).toHaveURL(/#\/orders\?q=portland$/);
  await expect(page.locator("[data-order]")).toHaveCount(1);
});

test("the order list: views with counts, the payment and shipping columns, and an order opens on its own page", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("/admin/index.html#/orders");
  await expect(page).toHaveTitle("Orders · APGO back office");
  await expect(page.locator("[data-order]")).toHaveCount(3);
  await expect(page.locator('[data-view="all"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-view="to_ship"]')).toContainText("To ship1");
  await expect(page.locator('[data-view="cancelled"]')).toContainText("Cancelled1");
  const row = page.locator(`[data-order="${PAID}"]`);
  await expect(row.locator('[data-payment="paid"]')).toHaveText("Paid");
  await expect(row.locator('[data-shipping="waiting"]')).toHaveText("Going to Amazon");
  await expect(row).toContainText("Austin, TX");
  await expect(row).toContainText("D204 ×1, D215 ×2");
  await expect(page.locator("[data-order-stats]")).toContainText("To ship");

  await row.getByRole("link", { name: PAID }).click();
  await expect(page).toHaveURL(new RegExp(`#/orders/${PAID}$`));
  const detail = page.locator("[data-admin-detail-body]");
  await expect(detail.locator("h1")).toHaveText(PAID);
  await expect(detail.locator('[data-payment="paid"]')).toBeVisible();
  for (const text of ["Ada Lee", "100 Example Ave", "Apt 4", "Austin, TX 78701", "APGO Atomic Glaze Coating", "D204 · 300 mL · 10.1 fl oz", "$59.99 × 1", "int_demo_1", "skipped (none: skipped)"]) {
    await expect(detail).toContainText(text);
  }
  await expect(detail.locator(".price-row--total")).toContainText("$128.97");
  await expect(detail.locator('a[href^="mailto:"]')).toHaveText("ada.lee@example.com");
  await page.getByRole("link", { name: "Orders" }).first().click();
  await expect(page).toHaveURL(/#\/orders$/);
});

test("views and search ask the Worker, and the old #<order> links still open the order", async ({ page }) => {
  const requests = await mockAdminApi(page);
  await page.goto(`/admin/index.html#${PENDING}`);
  await expect(page).toHaveURL(new RegExp(`#/orders/${PENDING}$`));
  await expect(page.locator("[data-admin-detail-body] h1")).toHaveText(PENDING);
  await expect(page.locator("[data-admin-detail-body]")).toContainText("Awaiting payment");

  await page.goto("/admin/index.html#/orders");
  await page.locator('[data-view="cancelled"]').click();
  await expect(page).toHaveURL(/#\/orders\?view=cancelled$/);
  await expect(page.locator("[data-order]")).toHaveCount(1);
  await expect(page.locator("[data-view-hint]")).toHaveText("Cancelled orders and their refunds.");
  expect(requests.some((r) => r.includes("view=cancelled"))).toBe(true);

  await page.locator('[data-view="all"]').click();
  // The list is redrawn when the Worker answers: search only once the "all" view is on the page.
  await expect(page.locator('[data-view="all"]')).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("searchbox", { name: "Search orders" }).fill("portland");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator("[data-order]")).toHaveCount(1);
  await expect(page.locator("[data-order]")).toContainText("Sam Ortiz");
  expect(requests.some((r) => r.includes("q=portland"))).toBe(true);

  await page.getByRole("searchbox", { name: "Search orders" }).fill("zzz-none");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".table-empty")).toHaveText("No orders match.");
});

test("shows a clear notice when the back office is not configured", async ({ page }) => {
  await mockAdminApi(page, { status: 503 });
  await page.goto("/admin/index.html");
  await expect(page.locator("[data-admin-message]")).toContainText("not configured");
});

test("Chinese by default; the switch changes every page's words at once and is remembered", async ({ page }) => {
  await mockAdminApi(page, { lang: null });
  await page.goto("/admin/index.html#/orders");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant-TW");
  await expect(page.locator('[data-nav="orders"]')).toContainText("訂單");
  await expect(page.locator("h1")).toHaveText("訂單");
  await expect(page.locator('[data-view="to_ship"]')).toContainText("待出貨");
  await expect(page.locator(`[data-order="${PAID}"] [data-payment]`)).toHaveText("已付款");
  await expect(page).toHaveTitle("訂單 · APGO 後台");

  await page.locator('[data-lang="en"]').click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("h1")).toHaveText("Orders");
  await expect(page.locator('[data-view="to_ship"]')).toContainText("To ship");
  await expect(page.locator('[data-lang="en"]')).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Orders");
  await page.locator('[data-lang="zh"]').click();
  await expect(page.locator("h1")).toHaveText("訂單");
});

test("on a phone the navigation is a menu that opens and closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAdminApi(page);
  await page.goto("/admin/index.html");
  const menu = page.locator("[data-admin-menu]");
  const nav = page.locator("[data-admin-nav]");
  await expect(menu).toBeVisible();
  await expect(nav).not.toBeInViewport();
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(nav).toBeInViewport();
  await nav.getByRole("link", { name: "Products and stock" }).click();
  await expect(page).toHaveURL(/#\/products$/);
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await page.locator("[data-admin-lang-toggle]").click();
  await expect(page.locator("h1")).toHaveText("商品與庫存");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

for (const width of [320, 390, 1440]) {
  test(`back office has no horizontal overflow at ${width}px`, async ({ page }) => {
    await mockAdminApi(page);
    await page.setViewportSize({ width, height: 900 });
    for (const hash of ["#/", "#/orders", `#/orders/${PAID}`, "#/products", "#/products/d204"]) {
      await page.goto(`/admin/index.html${hash}`);
      await expect(page.locator(".view-loading")).toHaveCount(0);
      await expect(page.locator("h1")).toBeVisible();
      expect(await overflow(page), `${hash} at ${width}px`).toBeLessThanOrEqual(0);
    }
  });
}

for (const [lang, hash] of [["en", "#/"], ["zh", "#/"], ["en", `#/orders/${PAID}`], ["zh", "#/orders"]]) {
  test(`no serious or critical axe violations: ${hash} in ${lang}`, async ({ page }) => {
    await mockAdminApi(page, { lang, notes: { [PAID]: [{ id: 1, author: "owner@apgo.example", body: "Customer called.", at: "2026-10-01T03:00:00.000Z" }] } });
    await page.goto(`/admin/index.html${hash}`);
    await expect(page.locator(".view-loading")).toHaveCount(0);
    await expect(page.locator("h1")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));
    expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
  });
}
