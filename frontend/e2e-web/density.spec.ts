import { test, expect } from "@playwright/test";

/**
 * Card density modes (compact / comfortable / expanded) on the kanban board.
 * Driven through the /kanbanlab harness. The mock cards are intentionally
 * sparse, so we verify density by measuring a card's rendered height: compact
 * collapses the body to a single meta line and must be shorter than expanded,
 * which adds a description slot. We also confirm the choice persists across a
 * reload (AsyncStorage → localStorage on web).
 */

const FIRST_CARD = "task-card-item-0-0";

async function cardHeight(page: import("@playwright/test").Page): Promise<number> {
  const box = await page.getByTestId(FIRST_CARD).first().boundingBox();
  expect(box).toBeTruthy();
  return box ? box.height : 0;
}

test("density control switches card size and compact is shorter than comfortable", async ({
  page,
}) => {
  await page.goto("/kanbanlab");
  await expect(page.getByTestId("density-control")).toBeVisible();
  await expect(page.getByTestId(FIRST_CARD).first()).toBeVisible();

  // Default is comfortable.
  const comfortable = await cardHeight(page);

  await page.getByTestId("density-compact").click();
  await page.waitForTimeout(150);
  const compact = await cardHeight(page);

  await page.getByTestId("density-expanded").click();
  await page.waitForTimeout(150);
  const expanded = await cardHeight(page);

  // Compact strictly collapses; expanded is at least as tall as comfortable.
  expect(compact).toBeLessThan(comfortable);
  expect(expanded).toBeGreaterThanOrEqual(comfortable - 1);
});

test("selected density survives a reload", async ({ page }) => {
  await page.goto("/kanbanlab");
  await expect(page.getByTestId(FIRST_CARD).first()).toBeVisible();

  await page.getByTestId("density-compact").click();
  await page.waitForTimeout(400); // let the AsyncStorage write settle

  await page.reload();
  await expect(page.getByTestId(FIRST_CARD).first()).toBeVisible();
  await page.waitForTimeout(400); // let the persisted density hydrate

  // The card comes back compact without touching the control. We prove that by
  // measuring it, then switching to comfortable: the rehydrated height must be
  // strictly shorter. If persistence had failed, it would have loaded as
  // comfortable and the two heights would match.
  const rehydrated = await cardHeight(page);

  await page.getByTestId("density-comfortable").click();
  await page.waitForTimeout(200);
  const comfortable = await cardHeight(page);

  expect(rehydrated).toBeLessThan(comfortable);
});
