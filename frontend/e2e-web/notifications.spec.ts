import { test, expect, type Page } from "@playwright/test";

import {
  addMember,
  createBoard,
  createCard,
  firstWorkspaceId,
  gotoHome,
  listNotifications,
  registerUser,
  signIn,
  type SeededUser,
} from "./helpers/session";

/**
 * The notifications inbox.
 *
 * Every row here is produced by the real pipeline: workspace-service publishes a
 * mention event, RabbitMQ carries it durably, notification-service's worker
 * writes the inbox row. That's deliberate — a mocked list would have hidden both
 * bugs this feature actually shipped with (naive timestamps rendering a
 * second-old row as "3h ago", and a raw ObjectId where the assigner's name
 * belongs), because both live on the far side of the queue.
 *
 * The queue is asynchronous, so specs wait for the row at the API before loading
 * the page. Polling the UI instead would conflate "the worker is slow" with "the
 * panel doesn't render", and the panel's own poll is a minute wide.
 */

/** Someone else assigns you a card. Returns the recipient, already seeded. */
async function seedMention(
  title = "Ship the release",
): Promise<{ owner: SeededUser; recipient: SeededUser; boardId: string }> {
  const owner = await registerUser("Ada Lovelace");
  const recipient = await registerUser("Grace Hopper");
  const ws = await firstWorkspaceId(owner);
  await addMember(owner, ws, recipient.id);
  const board = await createBoard(owner, ws, "Mention Board");
  await createCard(owner, board.id, {
    title,
    column_id: board.columns[0].id,
    assignees: [recipient.id],
  });
  await waitForNotification(recipient);
  return { owner, recipient, boardId: board.id };
}

