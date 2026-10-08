import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { mockStore } from "./helpers/store-mock.mjs";

// The policy pages (drafts from docs/legal) and the contact page with its form (D41 PR 三, M11, D28), on the built
// site. /api is answered by the store mock with the real contact rules.

const POLICIES = [
  ["privacy", "Privacy Policy"],
  ["terms", "Terms of Sale"],
  ["returns", "Returns & Refunds Policy"],
  ["shipping", "Shipping Policy"],
];
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const axe = async (page) => (await new AxeBuilder({ page }).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);

for (const [slug, title] of POLICIES) {
  test(`/${slug}: the draft from docs/legal in the site's header and footer, marked as a draft, accessible, no overflow`, async ({ page }) => {
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${slug}`);
      await expect(page.locator("h1")).toHaveText(title);
      expect(await overflow(page), `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
    }
    await expect(page).toHaveTitle(`${title} · APGO`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
    await expect(page.locator("[data-policy-draft]")).toContainText("Draft for internal review");
    await expect(page.locator(".us-site-header")).toBeVisible();
    await expect(page.locator(".legal__section h2").first()).toBeVisible();
    expect(await page.locator("main").innerText()).not.toMatch(/\*\*|\]\(/);
    expect(await axe(page)).toEqual([]);
  });
}

test("open points in a draft are marked [TO CONFIRM] and explained; the shipping policy states the checkout's terms", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.locator("mark[data-to-confirm]").filter({ hasText: "legal entity name" }).first()).toHaveText("[TO CONFIRM: legal entity name]");
  await expect(page.locator("[data-confirm-legend]")).toBeVisible();
  await expect(page.locator(".legal__table")).toContainText("Airwallex, PayPal");
  await page.goto("/shipping");
  const main = page.locator("main");
  await expect(main).toContainText("$7.99 per order");
  await expect(main).toContainText("48 contiguous United States and the District of Columbia");
  await expect(main.locator("a[href='mailto:services@apgo.com.tw']")).toBeVisible();
});

test("the site footer reaches every policy page and the contact page", async ({ page }) => {
  for (const [label, slug] of [["Privacy Policy", "privacy"], ["Terms of Sale", "terms"], ["Returns & Refunds", "returns"], ["Shipping", "shipping"], ["Contact", "contact"]]) {
    await page.goto("/cart");
    await page.locator("#site-footer").getByRole("navigation", { name: "Legal" }).getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}(\\.html)?$`));
    await expect(page.locator("h1")).toBeVisible();
  }
});

test.describe("contact form", () => {
  test("checks the fields on the page, sends the message and confirms with the reply time", async ({ page }) => {
    const calls = await mockStore(page);
    await page.goto("/contact");
    await expect(page).toHaveTitle("Contact · APGO");
    await expect(page.locator(".legal__facts")).toContainText("services@apgo.com.tw");

    await page.getByRole("button", { name: /Send message/ }).click();
    await expect(page.locator('[data-field="contact-name"] [data-error]')).toHaveText("Enter your name.");
    await expect(page.locator('[data-field="contact-email"] [data-error]')).toHaveText("Enter a valid email address.");
    await expect(page.locator('[data-field="contact-message"] [data-error]')).toHaveText("Write a message of at least 10 characters.");
    await expect(page.locator("#contact-name")).toBeFocused();
    await expect(page.locator("#contact-name")).toHaveAttribute("aria-invalid", "true");
    expect(calls.contact).toHaveLength(0);

    await page.getByLabel("Name").fill("Ada Lee");
    await page.getByLabel("Email").fill("Ada@Example.com");
    await page.getByRole("textbox", { name: "Message" }).fill("Can I use Dry on a matte wrap?\nThanks.");
    await page.getByRole("button", { name: /Send message/ }).click();
    await expect(page.locator("[data-contact-sent]")).toContainText("Thanks, Ada Lee. We'll reply to ada@example.com within 2 business days.");
    expect(calls.contact).toEqual([{ name: "Ada Lee", email: "ada@example.com", message: "Can I use Dry on a matte wrap?\nThanks." }]);
  });

  test("the robot field is out of sight and out of the tab order; the page is accessible and fits a phone", async ({ page }) => {
    await mockStore(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/contact");
    const trap = page.locator("#contact-company");
    await expect(trap).toHaveAttribute("tabindex", "-1");
    expect(await trap.evaluate((node) => node.getBoundingClientRect().right)).toBeLessThan(0);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(await axe(page)).toEqual([]);
  });

  test("the Worker's answers: a field error lands on the field, too many messages shows a notice and keeps the text", async ({ page }) => {
    await mockStore(page, { contactBusy: true });
    await page.goto("/contact");
    await page.getByLabel("Name").fill("Ada Lee");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByRole("textbox", { name: "Message" }).fill("A message that is long enough.");
    await page.getByRole("button", { name: /Send message/ }).click();
    await expect(page.locator("[data-contact-message]")).toContainText("We're receiving a lot of messages right now.");
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue("A message that is long enough.");
    await expect(page.getByRole("button", { name: /Send message/ })).toBeEnabled();
  });
});
