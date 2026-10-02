// Back-office Amazon MCF block, with /admin/api stubbed (tests/helpers/admin-mock.mjs): nothing reaches Amazon.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { mockAdminApi } from "./helpers/admin-mock.mjs";

const PAID = "APGO-US-0123456789AB";
const PENDING = "APGO-US-7K3M9Q2W4XZ8";
const FAILED = { status: "failed", mcfStatus: null, sellerOrderId: PAID, attempts: 1, serviceTier: "EXPEDITED", errorKind: "invalid", errorMessage: "destination.deliveryAddress.postalCode is invalid", note: null, carrier: null, trackingNumber: null, submittedAt: null, lastSyncedAt: null, updatedAt: "2026-10-01T02:00:00.000Z" };
const SUBMITTED = { ...FAILED, status: "submitted", mcfStatus: "PROCESSING", errorKind: null, errorMessage: null, submittedAt: "2026-10-01T02:00:00.000Z" };

const block = (page) => page.locator("[data-admin-mcf]");

test("connection check uses GET only, reports preview availability and never enables fulfillment", async ({ page }) => {
  const requests = await mockAdminApi(page);
  const checks = [];
  await page.route("**/admin/api/mcf/check", (route) => {
    checks.push(route.request().method());
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, autoSubmit: false, previews: [{ sku: "D204", fulfillable: true }, { sku: "D215", fulfillable: false }] }) });
  });
  await page.goto(`/admin/index.html#${PAID}`);
  await page.getByRole("button", { name: "Check MCF connection", exact: true }).click();
  await expect(page.locator("[data-admin-mcf-check-result]")).toContainText("D204: available");
  await expect(page.locator("[data-admin-mcf-check-result]")).toContainText("D215: unavailable");
  await expect(page.locator("[data-admin-mcf-check-result]")).toContainText("Automatic fulfillment is off.");
  await expect(page.locator("[data-admin-mcf-check-result]")).toContainText("No shipment was created.");
  expect(checks).toEqual(["GET"]);
  expect(requests.mcf).toHaveLength(0);
  expect(requests.writes).toHaveLength(0);
  await expect(page.locator("[data-mcf-submit]")).toHaveCount(0);
});

test("connection failure is readable as text and the check can be retried", async ({ page }) => {
  await mockAdminApi(page);
  await page.route("**/admin/api/mcf/check", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, step: "list", error: "<img src=x onerror=alert(1)> token rejected" }) }));
  await page.goto("/admin/index.html");
  await page.getByRole("button", { name: "Check MCF connection", exact: true }).click();
  await expect(page.locator("[data-admin-mcf-check-result]")).toContainText("token rejected");
  await expect(page.locator("[data-admin-mcf-check-result] img")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Check MCF connection", exact: true })).toBeEnabled();
});

test("default: MCF off shows 'not enabled, ship manually' and no MCF buttons; the manual shipping form still works", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto(`/admin/index.html#${PAID}`);
  await expect(block(page)).toContainText("MCF not enabled");
  await expect(block(page)).toHaveAttribute("data-admin-mcf", "off");
  await expect(page.locator("[data-mcf-submit], [data-mcf-sync]")).toHaveCount(0);
  await expect(page.locator("[data-ship-form]")).toBeVisible();
});

test("MCF on but not configured: explains what is missing, no send button", async ({ page }) => {
  await mockAdminApi(page, { mcf: { mode: "not_configured" } });
  await page.goto(`/admin/index.html#${PAID}`);
  await expect(block(page)).toContainText("not ready: missing OUTBOUND_INTERNAL_TOKEN");
  await expect(page.locator("[data-mcf-submit]")).toHaveCount(0);
});

test("unpaid orders show no MCF block", async ({ page }) => {
  await mockAdminApi(page, { mcf: { mode: "ready" } });
  await page.goto(`/admin/index.html#${PENDING}`);
  await expect(page.locator("[data-admin-detail-body] h3")).toHaveText(PENDING);
  await expect(block(page)).toHaveCount(0);
});

