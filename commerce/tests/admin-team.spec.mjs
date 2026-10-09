// Back office: who is signed in, Activity and Members (PR 3-2), with /admin/api stubbed (tests/helpers/admin-mock.mjs).
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { TEAM_OWNER, mockAdminApi } from "./helpers/admin-mock.mjs";

const COLLEAGUE = "colleague@apgo.example";
const ACTIVITY = [
  { source: "admin", at: "2026-10-09T02:00:00.000Z", actor: TEAM_OWNER, via: "access", action: "member.added", target: COLLEAGUE, before: null, after: { email: COLLEAGUE, role: "member", status: "active" }, reason: '<img src=x onerror="window.__unsafe=true"> handles shipping', detail: {} },
  { source: "order", at: "2026-10-09T01:00:00.000Z", actor: COLLEAGUE, via: null, action: "order.shipped", target: "APGO-US-0123456789AB", before: null, after: null, reason: null, detail: { carrier: "UPS", trackingNumber: "1Z999AA10123456784" } },
  { source: "order", at: "2026-10-09T00:30:00.000Z", actor: "mcf-auto", via: null, action: "mcf.submitted", target: "APGO-US-0123456789AB", before: null, after: null, reason: null, detail: {} },
];

test("an owner sees who is signed in, adds a member with a reason, and gets the outcome", async ({ page }) => {
  const requests = await mockAdminApi(page);
  await page.goto("/admin/index.html");
  await expect(page.locator("[data-admin-whoami]")).toHaveText(`${TEAM_OWNER} · Owner`);
  const members = page.locator("[data-admin-members-section]");
  await expect(members).toBeVisible();
  await expect(members).toContainText("still uses the shared login");
  await expect(members.locator("[data-member]")).toHaveCount(1);

  const form = members.locator("[data-member-add]");
  await form.getByLabel("Email").fill(" Colleague@APGO.example ");
  await form.getByLabel("Reason (optional)").fill("Handles shipping");
  await form.getByRole("button", { name: "Add member" }).click();
  await expect(members.locator("[data-member]")).toHaveCount(2);
  await expect(members.locator(`[data-member="${COLLEAGUE}"]`)).toContainText("Member");
  await expect(members.locator("[data-members-message]")).toContainText("Owners emailed: 1.");
  await expect(members.locator("[data-members-message]")).toContainText("Cloudflare list sync is not set up.");
  // The browser trims an email field; the Worker lowercases it.
  expect(requests.team).toEqual([{ path: "/admin/api/members", contentType: "application/json", body: { email: "Colleague@APGO.example", role: "member", reason: "Handles shipping" } }]);
});

