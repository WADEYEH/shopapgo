// PR 3-11 in the browser: every package of a shipment with what the carrier said (F6, F9), the dispute evidence
// download (M5-12) and packages going back to the sender on the dashboard, with /admin/api stubbed.
import { expect, test } from "@playwright/test";

import { mockAdminApi } from "./helpers/admin-mock.mjs";

const PAID = "APGO-US-0123456789AB";
const TWO = [
  { trackingNumber: "1ZFIRST", carrier: "UPS", trackingUrl: "https://www.ups.com/track?tracknum=1ZFIRST", status: "DELIVERED", deliveredAt: "2026-10-04T18:00:00.000Z", returnedAt: null, checkedAt: "2026-10-05T01:00:00.000Z", events: [] },
  { trackingNumber: "9400SECOND", carrier: "USPS", trackingUrl: null, status: "RETURNED", deliveredAt: null, returnedAt: "2026-10-06T01:00:00.000Z", checkedAt: "2026-10-06T01:00:00.000Z", events: [] },
];

test("a shipped order lists every package with the carrier's status; a returned one says what to do", async ({ page }) => {
  await mockAdminApi(page, { fulfilled: [PAID], packages: { [PAID]: TWO } });
  await page.goto(`/admin/index.html#/orders/${PAID}`);
  const list = page.locator("[data-packages]");
  await expect(list).toHaveAttribute("data-packages", "2");
  await expect(list.locator('[data-package="1ZFIRST"] [data-package-status="DELIVERED"]')).toHaveText("Delivered");
  await expect(list.locator('[data-package="1ZFIRST"]')).toContainText("Open tracking page");
  await expect(list.locator('[data-package="9400SECOND"] [data-package-status="RETURNED"]')).toHaveText("Returned to sender");
  await expect(list.locator('[data-package="9400SECOND"]')).toContainText("Contact the customer, then ship again or refund.");
});

test("a disputed order offers the evidence page as a download, saved under the order number", async ({ page }) => {
  const requests = await mockAdminApi(page, { disputes: { [PAID]: [{ provider: "airwallex", id: "dsp_1", status: "open", providerStatus: "", amountCents: 12897, reason: "product_not_received", dueAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" }] } });
  await page.goto(`/admin/index.html#/orders/${PAID}`);
  const download = page.waitForEvent("download");
  await page.locator("[data-evidence]").click();
  expect((await download).suggestedFilename()).toBe(`apgo-evidence-${PAID}.html`);
  await expect(page.locator("[data-evidence-message]")).toContainText("print it to PDF");
  expect(requests.downloads).toEqual([`/admin/api/orders/${PAID}/evidence`]);
});

test("the dashboard lists packages going back to the sender, in Chinese too", async ({ page }) => {
  await mockAdminApi(page, { lang: "zh", returned: [{ order_id: PAID, tracking_number: "9400SECOND", carrier: "USPS", status: "RETURNED", returned_at: "2026-10-06T01:00:00.000Z" }] });
  await page.goto("/admin/index.html#/");
  const row = page.locator('[data-attention="returned"]');
  await expect(row).toContainText("包裹被退回寄件人");
  await expect(row).toContainText("USPS 9400SECOND · RETURNED");
  await expect(row).toContainText("聯絡客戶");
});