/** Wait for the worker to drain the job, at the API rather than through the UI. */
async function waitForNotification(user: SeededUser, count = 1): Promise<void> {
  await expect
    .poll(async () => (await listNotifications(user)).length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(count);
}

async function openPanel(page: Page) {
  await page.getByTestId("nav-rail").getByLabel("Notifications", { exact: true }).click();
  await expect(page.getByTestId("notifications-panel")).toBeVisible();
}

test("an assignment arrives as an unread row naming who assigned it", async ({ page }) => {
  const { recipient } = await seedMention("Ship the release");
  await signIn(page, recipient);
  await gotoHome(page);

  // The badge is the only notification surface visible without opening anything,
  // so it has to be right before the panel is even considered.
  await expect(page.getByTestId("rail-badge-notifications")).toHaveText("1", { timeout: 20_000 });

  await openPanel(page);
  await expect(page.getByText("You were assigned")).toBeVisible();

  // Names the actor, not their id. The worker has no users collection of its
  // own, so this only works if actor_name rode along on the event.
  await expect(page.getByText(/Ada Lovelace assigned you to/)).toBeVisible();
  await expect(page.getByText(/Ship the release/)).toBeVisible();
  await expect(page.getByText(/[0-9a-f]{24}/)).toHaveCount(0);

  // A row written seconds ago must read as such. Mongo returns naive datetimes
  // unless the client is tz_aware, and a naive UTC string parsed as local time
  // renders a brand-new notification as hours old.
  await expect(page.getByText("just now")).toBeVisible();

  // Unread rows carry the Mark read affordance; read ones show a Read stamp.
  await expect(page.getByText("Mark read")).toBeVisible();
  await expect(page.getByText("Read", { exact: true })).toHaveCount(0);
});

test("marking a row read clears the badge and survives a reload", async ({ page }) => {
  const { recipient } = await seedMention();
  await signIn(page, recipient);
  await gotoHome(page);
  await openPanel(page);

  await page.getByText("Mark read").click();

  // The row stays in the list — it's an inbox, not a queue — but flips state.
  await expect(page.getByText("Read", { exact: true })).toBeVisible();
  await expect(page.getByText("Mark read")).toHaveCount(0);
  await expect(page.getByText("You were assigned")).toBeVisible();

  // The badge lives in the rail and the count in the panel title; both read the
  // same provider, so neither may go stale while the other updates.
  await expect(page.getByTestId("rail-badge-notifications")).toHaveCount(0);
  await expect(page.getByTestId("notifications-panel").getByText("Notifications", { exact: true })).toBeVisible();

  // It was persisted, not just marked in local state — the optimistic update
  // would look identical until you reload.
  await page.reload();
  await expect(page.getByTestId("nav-rail")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("rail-badge-notifications")).toHaveCount(0);
  const rows = await listNotifications(recipient);
  expect(rows.every((r) => r.read)).toBe(true);
});

test("Mark all read clears every row and then goes inert", async ({ page }) => {
  const owner = await registerUser("Ada Lovelace");
  const recipient = await registerUser("Grace Hopper");
  const ws = await firstWorkspaceId(owner);
  await addMember(owner, ws, recipient.id);
  const board = await createBoard(owner, ws, "Bulk Board");
  for (const title of ["First task", "Second task", "Third task"]) {
    await createCard(owner, board.id, {
      title,
      column_id: board.columns[0].id,
      assignees: [recipient.id],
    });
  }
  await waitForNotification(recipient, 3);

  await signIn(page, recipient);
  await gotoHome(page);
  await expect(page.getByTestId("rail-badge-notifications")).toHaveText("3", { timeout: 20_000 });

  await openPanel(page);
  const markAll = page.getByRole("button", { name: "Mark all read" });
  await expect(markAll).toBeEnabled();
  await markAll.click();

  await expect(page.getByText("Read", { exact: true })).toHaveCount(3);
  await expect(page.getByText("Mark read")).toHaveCount(0);
  await expect(page.getByTestId("rail-badge-notifications")).toHaveCount(0);

  // Nothing left to mark: leaving it enabled invites a no-op fan-out of writes.
  await expect(markAll).toBeDisabled();

  // All three really landed server-side, not just the one that was on screen.
  const rows = await listNotifications(recipient);
  expect(rows).toHaveLength(3);
  expect(rows.every((r) => r.read)).toBe(true);
});

test("following a row opens its board and reads it on the way", async ({ page }) => {
  const { recipient } = await seedMention("Ship the release");
  await signIn(page, recipient);
  await gotoHome(page);
  await openPanel(page);

  await page.getByLabel("You were assigned — open board").click();

  // The panel gets out of the way and the board is really rendered — a row that
  // dead-ends is a strange place for "you've been assigned something" to stop.
  // Home stays mounted behind the active route and renders the board's name
  // too, hidden; filter to the visible copy so this asserts the board header
  // rather than a stale sibling.
  await expect(page.getByTestId("notifications-panel")).toHaveCount(0);
  await expect(page.getByText("Mention Board").filter({ visible: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Ship the release")).toBeVisible();

  // Acting on it implies reading it; leaving it bold afterwards is just noise.
  await expect(page.getByTestId("rail-badge-notifications")).toHaveCount(0);
});

test("an empty inbox explains itself instead of showing a blank panel", async ({ page }) => {
  const user = await registerUser("Nobody Pinged Me");
  await signIn(page, user);
  await gotoHome(page);

  // No badge at all when there's nothing — not a zero.
  await expect(page.getByTestId("rail-badge-notifications")).toHaveCount(0);

  await openPanel(page);
  await expect(page.getByText("Nothing waiting")).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark all read" })).toBeDisabled();
});

test("assigning yourself a card doesn't notify you about it", async ({ page }) => {
  const user = await registerUser("Solo Worker");
  const ws = await firstWorkspaceId(user);
  const board = await createBoard(user, ws, "Solo Board");
  await createCard(user, board.id, {
    title: "My own task",
    column_id: board.columns[0].id,
    assignees: [user.id],
  });

  await signIn(page, user);
  await gotoHome(page);
  await openPanel(page);

  // Telling you about something you just did yourself is how an inbox becomes
  // noise people stop reading.
  await expect(page.getByText("Nothing waiting")).toBeVisible();
  expect(await listNotifications(user)).toHaveLength(0);
});
