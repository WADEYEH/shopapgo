// Back office (PR 3-7, I12, M9-20): each person's team-email switch next to their name, the last person cannot turn it
// off, and the Members list shows who gets them. Mocked /admin/api/* (tests/helpers/admin-mock.mjs).
import { expect, test } from "@playwright/test";
import { TEAM_OWNER, mockAdminApi } from "./helpers/admin-mock.mjs";

const COLLEAGUE = "colleague@apgo.example";
const STAMP = "2026-10-09T03:00:00.000Z";
const member = (email, role, teamAlerts) => ({ email, role, status: "active", addedBy: "system", addedAt: STAMP, updatedBy: "system", updatedAt: STAMP, teamAlerts });

test("a person turns their team emails off and on again", async ({ page }) => {
  const requests = await mockAdminApi(page, { team: { teamAlerts: true, othersGetAlerts: true } });
  await page.goto("/admin/index.html");
  const button = page.locator("[data-admin-team-alerts]");
  await expect(button).toHaveText("Team emails: on");
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await button.click();
  await expect(button).toHaveText("Team emails: off");
  await expect(page.locator("[data-admin-message]")).toContainText("You will no longer get the team emails.");
  await button.click();
  await expect(button).toHaveText("Team emails: on");
  expect(requests.team.filter((r) => r.path === "/admin/api/me/alerts").map((r) => [r.contentType, r.body])).toEqual([["application/json", { on: false }], ["application/json", { on: true }]]);
});

test("the last person getting team emails cannot turn them off", async ({ page }) => {
  await mockAdminApi(page, { team: { teamAlerts: true, othersGetAlerts: false } });
  await page.goto("/admin/index.html");
  const button = page.locator("[data-admin-team-alerts]");
  await button.click();
  await expect(page.locator("[data-admin-message]")).toContainText("At least one person must get the team emails.");
  await expect(button).toHaveText("Team emails: on");
});

test("a sign-in that is not on the member list has no switch; the Members list shows who gets team emails", async ({ page }) => {
  await mockAdminApi(page, { team: { teamAlerts: null, members: [member(TEAM_OWNER, "owner", false), member(COLLEAGUE, "member", true)] } });
  await page.goto("/admin/index.html");
  await expect(page.locator("[data-admin-whoami]")).toBeVisible();
  await expect(page.locator("[data-admin-team-alerts]")).toBeHidden();
  const members = page.locator("[data-admin-members-section]");
  await expect(members.locator(`[data-member="${TEAM_OWNER}"]`)).toContainText("Team emails: off");
  await expect(members.locator(`[data-member="${COLLEAGUE}"]`)).toContainText("Team emails: on");
});
