// Back office: Unfinished checkouts (PR 3-4, D36, M9-22), with /admin/api stubbed (tests/helpers/admin-mock.mjs).
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { mockAdminApi } from "./helpers/admin-mock.mjs";

const CHECKOUTS = [
  { id: "APGO-US-CHK000000001", status: "open", email: "ada@example.com", state: "TX", items: [{ sku: "D204", name: "APGO Atomic Colored Glaze", qty: 1 }], currency: "USD", totalCents: 6798, createdAt: "2026-10-09T02:00:00.000Z", expiredAt: null, purged: false, lastFailure: { code: "authorization_failed", message: '<img src=x onerror="window.__unsafe=true"> The card was declined.', count: 2 } },
  { id: "APGO-US-CHK000000002", status: "expired", email: "sam@example.com", state: "OR", items: [{ sku: "D215", name: "APGO Atomic Glaze Coating", qty: 2 }], currency: "USD", totalCents: 6797, createdAt: "2026-10-07T02:00:00.000Z", expiredAt: "2026-10-08T02:10:00.000Z", purged: false, lastFailure: null },
  { id: "APGO-US-CHK000000003", status: "expired", email: null, state: "WA", items: [{ sku: "D204", name: "APGO Atomic Colored Glaze", qty: 1 }], currency: "USD", totalCents: 6798, createdAt: "2026-09-01T02:00:00.000Z", expiredAt: "2026-09-02T02:10:00.000Z", purged: true, lastFailure: null },
];

test("unfinished checkouts are listed apart from orders, with why a payment failed, as text; filters and email search", async ({ page }) => {
  const requests = await mockAdminApi(page, { checkouts: CHECKOUTS });
  await page.goto("/admin/index.html");
  await expect(page.locator(".admin-tab", { hasText: "pending" })).toHaveCount(0, { timeout: 2000 });
  const section = page.locator("[data-admin-checkouts-section]");
  await section.getByRole("button", { name: "Show checkouts" }).click();
  await expect(section.locator("[data-checkout-id]")).toHaveCount(3);
  await expect(section.locator("[data-checkout-counts]")).toHaveText("Open: 1 · Expired: 2");
  const first = section.locator('[data-checkout-id="APGO-US-CHK000000001"]');
  await expect(first).toContainText("Open");
  await expect(first).toContainText("ada@example.com");
  await expect(first).toContainText("1 × APGO Atomic Colored Glaze · $67.98 · TX");
  await expect(first).toContainText("Payment failed 2 times: <img src=x");
  await expect(section.locator("img")).toHaveCount(0);
  await expect(section.locator('[data-checkout-id="APGO-US-CHK000000003"]')).toContainText("Details deleted after 30 days");

  await section.getByLabel("Status", { exact: true }).selectOption("expired");
  await section.getByLabel("Email", { exact: true }).fill("sam@");
  await section.getByRole("button", { name: "Show checkouts" }).click();
  await expect(section.locator("[data-checkout-id]")).toHaveCount(1);
  const query = new URLSearchParams(requests.filter((path) => path.startsWith("/admin/api/checkouts")).at(-1).split("?")[1]);
  expect([query.get("status"), query.get("q")]).toEqual(["expired", "sam@"]);
});

test("the Unfinished checkouts section has no serious accessibility problems and fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await mockAdminApi(page, { checkouts: CHECKOUTS });
  await page.goto("/admin/index.html");
  await page.locator("[data-admin-checkouts-section]").getByRole("button", { name: "Show checkouts" }).click();
  await expect(page.locator("[data-checkout-id]")).toHaveCount(3);
  const results = await new AxeBuilder({ page }).include("[data-admin-checkouts-section]").analyze();
  expect(results.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
