import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = ["privacy", "terms", "returns", "contact"];

for (const slug of pages) {
  test(`${slug}.html renders, is accessible and does not overflow`, async ({ page }) => {
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${slug}.html`);
      await expect(page.locator("h1")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
    }
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
}

test("cart footer reaches every policy page", async ({ page }) => {
  await page.goto("/cart.html");
  for (const [label, slug] of [["Privacy Policy", "privacy"], ["Terms of Sale", "terms"], ["Returns & Refunds", "returns"], ["Contact", "contact"]]) {
    await page.goto("/cart.html");
    await page.locator(".shop-footer__links").getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${slug}\\.html$`));
  }
});
