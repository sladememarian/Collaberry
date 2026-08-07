import fs from "node:fs";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the web (react-native-web) build.
 *
 * Two flavours of spec live here:
 *   · the *lab specs (kanban, item, density, backdrop) drive dev-only harness
 *     routes and need no backend at all;
 *   · the shell specs (nav rail, profile, notifications, board search) sign in
 *     against the real API, because those features only exist inside the
 *     authenticated layout and there is no backend-free route that renders them.
 *
 * `webServer` auto-starts `expo start --web` on :8199 and reuses an already
 * running dev server if you have one open, so `npm run test:web` is one command.
 * (Port 8199 avoids the Windows-reserved 8027–8126 range that swallows Metro's
 * usual 8081.)
 */

/**
 * Expo reads `.env` when it bundles the app; the Playwright process does not.
 * Without this the specs would seed data against the default backend while the
 * page under test talks to the one in `.env` — the symptom is "seeded board 404s"
 * that reads like an app bug. Load it here so both ends agree.
 */
function loadDotEnv(): void {
  const file = path.resolve(__dirname, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue; // comments and blanks
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue; // a real env var wins
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}
loadDotEnv();

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
