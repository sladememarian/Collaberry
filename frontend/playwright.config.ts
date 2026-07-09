import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the web (react-native-web) build. Tests target the
 * dev-only harness routes (e.g. /kanbanlab) so they run with zero backend —
 * pure UI/interaction regression coverage for the things that keep breaking
 * (lane scrolling, card drag, column enclosure).
 *
 * `webServer` auto-starts `expo start --web` on :8081 and reuses an already
 * running dev server if you have one open, so `npm run test:web` is one command.
 */
export default defineConfig({
  testDir: "./e2e-web",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:8081",
    viewport: { width: 1280, height: 800 },
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run web",
    url: "http://localhost:8081",
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
