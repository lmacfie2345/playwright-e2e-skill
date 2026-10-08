import { defineConfig, devices } from "@playwright/test";

// Base URL and credentials come from the environment (rule 12): CI variables, or a git-ignored .env file
// loaded here, e.g. with `import "dotenv/config";`.
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true, // rule 9: every test is independent and runs in parallel
  // Cap workers to what the environment's rate limits allow (discovery.md); Playwright's default elsewhere.
  ...(process.env.CI ? { workers: 2 } : {}),
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0, // retries surface flakiness in the report; they never hide it
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/setup/global-setup.ts",
  globalTeardown: "./tests/e2e/setup/global-teardown.ts",
  use: {
    baseURL,
    // Only set this when the app uses a test-ID attribute other than Playwright's default, data-testid.
    // testIdAttribute: "data-test",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      testMatch: /.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
});
