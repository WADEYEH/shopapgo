// PR 3-10 in the browser: the owners' refund panel (D51, D55, M9-25), customers and privacy requests (I7, E11, M9-13,
// M9-14, M11-05), reports and CSV exports (I8, I4, M9-06, M9-15, M9-16) and the payment lookup (M9-23), with
// /admin/api stubbed (tests/helpers/admin-mock.mjs).
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { mockAdminApi } from "./helpers/admin-mock.mjs";

const PAID = "APGO-US-0123456789AB";
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// ---------- refunds from the order page ----------

test("an owner refunds part of a shipped order: amount, reason, no email; the request and the result show on the page", async ({ page }) => {
  const requests = await mockAdminApi(page, { fulfilled: [PAID] });
  await page.goto(`/admin/index.html#/orders/${PAID}`);
  const refunds = page.locator("[data-order-refunds]");
  await expect(refunds).toContainText("Owners refund here with the Refund button");
  await refunds.getByRole("button", { name: "Refund", exact: true }).click();
  const form = page.locator("[data-refund-form]");
  await expect(form).toBeVisible();
  await expect(form).toContainText("You can refund up to $128.97.");
  await expect(page.locator("[data-refund-cancel]")).toHaveCount(0, { timeout: 1000 });

  // Checked in the page first: no reason, too much.
  await form.getByRole("button", { name: "Refund now" }).click();
  await expect(form).toContainText("Choose why you are refunding.");
  await form.getByLabel("Amount (USD)").fill("200");
  await form.getByLabel("Reason").selectOption("damaged");
  await form.getByRole("button", { name: "Refund now" }).click();
  await expect(form).toContainText("Enter an amount above $0 and up to $128.97.");
  expect(requests.refunds).toEqual([]);

  await form.getByLabel("Amount (USD)").fill("10.50");
  await form.getByLabel(/^Note/).fill("Cap cracked in transit");
  await form.getByLabel("Email the customer about the refund").uncheck();
  await expect(page.locator("[data-refund-summary]")).toHaveText("$10.50 goes back through Airwallex; the order stays as it is. The customer is not emailed.");
  await form.getByRole("button", { name: "Refund now" }).click();
  await expect(page.locator("[data-order-outcome]")).toContainText("Airwallex accepted the refund of $10.50");
  expect(requests.refunds).toHaveLength(1);
  const sent = requests.refunds[0];
  expect(sent.method).toBe("POST");
  expect(sent.contentType).toBe("application/json");
  expect(sent.body).toMatchObject({ amountCents: 1050, reason: "damaged", note: "Cap cracked in transit", notify: false, cancelFirst: false });
  expect(sent.body.key).toMatch(/^[0-9a-f-]{36}$/);
  const listed = page.locator("[data-refund-requests]");
  await expect(listed).toContainText("$10.50");
  await expect(listed).toContainText("Damaged or defective · Cap cracked in transit · customer not emailed");
});

test("an order not shipped is refunded only in full, cancelling it first; when Amazon cannot stop it the page says what to do", async ({ page }) => {
  const requests = await mockAdminApi(page, { refundOutcome: "not_cancelled" });
  await page.goto(`/admin/index.html#/orders/${PAID}`);
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  const form = page.locator("[data-refund-form]");
  await expect(form).toContainText("This order has not shipped, so it can only be refunded in full: $128.97.");
  await expect(form.getByLabel("Amount (USD)")).toBeDisabled();
  await expect(form.getByLabel(/Cancel the order first/)).toBeChecked();
  await form.getByLabel("Reason").selectOption("customer_request");
  await expect(page.locator("[data-refund-summary]")).toContainText("The order is cancelled first");
  await form.getByRole("button", { name: "Refund now" }).click();
  await expect(page.locator("[data-order-outcome]")).toContainText("The order could not be cancelled, so nothing was refunded");
  await expect(page.locator("[data-order-outcome]")).toContainText("refund after the customer returns it");
  expect(requests.refunds[0].body).toMatchObject({ amountCents: 12897, reason: "customer_request", notify: true, cancelFirst: true });
});

