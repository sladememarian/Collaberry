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


async def test_item_estimation_and_dates_set_and_updated(ctx):
    alice = ctx.user("alice")
    _, board = await _make_board(alice)
    todo = board["columns"][0]["id"]

    # None of the three are required — omitted means null.
    bare = (await alice.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "bare", "column_id": todo},
    )).json()
    assert bare["estimation_time"] is None
    assert bare["start_date"] is None
    assert bare["end_date"] is None

    # Settable at creation.
    planned = (await alice.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={
            "type": "card",
            "title": "planned",
            "column_id": todo,
            "estimation_time": 4.5,
            "start_date": "2026-08-01T00:00:00Z",
            "end_date": "2026-08-03T00:00:00Z",
        },
    )).json()
    assert planned["estimation_time"] == 4.5
    assert planned["start_date"].startswith("2026-08-01")
    assert planned["end_date"].startswith("2026-08-03")

    # And updatable later via PATCH, without disturbing other fields.
    patched = (await alice.patch(
        f"/api/v1/workspace/items/{bare['id']}", json={"estimation_time": 2}
    )).json()
    assert patched["estimation_time"] == 2
    assert patched["title"] == "bare"


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


async def test_add_rename_and_delete_column(ctx):
    alice = ctx.user("alice")
    _, board = await _make_board(alice)

    # Add a new lane; it lands to the right of the defaults.
    added = (await alice.post(
        f"/api/v1/workspace/boards/{board['id']}/columns", json={"name": "Code review"}
    )).json()
    assert [c["name"] for c in added["columns"]] == ["To do", "In progress", "Done", "Code review"]
    new_col = added["columns"][-1]
    assert new_col["order"] == 3

    # Rename it.
    renamed = (await alice.patch(
        f"/api/v1/workspace/boards/{board['id']}/columns/{new_col['id']}",
        json={"name": "Review"},
    )).json()
    assert any(c["name"] == "Review" for c in renamed["columns"])

    # Delete it (it's empty, so this is allowed).
    deleted = (await alice.delete(
        f"/api/v1/workspace/boards/{board['id']}/columns/{new_col['id']}"
    )).json()
    assert all(c["id"] != new_col["id"] for c in deleted["columns"])


async def test_reorder_columns(ctx):
    alice = ctx.user("alice")
    _, board = await _make_board(alice)
    ids = [c["id"] for c in board["columns"]]  # To do, In progress, Done

    # Move "Done" to the front.
    new_order = [ids[2], ids[0], ids[1]]
    reordered = (await alice.put(
        f"/api/v1/workspace/boards/{board['id']}/columns/order",
        json={"order": new_order},
    )).json()
    got = [c["id"] for c in sorted(reordered["columns"], key=lambda c: c["order"])]
    assert got == new_order

    # A partial/garbled order is refused so lanes can't be dropped or duplicated.
    bad = await alice.put(
        f"/api/v1/workspace/boards/{board['id']}/columns/order",
        json={"order": [ids[0]]},
    )
    assert bad.status_code == 409


async def test_delete_non_empty_column_is_rejected(ctx):
    alice = ctx.user("alice")
    _, board = await _make_board(alice)
    todo = board["columns"][0]["id"]
    await alice.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "stuck here", "column_id": todo},
    )
    # The lane still holds a card, so deletion is a 409 — cards are never orphaned.
    r = await alice.delete(f"/api/v1/workspace/boards/{board['id']}/columns/{todo}")
    assert r.status_code == 409


async def test_switch_item_type_card_to_checklist(ctx):
    alice = ctx.user("alice")
    _, board = await _make_board(alice)
    todo = board["columns"][0]["id"]
    card = (await alice.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "morphs", "column_id": todo, "data": {"description": "d"}},
    )).json()

    switched = (await alice.patch(
        f"/api/v1/workspace/items/{card['id']}",
        json={"type": "checklist", "data": {"entries": [{"text": "step one"}]}},
    )).json()
    assert switched["type"] == "checklist"
    assert switched["data"]["entries"][0] == {"text": "step one", "done": False}
    assert switched["title"] == "morphs"  # untouched


async def test_explicit_null_clears_estimation_and_dates(ctx):
    alice = ctx.user("alice")
    _, board = await _make_board(alice)
    todo = board["columns"][0]["id"]
    item = (await alice.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={
            "type": "card",
            "title": "planned",
            "column_id": todo,
            "estimation_time": 4.5,
            "start_date": "2026-08-01T00:00:00Z",
            "end_date": "2026-08-03T00:00:00Z",
            "due_date": "2026-08-05T00:00:00Z",
        },
    )).json()

    # Omitting a field must leave it untouched.
    untouched = (await alice.patch(
        f"/api/v1/workspace/items/{item['id']}", json={"title": "still planned"}
    )).json()
    assert untouched["estimation_time"] == 4.5
    assert untouched["start_date"] is not None

    # Explicitly sending null must clear it.
    cleared = (await alice.patch(
        f"/api/v1/workspace/items/{item['id']}",
        json={"estimation_time": None, "start_date": None, "end_date": None, "due_date": None},
    )).json()
    assert cleared["estimation_time"] is None
    assert cleared["start_date"] is None
    assert cleared["end_date"] is None
    assert cleared["due_date"] is None
    assert cleared["title"] == "still planned"  # untouched


async def test_comments_add_list_delete_own_only(ctx):
    alice = ctx.user("alice")
    bob = ctx.user("bob")
    ws = (await alice.post(
        "/api/v1/workspace/workspaces", json={"name": "Team", "context": "work"}
    )).json()
    board = (await alice.post(
        f"/api/v1/workspace/workspaces/{ws['id']}/boards", json={"name": "Board"}
    )).json()
    await alice.post(
        f"/api/v1/workspace/workspaces/{ws['id']}/members",
        json={"user_id": "bob", "role": "editor"},
    )
    todo = board["columns"][0]["id"]
    item = (await alice.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "discuss me", "column_id": todo},
    )).json()

    c1 = (await alice.post(
        f"/api/v1/workspace/items/{item['id']}/comments", json={"body": "first"}
    )).json()
    assert c1["user_id"] == "alice"
    assert c1["body"] == "first"

    c2 = (await bob.post(
        f"/api/v1/workspace/items/{item['id']}/comments", json={"body": "second"}
    )).json()

    listed = (await alice.get(f"/api/v1/workspace/items/{item['id']}/comments")).json()
    assert [c["body"] for c in listed] == ["first", "second"]

    # Bob cannot delete Alice's comment.
    forbidden = await bob.delete(f"/api/v1/workspace/items/{item['id']}/comments/{c1['id']}")
    assert forbidden.status_code == 403

    # Bob can delete his own.
    ok = await bob.delete(f"/api/v1/workspace/items/{item['id']}/comments/{c2['id']}")
    assert ok.status_code == 204

    remaining = (await alice.get(f"/api/v1/workspace/items/{item['id']}/comments")).json()
    assert [c["id"] for c in remaining] == [c1["id"]]

