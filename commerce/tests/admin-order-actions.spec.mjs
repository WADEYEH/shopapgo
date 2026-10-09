// Back office, order detail: stage, cooling-off, holds, and confirm / cancel / change address (PR 3-3), with /admin/api
// stubbed (tests/helpers/admin-mock.mjs).
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { mockAdminApi } from "./helpers/admin-mock.mjs";

const PAID = "APGO-US-0123456789AB";
const PENDING = "APGO-US-7K3M9Q2W4XZ8";
const COOLING = { stage: "paid", coolingOffEndsAt: "2026-10-09T05:00:00.000Z" };
const detail = (page) => page.locator("[data-admin-detail-body]");

test("a paid order in the cooling-off period shows when it goes to Amazon, and its address can change with a reason", async ({ page }) => {
  const requests = await mockAdminApi(page, { orderCore: { [PAID]: COOLING } });
  await page.goto(`/admin/index.html#${PAID}`);
  await expect(detail(page).locator("[data-order-stage]")).toHaveText("Paid");
  await expect(detail(page)).toContainText("Cooling-off until");
  const form = detail(page).locator("[data-order-address]");
  await detail(page).getByText("Change the address (cooling-off period only)").click();
  await expect(form.getByLabel("Street address")).toHaveValue("100 Example Ave");
  await form.getByLabel("Street address").fill("200 Example Ave");
  await form.getByRole("button", { name: "Save address" }).click();
  await expect(detail(page).locator("[data-order-action-message]")).toContainText("Write why the address changes.");
  expect(requests.orderActions).toHaveLength(0);
  await form.getByLabel("Why it changes").fill("Customer emailed a new unit");
  await form.getByRole("button", { name: "Save address" }).click();
  await expect(detail(page)).toContainText("Address changed");
  expect(requests.orderActions).toEqual([{ action: "address", method: "POST", contentType: "application/json", body: {
    shipping: { firstName: "Ada", lastName: "Lee", street: "200 Example Ave", street2: "Apt 4", city: "Austin", state: "TX", zip: "78701" },
    reason: "Customer emailed a new unit", noUnit: false,
  } }]);
  await expect(detail(page).locator(".admin-address")).toContainText("200 Example Ave");
});

test("cancelling needs a reason and a confirmation, then shows who cancelled and what to refund", async ({ page }) => {
  const requests = await mockAdminApi(page, { orderCore: { [PAID]: COOLING } });
  await page.goto(`/admin/index.html#${PAID}`);
  const cancel = detail(page).locator("[data-order-cancel]");
  await cancel.getByText("Cancel the order", { exact: true }).click();
  await cancel.getByRole("button", { name: "Cancel order" }).click();
  await expect(detail(page).locator("[data-order-action-message]")).toContainText("Choose why the order is cancelled.");
  await expect(cancel.getByLabel("Reason")).not.toContainText("Fully refunded");
  await cancel.getByLabel("Reason").selectOption("customer_request");
  await cancel.getByLabel("Details (needed for Other)").fill("Emailed after paying");
  page.once("dialog", (dialog) => { expect(dialog.message()).toContain(`Cancel order ${PAID}?`); dialog.accept(); });
  await cancel.getByRole("button", { name: "Cancel order" }).click();
  await expect(detail(page).locator("[data-order-stage]")).toHaveText("Cancelled");
  await expect(detail(page)).toContainText("Order cancelled");
  await expect(detail(page)).toContainText("Customer asked to cancel: Emailed after paying. By staff@apgo.example");
  await expect(detail(page).getByText("Refund $128.97 in Airwallex").first()).toBeVisible();
  await expect(detail(page).locator("[data-order-cancel]")).toHaveCount(0);
  expect(requests.orderActions.map((a) => [a.action, a.body])).toEqual([["cancel", { reason: "customer_request", note: "Emailed after paying" }]]);
});

test("a review order shows why it is held and is confirmed with a reason", async ({ page }) => {
  const requests = await mockAdminApi(page, { orderCore: { [PAID]: { stage: "review" } } });
  await page.goto(`/admin/index.html#${PAID}`);
  await expect(detail(page).locator("[data-order-stage]")).toHaveText("Needs review");
  await expect(detail(page)).toContainText("The amount paid did not match the order.");
  const confirm = detail(page).locator("[data-order-confirm]");
  await confirm.getByRole("button", { name: "Confirm order" }).click();
  await expect(detail(page).locator("[data-order-action-message]")).toContainText("Write why the payment is fine.");
  await confirm.getByLabel("Why it is fine").fill("Checked in Airwallex: paid in full");
  await confirm.getByRole("button", { name: "Confirm order" }).click();
  await expect(detail(page)).toContainText("Order confirmed");
  await expect(detail(page).locator("[data-order-stage]")).toHaveText("Paid");
  expect(requests.orderActions.map((a) => [a.action, a.body])).toEqual([["confirm", { reason: "Checked in Airwallex: paid in full" }]]);
});

test("with Amazon already: the cancel asks Amazon first, and a refusal is shown without changing anything", async ({ page }) => {
  await mockAdminApi(page, { orderCore: { [PAID]: { stage: "fulfilling" } }, orderActionError: { status: 502, code: "amazon_cancel_failed", message: "Amazon could not cancel this shipment (Order cannot be cancelled). The order stays with Amazon; the team was told." } });
  await page.goto(`/admin/index.html#${PAID}`);
  await expect(detail(page).locator("[data-order-stage]")).toHaveText("With Amazon");
  const cancel = detail(page).locator("[data-order-cancel]");
  await cancel.getByText("Cancel the order (asks Amazon first)").click();
  await cancel.getByLabel("Reason").selectOption("out_of_stock");
  page.once("dialog", (dialog) => { expect(dialog.message()).toContain("Amazon is asked to cancel the shipment first"); dialog.accept(); });
  await cancel.getByRole("button", { name: "Cancel order" }).click();
  await expect(detail(page).locator("[data-order-action-message]")).toContainText("Amazon could not cancel this shipment");
  await expect(detail(page).locator("[data-order-stage]")).toHaveText("With Amazon");
  await expect(cancel.getByRole("button", { name: "Cancel order" })).toBeEnabled();
});

test("orders without the order block (older Worker), or shipped ones, show no Order section", async ({ page }) => {
  await mockAdminApi(page, { orderCore: { [PENDING]: { stage: "shipped" } } });
  await page.goto(`/admin/index.html#${PAID}`);
  await expect(detail(page).locator("h3")).toHaveText(PAID);
  await expect(detail(page).locator("[data-order-actions]")).toHaveCount(0);
  await page.locator(".admin-row", { hasText: PENDING }).click();
  await expect(detail(page).locator("[data-order-stage]")).toHaveText("Shipped");
  await expect(detail(page).locator("[data-order-actions]")).toHaveCount(0);
});

for (const width of [360, 1440]) {
  test(`order actions have no serious accessibility problems and fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockAdminApi(page, { orderCore: { [PAID]: COOLING } });
    await page.goto(`/admin/index.html#${PAID}`);
    await detail(page).getByText("Change the address (cooling-off period only)").click();
    await detail(page).locator("[data-order-cancel]").getByText("Cancel the order", { exact: true }).click();
    const results = await new AxeBuilder({ page }).include("[data-order-actions]").analyze();
    expect(results.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}
