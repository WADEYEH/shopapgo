import { defineConfig } from "@playwright/test";

const baseURL = process.env.APGO_BASE_URL || "http://127.0.0.1:4173";
const prototypeDirectory = process.env.APGO_PROTOTYPE_DIR || "prototype";
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
    env: { PORT: port, APGO_PROTOTYPE_DIR: prototypeDirectory },
    url: `${baseURL}/`,
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
