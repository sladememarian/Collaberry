import { test, expect, type Page } from "@playwright/test";

import { API, gotoHome, registerUser, signIn } from "./helpers/session";

/**
 * The profile panel: rename yourself, change your password, switch the theme.
 *
 * The rename path is the interesting one. `display_name` is a JWT *claim*, so
 * the server answers a profile PATCH with a re-signed token rather than just a
 * user row — presence-service labels live cursors from the token, so keeping the
 * old one would leave the rename invisible to everyone else on the board. These
 * specs assert the token actually rotates, not merely that the name re-renders.
 *
 * The theme picker applies on tap, not on save: it's a preview you watch behind
 * the panel.
 */

async function openProfile(page: Page) {
  await page.getByTestId("nav-rail").getByLabel("Profile", { exact: true }).click();
  await expect(page.getByTestId("profile-panel")).toBeVisible();
}

/** The `--ink-void` CSS var is the whole background stack's root — dark vs light. */
function inkVoid(page: Page): Promise<string> {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--ink-void").trim(),
  );
}

function storedToken(page: Page): Promise<string | null> {
  return page.evaluate(() => window.localStorage.getItem("collaberry.token"));
}

test("renaming yourself re-signs the token and shows the new name in the rail", async ({ page }) => {
  const user = await registerUser("Original Name");
  await signIn(page, user);
  await gotoHome(page);
  await openProfile(page);

  const before = await storedToken(page);
  await page.getByTestId("profile-name").fill("Renamed Person");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByTestId("profile-saved")).toBeVisible();

  // The stored token must have rotated — a rename that only updates the cached
  // user object leaves presence-service labelling this person by their old name.
  const after = await storedToken(page);
  expect(after).not.toBeNull();
  expect(after).not.toBe(before);

  // And the new claim is really in it.
  const claim = await page.evaluate((t) => {
    const payload = JSON.parse(atob(t!.split(".")[1]));
    return payload.name as string;
  }, after);
  expect(claim).toBe("Renamed Person");

  // Visible in the expanded rail, which reads from the session.
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByTestId("rail-toggle").click();
  await expect(page.getByTestId("nav-rail").getByText("Renamed Person")).toBeVisible();

  // And it survives a reload, so it was persisted rather than held in memory.
  await page.reload();
  await expect(page.getByTestId("nav-rail").getByText("Renamed Person")).toBeVisible({
    timeout: 20_000,
  });
});

test("Save is inert until something actually changes", async ({ page }) => {
  const user = await registerUser("Dirty Check");
  await signIn(page, user);
  await gotoHome(page);
  await openProfile(page);

  const save = page.getByRole("button", { name: "Save changes" });
  await expect(save).toBeDisabled();

  // Retyping the same name is not a change.
  await page.getByTestId("profile-name").fill("Dirty Check");
  await expect(save).toBeDisabled();

  // Whitespace-only is not a change either.
  await page.getByTestId("profile-name").fill("  Dirty Check  ");
  await expect(save).toBeDisabled();

  await page.getByTestId("profile-name").fill("Actually Different");
  await expect(save).toBeEnabled();
});

test("switching to the light theme repaints immediately and persists", async ({ page }) => {
  const user = await registerUser("Theme Tester");
  await signIn(page, user);
  await gotoHome(page);
  await openProfile(page);

  // Dark is the default: a near-black void.
  expect(await inkVoid(page)).toBe("10 10 12");

  // Applies on tap, with no save — the panel is a preview. Scoped to the panel
  // because the rail's own toggle is labelled "Light theme" and would match too.
  await page.getByTestId("profile-panel").getByRole("button", { name: "Light" }).click();
  await expect.poll(() => inkVoid(page), { timeout: 5_000 }).toBe("255 255 255");

  // Purple becomes pink in light, per the brief; blue stays blue.
  const [purple, blue] = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return [s.getPropertyValue("--brand-purple").trim(), s.getPropertyValue("--brand-blue").trim()];
  });
  expect(purple).toBe("219 39 119"); // pink
  expect(blue).toBe("37 99 235"); // still blue

  // Survives a reload — the choice is stored, not per-session.
  await page.reload();
  await expect(page.getByTestId("nav-rail")).toBeVisible({ timeout: 20_000 });
  expect(await inkVoid(page)).toBe("255 255 255");

  // And back again, from the rail's own toggle this time.
  await page.getByTestId("rail-theme-toggle").click();
  await expect.poll(() => inkVoid(page), { timeout: 5_000 }).toBe("10 10 12");
});

test("a password change requires the current password and is enforced by the server", async ({
  page,
}) => {
  const user = await registerUser("Password Tester");
  await signIn(page, user);
  await gotoHome(page);
  await openProfile(page);

  // Too-short new password is flagged inline rather than sent.
  await page.getByTestId("profile-new-password").fill("short");
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();

  // A wrong current password must be refused by the server, not accepted locally.
  await page.getByTestId("profile-current-password").fill("definitely-not-my-password");
  await page.getByTestId("profile-new-password").fill("brand-new-password-2");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("profile-error")).toBeVisible();
  await expect(page.getByTestId("profile-saved")).toHaveCount(0);

  // The real one goes through.
  await page.getByTestId("profile-current-password").fill(user.password);
  await page.getByTestId("profile-new-password").fill("brand-new-password-2");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("profile-saved")).toBeVisible();

  // And it *stays* visible. Saving swaps in a re-signed session, and a re-seed
  // effect that watched the user object would wipe this line on the frame it
  // appeared — a confirmation you can't read is no confirmation.
  await page.waitForTimeout(1_000);
  await expect(page.getByTestId("profile-saved")).toBeVisible();

  // Prove it at the API: the new password logs in, the old one no longer does.
  const login = (password: string) =>
    fetch(`${API}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password }),
    }).then((r) => r.status);

  expect(await login("brand-new-password-2")).toBe(200);
  expect(await login(user.password)).toBe(401);
});

test("an abandoned edit doesn't reappear the next time the panel opens", async ({ page }) => {
  const user = await registerUser("Reseed Tester");
  await signIn(page, user);
  await gotoHome(page);
  await openProfile(page);

  await page.getByTestId("profile-name").fill("Never Saved");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("profile-panel")).toHaveCount(0);

  await openProfile(page);
  // Re-seeded from the live session — showing the abandoned draft would read as
  // if it had been saved.
  await expect(page.getByTestId("profile-name")).toHaveValue("Reseed Tester");
});

test("the profile panel closes on backdrop press and on Escape", async ({ page }) => {
  const user = await registerUser("Dismiss Tester");
  await signIn(page, user);
  await gotoHome(page);

  await openProfile(page);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("profile-panel")).toHaveCount(0);

  await openProfile(page);
  // Top-left corner is backdrop, well clear of the centred dialog.
  await page.mouse.click(8, 8);
  await expect(page.getByTestId("profile-panel")).toHaveCount(0);
});
