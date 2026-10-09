// Back office: the Disputes filter (I13), a dispute on the order page with its deadline and the shipping lock, and the
// refunds panel of a PayPal order (PR 3-5). Mocked /admin/api/* (tests/helpers/admin-mock.mjs).
import { expect, test } from "@playwright/test";
import { SAMPLE_ORDERS, mockAdminApi } from "./helpers/admin-mock.mjs";

const PAID = SAMPLE_ORDERS[0].id;
const CANCELLED = SAMPLE_ORDERS[2].id;
const open = { provider: "airwallex", id: "dsp_demo_1", status: "open", providerStatus: "REQUIRES_RESPONSE", stage: "CHARGEBACK", reason: "Fraudulent transaction", amountCents: 12897, currency: "USD", dueAt: "2026-10-12T12:00:00.000Z", updatedAt: "2026-10-05T08:00:00.000Z" };
const lost = { ...open, provider: "paypal", id: "PP-D-DEMO", status: "lost", providerStatus: "RESOLVED:RESOLVED_BUYER_FAVOUR", amountCents: 5999 };
const hold = { code: "dispute", message: "A dispute is open with Airwallex (respond by Mon, 12 Oct 2026 12:00:00 GMT). The order waits until it is won." };

test("the Disputes filter lists orders with an open dispute and their deadline", async ({ page }) => {
  const requests = await mockAdminApi(page, { disputes: { [PAID]: [open], [CANCELLED]: [lost] } });
  await page.goto("/admin/index.html");
  const tab = page.locator('[data-issue="disputes"]');
  await expect(tab).toContainText("Disputes1");
  await expect(tab).toHaveAttribute("aria-pressed", "false");
  await tab.click();
  await expect(tab).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-order]")).toHaveCount(1);
  const row = page.locator(`[data-order="${PAID}"]`);
  await expect(row).toContainText("dispute");
  await expect(row).toContainText("respond by Oct 12, 2026");
  expect(requests.some((path) => path.startsWith("/admin/api/orders?") && path.includes("issue=disputes"))).toBe(true);
  await tab.click();
  await expect(tab).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("[data-order]")).toHaveCount(SAMPLE_ORDERS.length);
});

test("an open dispute is shown on the order with its deadline; shipping is locked", async ({ page }) => {
  await mockAdminApi(page, { disputes: { [PAID]: [open] }, orderCore: { [PAID]: { stage: "paid", holds: [hold] } } });
  await page.goto(`/admin/index.html#${PAID}`);
  const disputes = page.getByRole("region", { name: "Disputes", exact: true });
  await expect(disputes).toContainText("Respond in the Airwallex dashboard");
  await expect(disputes).toContainText("Airwallex dsp_demo_1");
  await expect(disputes).toContainText("Open (REQUIRES_RESPONSE)");
  await expect(disputes).toContainText("$128.97");
  await expect(disputes).toContainText("Fraudulent transaction");
  await expect(disputes).toContainText("Respond by");
  await expect(page.getByText("A dispute is open with Airwallex", { exact: false })).toBeVisible();
  await expect(page.getByRole("region", { name: "Fulfilment", exact: true })).toContainText("cannot be shipped until the dispute is won");
  await expect(page.getByRole("button", { name: "Mark as shipped", exact: true })).toHaveCount(0);
});

test("a PayPal order's refunds panel points to PayPal and has no Airwallex sync button; fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await mockAdminApi(page, { providers: { [PAID]: "paypal" }, disputes: { [PAID]: [{ ...lost, status: "won", providerStatus: "RESOLVED:RESOLVED_SELLER_FAVOUR" }] } });
  await page.goto(`/admin/index.html#${PAID}`);
  const refunds = page.getByRole("region", { name: "Refunds", exact: true });
  await expect(refunds).toContainText("Paid with PayPal. Initiate refunds in PayPal");
  await expect(refunds).toContainText("No refunds recorded.");
  await expect(page.getByRole("button", { name: "Sync refunds", exact: true })).toHaveCount(0);
  const disputes = page.getByRole("region", { name: "Disputes", exact: true });
  await expect(disputes).toContainText("PayPal PP-D-DEMO");
  await expect(disputes).toContainText("Won");
  await expect(disputes).not.toContainText("Respond by");
  await expect(page.getByRole("button", { name: "Mark as shipped", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
