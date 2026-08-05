"""Board access checks — the guard that stops a valid token from reading any board.

A JWT proves identity, not membership. These cover the gap directly: a signed-in
non-member must be refused, and the refusal must be cached without going stale
enough to matter.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from bson import ObjectId
from fakeredis import aioredis as fake_aioredis
from mongomock_motor import AsyncMongoMockClient

from presence.app.authz import BoardAccess


class _Mongo:
    """Minimal stand-in for collaberry_common.db.Mongo over mongomock."""

    def __init__(self) -> None:
        self._db = AsyncMongoMockClient()["collaberry_test"]

    @property
    def db(self):
        return self._db


@pytest_asyncio.fixture
async def fixture():
    redis = fake_aioredis.FakeRedis(decode_responses=True)
    mongo = _Mongo()

    ws = await mongo.db["workspaces"].insert_one(
        {"name": "Alice's", "owner_id": "alice", "members": [{"user_id": "alice", "role": "owner"}]}
    )
    board = await mongo.db["boards"].insert_one(
        {"workspace_id": str(ws.inserted_id), "name": "Sprint", "columns": []}
    )
    item = await mongo.db["items"].insert_one(
        {"board_id": str(board.inserted_id), "title": "Ship it"}
    )

    yield {
        "access": BoardAccess(mongo, redis),
        "redis": redis,
        "mongo": mongo,
        "workspace_id": str(ws.inserted_id),
        "board_id": str(board.inserted_id),
        "item_id": str(item.inserted_id),
    }
    await redis.aclose()


async def test_member_may_view(fixture):
    assert await fixture["access"].may_view(fixture["board_id"], "alice") is True


async def test_non_member_is_refused(fixture):
    """The actual vulnerability: a real signed-in user, someone else's board."""
    assert await fixture["access"].may_view(fixture["board_id"], "mallory") is False


async def test_unknown_board_is_refused(fixture):
    assert await fixture["access"].may_view(str(ObjectId()), "alice") is False


@pytest.mark.parametrize("bad", ["", "not-an-objectid", "../../etc/passwd"])
async def test_malformed_board_id_is_refused_not_crashed(fixture, bad):
    assert await fixture["access"].may_view(bad, "alice") is False


async def test_answer_is_cached(fixture):
    access, redis = fixture["access"], fixture["redis"]
    board_id = fixture["board_id"]

    assert await access.may_view(board_id, "alice") is True
    assert await redis.get(f"authz:board:{board_id}:alice") == "1"

    # Drop the workspace: the cached yes should still answer inside the window,
    # which is the documented trade-off rather than a bug.
    await fixture["mongo"].db["workspaces"].delete_many({})
    assert await access.may_view(board_id, "alice") is True


async def test_denials_are_cached_too(fixture):
    """A probe loop must not turn into a Mongo query per attempt."""
    board_id = fixture["board_id"]
    assert await fixture["access"].may_view(board_id, "mallory") is False
    assert await fixture["redis"].get(f"authz:board:{board_id}:mallory") == "0"


async def test_board_for_item_resolves(fixture):
    assert await fixture["access"].board_for_item(fixture["item_id"]) == fixture["board_id"]


async def test_board_for_item_missing_is_none(fixture):
    assert await fixture["access"].board_for_item(str(ObjectId())) is None
    assert await fixture["access"].board_for_item("garbage") is None


async def test_board_for_item_tombstone_does_not_become_a_board_id(fixture):
    """The empty-string miss marker must read back as None, not as ''."""
    access = fixture["access"]
    missing = str(ObjectId())
    assert await access.board_for_item(missing) is None
    # Second call hits the cached tombstone.
    assert await access.board_for_item(missing) is None