test("failed send shows the error; Retry send POSTs JSON and then shows 'Sent to Amazon' with a sync button", async ({ page }) => {
  const requests = await mockAdminApi(page, { mcf: { mode: "ready" }, mcfRecords: { [PAID]: FAILED } });
  await page.goto(`/admin/index.html#${PAID}`);
  await expect(block(page)).toContainText("Failed");
  await expect(block(page)).toContainText("postalCode is invalid");
  await expect(page.locator("[data-mcf-sync]")).toHaveCount(0);

  await page.locator("[data-mcf-submit]").click();
  await expect(page.locator("[data-admin-detail-body] .notice--success")).toContainText("Sent to Amazon MCF.");
  await expect(block(page)).toContainText("Sent to Amazon");
  await expect(block(page)).toContainText("PROCESSING");
  await expect(block(page)).not.toContainText("postalCode");
  await expect(page.locator("[data-mcf-submit]")).toHaveCount(0);
  await expect(page.locator("[data-mcf-sync]")).toBeVisible();
  expect(requests.mcf).toHaveLength(1);
  expect(requests.mcf[0]).toMatchObject({ method: "POST", path: `/admin/api/orders/${PAID}/mcf/submit`, contentType: "application/json", body: {} });
});

test("a retry that fails again keeps the error visible and the button available", async ({ page }) => {
  await mockAdminApi(page, { mcf: { mode: "ready", submitFails: 1 } });
  await page.goto(`/admin/index.html#${PAID}`);
  await page.locator("[data-mcf-submit]").click();
  await expect(page.locator("[data-admin-detail-body] .notice--warning")).toContainText("did not accept");
  await expect(block(page)).toContainText("postalCode is invalid");
  await expect(page.locator("[data-mcf-submit]")).toBeEnabled();
});

test("Sync MCF status: before Amazon ships nothing changes; after, the order becomes shipped with Amazon tracking, once", async ({ page }) => {
  const requests = await mockAdminApi(page, { mcf: { mode: "ready" }, mcfRecords: { [PAID]: SUBMITTED } });
  await page.goto(`/admin/index.html#${PAID}`);
  await page.locator("[data-mcf-sync]").click();
  await expect(page.locator("[data-admin-detail-body] .notice--success")).toContainText("has not shipped it yet");
  await expect(page.locator('[data-admin-fulfillment="open"]')).toBeVisible();

  requests.mcfState.amazonShipped = true;
  await page.locator("[data-mcf-sync]").click();
  await expect(page.locator("[data-admin-detail-body] .notice--success")).toContainText("Order marked shipped and the customer was emailed");
  await expect(block(page)).toContainText("Shipped by Amazon");
  await expect(block(page)).toContainText("TBA123456789000");
  const record = page.locator('[data-admin-fulfillment="shipped"]');
  await expect(record).toContainText("Amazon Logistics");
  await expect(record).toContainText("mcf");
  await expect(page.locator("[data-mcf-sync]")).toHaveCount(0);
  await expect(page.locator(`[data-order="${PAID}"] .status--shipped`)).toBeVisible();
  expect(requests.emails).toHaveLength(1);
  expect(requests.emails[0].text).toContain("TBA123456789000");
});

test("the toolbar 'Sync MCF status' button syncs every waiting order", async ({ page }) => {
  const requests = await mockAdminApi(page, { mcf: { mode: "ready" }, mcfRecords: { [PAID]: SUBMITTED } });
  await page.goto("/admin/index.html");
  await page.locator("[data-admin-mcf-sync-all]").click();
  await expect(page.locator("[data-admin-message] .notice--success")).toContainText("Checked 1 order");
  expect(requests.mcf.at(-1)).toMatchObject({ method: "POST", path: "/admin/api/mcf/sync", body: {} });
});

test("the MCF block has no serious axe violations and does not overflow at 320/390/1440", async ({ page }) => {
  await mockAdminApi(page, { mcf: { mode: "ready" }, mcfRecords: { [PAID]: FAILED } });
  await page.goto(`/admin/index.html#${PAID}`);
  await expect(block(page)).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
  }
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
});
