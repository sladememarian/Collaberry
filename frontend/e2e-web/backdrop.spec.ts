import { test, expect } from "@playwright/test";

/**
 * Backdrop system regression coverage.
 *
 * The backdrop is intentionally *animated* — a drifting dot-grid + cursor glow
 * (grid variant) and slow aurora bands (aurora variant). It's part of the app's
 * identity and should stay fun. But it once broke layout: its overscanned,
 * absolutely-positioned layers grew the document scroll width on web, adding a
 * phantom horizontal scrollbar that misaligned whole screens, and it sat fixed
 * to the viewport while content scrolled past.
 *
 * The fix was NOT to remove the animation — it's to clip it. The backdrop lives
 * inside an `overflow: hidden` absolute fill. These tests pin down both halves
 * of the contract so neither can regress:
 *  1. the animation is actually present (layers render, and the dot-grid moves),
 *  2. it never widens the page and stays glued to the viewport while scrolling.
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

test("kanban backdrop renders the animated dot-grid and it actually drifts", async ({ page }) => {
  await page.goto("/kanbanlab");
  await expect(page.getByTestId("app-backdrop-grid")).toBeAttached();

  const dotGrid = page.getByTestId("backdrop-dotgrid");
  await expect(dotGrid).toBeAttached();

  // The grid drifts on a slow ~16s loop. Sample its transform twice, a beat
  // apart — the values must differ, proving the animation is live (not the
  // static wash we replaced it with by mistake once).
  const first = await transformOf(page, "backdrop-dotgrid");
  await page.waitForTimeout(1200);
  const second = await transformOf(page, "backdrop-dotgrid");
  expect(
    first !== second,
    `dot-grid transform did not change (${first} → ${second}) — the backdrop animation is gone`,
  ).toBe(true);
});

test("kanban backdrop never causes horizontal page overflow", async ({ page }) => {
  await page.goto("/kanbanlab");
  await expect(page.getByTestId("app-backdrop-grid")).toBeAttached();
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
