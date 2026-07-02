"""The hub must relay a Redis board event to every socket on that board."""

from __future__ import annotations

import asyncio

import orjson
import pytest
from fakeredis import aioredis as fake_aioredis

from collaberry_common.events import BoardEvent, EventType, board_channel, publish_board_event
from presence.app.hub import Hub


class FakeWebSocket:
    """Records whatever the hub sends it."""

    def __init__(self) -> None:
        self.sent: list[dict] = []

    async def send_text(self, text: str) -> None:
        self.sent.append(orjson.loads(text))


async def _wait_for(predicate, timeout=2.0):
    loop = asyncio.get_event_loop()
    deadline = loop.time() + timeout
    while loop.time() < deadline:
        if predicate():
            return True
        await asyncio.sleep(0.01)
    return False


async def test_board_event_reaches_subscribed_socket():
    redis = fake_aioredis.FakeRedis(decode_responses=True)
    hub = Hub(redis)
    await hub.start()
    ws = FakeWebSocket()
    await hub.add("board-1", "conn-1", ws)

    event = BoardEvent(
        type=EventType.CARD_MOVED,
        board_id="board-1",
        workspace_id="w1",
        actor_id="alice",
        payload={"id": "card-9", "column_id": "done"},
    )
    await publish_board_event(redis, event)

    got = await _wait_for(lambda: any(m.get("type") == "board_event" for m in ws.sent))
    assert got, "hub never delivered the board event"
    relayed = next(m for m in ws.sent if m["type"] == "board_event")
    assert relayed["event"]["payload"]["column_id"] == "done"

    await hub.stop()
    await redis.aclose()


async def test_event_not_delivered_after_socket_leaves():
    redis = fake_aioredis.FakeRedis(decode_responses=True)
    hub = Hub(redis)
    await hub.start()
    ws = FakeWebSocket()
    await hub.add("board-2", "conn-1", ws)
    await hub.remove("board-2", "conn-1")

    await publish_board_event(
        redis,
        BoardEvent(type=EventType.CARD_UPDATED, board_id="board-2", workspace_id="w", actor_id="a"),
    )
    # Give the reader a moment; nothing should arrive.
    await asyncio.sleep(0.3)
    assert ws.sent == []

    await hub.stop()
    await redis.aclose()
