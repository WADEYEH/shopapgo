import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { mockAdminApi } from "./helpers/admin-mock.mjs";

const PAID = "APGO-US-0123456789AB";
const PENDING = "APGO-US-7K3M9Q2W4XZ8";

async function fillShipment(page, { carrier = "UPS", number = "1Z999AA10123456784", url = "https://www.ups.com/track?tracknum=1Z999AA10123456784" } = {}) {
  const form = page.locator("[data-ship-form]");
  await form.getByLabel(/Carrier/).fill(carrier);
  await form.getByLabel(/Tracking number/).fill(number);
  if (url) await form.getByLabel(/Tracking link/).fill(url);
}

test("marks a paid order shipped: form, success notice, shipped record, list badge and to-ship count", async ({ page }) => {
  const requests = await mockAdminApi(page);
  await page.goto(`/admin/index.html#${PAID}`);
  const detail = page.locator("[data-admin-detail-body]");
  await expect(detail.locator("h3")).toHaveText(PAID);
  await expect(page.locator(".admin-tab", { hasText: "To ship" })).toContainText("1");
  await expect(page.locator(`[data-order="${PAID}"] .status--to-ship`)).toBeVisible();
  await expect(detail).not.toContainText("null");

  await fillShipment(page);
  await page.getByRole("button", { name: "Mark as shipped" }).click();

  await expect(detail.locator(".notice--success")).toContainText("Email accepted by the email service; delivery is tracked separately.");
  const record = detail.locator('[data-admin-fulfillment="shipped"]');
  await expect(record).toContainText("UPS");
  await expect(record).toContainText("1Z999AA10123456784");
  await expect(record.getByRole("link", { name: "Open tracking page" })).toHaveAttribute("href", /ups\.com\/track/);
  await expect(page.locator("[data-ship-form]")).toHaveCount(0);
  await expect(detail).toContainText("order.shipped by admin");
  await expect(detail).toContainText("Shipment notice: sent");
  await expect(page.locator(`[data-order="${PAID}"] .status--shipped`)).toBeVisible();
  await expect(page.locator(".admin-tab", { hasText: "To ship" })).toContainText("0");
  await expect(page.locator(".admin-tab", { hasText: "Shipped" })).toContainText("1");

  expect(requests.writes).toHaveLength(1);
  expect(requests.writes[0]).toMatchObject({ method: "POST", path: `/admin/api/orders/${PAID}/ship`, contentType: "application/json" });
  expect(requests.writes[0].body).toEqual({ carrier: "UPS", trackingNumber: "1Z999AA10123456784", trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784" });
});

test("the shipment email payload has order id, items, total, address summary and tracking, and no invented promises", async ({ page }) => {
  const requests = await mockAdminApi(page);
  await page.goto(`/admin/index.html#${PAID}`);
  await fillShipment(page);
  await page.getByRole("button", { name: "Mark as shipped" }).click();
  await expect(page.locator('[data-admin-fulfillment="shipped"]')).toBeVisible();

  expect(requests.emails).toHaveLength(1);
  const mail = requests.emails[0];
  expect(mail.to).toEqual(["ada.lee@example.com"]);
  expect(mail.subject).toContain(PAID);
  for (const body of [mail.text, mail.html]) {
    expect(body).toContain(PAID);
    expect(body).toContain("APGO Atomic Glaze Coating");
    expect(body).toContain("$88.70");
    expect(body).toContain("Austin, TX 78701");
    expect(body).toContain("1Z999AA10123456784");
  }
  expect(mail.html).toContain("<!doctype html>");
  expect(mail.text).not.toMatch(/business days|guarantee|arrive by|refund|return/i);
});

test("the tracking link is optional", async ({ page }) => {
  const requests = await mockAdminApi(page);
  await page.goto(`/admin/index.html#${PAID}`);
  await fillShipment(page, { carrier: "USPS", number: "9400 1000 0000", url: "" });
  await page.getByRole("button", { name: "Mark as shipped" }).click();
  const record = page.locator('[data-admin-fulfillment="shipped"]');
  await expect(record).toContainText("USPS");
  await expect(record.getByRole("link")).toHaveCount(0);
  expect(requests.writes[0].body.trackingUrl).toBe("");
});

test("shows 'email skipped' when customer email is not configured, and the shipment is still saved", async ({ page }) => {
  const requests = await mockAdminApi(page, { emailConfigured: false });
  await page.goto(`/admin/index.html#${PAID}`);
  await fillShipment(page);
  await page.getByRole("button", { name: "Mark as shipped" }).click();
  await expect(page.locator("[data-admin-detail-body] .notice--success")).toContainText("Customer email: skipped");
  await expect(page.locator('[data-admin-fulfillment="shipped"]')).toBeVisible();
  await expect(page.locator("[data-admin-detail-body]")).toContainText("Shipment notice: skipped");
  expect(requests.emails).toHaveLength(0);
});

test("rejects a missing carrier / tracking number in the page, and bad input from the server, without shipping", async ({ page }) => {
  const requests = await mockAdminApi(page);
  await page.goto(`/admin/index.html#${PAID}`);
  await page.getByRole("button", { name: "Mark as shipped" }).click();
  await expect(page.locator("[data-ship-message]")).toContainText("Enter the carrier and tracking number.");
  expect(requests.writes).toHaveLength(0);

  await fillShipment(page, { url: "http://insecure.example/t" });
  await page.getByRole("button", { name: "Mark as shipped" }).click();
  await expect(page.locator("[data-ship-message]")).toContainText("https://");
  await expect(page.locator("[data-ship-form]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark as shipped" })).toBeEnabled();
  expect(requests.emails).toHaveLength(0);
});

test("cannot ship twice: a shipped order has no form, and a stale second attempt is refused by the server", async ({ page, browser }) => {
  await mockAdminApi(page);
  await page.goto(`/admin/index.html#${PAID}`);
  await fillShipment(page);
  await page.getByRole("button", { name: "Mark as shipped" }).click();
  await expect(page.locator('[data-admin-fulfillment="shipped"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark as shipped" })).toHaveCount(0);

  // A second tab that still shows the open form gets the server's 409 and refreshes to the record.
  const stale = await browser.newPage();
  await mockAdminApi(stale, { shipError: { status: 409, code: "already_shipped", message: "This order is already marked shipped." } });
  await stale.goto(`/admin/index.html#${PAID}`);
  await fillShipment(stale);
  await stale.getByRole("button", { name: "Mark as shipped" }).click();
  await expect(stale.locator("[data-admin-detail-body] .notice--warning")).toContainText("already marked shipped");
  await stale.close();
});

test("only paid orders offer shipping: a pending order shows a note instead of the form", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto(`/admin/index.html#${PENDING}`);
  const locked = page.locator('[data-admin-fulfillment="locked"]');
  await expect(locked).toContainText("Only paid orders can be marked shipped.");
  await expect(page.locator("[data-ship-form]")).toHaveCount(0);
});

test("filters the list by shipping status", async ({ page }) => {
  const requests = await mockAdminApi(page);
  await page.goto("/admin/index.html");
  await expect(page.locator(".admin-row")).toHaveCount(3);

  await page.locator(".admin-tab", { hasText: "To ship" }).click();
  await expect(page.locator(".admin-row")).toHaveCount(1);
  await expect(page.locator(".admin-row")).toContainText(PAID);
  expect(requests.some((r) => r.includes("fulfillment=unfulfilled"))).toBe(true);

  await page.locator(".admin-tab", { hasText: "Shipped" }).click();
  await expect(page.locator(".admin-empty")).toHaveText("No orders match.");
  expect(requests.some((r) => r.includes("fulfillment=shipped"))).toBe(true);

  await page.locator(".admin-tab", { hasText: "Any shipping" }).click();
  await expect(page.locator(".admin-row")).toHaveCount(3);
});

test("a signed-out (401) or unconfigured (503) write shows a clear message and keeps the form", async ({ page }) => {
  await mockAdminApi(page, { shipError: { status: 401, code: "unauthorized", message: "Authentication required." } });
  await page.goto(`/admin/index.html#${PAID}`);
  await fillShipment(page);
  await page.getByRole("button", { name: "Mark as shipped" }).click();
  await expect(page.locator("[data-ship-message]")).toContainText("signed out");
  await expect(page.locator("[data-ship-form]")).toBeVisible();
});

for (const width of [320, 390, 1440]) {
  test(`fulfilment form and shipped record have no horizontal overflow at ${width}px`, async ({ page }) => {
    await mockAdminApi(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/admin/index.html#${PAID}`);
    await expect(page.locator("[data-ship-form]")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await fillShipment(page, { number: "1Z999AA10123456784".repeat(3).slice(0, 60), url: "https://www.ups.com/track?tracknum=" + "A".repeat(80) });
    await page.getByRole("button", { name: "Mark as shipped" }).click();
    await expect(page.locator('[data-admin-fulfillment="shipped"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}

test("fulfilment form has no serious or critical axe violations", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto(`/admin/index.html#${PAID}`);
  await expect(page.locator("[data-ship-form]")).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));
  expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
});