test("members never see the Refund button; an owner sees why when an order cannot be refunded", async ({ page }) => {
  await mockAdminApi(page, { team: { role: "member" }, fulfilled: [PAID] });
  await page.goto(`/admin/index.html#/orders/${PAID}`);
  await expect(page.locator("[data-order-refunds]")).toBeVisible();
  await expect(page.locator("[data-refund-panel]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Refund", exact: true })).toHaveCount(0);

  await mockAdminApi(page, { disputes: { [PAID]: [{ provider: "airwallex", id: "dsp_1", status: "open", providerStatus: "", amountCents: 12897, reason: "fraud", dueAt: "2026-10-12T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" }] } });
  await page.reload();
  await expect(page.locator('[data-refund-why="dispute_open"]')).toContainText("A dispute is open for this order");
});

// ---------- customers and privacy ----------

test("customers: the list, search, and one customer's orders, addresses, messages and notes", async ({ page }) => {
  const requests = await mockAdminApi(page);
  await page.goto("/admin/index.html#/customers");
  await expect(page.locator("h1")).toHaveText("Customers");
  await expect(page.locator("[data-customer]")).toHaveCount(2);
  await expect(page.locator(`[data-customer="${PAID}"]`)).toContainText("$178.96");
  await expect(page.locator(`[data-customer="${PAID}"]`)).toContainText("Subscribed");
  await page.getByRole("searchbox", { name: "Search customers" }).fill("chen");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/#\/customers\?q=chen$/);
  await expect(page.locator("[data-customer]")).toHaveCount(1);
  expect(requests.customers.some((query) => query.includes("q=chen"))).toBe(true);
  await page.getByRole("button", { name: "Clear search" }).click();
  // The list is drawn again when the Worker answers: sort only once the full list is back.
  await expect(page).toHaveURL(/#\/customers$/);
  await expect(page.locator("[data-customer]")).toHaveCount(2);
  await page.locator("[data-customers-sort]").selectOption("spent");
  await expect(page).toHaveURL(/#\/customers\?sort=spent$/);
  await expect(page.locator("[data-customer]")).toHaveCount(2);

  await page.getByRole("link", { name: "Ada Lee" }).click();
  await expect(page).toHaveURL(new RegExp(`#/customers/${PAID}$`));
  await expect(page.locator("h1")).toHaveText("Ada Lee");
  await expect(page.locator("[data-customer-orders] [data-order]")).toHaveCount(2);
  await expect(page.locator("[data-customer-addresses] address")).toHaveCount(2);
  await expect(page.locator("[data-customer-messages]")).toContainText("Where is my second bottle?");
  await page.getByLabel("Add a note (the customer never sees it)").fill("Prefers weekend delivery");
  await page.locator("[data-customer-notes]").getByRole("button", { name: "Post note" }).click();
  await expect(page.locator("[data-customer-notes-list]")).toContainText("Prefers weekend delivery");
  // The order page links to the customer.
  await page.goto(`/admin/index.html#/orders/${PAID}`);
  await page.locator("[data-customer-link]").click();
  await expect(page).toHaveURL(new RegExp(`#/customers/${PAID}$`));
});

test("privacy: record a request with its deadline, export the data, close it; delete waits for open orders, then needs the email typed", async ({ page }) => {
  const requests = await mockAdminApi(page, { erasureBlockers: [{ orderId: "APGO-US-4K7M2N9P3Q5R", code: "open_order" }] });
  await page.goto(`/admin/index.html#/customers/${PAID}`);
  const privacy = page.locator("[data-customer-privacy]");
  await expect(privacy).toContainText("No privacy requests.");
  await privacy.getByRole("button", { name: "Record a request" }).click();
  await privacy.getByLabel("The customer asks to").selectOption("delete");
  await privacy.getByRole("button", { name: "Record", exact: true }).click();
  await expect(privacy.locator('[data-privacy-request="open"]')).toContainText("Delete their data");
  await expect(privacy.locator('[data-privacy-request="open"]')).toContainText("Answer by");

  const download = page.waitForEvent("download");
  await privacy.getByRole("button", { name: "Export their data" }).click();
  expect((await download).suggestedFilename()).toBe(`apgo-customer-${PAID}.json`);
  await expect(privacy).toContainText("Send it to the customer securely");

  await privacy.getByRole("button", { name: "Delete their data" }).click();
  const box = page.locator("[data-erase-box]");
  await expect(box).toContainText("Kept: order amounts, items and the state shipped to");
  await expect(box).toContainText("Order APGO-US-4K7M2N9P3Q5R has not shipped or been cancelled.");
  await expect(page.locator("[data-erase-go]")).toHaveCount(0);
  await box.getByRole("button", { name: "Keep" }).click();

  await privacy.locator("[data-privacy-close]").click();
  await expect(privacy.locator('[data-privacy-request="done"]')).toContainText("Data deleted");
  expect(requests.customers).toContain("close deleted");
});

test("privacy: deleting asks for the email typed out, then the page says the data is gone", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto(`/admin/index.html#/customers/${PAID}`);
  await page.getByRole("button", { name: "Delete their data" }).click();
  const go = page.locator("[data-erase-go]");
  await expect(go).toBeDisabled();
  await page.getByLabel(/Type the customer's email to confirm/).fill("someone@example.com");
  await expect(go).toBeDisabled();
  await page.getByLabel(/Type the customer's email to confirm/).fill("Ada.Lee@example.com");
  await expect(go).toBeEnabled();
  await go.click();
  await expect(page.locator("h1")).toHaveText("Customer data deleted");
  await expect(page.locator("[data-customer-outcome]")).toContainText("Personal data removed from 2 orders");
});

test("the dashboard lists privacy requests to answer, late ones first, linked to the customer", async ({ page }) => {
  await mockAdminApi(page, { privacy: [{ id: "PR-1", kind: "delete", dueAt: "2026-10-05T00:00:00.000Z", handler: "owner@apgo.example", ref: PAID, daysLeft: -3, urgent: true, erased: false }] });
  await page.goto("/admin/index.html#/");
  const row = page.locator('[data-dashboard-privacy] [data-attention="privacy"]');
  await expect(row).toContainText("Privacy request: delete their data");
  await expect(row).toContainText("3 days late");
  await row.click();
  await expect(page).toHaveURL(new RegExp(`#/customers/${PAID}$`));
});

// ---------- reports and exports ----------

test("reports: a period, the numbers, per product and payment method, shipping vs Amazon, and the two CSV downloads", async ({ page }) => {
  const requests = await mockAdminApi(page);
  await page.goto("/admin/index.html#/reports");
  await expect(page.locator("h1")).toHaveText("Reports");
  await expect(page.locator('[data-preset="month"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-report-kpi="gross"]')).toContainText("$275.91");
  await expect(page.locator('[data-report-kpi="net"]')).toContainText("$265.91");
  await expect(page.locator("[data-report-products] [data-sku]")).toHaveCount(2);
  await expect(page.locator('[data-report-payments] [data-provider="paypal"]')).toContainText("$59.99");
  await expect(page.locator("[data-report-shipping]")).toContainText("−$1.84");
  await expect(page.locator("[data-report-shipping]")).toContainText("1 order has no estimate");
  await expect(page.locator("[data-report-range]")).toContainText("Asia/Taipei");

  await page.locator('[data-preset="7d"]').click();
  await expect(page).toHaveURL(/#\/reports\?preset=7d$/);
  await expect(page.locator('[data-preset="7d"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-report-days] .bars__bar")).toHaveCount(7);
  expect(requests.some((path) => path.includes("/admin/api/reports/sales?preset=7d"))).toBe(true);

  for (const kind of ["orders", "payments"]) {
    const download = page.waitForEvent("download");
    await page.locator(`[data-export="${kind}"]`).click();
    expect((await download).suggestedFilename()).toBe(`apgo-${kind}-2026-10-01-to-2026-10-31.csv`);
  }
  expect(requests.downloads).toEqual(["/admin/api/exports/orders.csv?preset=7d", "/admin/api/exports/payments.csv?preset=7d"]);

  await page.getByLabel("From", { exact: true }).fill("2026-10-09");
  await page.getByLabel("To", { exact: true }).fill("2026-10-01");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.locator(".notice")).toContainText("The end day is before the start day.");
});

// ---------- payment lookup ----------

test("payment lookup: an Airwallex payment shows its status and why it failed; an unknown PayPal order says so", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("/admin/index.html#/checkouts");
  const lookup = page.locator("[data-payment-lookup]");
  await lookup.getByLabel("Id", { exact: true }).fill("int_hkdm00000000demo");
  await lookup.getByRole("button", { name: "Look up" }).click();
  await expect(lookup.locator('[data-lookup-result="airwallex"]')).toContainText("REQUIRES_PAYMENT_METHOD");
  await expect(lookup.locator('[data-lookup-result="airwallex"]')).toContainText("issuer_declined · Do not honor");
  await lookup.getByLabel("Provider", { exact: true }).selectOption("paypal");
  await lookup.getByLabel("Id", { exact: true }).fill("5o190127tn364715t");
  await lookup.getByRole("button", { name: "Look up" }).click();
  await expect(lookup).toContainText("PayPal has no payment with this id.");
});

// ---------- languages, phones, accessibility ----------

test("the new pages are complete in Chinese", async ({ page }) => {
  await mockAdminApi(page, { lang: "zh", fulfilled: [PAID] });
  for (const [hash, title] of [["#/customers", "客戶"], [`#/customers/${PAID}`, "Ada Lee"], ["#/reports", "報表"]]) {
    await page.goto(`/admin/index.html${hash}`);
    await expect(page.locator("h1")).toHaveText(title);
    expect(await page.locator("main").innerText()).not.toMatch(/\b(customers|privacy|reports|refund|lookup)\.[a-zA-Z_]+/);
  }
  await page.goto(`/admin/index.html#/orders/${PAID}`);
  await page.getByRole("button", { name: "退款", exact: true }).click();
  await expect(page.locator("[data-refund-form]")).toContainText("最多可以退");
});

for (const width of [320, 390]) {
  test(`the new pages have no horizontal overflow at ${width}px`, async ({ page }) => {
    await mockAdminApi(page, { fulfilled: [PAID] });
    await page.setViewportSize({ width, height: 900 });
    for (const hash of ["#/customers", `#/customers/${PAID}`, "#/reports?preset=30d", "#/checkouts"]) {
      await page.goto(`/admin/index.html${hash}`);
      await expect(page.locator(".view-loading")).toHaveCount(0);
      await expect(page.locator("h1")).toBeVisible();
      expect(await overflow(page), `${hash} at ${width}px`).toBeLessThanOrEqual(0);
    }
    await page.goto(`/admin/index.html#/orders/${PAID}`);
    await page.getByRole("button", { name: "Refund", exact: true }).click();
    expect(await overflow(page), `refund panel at ${width}px`).toBeLessThanOrEqual(0);
  });
}

for (const [lang, hash] of [["en", "#/customers"], ["zh", `#/customers/${PAID}`], ["en", "#/reports"], ["zh", "#/reports"]]) {
  test(`no serious or critical axe violations: ${hash} in ${lang}`, async ({ page }) => {
    await mockAdminApi(page, { lang });
    await page.goto(`/admin/index.html${hash}`);
    await expect(page.locator(".view-loading")).toHaveCount(0);
    await expect(page.locator("h1")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((v) => ["serious", "critical"].includes(v.impact));
    expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
  });
}
