import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { mockAdminApi } from "./helpers/admin-mock.mjs";

test("lists orders with status counts and opens the detail with address, items, totals and payment state", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("/admin/index.html");

  await expect(page).toHaveTitle(/Orders/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
  await expect(page.locator(".admin-row")).toHaveCount(3);
  await expect(page.locator(".admin-tab", { hasText: "paid" })).toContainText("1");
  await expect(page.locator(".admin-tab", { hasText: "All" })).toContainText("3");

  await page.locator('[data-order="APGO-US-0123456789AB"]').click();
  const detail = page.locator("[data-admin-detail-body]");
  await expect(detail.locator("h3")).toHaveText("APGO-US-0123456789AB");
  await expect(detail).toContainText("Paid");
  await expect(detail).toContainText("Ada Lee");
  await expect(detail).toContainText("100 Example Ave");
  await expect(detail).toContainText("Apt 4");
  await expect(detail).toContainText("Austin, TX 78701");
  await expect(detail).toContainText("2 × APGO Atomic Glaze Coating");
  await expect(detail).toContainText("D204 · 300 mL · 10.1 fl oz · $59.99 each");
  await expect(detail).toContainText("int_demo_1");
  await expect(detail.locator(".price-row--total")).toContainText("$128.97");
  await expect(detail).toContainText("skipped (none: skipped)");
  await expect(detail.locator('a[href^="mailto:"]')).toHaveText("ada.lee@example.com");
  await expect(page).toHaveURL(/#APGO-US-0123456789AB$/);
});

test("filters by status, searches, and deep-links to an order", async ({ page }) => {
  const requests = await mockAdminApi(page);
  await page.goto("/admin/index.html#APGO-US-7K3M9Q2W4XZ8");
  await expect(page.locator("[data-admin-detail-body] h3")).toHaveText("APGO-US-7K3M9Q2W4XZ8");
  await expect(page.locator("[data-admin-detail-body]")).toContainText("Awaiting payment");

  await page.locator(".admin-tab", { hasText: "paid" }).click();
  await expect(page.locator(".admin-row")).toHaveCount(1);
  expect(requests.some((r) => r.includes("status=paid"))).toBe(true);

  await page.locator(".admin-tab", { hasText: "All" }).click();
  await page.getByRole("searchbox", { name: "Search orders" }).fill("portland");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.locator(".admin-row")).toHaveCount(1);
  await expect(page.locator(".admin-row")).toContainText("Sam Ortiz");
  expect(requests.some((r) => r.includes("q=portland"))).toBe(true);

  await page.getByRole("searchbox", { name: "Search orders" }).fill("zzz-none");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.locator(".admin-empty")).toHaveText("No orders match.");
});

test("shows a clear notice when the back office is not configured", async ({ page }) => {
  await mockAdminApi(page, { status: 503 });
  await page.goto("/admin/index.html");
  await expect(page.locator("[data-admin-message]")).toContainText("not configured");
});

for (const width of [320, 390, 1440]) {
  test(`back office has no horizontal overflow at ${width}px`, async ({ page }) => {
    await mockAdminApi(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/index.html#APGO-US-0123456789AB");
    await expect(page.locator("[data-admin-detail-body] h3")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("back office has no serious or critical axe violations", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("/admin/index.html#APGO-US-0123456789AB");
  await expect(page.locator("[data-admin-detail-body] h3")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
});
