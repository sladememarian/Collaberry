import { test, expect, type Page } from "@playwright/test";

import {
  createBoard,
  createCard,
  firstWorkspaceId,
  gotoBoard,
  registerUser,
  signIn,
  type SeededUser,
} from "./helpers/session";

/** A user with one board holding one card, ready to sign in. */
async function seedBoard(
  who: string,
  boardName: string,
  cardTitle: string,
): Promise<{ user: SeededUser; boardId: string }> {
  const user = await registerUser(who);
  const ws = await firstWorkspaceId(user);
  const board = await createBoard(user, ws, boardName);
  await createCard(user, board.id, { title: cardTitle, column_id: board.columns[0].id });
  return { user, boardId: board.id };
}

/**
 * Guards the two things a screenshot review kept catching by eye:
 *
 * 1. "Open full view" must land on the same black working canvas as the board.
 *    It used to open on the drifting aurora backdrop, which reads as noise
 *    behind a form.
 * 2. Light mode must leave *nothing* dark behind. The theme is delivered as CSS
 *    custom properties, so any color written as a literal silently opts out of
 *    the switch — this walks the rendered tree and fails on a dark fill that
 *    survived, rather than trusting the token file to be complete.
 */

/** Parse any computed color into [r,g,b,a]; null for transparent/unset. */
function parse(color: string): [number, number, number, number] | null {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(",").map((p) => Number(p.trim()));
  const [r, g, b] = parts;
  const a = parts.length > 3 ? parts[3] : 1;
  if (!a) return null;
  return [r, g, b, a];
}

function luminance([r, g, b]: [number, number, number, number]): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

async function setLight(page: Page) {
  await page.getByTestId("rail-theme-toggle").click();
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue("--ink-void").trim(),
        ),
      { timeout: 5_000 },
    )
    .toBe("255 255 255");
  await settle(page);
}

/**
 * Wait out the 220ms color transition in global.css. Without this, a surface
 * sampled mid-flight reads as a blend of the two themes — dark enough to look
 * like a color that never switched, which is a false failure.
 */
async function settle(page: Page) {
  await page.waitForTimeout(400);
}

/**
 * Every painted background in the tree that reads as a dark neutral.
 *
 * Two deliberate exclusions. Saturated fills are skipped: white-on-pink or
 * white-on-red is correct on paper as much as on black, so an accent chip is
 * not evidence of a missed switch. Mostly-transparent layers are skipped too —
 * a modal scrim dims what is behind it in either theme, by design.
 */
async function darkSurfaces(page: Page) {
  await settle(page);
  const painted = await page.evaluate(() => {
    const out: { tag: string; cls: string; color: string; w: number; h: number }[] = [];
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) continue;
      out.push({
        tag: el.tagName,
        cls: typeof el.className === "string" ? el.className : "",
        color: s.backgroundColor,
        w: r.width,
        h: r.height,
      });
    }
    return out;
  });

  return painted
    .map((p) => ({ ...p, rgba: parse(p.color) }))
    .filter((p): p is typeof p & { rgba: [number, number, number, number] } => p.rgba !== null)
    .filter((p) => p.rgba[3] > 0.5)
    .filter((p) => {
      const [r, g, b] = p.rgba;
      // An accent fill is saturated; a stranded dark neutral is not.
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      return spread < 60;
    })
    .filter((p) => luminance(p.rgba) < 0.45)
    .map((p) => `${p.tag}.${p.cls || "(no class)"} ${p.color} ${Math.round(p.w)}x${Math.round(p.h)}`);
}

test("Open full view lands on the board's black canvas, not the aurora backdrop", async ({
  page,
}) => {
  const { user, boardId } = await seedBoard("Canvas Tester", "Canvas Board", "A card to open");
  await signIn(page, user);
  await gotoBoard(page, boardId, "Canvas Board");

  // The board itself sits on the plain canvas.
  await expect(page.getByTestId("app-canvas-plain")).toBeVisible();
  await expect(page.getByTestId("app-backdrop-aurora")).toHaveCount(0);

  await page.getByText("A card to open").click();
  await page.getByRole("button", { name: "Open full view" }).click();

  // Expo Router keeps the board mounted underneath the item screen, so there are
  // two canvases in the tree at this point — the last one is the screen on top.
  const full = page.getByTestId("app-canvas-plain").last();
  await expect(full).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("app-backdrop-aurora")).toHaveCount(0);
  await expect(page.getByTestId("backdrop-dotgrid")).toHaveCount(0);

  // In dark, that canvas is true black — deliberately blacker than ink-void, so
  // the panels on top read as lifted.
  expect(parse(await full.evaluate((el) => getComputedStyle(el).backgroundColor))).toEqual([
    0, 0, 0, 1,
  ]);
});

test("light mode leaves no dark surface behind on the workspace", async ({ page }) => {
  const { user } = await seedBoard("Light Tester", "Light Board", "A listed card");
  await signIn(page, user);
  await page.goto("/");
  await expect(page.getByTestId("nav-rail")).toBeVisible({ timeout: 20_000 });

  await setLight(page);

  const stranded = await darkSurfaces(page);
  expect(stranded, `dark surfaces surviving in light mode:\n${stranded.join("\n")}`).toEqual([]);
});

test("light mode leaves no dark surface behind on a board or in the full view", async ({ page }) => {
  const { user, boardId } = await seedBoard("Light Board Tester", "Light Canvas", "A light card");
  await signIn(page, user);
  await page.goto("/");
  await expect(page.getByTestId("nav-rail")).toBeVisible({ timeout: 20_000 });
  await setLight(page);

  await gotoBoard(page, boardId, "Light Canvas");
  expect(await darkSurfaces(page)).toEqual([]);

  // The board canvas turns to cool paper rather than staying black.
  const canvas = await page
    .getByTestId("app-canvas-plain")
    .last()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(luminance(parse(canvas)!)).toBeGreaterThan(0.9);

  await page.getByText("A light card").click();
  await page.getByRole("button", { name: "Open full view" }).click();
  await expect(page.getByTestId("app-canvas-plain").last()).toBeVisible({ timeout: 15_000 });

  expect(await darkSurfaces(page)).toEqual([]);
});
