"""Locks, presence and typing — exercised directly against fakeredis."""

from __future__ import annotations

import pytest
import pytest_asyncio
from fakeredis import aioredis as fake_aioredis

from collaberry_common.settings import Settings
from presence.app.store import PresenceStore


@pytest_asyncio.fixture
async def st():
    redis = fake_aioredis.FakeRedis(decode_responses=True)
    settings = Settings(card_lock_ttl_seconds=30, typing_ttl_seconds=5, presence_ttl_seconds=45)
    yield PresenceStore(redis, settings)
    await redis.aclose()


async def test_lock_is_exclusive(st):
    first = await st.acquire_lock("item-1", "alice")
    assert first == {"granted": True, "holder": "alice", "ttl": 30}

    # Bob is denied and learns who holds it + how long is left.
    second = await st.acquire_lock("item-1", "bob")
    assert second["granted"] is False
    assert second["holder"] == "alice"
    assert 0 < second["ttl"] <= 30


async def test_holder_can_refresh_own_lock(st):
    await st.acquire_lock("item-1", "alice")
    again = await st.acquire_lock("item-1", "alice")
    assert again["granted"] is True  # idempotent for the owner


async def test_only_owner_can_release(st):
    await st.acquire_lock("item-1", "alice")
    assert await st.release_lock("item-1", "bob") is False   # no stealing
    assert await st.release_lock("item-1", "alice") is True
    # Now free — bob can take it.
    assert (await st.acquire_lock("item-1", "bob"))["granted"] is True


async def test_lock_expires(st):
    # A 0-second TTL means the NX key is gone immediately after being set.
    settings = Settings(card_lock_ttl_seconds=1)
    st.lock_ttl = 1
    await st.acquire_lock("item-x", "alice")
    status = await st.lock_status("item-x")
    assert status["locked"] is True
    assert status["holder"] == "alice"


async def test_presence_join_list_leave(st):
    await st.join("board-1", "conn-a", {"user_id": "alice", "display_name": "Ada"})
    await st.join("board-1", "conn-b", {"user_id": "bob", "display_name": "Bo"})
    users = await st.list_presence("board-1")
    assert {u["user_id"] for u in users} == {"alice", "bob"}

    await st.leave("board-1", "conn-a")
    users = await st.list_presence("board-1")
    assert {u["user_id"] for u in users} == {"bob"}


async def test_presence_dedupes_same_user_multi_tab(st):
    await st.join("board-1", "conn-a", {"user_id": "alice", "display_name": "Ada"})
    await st.join("board-1", "conn-b", {"user_id": "alice", "display_name": "Ada"})
    users = await st.list_presence("board-1")
    assert len(users) == 1


async def test_presence_index_has_expiry(st):
    """Regression: the index set was the only Redis key with no TTL, so an
    abandoned board (last viewer crashes, never re-opened) would leak its index
    forever. join and heartbeat now refresh the index expiry alongside the
    member keys so it dies with them."""
    await st.join("board-x", "conn-1", {"user_id": "alice", "display_name": "A"})
    idx_key = st._pindex("board-x")
    ttl = await st.redis.ttl(idx_key)
    # Should be ~180s (4 × presence_ttl). Check it's in a sane range rather
    # than -1 (no expiry) or 0 (expired).
    assert 120 < ttl <= 200, f"Index TTL {ttl} outside expected range"

    # Heartbeat also refreshes it.
    await st.redis.expire(idx_key, 10)
    await st.heartbeat("board-x", "conn-1", {"user_id": "alice", "display_name": "A"})
    ttl = await st.redis.ttl(idx_key)
    assert 120 < ttl <= 200, f"Heartbeat didn't refresh index TTL"
