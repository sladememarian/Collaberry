import { test, expect } from "@playwright/test";

import { createBoard, createCard, firstWorkspaceId, gotoBoard, registerUser, signIn } from "./helpers/session";

/**
 * Board search. Unlike every other panel in the app this is an inline bar, not
 * a floating dialog — the filtered lanes behind it *are* the result, so a
 * dimmed backdrop would hide the thing you opened it to see. These specs pin
 * that behaviour along with the two entry points (header icon, nav rail) and
 * the states that are easy to regress: zero matches, clear, and close.
 *
 * Runs against the live backend; see helpers/session.ts for why.
 */

const CARDS = [
  { title: "Design the login screen", tags: ["ui"], description: "Sketch the form layout" },
  { title: "Fix the payment webhook", tags: ["backend"], description: "Stripe retries twice" },
  { title: "Write release notes", tags: ["docs"], description: "Summarise the sprint" },
];

async function seedBoard(page: import("@playwright/test").Page) {
  const user = await registerUser("Search Tester");
  const ws = await firstWorkspaceId(user);
  const board = await createBoard(user, ws, "Search Board");
  for (const c of CARDS) {
    await createCard(user, board.id, {
      title: c.title,
      column_id: board.columns[0].id,
      tags: c.tags,
      data: { description: c.description },
    });
  }
  await signIn(page, user);
  await gotoBoard(page, board.id, "Search Board");
  return { user, board };
}

test("the header search icon opens the bar and it filters lanes by title", async ({ page }) => {
  await seedBoard(page);

  // All three cards are on the board before searching.
  await expect(page.getByText("Design the login screen")).toBeVisible();
  await expect(page.getByTestId("board-search-input")).toHaveCount(0);

  await page.getByTestId("board-search-open").click();
  const input = page.getByTestId("board-search-input");
  await expect(input).toBeVisible();
  // The bar autofocuses — having to click the field would make opening search
  // a two-step action.
  await expect(input).toBeFocused();
  await expect(page.getByTestId("board-search-count")).toHaveText("3 cards");

  await input.fill("payment");
  await expect(page.getByTestId("board-search-count")).toHaveText("1 match");
  await expect(page.getByText("Fix the payment webhook")).toBeVisible();
  await expect(page.getByText("Design the login screen")).toHaveCount(0);
  await expect(page.getByText("Write release notes")).toHaveCount(0);
});

test("search matches tags and description text, not just titles", async ({ page }) => {
  await seedBoard(page);
  await page.getByTestId("board-search-open").click();
  const input = page.getByTestId("board-search-input");

  // Tag-only match: "backend" appears in no title.
  await input.fill("backend");
  await expect(page.getByTestId("board-search-count")).toHaveText("1 match");
  await expect(page.getByText("Fix the payment webhook")).toBeVisible();

  // Description-only match: "Stripe" appears in no title or tag.
  await input.fill("Stripe");
  await expect(page.getByTestId("board-search-count")).toHaveText("1 match");
  await expect(page.getByText("Fix the payment webhook")).toBeVisible();

  // Case-insensitive.
  await input.fill("STRIPE");
  await expect(page.getByTestId("board-search-count")).toHaveText("1 match");
});

test("a query with no matches says so instead of showing a silently empty board", async ({ page }) => {
  await seedBoard(page);
  await page.getByTestId("board-search-open").click();

  await page.getByTestId("board-search-input").fill("zzzznothing");

  const count = page.getByTestId("board-search-count");
  await expect(count).toHaveText("No matches");
  await expect(page.getByText("Design the login screen")).toHaveCount(0);

  // Amber, not the usual low-contrast grey: empty lanes with no explanation
  // read as "my cards are gone".
  const color = await count.evaluate((el) => getComputedStyle(el).color);
  expect(color).not.toBe("rgb(255, 255, 255)");
  const [r, , b] = color.match(/\d+/g)!.map(Number);
  expect(r, `expected a warm/amber tone, got ${color}`).toBeGreaterThan(b);
});

test("clearing restores every card without closing the bar", async ({ page }) => {
  await seedBoard(page);
  await page.getByTestId("board-search-open").click();

  const input = page.getByTestId("board-search-input");
  await input.fill("payment");
  await expect(page.getByTestId("board-search-count")).toHaveText("1 match");

  await page.getByTestId("board-search-clear").click();

  await expect(input).toBeVisible(); // still open
  await expect(input).toHaveValue("");
  await expect(page.getByTestId("board-search-count")).toHaveText("3 cards");
  await expect(page.getByText("Design the login screen")).toBeVisible();
  await expect(page.getByText("Write release notes")).toBeVisible();
});

test("closing search drops the filter rather than leaving it applied invisibly", async ({ page }) => {
  await seedBoard(page);
  await page.getByTestId("board-search-open").click();
  await page.getByTestId("board-search-input").fill("payment");
  await expect(page.getByText("Design the login screen")).toHaveCount(0);

  await page.getByTestId("board-search-close").click();

  await expect(page.getByTestId("board-search-input")).toHaveCount(0);
  // The whole board is back. A filter surviving behind a closed bar is how you
  // end up convinced cards have gone missing.
  await expect(page.getByText("Design the login screen")).toBeVisible();
  await expect(page.getByText("Fix the payment webhook")).toBeVisible();
  await expect(page.getByText("Write release notes")).toBeVisible();

  // Reopening starts clean.
  await page.getByTestId("board-search-open").click();
  await expect(page.getByTestId("board-search-input")).toHaveValue("");
});

test("Escape closes the search bar, even once focus has left the field", async ({ page }) => {
  await seedBoard(page);
  await page.getByTestId("board-search-open").click();
  await expect(page.getByTestId("board-search-input")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.getByTestId("board-search-input")).toHaveCount(0);
  await expect(page.getByText("Design the login screen")).toBeVisible();

  // Escape is bound on the window, not on the input. Blur the field and it must
  // still work: focus leaves the moment you click a card, and a dismissal that
  // depends on where focus happens to sit is one you can't rely on.
  await page.getByTestId("board-search-open").click();
  await page.getByTestId("board-search-input").fill("payment");
  await page.getByText("Fix the payment webhook").click();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("board-search-input")).toHaveCount(0);
  await expect(page.getByText("Design the login screen")).toBeVisible();
});

test("the nav rail offers Search on a board and hides it on Home", async ({ page }) => {
  const { board } = await seedBoard(page);

  // On a board the rail publishes the screen's handler, so the entry exists
  // and drives the same bar as the header icon.
  const railSearch = page.getByLabel("Search", { exact: true });
  await expect(railSearch).toBeVisible();
  await railSearch.click();
  await expect(page.getByTestId("board-search-input")).toBeVisible();

  // Home has no card list, so the entry must unregister rather than linger as a
  // dead control that calls a handler closed over an unmounted screen.
  await page.goto("/");
  await expect(page.getByTestId("nav-rail")).toBeVisible();
  await expect(page.getByLabel("Search", { exact: true })).toHaveCount(0);

  // And it comes back on returning to the board.
  await page.goto(`/board/${board.id}`);
  await expect(page.getByLabel("Search", { exact: true })).toBeVisible({ timeout: 20_000 });
});
