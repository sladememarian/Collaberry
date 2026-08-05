"""Assigning someone must enqueue a durable mention job.

These guard the seam between workspace-service and notification-service. The
board event on Redis is fan-out for live viewers and may be dropped; the mention
is a job that has to survive the notifier being down, so it goes on the queue.
If that publish silently stops happening, assignees quietly stop getting inbox
rows — a failure with no visible symptom at the API boundary, which is exactly
what needs a test.
"""

from __future__ import annotations

from collaberry_common.queue import ROUTE_NOTIFY


async def _board(ctx, owner: str = "alice") -> tuple[str, str]:
    """Create a workspace + board, returning (board_id, first_column_id)."""
    c = ctx.user(owner)
    ws = await c.post("/api/v1/workspace/workspaces", json={"name": "WS", "context": "work"})
    ws_id = ws.json()["id"]
    b = await c.post(f"/api/v1/workspace/workspaces/{ws_id}/boards", json={"name": "B"})
    board = b.json()
    return board["id"], board["columns"][0]["id"]


async def test_assigning_someone_else_enqueues_mention(ctx):
    board_id, col_id = await _board(ctx)
    ctx.queue.published.clear()

    r = await ctx.user("alice").post(
        f"/api/v1/workspace/boards/{board_id}/items",
        json={
            "type": "card",
            "title": "Ship it",
            "column_id": col_id,
            "data": {"description": ""},
            "assignees": ["bob"],
        },
    )
    assert r.status_code == 201, r.text

    routes = [k for k, _ in ctx.queue.published]
    assert routes == [ROUTE_NOTIFY], f"expected one mention job, got {routes}"

    _, payload = ctx.queue.published[0]
    assert payload["type"] == "mention"
    assert payload["actor_id"] == "alice"
    assert payload["payload"]["assignees"] == ["bob"]


async def test_self_assignment_enqueues_nothing(ctx):
    """You don't need an inbox row telling you what you just did to yourself."""
    board_id, col_id = await _board(ctx)
    ctx.queue.published.clear()

    r = await ctx.user("alice").post(
        f"/api/v1/workspace/boards/{board_id}/items",
        json={
            "type": "card",
            "title": "Mine",
            "column_id": col_id,
            "data": {"description": ""},
            "assignees": ["alice"],
        },
    )
    assert r.status_code == 201, r.text
    assert ctx.queue.published == []


async def test_unassigned_card_enqueues_nothing(ctx):
    board_id, col_id = await _board(ctx)
    ctx.queue.published.clear()

    r = await ctx.user("alice").post(
        f"/api/v1/workspace/boards/{board_id}/items",
        json={
            "type": "card",
            "title": "Nobody yet",
            "column_id": col_id,
            "data": {"description": ""},
        },
    )
    assert r.status_code == 201, r.text
    assert ctx.queue.published == []


async def test_write_still_succeeds_when_broker_is_down(ctx):
    """A broker outage must not surface as a failed write.

    The item is already committed by the time we publish, so a 5xx here would
    tell the client its change was lost when it wasn't.
    """
    board_id, col_id = await _board(ctx)

    async def boom(*_a, **_kw):
        raise ConnectionError("broker unreachable")

    ctx.queue.publish = boom  # type: ignore[method-assign]

    r = await ctx.user("alice").post(
        f"/api/v1/workspace/boards/{board_id}/items",
        json={
            "type": "card",
            "title": "Survives",
            "column_id": col_id,
            "data": {"description": ""},
            "assignees": ["bob"],
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["title"] == "Survives"