test("the last owner cannot be removed: the reason is shown and nothing changes", async ({ page }) => {
  await mockAdminApi(page);
  await page.goto("/admin/index.html");
  const owner = page.locator(`[data-member="${TEAM_OWNER}"]`);
  await owner.getByText("Change", { exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await owner.getByRole("button", { name: "Remove" }).click();
  await expect(page.locator("[data-members-message]")).toContainText("The last owner cannot be removed");
  await expect(page.locator("[data-member]")).toHaveCount(1);
});

test("an owner changes a role and removes a member; removed people move to Former members", async ({ page }) => {
  const requests = await mockAdminApi(page, { team: { members: [
    { email: TEAM_OWNER, role: "owner", status: "active", addedBy: "system", addedAt: "2026-10-09T00:00:00.000Z", updatedBy: "system", updatedAt: "2026-10-09T00:00:00.000Z" },
    { email: COLLEAGUE, role: "member", status: "active", addedBy: TEAM_OWNER, addedAt: "2026-10-09T00:00:00.000Z", updatedBy: TEAM_OWNER, updatedAt: "2026-10-09T00:00:00.000Z" },
  ] } });
  await page.goto("/admin/index.html");
  const row = page.locator(`[data-member="${COLLEAGUE}"]`);
  await row.getByText("Change", { exact: true }).click();
  await row.getByLabel(`Role for ${COLLEAGUE}`).selectOption("owner");
  await row.getByLabel(`Reason for the change to ${COLLEAGUE}`).fill("Second owner");
  await row.getByRole("button", { name: "Change role" }).click();
  await expect(page.locator("[data-members-message]")).toContainText(`Role changed for ${COLLEAGUE}`);
  await expect(page.locator(`[data-member="${COLLEAGUE}"]`)).toContainText("Owner");

  const again = page.locator(`[data-member="${COLLEAGUE}"]`);
  await again.getByText("Change", { exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await again.getByRole("button", { name: "Remove" }).click();
  await expect(page.locator(`[data-member="${COLLEAGUE}"]`)).toHaveCount(0);
  await expect(page.locator(".admin-member-former")).toContainText("Former members (1)");
  expect(requests.team.map((w) => [w.path, w.body.email, w.body.role ?? null])).toEqual([
    ["/admin/api/members/role", COLLEAGUE, "owner"],
    ["/admin/api/members/remove", COLLEAGUE, null],
  ]);
});

test("a member sees Activity but not Members", async ({ page }) => {
  const requests = await mockAdminApi(page, { team: { role: "member", activity: ACTIVITY } });
  await page.goto("/admin/index.html");
  await expect(page.locator("[data-admin-whoami]")).toHaveText(`${TEAM_OWNER} · Member`);
  await expect(page.locator("[data-admin-activity-section]")).toBeVisible();
  await expect(page.locator("[data-admin-members-section]")).toBeHidden();
  expect(requests.some((path) => path.startsWith("/admin/api/members"))).toBe(false);
});

test("Activity: everything newest first, as text; filter by person and dates; order links open the order", async ({ page }) => {
  const requests = await mockAdminApi(page, { team: { activity: ACTIVITY } });
  await page.goto("/admin/index.html");
  const section = page.locator("[data-admin-activity-section]");
  await section.getByRole("button", { name: "Show activity" }).click();
  const items = section.locator("[data-activity-action]");
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText("Member added");
  await expect(items.nth(0)).toContainText(`By ${TEAM_OWNER} (Cloudflare sign-in)`);
  await expect(items.nth(0)).toContainText('Reason: <img src=x onerror="window.__unsafe=true"> handles shipping');
  await expect(section.locator("img")).toHaveCount(0);
  await expect(items.nth(1)).toContainText("Marked shipped");
  await expect(items.nth(1)).toContainText("UPS 1Z999AA10123456784");

  await section.getByLabel("Person", { exact: true }).selectOption(COLLEAGUE);
  await section.getByLabel("From", { exact: true }).fill("2026-10-01");
  await section.getByLabel("To", { exact: true }).fill("2026-10-09");
  await section.getByRole("button", { name: "Show activity" }).click();
  await expect(items).toHaveCount(1);
  const query = new URLSearchParams(requests.filter((path) => path.startsWith("/admin/api/activity")).at(-1).split("?")[1]);
  expect(query.get("actor")).toBe(COLLEAGUE);
  // Local calendar days become an exact time range; "To" includes the whole day.
  expect(Date.parse(query.get("to")) - Date.parse(query.get("from"))).toBe(9 * 86_400_000);

  await items.first().getByRole("link", { name: "APGO-US-0123456789AB" }).click();
  await expect(page.locator("[data-admin-detail-body]")).toContainText("APGO-US-0123456789AB");
});

test("with Access sign-in on, a failed Cloudflare list update is shown and can be retried", async ({ page }) => {
  const requests = await mockAdminApi(page, { team: { accessSignIn: true, accessList: { configured: true, last: { status: "failed", at: "2026-10-09T01:00:00.000Z", detail: "Cloudflare answered HTTP 403 (error 10000)." } } } });
  await page.goto("/admin/index.html");
  const members = page.locator("[data-admin-members-section]");
  await expect(members).toContainText("Cloudflare list not updated");
  await expect(members).toContainText("HTTP 403 (error 10000)");
  await members.getByRole("button", { name: "Update Cloudflare list now" }).click();
  await expect(members).toContainText("Up to date as of");
  expect(requests.team.map((w) => w.path)).toEqual(["/admin/api/members/sync"]);
});

test("an older Worker without these endpoints: the order pages work and the new sections stay hidden", async ({ page }) => {
  await mockAdminApi(page, { team: null });
  await page.goto("/admin/index.html");
  await expect(page.locator(".admin-row")).toHaveCount(3);
  await expect(page.locator("[data-admin-whoami]")).toBeHidden();
  await expect(page.locator("[data-admin-activity-section]")).toBeHidden();
  await expect(page.locator("[data-admin-members-section]")).toBeHidden();
});

for (const width of [360, 1440]) {
  test(`Members and Activity have no serious accessibility problems and fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockAdminApi(page, { team: { activity: ACTIVITY } });
    await page.goto("/admin/index.html");
    await page.locator("[data-admin-activity-section]").getByRole("button", { name: "Show activity" }).click();
    await expect(page.locator("[data-activity-action]")).toHaveCount(3);
    await page.locator(`[data-member="${TEAM_OWNER}"]`).getByText("Change", { exact: true }).click();
    const results = await new AxeBuilder({ page }).include("[data-admin-activity-section]").include("[data-admin-members-section]").analyze();
    expect(results.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}

test("lists end cleanly: no stray text after Activity, Members or Customer messages", async ({ page }) => {
  await mockAdminApi(page, { team: { activity: ACTIVITY } });
  await page.route("**/admin/api/contact-messages**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ messages: [{ id: "CM-1", name: "Ada", email: "ada@example.com", message: "Hi", emailStatus: "sent", createdAt: "2026-10-09T00:00:00.000Z" }], nextBefore: null }) }));
  await page.goto("/admin/index.html");
  await page.locator("[data-admin-activity-section]").getByRole("button", { name: "Show activity" }).click();
  await page.getByRole("button", { name: "Show messages" }).click();
  await expect(page.locator("[data-activity-action]")).toHaveCount(3);
  await expect(page.locator("[data-message-id]")).toHaveCount(1);
  for (const selector of ["[data-admin-activity]", "[data-admin-members]", "[data-admin-messages]"]) {
    const strays = await page.locator(selector).evaluate((node) => [...node.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE).map((child) => child.textContent));
    expect(strays, selector).toEqual([]);
  }
});
