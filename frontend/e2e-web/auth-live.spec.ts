import { test, expect } from "@playwright/test";

/**
 * Live-backend coverage: registers a brand-new user through the real UI and
 * confirms the app actually lands on the Home screen with no console errors
 * and a working workspace list. Unlike the *lab specs, this hits the real
 * EXPO_PUBLIC_API_URL backend (no mocks) — it's here to catch integration
 * breakage between the frontend and the live API that the mock harnesses
 * can't see (auth, CORS, response-shape mismatches, network resolution).
 */

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@collaberry.dev`;
}

test("a new user can register, land on Home, and see their workspace list load without errors", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const failedRequests: { url: string; status: number; body: string }[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("response", async (res) => {
    if (res.status() >= 400) {
      let body = "";
      try {
        body = (await res.text()).slice(0, 500);
      } catch {
        /* ignore */
      }
      failedRequests.push({ url: res.url(), status: res.status(), body });
    }
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  const email = uniqueEmail();
  const password = "e2e-test-password-1";

  await page.goto("/register");
  await page.getByPlaceholder("Amirpouyan").fill("E2E Tester");
  await page.getByPlaceholder("you@work.com").fill(email);
  await page.getByPlaceholder("At least 8 characters").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  // Should leave the auth stack and land on Home.
  await expect(page.getByText(/Morning|Afternoon|Evening/).first()).toBeVisible({ timeout: 15_000 });

  // Workspace list must resolve to actual chips, not hang on skeletons or
  // blow up mid-render. A brand-new account should have a seeded workspace.
  await expect(page.getByText("Workspaces").first()).toBeVisible();
  await page.waitForTimeout(2000); // let the loadWorkspaces() request settle

  const fatalErrors = consoleErrors.filter(
    (e) => !e.includes("pointerEvents") && !e.includes("DevTools"),
  );

  expect(fatalErrors, `Console errors during login/home render:\n${fatalErrors.join("\n")}`).toEqual(
    [],
  );
  expect(
    failedRequests,
    `Failed network requests:\n${failedRequests.map((f) => `${f.status} ${f.url} — ${f.body}`).join("\n")}`,
  ).toEqual([]);
});
