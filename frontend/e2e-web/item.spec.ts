import { test, expect, type Page } from "@playwright/test";

/**
 * Coverage for the item-detail pieces that don't need a live backend —
 * estimation parsing/help, the calendar date picker, and comments —
 * exercised against the mock harness at /itemlab (see app/itemlab.tsx).
 */

const LAB = "/itemlab";

async function openLab(page: Page) {
  await page.goto(LAB);
  await expect(page.getByText("Item Lab").first()).toBeVisible();
}

test("estimation input parses XdYh and live-renders a human-readable preview", async ({ page }) => {
  await openLab(page);

  const input = page.getByTestId("estimation-input");
  await input.fill("2d3h");
  await input.blur();
  await expect(page.getByTestId("estimation-preview")).toHaveText("2 days and 3 hours");

  // Case-insensitive on d/h.
  await input.fill("2D3H");
  await input.blur();
  await expect(page.getByTestId("estimation-preview")).toHaveText("2 days and 3 hours");

  // Days-only / hours-only.
  await input.fill("1d");
  await input.blur();
  await expect(page.getByTestId("estimation-preview")).toHaveText("1 day");

  await input.fill("3h");
  await input.blur();
  await expect(page.getByTestId("estimation-preview")).toHaveText("3 hours");

  // Unparseable input is flagged rather than silently accepted.
  await input.fill("not a duration");
  await input.blur();
  await expect(page.getByTestId("estimation-preview")).toHaveText("Doesn't look like a valid estimate");
});

test("the estimation help icon opens a format explainer on hover and on tap", async ({ page }) => {
  await openLab(page);

  const icon = page.getByTestId("estimation-help-icon");
  await expect(page.getByTestId("estimation-help-tooltip")).toHaveCount(0);
  await icon.hover();
  await expect(page.getByTestId("estimation-help-tooltip")).toBeVisible();
  await expect(page.getByTestId("estimation-help-tooltip")).toContainText("2d3h");

  // Tap opens the fallback modal dialog too.
  await icon.click();
  await expect(page.getByText("How to write an estimate")).toBeVisible();
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(page.getByText("How to write an estimate")).toHaveCount(0);
});

test("the calendar date picker highlights today, selects a date, and clears it", async ({ page }) => {
  await openLab(page);

  await expect(page.getByTestId("start-date")).toHaveText("Set date");
  await page.getByTestId("start-date").click();
  await expect(page.getByTestId("date-picker-dialog")).toBeVisible();

  const todayIso = new Date().toISOString().slice(0, 10);
  const todayCell = page.getByTestId(`date-picker-day-${todayIso}`);
  await expect(todayCell).toBeVisible();

  // Pick the 15th of the currently-shown month as a concrete, always-present
  // selectable day distinct from "today" in most runs.
  const y = new Date().getFullYear();
  const m = String(new Date().getMonth() + 1).padStart(2, "0");
  const pickIso = `${y}-${m}-15`;
  await page.getByTestId(`date-picker-day-${pickIso}`).click();

  await expect(page.getByTestId("date-picker-dialog")).toHaveCount(0);
  await expect(page.getByTestId("start-date")).not.toHaveText("Set date");

  // Clearing goes back through the same dialog.
  await page.getByTestId("start-date").click();
  await page.getByTestId("date-picker-clear").click();
  await expect(page.getByTestId("start-date")).toHaveText("Set date");
});

test("comments can be added, viewed, and only the current user's own comment can be deleted", async ({ page }) => {
  await openLab(page);

  // Seeded with one comment from another user — no delete affordance on it.
  await expect(page.getByText("Looks good, one nit on the copy.")).toBeVisible();
  const seeded = page.getByTestId("comment-c1");
  await expect(seeded.getByTestId("comment-delete-c1")).toHaveCount(0);

  // Add a new comment as "me".
  await page.getByTestId("comment-input").fill("Fixed, thanks!");
  await page.getByTestId("comment-send").click();
  await expect(page.getByText("Fixed, thanks!")).toBeVisible();

  // Own comment has a delete affordance; deleting removes it.
  const own = page.locator('[data-testid^="comment-c-new-"]');
  await expect(own).toBeVisible();
  const ownId = await own.getAttribute("data-testid");
  const ownDeleteId = ownId!.replace("comment-", "comment-delete-");
  await page.getByTestId(ownDeleteId).click();
  await expect(page.getByText("Delete this comment?")).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Fixed, thanks!")).toHaveCount(0);
});
