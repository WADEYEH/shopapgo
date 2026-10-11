// Back office (PR 3-6): out of stock at Amazon with Cancel and refund, a read-back mismatch with Cancel at Amazon, and
// the owners-only Hold test order. Mocked /admin/api/* (tests/helpers/admin-mock.mjs).
import { expect, test } from "@playwright/test";
import { SAMPLE_ORDERS, mockAdminApi } from "./helpers/admin-mock.mjs";

const PAID = SAMPLE_ORDERS[0].id;
const base = { sellerOrderId: PAID, attempts: 1, serviceTier: "STANDARD", errorKind: null, errorMessage: null, note: null, carrier: null, trackingNumber: null, submittedAt: "2026-10-05T03:00:00.000Z", lastSyncedAt: "2026-10-05T04:00:00.000Z", updatedAt: "2026-10-05T04:00:00.000Z" };
const stockout = { ...base, status: "rejected", mcfStatus: "UNFULFILLABLE", errorKind: "amazon", errorMessage: "Amazon closed the MCF order as UNFULFILLABLE.", stockoutAt: "2026-10-05T04:00:00.000Z", check: { status: "ok", detail: null, at: "2026-10-05T03:00:05.000Z" } };
const mismatch = { ...base, status: "submitted", mcfStatus: "RECEIVED", check: { status: "mismatch", detail: "AMZ-SKU-D204: sent 1, Amazon has 2", at: "2026-10-05T03:00:05.000Z" } };

test("out of stock at Amazon: days shown; Cancel and refund asks first, then cancels and refunds in one step", async ({ page }) => {
  const requests = await mockAdminApi(page, { mcf: { mode: "ready" }, mcfRecords: { [PAID]: stockout }, orderCore: { [PAID]: { stage: "paid" } } });
  await page.goto(`/admin/index.html#${PAID}`);
  const block = page.getByRole("region", { name: "Amazon MCF", exact: true });
  await expect(block).toContainText("Out of stock at Amazon for 3 days");
  await expect(block).toContainText("the customer was told it is delayed");
  await expect(block).toContainText("Amazon's copy");
  let asked = "";
  page.once("dialog", (dialog) => { asked = dialog.message(); dialog.accept(); });
  await block.getByRole("button", { name: "Cancel and refund", exact: true }).click();
  await expect(page.getByText("Cancelled and refunded", { exact: true })).toBeVisible();
  expect(asked).toContain(`Cancel order ${PAID} and refund $128.97`);
  expect(requests.orderActions).toEqual([{ action: "cancel-refund", method: "POST", contentType: "application/json", body: {} }]);
  await expect(page.getByRole("region", { name: "Refunds", exact: true })).toContainText("Refund asked by the store when cancelling: $128.97 through Airwallex · accepted by the provider");
});

test("Cancel and refund does nothing when the confirmation is dismissed", async ({ page }) => {
  const requests = await mockAdminApi(page, { mcf: { mode: "ready" }, mcfRecords: { [PAID]: stockout }, orderCore: { [PAID]: { stage: "paid" } } });
  await page.goto(`/admin/index.html#${PAID}`);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Cancel and refund", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cancel and refund", exact: true })).toBeEnabled();
  expect(requests.orderActions).toEqual([]);
});

test("Amazon's copy does not match: the difference is shown and Cancel at Amazon stops it", async ({ page }) => {
  const requests = await mockAdminApi(page, { mcf: { mode: "ready" }, mcfRecords: { [PAID]: mismatch } });
  await page.goto(`/admin/index.html#${PAID}`);
  const block = page.getByRole("region", { name: "Amazon MCF", exact: true });
  await expect(block).toContainText("Amazon's copy does not match");
  await expect(block).toContainText("AMZ-SKU-D204: sent 1, Amazon has 2");
  page.once("dialog", (dialog) => dialog.accept());
  await block.getByRole("button", { name: "Cancel at Amazon", exact: true }).click();
  await expect(page.getByText("Amazon cancelled it. Check the order, then Retry send to send it again.")).toBeVisible();
  expect(requests.mcf.map((r) => [r.method, r.path, r.contentType])).toEqual([["POST", `/admin/api/orders/${PAID}/mcf/cancel`, "application/json"]]);
});

test("the Hold test order is for owners: it asks first and shows each step", async ({ page }) => {
  const requests = await mockAdminApi(page, { team: { role: "owner" } });
  await page.goto("/admin/index.html");
  const button = page.getByRole("button", { name: "Hold test order", exact: true });
  await expect(button).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await button.click();
  await expect(page.getByText("Hold test passed (HOLDTEST-20261009030000)")).toBeVisible();
  await expect(page.getByText(/Create on hold: OK\..*Read back: OK\..*Cancel: OK\./)).toBeVisible();
  expect(requests.holdTests).toEqual([{ method: "POST", contentType: "application/json", body: {} }]);
});

test("members do not see the Hold test order button", async ({ page }) => {
  await mockAdminApi(page, { team: { role: "member" } });
  await page.goto("/admin/index.html");
  await expect(page.locator("[data-admin-whoami]")).toContainText("Member");
  await expect(page.getByRole("button", { name: "Hold test order", exact: true })).toHaveCount(0);
});
