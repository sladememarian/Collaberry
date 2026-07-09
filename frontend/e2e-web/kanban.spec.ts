import { test, expect, type Page } from "@playwright/test";

/**
 * Interaction regressions for the Kanban board, run against the backend-free
 * dev harness at /kanbanlab (see app/kanbanlab.tsx). These cover the three
 * things that have historically broken silently:
 *   1. mouse-wheel scroll inside a lane's card list
 *   2. dragging a card from one lane to another
 *   3. lanes rendering a visible enclosure/track (incl. empty ones)
 *
 * react-native-web renders everything as <div>, so we assert on text content
 * and computed layout rather than semantic roles.
 */

const LAB = "/kanbanlab";

async function openLab(page: Page) {
  await page.goto(LAB);
  await expect(page.getByText("Kanban Lab").first()).toBeVisible();
  // Wait for the seeded board to render (the tall Backlog lane's first card).
  await expect(page.getByText("Backlog task 1").first()).toBeVisible();
}

/**
 * From a card element, climb to the nearest scrollable ancestor (the lane's
 * card-list ScrollView) and report its scroll geometry. Returns null if no
 * scrollable ancestor exists — which is itself the bug we're guarding against.
 */
async function laneScrollInfo(page: Page, cardText: string) {
  const card = page.getByText(cardText, { exact: true }).first();
  await card.waitFor();
  return card.evaluate((el: HTMLElement) => {
    let node: HTMLElement | null = el;
    while (node) {
      const canScroll = node.scrollHeight > node.clientHeight + 4;
      const oy = getComputedStyle(node).overflowY;
      if (canScroll && (oy === "auto" || oy === "scroll" || oy === "hidden")) {
        return { found: true, scrollTop: node.scrollTop, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight };
      }
      node = node.parentElement;
    }
    return { found: false, scrollTop: 0, scrollHeight: 0, clientHeight: 0 };
  });
}

test("a lane's card list scrolls with the mouse wheel", async ({ page }) => {
  await openLab(page);

  // The Backlog lane is seeded with 14 cards — taller than the viewport — so
  // its list must have a bounded, scrollable height.
  const before = await laneScrollInfo(page, "Backlog task 1");
  expect(before.found, "Backlog lane should have a scrollable card list").toBe(true);
  expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);

  // Hover the middle of the Backlog lane and wheel down.
  const anchor = page.getByText("Backlog task 3", { exact: true }).first();
  await anchor.hover();
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);

  const after = await laneScrollInfo(page, "Backlog task 1");
  expect(after.scrollTop, "wheel should have scrolled the lane down").toBeGreaterThan(before.scrollTop + 20);

  // And a card that started below the fold should now be reachable/visible.
  await expect(page.getByText("Backlog task 14").first()).toBeVisible();
});

test("every lane renders a visible enclosed track, including empty ones", async ({ page }) => {
  await openLab(page);

  // "Blocked" is seeded empty — its track must still be visible with a real
  // (non-transparent) background so it reads as a drop-zone.
  const blockedHeader = page.getByText("Blocked", { exact: true }).first();
  await expect(blockedHeader).toBeVisible();
  await expect(page.getByText("Drop a card here").first()).toBeVisible();

  // The empty lane's track should have a non-transparent background surface.
  const trackBg = await blockedHeader.evaluate((el: HTMLElement) => {
    // header → up to the enclosing track (the bordered, rounded container)
    let node: HTMLElement | null = el;
    for (let i = 0; i < 6 && node; i++) {
      const cs = getComputedStyle(node);
      const hasBorder = parseFloat(cs.borderTopWidth) > 0;
      const bg = cs.backgroundColor;
      const opaque = bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent";
      if (hasBorder && opaque) return bg;
      node = node.parentElement;
    }
    return null;
  });
  expect(trackBg, "empty lane should have a bordered, tinted track").not.toBeNull();
});

test("the sort control reorders cards within a lane for created/priority/estimation", async ({ page }) => {
  await openLab(page);

  // Read the visible order of "Code review task N" cards top-to-bottom by y position.
  const codeReviewOrder = async () => {
    const cards = await Promise.all(
      [1, 2, 3].map(async (n) => {
        const el = page.getByText(`Code review task ${n}`, { exact: true }).first();
        const box = await el.boundingBox();
        return { n, y: box?.y ?? 0 };
      }),
    );
    return cards.sort((a, b) => a.y - b.y).map((c) => c.n);
  };

  // Default is "created" order — 1, 2, 3.
  await expect(page.getByTestId("sort-created")).toBeVisible();
  expect(await codeReviewOrder()).toEqual([1, 2, 3]);

  // Seeded priority (task1=0, task2=2, task3=1) sorts descending to 2, 3, 1.
  // Reordering animates via a damped spring (LinearTransition), so wait for
  // it to settle before reading positions — a short wait reads a mid-flight
  // layout and flakes.
  await page.getByTestId("sort-priority").click();
  await page.waitForTimeout(600);
  expect(await codeReviewOrder()).toEqual([2, 3, 1]);

  // Seeded estimation (task1=2, task2=1, task3=3) sorts descending to 3, 1, 2.
  await page.getByTestId("sort-estimation").click();
  await page.waitForTimeout(600);
  expect(await codeReviewOrder()).toEqual([3, 1, 2]);

  // Back to created restores the original order.
  await page.getByTestId("sort-created").click();
  await page.waitForTimeout(600);
  expect(await codeReviewOrder()).toEqual([1, 2, 3]);
});

test("no leftover '< >' nudge controls exist on cards or lane headers", async ({ page }) => {
  await openLab(page);

  // The old (removed) affordance exposed accessible "Move lane left/right" and
  // per-card move buttons. Neither should exist anywhere on the board now —
  // reordering only happens via drag.
  await expect(page.getByLabel(/move lane (left|right)/i)).toHaveCount(0);
  await expect(page.getByLabel(/move card/i)).toHaveCount(0);

  // No literal chevron glyphs ("<", ">", "‹", "›") should render as standalone
  // pressable text anywhere on the board either.
  const chevronTexts = await page.locator("text=/^[<>‹›]$/").count();
  expect(chevronTexts).toBe(0);
});

test("a card can be dragged from one lane into another", async ({ page }) => {
  await openLab(page);

  const card = page.getByText("In progress task 1", { exact: true }).first();
  const target = page.getByText("Code review", { exact: true }).first();

  const from = await card.boundingBox();
  const to = await target.boundingBox();
  expect(from && to).toBeTruthy();
  if (!from || !to) return;

  // RNGH pan activates after an ~80ms long-press; hold, then move in steps to
  // the Code review lane and drop.
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(200); // clear the long-press activation threshold
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 10, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 12 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(400);

  // After the move, the card should live under the Code review lane. We assert
  // by proximity: the card's x-center should sit within the Code review column.
  const moved = await page.getByText("In progress task 1", { exact: true }).first().boundingBox();
  const codeReviewCol = await target.boundingBox();
  expect(moved && codeReviewCol).toBeTruthy();
  if (moved && codeReviewCol) {
    const cardMid = moved.x + moved.width / 2;
    expect(cardMid).toBeGreaterThan(codeReviewCol.x - 40);
    expect(cardMid).toBeLessThan(codeReviewCol.x + codeReviewCol.width + 40);
  }
});
