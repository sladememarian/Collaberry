import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the web (react-native-web) build. Tests target the
 * dev-only harness routes (e.g. /kanbanlab) so they run with zero backend —
 * pure UI/interaction regression coverage for the things that keep breaking
 * (lane scrolling, card drag, column enclosure).
 *
 * `webServer` auto-starts `expo start --web` on :8199 and reuses an already
 * running dev server if you have one open, so `npm run test:web` is one command.
 * (Port 8199 avoids the Windows-reserved 8027–8126 range that swallows Metro's
 * usual 8081.)
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
    baseURL: "http://localhost:8199",
    viewport: { width: 1280, height: 800 },
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run web -- --port 8199",
    url: "http://localhost:8199",
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
