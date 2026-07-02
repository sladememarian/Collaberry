"""The cross-service event bus, carried over Redis pub/sub.

The workspace-service is the only writer of board state, so it is the only
publisher of ``board`` events. presence-service subscribes and fans those out to
the WebSocket clients watching a board; notification-service subscribes to the
``notify`` stream for @mentions. Keeping the channel names and payload shape here
means a typo can't silently break the fan-out.
"""

from __future__ import annotations

import time
from enum import Enum

import orjson
from pydantic import BaseModel, Field
from redis.asyncio import Redis


class EventType(str, Enum):
    CARD_CREATED = "card.created"
    CARD_UPDATED = "card.updated"
    CARD_MOVED = "card.moved"
    CARD_DELETED = "card.deleted"
    BOARD_UPDATED = "board.updated"
    MENTION = "mention"
    DEADLINE_APPROACHING = "deadline.approaching"


class BoardEvent(BaseModel):
    """A single change to broadcast to everyone watching a board."""

    type: EventType
    board_id: str
    workspace_id: str
    actor_id: str
    # The affected item, already serialised for the client (id, column, order…).
    payload: dict = Field(default_factory=dict)
    # Server timestamp in epoch millis — the WS clients use it to measure fan-out.
    ts: float = Field(default_factory=lambda: time.time() * 1000.0)


def board_channel(board_id: str) -> str:
    return f"events:board:{board_id}"


NOTIFY_CHANNEL = "events:notify"


async def publish_board_event(redis: Redis, event: BoardEvent) -> int:
    """Publish to the board's channel; returns the number of subscribers reached."""
    return await redis.publish(board_channel(event.board_id), _dumps(event))


async def publish_notify_event(redis: Redis, event: BoardEvent) -> int:
    return await redis.publish(NOTIFY_CHANNEL, _dumps(event))


def _dumps(event: BoardEvent) -> str:
    return orjson.dumps(event.model_dump(mode="json")).decode("utf-8")


def parse_event(raw: str | bytes) -> BoardEvent:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8")
    return BoardEvent.model_validate(orjson.loads(raw))
