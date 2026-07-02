# workspace-service — content & events

**Path:** `services/workspace` · **Port (internal):** 8000 · **Envoy prefix:** `/api/v1/workspace`
**Stores:** MongoDB `workspaces`, `boards`, `items` · **Publishes:** Redis `events:board:{id}` and `events:notify`

## What it does

Owns everything persistent: workspaces (the "Personal" / "University" / "Work"
containers), Kanban boards, and the polymorphic items on them. It is the **single
writer** of board content, which is the load-bearing design decision: because all
mutations funnel through here, each one can publish exactly one event, and
real-time consumers (presence-service, notification-service) see a complete,
ordered change feed.

## Endpoints

| Method & path | Behaviour |
|---|---|
| `POST /workspaces` | Create a workspace; creator becomes `owner` member |
| `GET /workspaces` | List caller's workspaces; **lazily creates "Personal"** on a user's first visit so the app never starts empty |
| `POST /workspaces/{id}/members` | Owner-only invite; idempotent if already a member; 404 (not 403) for non-owners so existence isn't leaked |
| `POST /workspaces/{id}/boards` | Create a board; default columns "To do / In progress / Done", each with a random 8-hex id |
| `GET /workspaces/{id}/boards` · `GET /boards/{id}` | Reads, membership-scoped |
| `GET /boards/{id}/items` | All items on a board, sorted by column then order |
| `POST /boards/{id}/items` | Create an item; validates the target column exists; appends at the bottom (`order = max + 1`) |
| `PATCH /items/{id}` | Partial update. A `column_id` change is classified as a **move**; moving without an explicit `order` drops the card at the bottom of the new column |
| `DELETE /items/{id}` | Delete, then publish `card.deleted` |

(All prefixed `/api/v1/workspace`, all requiring a bearer token.)

## Event publishing (`_emit` in `main.py`)

Every successful mutation publishes a `BoardEvent` whose `payload` is the item
already serialised in client shape — subscribers can apply it directly without a
follow-up fetch:

- create → `card.created` · update → `card.updated` · column change → `card.moved` · delete → `card.deleted`
- Additionally, if the item has assignees other than the actor, a `mention`
  event goes to `events:notify` for the notification worker.

## Files

- **`app/main.py`** — routes + event emission + model mapping (`_to_workspace`
  / `_to_board` / `_to_item`). `NotFound` from the repository is uniformly
  translated to HTTP 404.
- **`app/repository.py`** — `WorkspaceRepository`, all Mongo access **and all
  authorisation**. Every read/write is scoped through
  `get_workspace_for_member(workspace_id, user_id)`; a non-member sees 404 for
  everything, indistinguishable from "doesn't exist". Also home of the ordering
  scheme: `order` is a float, so future drag-between reordering can bisect
  (e.g. 1.5 between 1 and 2) without renumbering neighbours.
- **`Dockerfile` / `requirements.txt`** — same pattern as auth-service.

## Item document shape (polymorphic)

```json
{
  "_id": ObjectId,
  "board_id": "…", "workspace_id": "…", "column_id": "a1b2c3d4",
  "type": "card" | "document" | "checklist",
  "title": "Ship it",
  "order": 3.0,
  "data": { /* shape depends on type — see common-library.md */ },
  "assignees": ["userId…"], "tags": ["…"], "due_date": ISODate | null,
  "created_by": "userId…", "updated_at": ISODate
}
```

Indexes: `workspaces.members.user_id`, `boards.workspace_id`, and the hot-path
compound `items (board_id, column_id, order)`.
