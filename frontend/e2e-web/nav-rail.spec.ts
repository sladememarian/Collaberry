import { test, expect } from "@playwright/test";

import { createBoard, firstWorkspaceId, gotoBoard, gotoHome, registerUser, signIn } from "./helpers/session";

/**
 * The nav rail. Three things here are load-bearing and easy to break silently:
 *
 *   1. it's a real flex sibling of the screen content, not an absolute overlay —
 *      an overlay would sit on top of the board's horizontal scroller and eat
 *      drag gestures near the left edge, exactly where you grab a card leaving
 *      the first lane;
 *   2. the expanded/collapsed choice persists, and restores by jumping rather
 *      than animating on every launch;
 *   3. below RAIL_MIN_WIDTH (720) it becomes a floating button + overlay, because
 *      a permanent rail on a phone-width window eats the board.
 */

const COLLAPSED_W = 64;
const EXPANDED_W = 210;

/**
 * Scope every rail assertion to the rail itself. The Home header renders its own
 * "Collaberry" word-mark plus Server settings / Sign out buttons, so unscoped
 * label lookups are ambiguous and would pass or fail for the wrong reasons.
 */
function rail(page: import("@playwright/test").Page) {
  return page.getByTestId("nav-rail");
}

async function railWidth(page: import("@playwright/test").Page): Promise<number> {
  return page.getByTestId("nav-rail").evaluate((el) => el.getBoundingClientRect().width);
}

test("the rail renders collapsed by default and expands to labelled entries", async ({ page }) => {
  const user = await registerUser("Rail Tester");
  await signIn(page, user);
  await gotoHome(page);

  expect(await railWidth(page)).toBeCloseTo(COLLAPSED_W, 0);
  // Collapsed shows icons only — no text labels inside the rail.
  await expect(rail(page).getByText("Collaberry", { exact: true })).toHaveCount(0);
  await expect(rail(page).getByText("Home", { exact: true })).toHaveCount(0);

  await page.getByTestId("rail-toggle").click();
  await expect.poll(() => railWidth(page), { timeout: 5_000 }).toBeGreaterThan(EXPANDED_W - 10);
  await expect(rail(page).getByText("Collaberry", { exact: true })).toBeVisible();
  await expect(rail(page).getByText("Home", { exact: true })).toBeVisible();
  await expect(rail(page).getByText(user.displayName)).toBeVisible();
  await expect(rail(page).getByText(user.email)).toBeVisible();

  await page.getByTestId("rail-toggle").click();
  await expect.poll(() => railWidth(page), { timeout: 5_000 }).toBeLessThan(COLLAPSED_W + 10);
  await expect(rail(page).getByText("Home", { exact: true })).toHaveCount(0);
});

test("the expanded choice survives a reload", async ({ page }) => {
  const user = await registerUser("Rail Persist");
  await signIn(page, user);
  await gotoHome(page);

  await page.getByTestId("rail-toggle").click();
  await expect.poll(() => railWidth(page), { timeout: 5_000 }).toBeGreaterThan(EXPANDED_W - 10);

  await page.reload();
  await expect(page.getByTestId("nav-rail")).toBeVisible({ timeout: 20_000 });

  // Restored expanded — and by jumping, so it's already at full width rather
  // than sliding open. Assert without polling to catch a stray open animation.
  await expect(rail(page).getByText("Collaberry", { exact: true })).toBeVisible();
  expect(await railWidth(page)).toBeGreaterThan(EXPANDED_W - 10);
});

test("the rail occupies its own column instead of overlaying the screen", async ({ page }) => {
  const user = await registerUser("Rail Layout");
  await signIn(page, user);
  await gotoHome(page);

  const rail = await page.getByTestId("nav-rail").boundingBox();
  expect(rail).toBeTruthy();
  if (!rail) return;

  // Nothing from the screen content may start left of the rail's right edge.
  // If the rail ever became `position: absolute`, this is the assertion that
  // catches it — and with it the swallowed card-drag gestures.
  const position = await page
    .getByTestId("nav-rail")
    .evaluate((el) => getComputedStyle(el).position);
  expect(position).not.toBe("absolute");
  expect(position).not.toBe("fixed");

  const greeting = page.getByText(/Morning|Afternoon|Evening/).first();
  await expect(greeting).toBeVisible();
  const box = await greeting.boundingBox();
  expect(box).toBeTruthy();
  if (box) expect(box.x).toBeGreaterThanOrEqual(rail.x + rail.width - 1);
});

test("a narrow window swaps the rail for a floating button and overlay", async ({ page }) => {
  const user = await registerUser("Rail Narrow");
  await signIn(page, user);
  await gotoHome(page);

  // Under RAIL_MIN_WIDTH (720) the persistent rail must yield the width.
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(page.getByTestId("nav-rail")).toHaveCount(0);
  const fab = page.getByTestId("nav-rail-fab");
  await expect(fab).toBeVisible();

  // The overlay opens expanded (there's no room for a guessing-game icon strip),
  // so its labels render as text. "Light theme" and "Close menu" are rail-only,
  // unlike "Collaberry", which the Home header also renders.
  await fab.click();
  await expect(page.getByLabel("Close menu")).toBeVisible();
  await expect(page.getByText("Light theme", { exact: true })).toBeVisible();

  // Tapping the scrim closes it.
  await page.mouse.click(560, 400);
  await expect(page.getByLabel("Close menu")).toHaveCount(0);

  // Widening brings the persistent rail back.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByTestId("nav-rail")).toBeVisible();
  await expect(page.getByTestId("nav-rail-fab")).toHaveCount(0);
});

test("the rail's Home entry navigates back from a board", async ({ page }) => {
  const user = await registerUser("Rail Nav");
  const ws = await firstWorkspaceId(user);
  const board = await createBoard(user, ws, "Rail Nav Board");
  await signIn(page, user);
  await gotoBoard(page, board.id, "Rail Nav Board");

  await rail(page).getByLabel("Home", { exact: true }).click();

  await expect(page.getByText(/Morning|Afternoon|Evening/).first()).toBeVisible({ timeout: 20_000 });
});

test("the rail's Server settings entry reaches the settings screen", async ({ page }) => {
  const user = await registerUser("Rail Settings");
  await signIn(page, user);
  await gotoHome(page);

  await rail(page).getByLabel("Server settings", { exact: true }).click();
  await expect(page.getByTestId("settings-active-url")).toBeVisible({ timeout: 20_000 });

  // Settings deliberately lives outside the authenticated shell — it's the
  // escape hatch when the app points at an unreachable backend and you can't
  // sign in — so the rail is absent and the screen carries its own way back.
  await expect(page.getByTestId("nav-rail")).toBeHidden();
  await page.getByLabel("Go back").click();
  await expect(page.getByTestId("nav-rail")).toBeVisible({ timeout: 20_000 });
});

test("signing out from the rail returns to login and forgets the session", async ({ page }) => {
  const user = await registerUser("Rail Signout");
  await signIn(page, user);
  await gotoHome(page);

  await rail(page).getByLabel("Sign out", { exact: true }).click();

  await expect(page.getByPlaceholder("you@work.com")).toBeVisible({ timeout: 20_000 });
  // The stored token must actually be gone, not just navigated away from —
  // otherwise a reload silently signs back in.
  const token = await page.evaluate(() => window.localStorage.getItem("collaberry.token"));
  expect(token).toBeNull();
});
