import { test, expect } from "@playwright/test";

/**
 * Backdrop system regression coverage.
 *
 * The old animated backdrop (drifting dot-grid / aurora bands) was absolutely
 * positioned with overscan beyond the viewport, which grew the document's
 * scroll width on web — screens gained a phantom horizontal scrollbar and
 * whole layouts drifted out of alignment. Its patterned texture also sat
 * fixed while content scrolled past, reading as broken.
 *
 * The replacement is a static, overflow-hidden gradient wash. These tests pin
 * down the load-bearing properties so a future backdrop change can't
 * reintroduce the bug class:
 *  1. the backdrop never widens the page (no horizontal overflow), and
 *  2. it stays glued to the viewport box even after heavy scrolling.
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
