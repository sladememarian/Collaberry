import { test, expect } from "@playwright/test";

/**
 * Backdrop system regression coverage.
 *
 * Two separate backdrop treatments, and the split is intentional:
 *  - Ambient screens (Home, auth, item detail) get an *animated* backdrop —
 *    drifting dot-grid + cursor glow ("grid"), or slow aurora bands ("aurora").
 *    It's part of the app's identity and should stay fun.
 *  - The tasks/kanban board gets a *plain* solid void with NO ambient backdrop:
 *    the lanes are the focus there, and the ambient read as noise behind them.
 *
 * The animated backdrop once broke layout — its overscanned absolute layers
 * grew the document scroll width (phantom horizontal scrollbar, misaligned
 * screens) and sat fixed while content scrolled. The fix was to CLIP it inside
 * an overflow:hidden fill, not to remove it. These tests pin all of that down:
 *  1. animated screens actually animate (dot-grid drifts) and never overflow,
 *  2. the tasks board has no ambient backdrop element at all.
 */

async function assertNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  expect(
    overflow.scrollWidth,
    `document scrollWidth ${overflow.scrollWidth} exceeds viewport ${overflow.innerWidth} — backdrop is leaking past the viewport again`,
  ).toBeLessThanOrEqual(overflow.innerWidth + 1);
  expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);
}

/** Reads the CSS transform matrix of an element (identity → "none"). */
async function transformOf(page: import("@playwright/test").Page, testId: string) {
  return page.getByTestId(testId).evaluate((el) => getComputedStyle(el as HTMLElement).transform);
}

test("the ambient (login) backdrop renders the animated dot-grid and it drifts", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByTestId("app-backdrop-grid")).toBeAttached();

  const dotGrid = page.getByTestId("backdrop-dotgrid");
  await expect(dotGrid).toBeAttached();

  // The grid drifts on a slow ~16s loop. Sample its transform twice, a beat
  // apart — the values must differ, proving the animation is live.
  const first = await transformOf(page, "backdrop-dotgrid");
  await page.waitForTimeout(1200);
  const second = await transformOf(page, "backdrop-dotgrid");
  expect(
    first !== second,
    `dot-grid transform did not change (${first} → ${second}) — the backdrop animation is gone`,
  ).toBe(true);

  await assertNoHorizontalOverflow(page);
});

test("the tasks/kanban board has a plain void — no ambient backdrop", async ({ page }) => {
  await page.goto("/kanbanlab");
  await expect(page.getByTestId("kanbanlab")).toBeVisible();

  // The board must NOT mount any animated ambient layer — that's the whole
  // point of the "plain" variant the user asked for on the tasks view.
  await expect(page.getByTestId("app-backdrop-grid")).toHaveCount(0);
  await expect(page.getByTestId("app-backdrop-aurora")).toHaveCount(0);
  await expect(page.getByTestId("backdrop-dotgrid")).toHaveCount(0);

  await assertNoHorizontalOverflow(page);
});

test("item backdrop stays aligned with the viewport while the page scrolls", async ({ page }) => {
  await page.goto("/itemlab");
  const backdrop = page.getByTestId("app-backdrop-aurora");
  await expect(backdrop).toBeAttached();
  await assertNoHorizontalOverflow(page);

  const before = await backdrop.boundingBox();
  expect(before).toBeTruthy();

  // Scroll the item document hard, twice, letting rendering settle.
  for (let i = 0; i < 2; i++) {
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(300);
  }

  // The backdrop must still cover the viewport exactly — same box, no drift,
  // no gap opening up beneath the content ("background doesn't move" bug).
  const after = await backdrop.boundingBox();
  expect(after).toBeTruthy();
  if (!before || !after) return;
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);

  const viewport = page.viewportSize();
  if (!viewport) return;
  expect(after.width).toBeGreaterThanOrEqual(viewport.width - 2);
  expect(after.height).toBeGreaterThanOrEqual(viewport.height - 2);

  await assertNoHorizontalOverflow(page);
});
