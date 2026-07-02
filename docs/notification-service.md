# notification-service — mentions & deadlines

**Path:** `services/notification` · **Port (internal):** 8000 · **Envoy prefix:** `/api/v1/notifications`
**Stores:** MongoDB `notifications`, `deadline_marks` (reads `items` for due dates) · **Subscribes:** Redis `events:notify`

## What it does

A mostly-background worker with a small REST inbox on the side. Two triggers:

1. **Mentions** — workspace-service publishes a `mention` event whenever a card
   is created/updated with assignees; each assignee (except the actor) gets an
   inbox entry.
2. **Approaching deadlines** — a sweep every 60s finds items whose `due_date`
   falls within the next 24h (configurable) and notifies their assignees,
   **exactly once per item+user**.

## Endpoints

| Method & path | Behaviour |
|---|---|
| `GET /api/v1/notifications?unread=true|false` | Caller's inbox, newest first, capped at 200 |
| `PATCH /api/v1/notifications/{id}/read` | Mark read; ownership-checked (404 for someone else's) |
| `GET /healthz` | Mongo + Redis ping |

## Files

- **`app/worker.py`** — the interesting part, deliberately split into two *pure*
  async functions (unit-testable with in-memory Mongo, no Redis loop needed):
  - `process_mention(repo, event)` — one notification per assignee ≠ actor.
  - `sweep_deadlines(repo, warning_hours)` — window query `now ≤ due ≤ now+24h`,
    then a claim per (item, user) before writing.
  - `run_worker(app)` — the long-running shell: a pub/sub consumer on
    `events:notify` and the 60s sweep timer, run under `asyncio.gather`.
- **`app/repository.py`** — `NotificationRepository`. The dedup trick lives
  here: `claim_deadline` inserts into `deadline_marks` with a unique index on
  `"{item_id}:{user_id}"` — a `DuplicateKeyError` means "already reminded", so
  a card that stays overdue nags exactly once. `mark_read` uses
  `find_one_and_update` filtered by owner.
- **`app/main.py`** — lifespan starts/stops the worker task alongside the HTTP
  app; the inbox routes.

## Notification document shape

```json
{
  "_id": ObjectId,
  "user_id": "…",
  "kind": "mention" | "deadline",
  "title": "You were assigned",
  "body": "alice assigned you to “Design review”.",
  "board_id": "…", "item_id": "…",
  "read": false,
  "created_at": ISODate
}
```

## Design notes

- No ingress dependency: if this service is down, nothing else degrades — events
  queue up only in the sense that future sweeps still catch deadlines; missed
  pub/sub mentions are the accepted trade-off of pub/sub (fire-and-forget).
- Push notifications (APNs/FCM) would slot in exactly where `repo.add` is called;
  the fan-out and dedup logic wouldn't change.
