"""Happy-path + guardrail e2e coverage through Envoy.

Covers the whole product loop: auth → workspaces → boards → polymorphic items →
moves → locking. Each test is independent (fresh users per fixture).
"""
from __future__ import annotations

import pytest

from .conftest import ApiUser, unique_email

pytestmark = pytest.mark.e2e


# --------------------------------------------------------------------------- #
# Auth + gateway
# --------------------------------------------------------------------------- #
def test_gateway_serves_jwks(client):
    r = client.get("/api/v1/auth/.well-known/jwks.json")
    assert r.status_code == 200
    keys = r.json()["keys"]
    assert keys and keys[0]["kty"] == "RSA"


def test_protected_route_requires_token(client):
    # No Authorization header — Envoy's jwt_authn must reject before it hits a service.
    r = client.get("/api/v1/workspace/workspaces")
    assert r.status_code == 401


def test_register_conflict(client):
    email = unique_email()
    payload = {"email": email, "password": "supersecret123", "display_name": "Dup"}
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    assert client.post("/api/v1/auth/register", json=payload).status_code == 409


def test_login_roundtrip(client, owner: ApiUser):
    r = client.post(
        "/api/v1/auth/login",
        json={"email": owner.email, "password": "supersecret123"},
    )
    assert r.status_code == 200
    assert r.json()["user"]["id"] == owner.id


def test_me_returns_identity(owner: ApiUser):
    r = owner.http.get("/api/v1/auth/me")
    assert r.status_code == 200
    assert r.json()["email"] == owner.email


# --------------------------------------------------------------------------- #
# Workspaces + boards
# --------------------------------------------------------------------------- #
def test_new_user_has_personal_workspace(owner: ApiUser):
    # The spec: never an empty void on first launch.
    r = owner.http.get("/api/v1/workspace/workspaces")
    assert r.status_code == 200
    names = [w["context"] for w in r.json()]
    assert "personal" in names


def test_create_workspace_and_board(owner: ApiUser):
    ws = owner.http.post(
        "/api/v1/workspace/workspaces", json={"name": "Q3 Launch", "context": "work"}
    ).json()
    assert ws["context"] == "work"

    board = owner.http.post(
        f"/api/v1/workspace/workspaces/{ws['id']}/boards", json={"name": "Sprint 1"}
    ).json()
    assert len(board["columns"]) == 3  # To do / In progress / Done
    assert board["columns"][0]["order"] == 0


# --------------------------------------------------------------------------- #
# Polymorphic items
# --------------------------------------------------------------------------- #
@pytest.fixture()
def board(owner: ApiUser) -> dict:
    ws = owner.http.post(
        "/api/v1/workspace/workspaces", json={"name": "WS", "context": "university"}
    ).json()
    return owner.http.post(
        f"/api/v1/workspace/workspaces/{ws['id']}/boards", json={"name": "Board"}
    ).json()


def _col(board: dict, idx: int) -> str:
    return board["columns"][idx]["id"]


def test_create_all_three_item_shapes(owner: ApiUser, board: dict):
    todo = _col(board, 0)

    card = owner.http.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "Fix login", "column_id": todo, "data": {"description": "edge cases"}},
    ).json()
    assert card["type"] == "card"

    doc = owner.http.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={
            "type": "document",
            "title": "Spec",
            "column_id": todo,
            "data": {"blocks": [{"type": "heading", "text": "Goals"}, {"text": "ship it"}]},
        },
    ).json()
    assert doc["data"]["blocks"][1]["type"] == "paragraph"  # defaulted server-side

    checklist = owner.http.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={
            "type": "checklist",
            "title": "Pre-flight",
            "column_id": todo,
            "data": {"entries": [{"text": "tests", "done": False}]},
        },
    ).json()
    assert checklist["data"]["entries"][0]["done"] is False

    items = owner.http.get(f"/api/v1/workspace/boards/{board['id']}/items").json()
    assert {i["id"] for i in items} == {card["id"], doc["id"], checklist["id"]}


def test_bad_item_shape_is_rejected(owner: ApiUser, board: dict):
    # A card description must be a string — the model validator turns this into a 422.
    r = owner.http.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "Broken", "column_id": _col(board, 0), "data": {"description": 5}},
    )
    assert r.status_code == 422


