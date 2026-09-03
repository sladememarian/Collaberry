import { test, expect } from "@playwright/test";

/**
 * Regression coverage for the failure that made sign-in look like a dead
 * button on the Daytona sandbox deployment.
 *
 * Daytona's preview proxy fronts every preview host with an anti-phishing
 * interstitial, and it decides who gets it by User-Agent — so the app's own
 * `fetch` was served the warning page too, not just address-bar navigations.
 * That page answers **200 with an HTML body**, so `res.ok` was true and the
 * client handed the raw HTML back as the payload. `signIn` then read
 * `access_token` off a string, got `undefined`, stored no session, and the
 * shell bounced straight back to /login: no error, nothing red in the network
 * tab, nothing in the console.
 *
 * The client now (a) sends the documented opt-out header on preview hosts and
 * (b) refuses any 2xx whose body isn't JSON. This spec locks in (b), which is
 * the part that turns the whole class of "something answered for the API"
 * failures — proxy walls, captive portals, a misrouted index.html — from
 * silence into a message. Backend-free: the API call is stubbed.
 */

const INTERSTITIAL = `<!doctype html>
<html lang="en"><head><title>Daytona Preview - Warning</title></head>
<body><h1>Preview URL Warning</h1>
<form action="/accept-daytona-preview-warning" method="POST"><button>Continue</button></form>
</body></html>`;

test("a 200 that isn't JSON surfaces an error instead of silently failing", async ({ page }) => {
  // Stand in for whatever sits in front of the API: 200, but HTML.
  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: INTERSTITIAL }),
  );

  await page.goto("/login");
  await page.getByPlaceholder("you@work.com").fill("someone@collaberry.dev");
  await page.locator("input").nth(1).fill("some-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();

  // The user must be told. Before the fix this assertion failed by timeout:
  // the screen sat there unchanged.
  await expect(page.getByText(/instead of JSON/i)).toBeVisible({ timeout: 15_000 });

  // And we must still be on the form, with no half-session written.
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate(() => localStorage.getItem("collaberry.token"))).toBeNull();
});

test("a well-formed 200 with no session in it is reported, not swallowed", async ({ page }) => {
  // JSON, but not the shape we asked for — the same silent-success trap one
  // level in. `request<TokenResponse>` is a cast, not a check, so without the
  // guard in AuthContext this stored nothing and said nothing.
  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) }),
  );

  await page.goto("/login");
  await page.getByPlaceholder("you@work.com").fill("someone@collaberry.dev");
  await page.locator("input").nth(1).fill("some-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText(/Couldn't sign in|didn't return a session/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate(() => localStorage.getItem("collaberry.token"))).toBeNull();
});
