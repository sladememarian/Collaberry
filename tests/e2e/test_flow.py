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


def test_delete_item(owner: ApiUser, board: dict):
    item = owner.http.post(
        f"/api/v1/workspace/boards/{board['id']}/items",
        json={"type": "card", "title": "Temp", "column_id": _col(board, 0)},
    ).json()
    assert owner.http.delete(f"/api/v1/workspace/items/{item['id']}").status_code == 204
    remaining = owner.http.get(f"/api/v1/workspace/boards/{board['id']}/items").json()
    assert item["id"] not in {i["id"] for i in remaining}


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
