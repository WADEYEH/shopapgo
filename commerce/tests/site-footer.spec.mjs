// The site's footer and 404 page (phase 2 step 8, owner decisions 2026-10-08): on phones the footer's guide list shows
// Home and All guides with a button for the rest; the checkout's footer is only the policies and Contact; unknown
// pages get the branded 404 page (app/global-not-found.js, out/404.html). Runs against the built site.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { mockStore, seedCart } from "./helpers/store-mock.mjs";

test.describe("footer guide list", () => {
  test("on a phone: Home and All guides, the rest behind a button that opens and closes the list", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockStore(page);
    await page.goto("/products");
    const explore = page.locator("#site-footer").getByRole("navigation", { name: "Explore" });
    // A CSS locator: role queries skip the hidden links, which is what this test checks.
    const links = explore.locator("li a");
    await expect(links.nth(0)).toHaveText("Home");
    await expect(links.nth(1)).toHaveText("All guides");
    await expect(links.nth(2)).toBeHidden();
    const more = explore.getByRole("button", { name: /More guides \(\d+\)/ });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    const total = await links.count();
    expect(total).toBeGreaterThan(10);
    await more.click();
    await expect(explore.getByRole("button", { name: /Fewer guides/ })).toHaveAttribute("aria-expanded", "true");
    await expect(links.nth(total - 1)).toBeVisible();
    await explore.getByRole("button", { name: /Fewer guides/ }).click();
    await expect(links.nth(2)).toBeHidden();
  });

  test("on a desktop: the whole list, no button", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockStore(page);
    await page.goto("/products");
    const explore = page.locator("#site-footer").getByRole("navigation", { name: "Explore" });
    await expect(explore.getByRole("link").last()).toBeVisible();
    await expect(explore.getByRole("button")).toBeHidden();
  });
});

test("the checkout's footer is only the policies and Contact", async ({ page }) => {
  await mockStore(page);
  await seedCart(page, [{ sku: "d204", qty: 1 }]);
  await page.goto("/checkout");
  const footer = page.locator("#site-footer");
  await expect(footer.getByRole("navigation", { name: "Legal" }).getByRole("link")).toHaveText(["Privacy Policy", "Terms of Sale", "Returns & Refunds", "Shipping", "Contact"]);
  await expect(footer.getByRole("navigation", { name: "Explore" })).toHaveCount(0);
  await expect(footer.getByText("services@apgo.com.tw")).toHaveCount(0);
  // Every other store page keeps the full footer.
  await page.goto("/cart");
  await expect(page.locator("#site-footer").getByRole("navigation", { name: "Explore" })).toHaveCount(1);
});

test.describe("404 page", () => {
  for (const width of [390, 1440]) {
    test(`is the site's own page with the way back, at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockStore(page);
      // The Worker answers any unknown path with this file (not_found_handling = "404-page").
      await page.goto("/404.html");
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page).toHaveTitle("Page not found · APGO");
      await expect(page.locator("h1")).toHaveText("Page not found.");
      const next = page.getByRole("navigation", { name: "Where to go next" });
      await expect(next.getByRole("link", { name: /Shop APGO/ })).toHaveAttribute("href", "/products");
      await expect(next.getByRole("link", { name: /Read the guides/ })).toHaveAttribute("href", "/us/guides");
      await expect(next.getByRole("link", { name: /Home/ })).toHaveAttribute("href", "/");
      await expect(page.locator(".us-site-header")).toBeVisible();
      await expect(page.locator("#site-footer")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => v.id)).toEqual([]);
    });
  }
});
