import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a real build and a real local Supabase.
 *
 * These exist for the one thing vitest cannot touch: async server components
 * and the server actions behind them. Everything pure is unit-tested, the
 * database rules are pgTAP's job, and this layer only has to prove the whole
 * stack is wired together — a game can be played from the PIN to the crown.
 *
 * `next build && next start` rather than `next dev`: dev-mode compilation
 * makes the first navigation of every test slow enough to be flaky, and the
 * production build is what actually ships.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // one local database; parallel games race each other
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "en-GB",
    timezoneId: "Europe/Stockholm",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // The app is used on phones far more than on laptops, and the layout bug
    // that started this work only showed up at phone widths.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start -- --port 3100",
        url: "http://127.0.0.1:3100/api/health",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