def test_move_and_update_item(owner: ApiUser, board: dict):
    item = owner.http.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "Move me", "column_id": _col(board, 0)},
    ).json()

    moved = owner.http.patch(
        f"/api/v1/workspace/items/{item['id']}", json={"column_id": _col(board, 1)}
    ).json()
    assert moved["column_id"] == _col(board, 1)

    renamed = owner.http.patch(
        f"/api/v1/workspace/items/{item['id']}", json={"title": "Renamed"}
    ).json()
    assert renamed["title"] == "Renamed"


def test_item_priority_end_to_end(owner: ApiUser, board: dict):
    # Default 0, settable at creation, updatable via PATCH, and range-checked -
    # all the way through Envoy, the real workspace service, and Mongo.
    plain = owner.http.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "later", "column_id": _col(board, 0)},
    ).json()
    assert plain["priority"] == 0

    urgent = owner.http.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "now", "column_id": _col(board, 0), "priority": 3},
    ).json()
    assert urgent["priority"] == 3

    bumped = owner.http.patch(
        f"/api/v1/workspace/items/{plain['id']}", json={"priority": 2}
    ).json()
    assert bumped["priority"] == 2

    bad = owner.http.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "x", "column_id": _col(board, 0), "priority": 5},
    )
    assert bad.status_code == 422


def test_delete_item(owner: ApiUser, board: dict):
    item = owner.http.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "Temp", "column_id": _col(board, 0)},
    ).json()
    assert owner.http.delete(f"/api/v1/workspace/items/{item['id']}").status_code == 204
    remaining = owner.http.get(f"/api/v1/workspace/boards/{board['id']}/items").json()
    assert item["id"] not in {i["id"] for i in remaining}


# --------------------------------------------------------------------------- #
# Full user flows, verified by an independent read-back through the gateway.
#
# The tests above assert on the mutation *response*. These re-fetch state with a
# fresh GET so we prove the change actually landed in Mongo (and survives the
# round-trip through Envoy + the workspace service), not just that the write
# echoed our input back. That distinction is what "accurate" e2e means here:
# nothing is trusted until it's been read back out of the persisted list.
# --------------------------------------------------------------------------- #
def _item_in_list(user: ApiUser, board_id: str, item_id: str) -> dict | None:
    """Fetch the board's items and return the one with ``item_id`` (or None)."""
    items = user.http.get(f"/api/v1/workspace/boards/{board_id}/items").json()
    return next((i for i in items if i["id"] == item_id), None)


def test_priority_flow_persists_end_to_end(base_url: str):
    """register → login → workspace → board → card → PATCH priority → read back.

    A self-contained walk of goal #1 that owns its whole user, so it never leans
    on shared fixtures and stays deterministic under parallel runs.
    """
    from .conftest import _register

    user = _register(base_url, "PriorityWalker")
    try:
        # Fresh login proves the just-minted credentials actually authenticate,
        # not only the register-issued token.
        login = user.http.post(
            "/api/v1/auth/login",
            json={"email": user.email, "password": "supersecret123"},
        )
        assert login.status_code == 200

        ws = user.http.post(
            "/api/v1/workspace/workspaces",
            json={"name": "Priority WS", "context": "work"},
        ).json()
        board = user.http.post(
            f"/api/v1/workspace/workspaces/{ws['id']}/boards",
            json={"name": "Priorities"},
        ).json()
        todo = board["columns"][0]["id"]

        card = user.http.post(
            f"/api/v1/workspace/boards/{board['id']}/items",
            json={"type": "card", "title": "Triage me", "column_id": todo},
        ).json()
        assert card["priority"] == 0  # defaults to "none"

        patched = user.http.patch(
            f"/api/v1/workspace/items/{card['id']}", json={"priority": 3}
        )
        assert patched.status_code == 200
        assert patched.json()["priority"] == 3

        # The load-bearing assertion: re-read the board and confirm persistence.
        fetched = _item_in_list(user, board["id"], card["id"])
        assert fetched is not None
        assert fetched["priority"] == 3
        assert fetched["title"] == "Triage me"  # PATCH touched nothing else
    finally:
        user.close()


