from __future__ import annotations

import pytest

from collaberry_common.events import board_channel, parse_event


async def _make_board(client, columns=None):
    ws = (await client.post(
        "/api/v1/workspace/workspaces", json={"name": "Uni", "context": "university"}
    )).json()
    payload = {"name": "Thesis"}
    if columns:
        payload["columns"] = columns
    board = (await client.post(
        f"/api/v1/workspace/workspaces/{ws['id']}/boards", json=payload
    )).json()
    return ws, board


async def test_create_workspace_defaults_owner_membership(ctx):
    alice = ctx.user("alice")
    r = await alice.post(
        "/api/v1/workspace/workspaces", json={"name": "Personal", "context": "personal"}
    )
    assert r.status_code == 201
    body = r.json()
    assert body["owner_id"] == "alice"
    assert body["members"][0] == {"user_id": "alice", "role": "owner"}


async def test_board_default_columns(ctx):
    alice = ctx.user("alice")
    _, board = await _make_board(alice)
    names = [c["name"] for c in board["columns"]]
    assert names == ["To do", "In progress", "Done"]
    assert all(c["id"] for c in board["columns"])


async def test_item_lifecycle_and_ordering(ctx):
    alice = ctx.user("alice")
    _, board = await _make_board(alice)
    todo = board["columns"][0]["id"]
    doing = board["columns"][1]["id"]

    first = (await alice.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "A", "column_id": todo},
    )).json()
    second = (await alice.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "B", "column_id": todo},
    )).json()
    assert second["order"] > first["order"]  # appended after the first

    # Move the first card to the "doing" column.
    moved = (await alice.patch(
        f"/api/v1/workspace/items/{first['id']}", json={"column_id": doing}
    )).json()
    assert moved["column_id"] == doing

    items = (await alice.get(f"/api/v1/workspace/boards/{board['id']}/items")).json()
    assert {i["title"] for i in items} == {"A", "B"}


async def test_item_priority_defaults_sets_and_updates(ctx):
    alice = ctx.user("alice")
    _, board = await _make_board(alice)
    todo = board["columns"][0]["id"]

    # Default priority is 0 ("none") when omitted.
    default = (await alice.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "no prio", "column_id": todo},
    )).json()
    assert default["priority"] == 0

    # Priority can be set at creation.
    high = (await alice.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "urgent", "column_id": todo, "priority": 3},
    )).json()
    assert high["priority"] == 3

    # And changed later via PATCH, without touching anything else.
    patched = (await alice.patch(
        f"/api/v1/workspace/items/{default['id']}", json={"priority": 2}
    )).json()
    assert patched["priority"] == 2
    assert patched["title"] == "no prio"  # untouched


async def test_item_priority_out_of_range_is_rejected(ctx):
    alice = ctx.user("alice")
    _, board = await _make_board(alice)
    todo = board["columns"][0]["id"]

    r = await alice.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "bad", "column_id": todo, "priority": 9},
    )
    assert r.status_code == 422  # 0-3 only


async def test_mutations_publish_board_events(ctx):
    alice = ctx.user("alice")
    _, board = await _make_board(alice)
    todo = board["columns"][0]["id"]

    pubsub = ctx.redis.pubsub()
    await pubsub.subscribe(board_channel(board["id"]))

    created = (await alice.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "Ship it", "column_id": todo},
    )).json()

    # Drain messages until we see our card.created event.
    seen = None
    for _ in range(10):
        msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
        if msg:
            seen = parse_event(msg["data"])
            break
    assert seen is not None
    assert seen.type.value == "card.created"
    assert seen.payload["id"] == created["id"]
    await pubsub.aclose()


async def test_polymorphic_checklist_item(ctx):
    alice = ctx.user("alice")
    _, board = await _make_board(alice)
    todo = board["columns"][0]["id"]
    r = await alice.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={
            "type": "checklist",
            "title": "Launch checklist",
            "column_id": todo,
            "data": {"entries": [{"text": "tests green"}, {"text": "docs", "done": True}]},
        },
    )
    assert r.status_code == 201
    entries = r.json()["data"]["entries"]
    assert entries[0] == {"text": "tests green", "done": False}


async def test_non_member_cannot_see_workspace(ctx):
    alice = ctx.user("alice")
    bob = ctx.user("bob")
    ws = (await alice.post(
        "/api/v1/workspace/workspaces", json={"name": "Secret", "context": "work"}
    )).json()

    # Bob is not a member — the board list must 404, not leak existence.
    r = await bob.post(
        f"/api/v1/workspace/workspaces/{ws['id']}/boards", json={"name": "X"}
    )
    assert r.status_code == 404

    # After Alice invites Bob, he can act.
    invite = await alice.post(
        f"/api/v1/workspace/workspaces/{ws['id']}/members",
        json={"user_id": "bob", "role": "editor"},
    )
    assert invite.status_code == 200
    r2 = await bob.get(f"/api/v1/workspace/workspaces/{ws['id']}/boards")
    assert r2.status_code == 200


async def test_bad_column_rejected(ctx):
    alice = ctx.user("alice")
    _, board = await _make_board(alice)
    r = await alice.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "X", "column_id": "does-not-exist"},
    )
    assert r.status_code == 404
