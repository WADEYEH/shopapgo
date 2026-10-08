import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const baseURL = process.env.APGO_BASE_URL || "http://127.0.0.1:4173";
// The site the Worker serves (D41): the Next.js export in ../out. Build it first: npm run build:site.
const siteDirectory = process.env.APGO_SITE_DIR || "../out";
if (!existsSync(`${siteDirectory}/index.html`)) {
  throw new Error(`Browser tests run against the built site: run "npm run build:site" first (${siteDirectory}/index.html is missing).`);
}
const port = new URL(baseURL).port || "4173";

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.spec\.mjs/,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never", outputFolder: "test-results/html" }]],
  outputDir: "test-results/artifacts",
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
    browserName: "chromium",
    headless: true,
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/serve-static.mjs",
    env: { PORT: port, APGO_SITE_DIR: siteDirectory },
    url: `${baseURL}/`,
    // Never reuse a server left running: it may serve another folder or an older build.
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