def test_delete_removes_item_from_read_back(owner: ApiUser, board: dict):
    """Goal #2: the API-level contract behind the "are you sure?" confirm dialog.

    Create two items, delete one, and prove via a fresh list that exactly the
    deleted item is gone while its sibling survives (guards against a delete that
    nukes too much).
    """
    keep = owner.http.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "Keep", "column_id": _col(board, 0)},
    ).json()
    doomed = owner.http.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "Delete", "column_id": _col(board, 0)},
    ).json()

    # Sanity: both are present before the delete.
    assert _item_in_list(owner, board["id"], keep["id"]) is not None
    assert _item_in_list(owner, board["id"], doomed["id"]) is not None

    assert owner.http.delete(f"/api/v1/workspace/items/{doomed['id']}").status_code == 204

    # Read back: the doomed item is gone, the sibling remains.
    assert _item_in_list(owner, board["id"], doomed["id"]) is None
    assert _item_in_list(owner, board["id"], keep["id"]) is not None

    # A second delete of the now-missing item is a clean 404 (idempotent-ish).
    assert owner.http.delete(f"/api/v1/workspace/items/{doomed['id']}").status_code == 404


def test_board_columns_default_names(owner: ApiUser):
    """Goal #3a: a new board's lanes are exactly To do / In progress / Done, ordered."""
    ws = owner.http.post(
        "/api/v1/workspace/workspaces", json={"name": "Lanes", "context": "work"}
    ).json()
    board = owner.http.post(
        f"/api/v1/workspace/workspaces/{ws['id']}/boards", json={"name": "Default lanes"}
    ).json()

    columns = board["columns"]
    assert [c["name"] for c in columns] == ["To do", "In progress", "Done"]
    assert [c["order"] for c in columns] == [0, 1, 2]
    assert all(c["id"] for c in columns)

    # Persisted: a fresh GET of the board reports the same lanes.
    refetched = owner.http.get(f"/api/v1/workspace/boards/{board['id']}").json()
    assert [c["name"] for c in refetched["columns"]] == ["To do", "In progress", "Done"]


def test_move_item_between_columns_persists(owner: ApiUser, board: dict):
    """Goal #3b: PATCH column_id moves a card To do → In progress → Done, and sticks."""
    todo, doing, done = _col(board, 0), _col(board, 1), _col(board, 2)

    item = owner.http.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "Travelling card", "column_id": todo},
    ).json()
    assert item["column_id"] == todo

    for target in (doing, done):
        resp = owner.http.patch(
            f"/api/v1/workspace/items/{item['id']}", json={"column_id": target}
        )
        assert resp.status_code == 200
        assert resp.json()["column_id"] == target

        # Read-back: the move is durable, not just reflected in the PATCH echo.
        fetched = _item_in_list(owner, board["id"], item["id"])
        assert fetched is not None
        assert fetched["column_id"] == target


# --------------------------------------------------------------------------- #
# Isolation + locking (presence-service)
# --------------------------------------------------------------------------- #
def test_workspace_isolation(owner: ApiUser, collaborator: ApiUser):
    ws = owner.http.post(
        "/api/v1/workspace/workspaces", json={"name": "Private", "context": "work"}
    ).json()
    # A stranger can't list the owner's boards.
    r = collaborator.http.get(f"/api/v1/workspace/workspaces/{ws['id']}/boards")
    assert r.status_code == 404


def test_card_lock_blocks_second_editor(owner: ApiUser, collaborator: ApiUser, board: dict):
    ws_id = board["workspace_id"]
    # Let the collaborator in so they can even see the item.
    owner.http.post(
        f"/api/v1/workspace/workspaces/{ws_id}/members",
        json={"user_id": collaborator.id, "role": "editor"},
    )
    item = owner.http.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "document", "title": "Shared doc", "column_id": _col(board, 0)},
    ).json()

    first = owner.http.post(f"/api/v1/presence/items/{item['id']}/lock")
    assert first.status_code == 200 and first.json()["granted"] is True

    # Second editor is locked out (423) with the holder surfaced.
    second = collaborator.http.post(f"/api/v1/presence/items/{item['id']}/lock")
    assert second.status_code == 423

    # Owner releases; now the collaborator can grab it.
    assert owner.http.delete(f"/api/v1/presence/items/{item['id']}/lock").json()["released"] is True
    assert collaborator.http.post(f"/api/v1/presence/items/{item['id']}/lock").status_code == 200
