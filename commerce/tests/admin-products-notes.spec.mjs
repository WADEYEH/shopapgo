// Back office v1 (PR 3-8): products and the owners' stop-selling switch (A4, M9-07), and internal order notes (I10,
// M9-18), with /admin/api stubbed (tests/helpers/admin-mock.mjs).
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { TEAM_OWNER, mockAdminApi } from "./helpers/admin-mock.mjs";

const PAID = "APGO-US-0123456789AB";

test("products list their status, stock, price and sales; a product opens on its own page", async ({ page }) => {
  await mockAdminApi(page, { stopped: ["d215"] });
  await page.goto("/admin/index.html#/products");
  await expect(page.locator("[data-product]")).toHaveCount(2);
  await expect(page.locator('[data-product="d204"] [data-on-sale="true"]')).toHaveText("On sale");
  await expect(page.locator('[data-product="d215"] [data-on-sale="false"]')).toHaveText("Stopped");
  await expect(page.locator('[data-product="d204"]')).toContainText("Stock not connected");
  await expect(page.locator('[data-product="d204"]')).toContainText("$59.99");
  await page.getByRole("link", { name: /Atomic Colored Glaze/ }).click();
  await expect(page).toHaveURL(/#\/products\/d204$/);
  await expect(page.locator("h1")).toHaveText("Atomic Colored Glaze");
  await expect(page.locator("[data-product-sales]")).toContainText("Sold this month");
  await expect(page.locator("[data-product-stock]")).toContainText("Out of stock below");
  await expect(page.locator("[data-product-details]")).toContainText("After washing & fully drying");
  await expect(page.getByRole("link", { name: "View on site" })).toHaveAttribute("href", "/products/atomic-colored-glaze");
});

test("an owner stops selling after confirming, sees it take effect and the change listed, then resumes", async ({ page }) => {
  const requests = await mockAdminApi(page);
  await page.goto("/admin/index.html#/products/d204");
  const sale = page.locator("[data-product-sale]");
  await expect(sale).toHaveAttribute("data-product-sale", "on");

  // Asking first; Keep selling sends nothing.
  await page.getByRole("button", { name: "Stop selling this product" }).click();
  const confirm = page.locator("[data-stop-confirm]");
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText("Carts that already have it cannot check out");
  await confirm.getByRole("button", { name: "Keep selling" }).click();
  await expect(confirm).toBeHidden();
  expect(requests.sales).toEqual([]);

  await page.getByRole("button", { name: "Stop selling this product" }).click();
  await confirm.getByLabel(/Reason/).fill("Quality check on a batch");
  await confirm.getByRole("button", { name: "Stop selling", exact: true }).click();
  await expect(page.locator("[data-product-sale]")).toHaveAttribute("data-product-sale", "off");
  await expect(page.locator("[data-product-outcome]")).toContainText("Atomic Colored Glaze is off sale");
  await expect(page.locator("h1 + [data-on-sale]")).toHaveText("Stopped");
  await expect(page.locator("[data-product-history]")).toContainText("Stopped selling · Quality check on a batch");
  await expect(page.locator("[data-product-history]")).toContainText(TEAM_OWNER);

  await page.getByRole("button", { name: "Resume selling" }).click();
  await expect(page.locator("[data-product-sale]")).toHaveAttribute("data-product-sale", "on");
  expect(requests.sales).toEqual([
    { method: "POST", contentType: "application/json", body: { onSale: false, reason: "Quality check on a batch" } },
    { method: "POST", contentType: "application/json", body: { onSale: true, reason: "" } },
  ]);
});

test("members see whether a product is on sale but cannot change it", async ({ page }) => {
  const requests = await mockAdminApi(page, { team: { role: "member" } });
  await page.goto("/admin/index.html#/products/d204");
  await expect(page.locator("[data-owner-only]")).toHaveText("Only owners can stop or resume selling.");
  await expect(page.getByRole("button", { name: "Stop selling this product" })).toHaveCount(0);
  await expect(page.locator('[data-nav="members"]')).toHaveCount(0);
  expect(requests.sales).toEqual([]);
});

test("an internal note is posted with the writer and time, shown in the timeline, and kept as written", async ({ page }) => {
  const requests = await mockAdminApi(page, { notes: { [PAID]: [{ id: 1, author: "colleague@apgo.example", body: "Customer asked about Friday.", at: "2026-09-30T06:00:00.000Z" }] } });
  await page.goto(`/admin/index.html#/orders/${PAID}`);
  const timeline = page.getByRole("region", { name: "Timeline", exact: true });
  await expect(timeline.locator("[data-note]")).toHaveCount(1);
  await expect(timeline.locator("[data-note]")).toContainText("colleague@apgo.example");
  const post = timeline.getByRole("button", { name: "Post note" });
  await expect(post).toBeDisabled();
  await timeline.getByLabel("Add an internal note").fill('Called back: <b>wants</b> it after Oct 15\nsecond line');
  await post.click();
  await expect(timeline.locator("[data-note]")).toHaveCount(2);
  const newest = timeline.locator("[data-note]").first();
  await expect(newest).toContainText("<b>wants</b> it after Oct 15");
  await expect(newest.locator("b")).toHaveCount(0);
  await expect(newest).toContainText(TEAM_OWNER);
  await expect(timeline.getByLabel("Add an internal note")).toHaveValue("");
  expect(requests.notes).toEqual([{ method: "POST", contentType: "application/json", body: { body: 'Called back: <b>wants</b> it after Oct 15\nsecond line' } }]);
  // Notes are never edited or deleted: posting is the only button there.
  await expect(timeline.getByRole("button")).toHaveCount(1);
});

test("a note the Worker refuses keeps the text and says why", async ({ page }) => {
  await mockAdminApi(page);
  await page.route(`**/admin/api/orders/${PAID}/notes`, (route) => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: { code: "note_too_long", message: "A note can be up to 1000 characters." } }) }));
  await page.goto(`/admin/index.html#/orders/${PAID}`);
  const timeline = page.getByRole("region", { name: "Timeline", exact: true });
  await timeline.getByLabel("Add an internal note").fill("Too long, says the server");
  await timeline.getByRole("button", { name: "Post note" }).click();
  await expect(timeline).toContainText("A note can be up to 1000 characters.");
  await expect(timeline.getByLabel("Add an internal note")).toHaveValue("Too long, says the server");
});

for (const lang of ["zh", "en"]) {
  test(`the product page and the stop-selling question have no serious accessibility problems (${lang})`, async ({ page }) => {
    await mockAdminApi(page, { lang });
    await page.goto("/admin/index.html#/products/d204");
    await page.locator("[data-stop-selling]").click();
    await expect(page.locator("[data-stop-confirm]")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => v.id)).toEqual([]);
  });
}
