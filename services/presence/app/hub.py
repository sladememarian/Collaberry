"""The WebSocket hub.

Two jobs: keep track of which sockets are watching which board, and pump board
events from Redis pub/sub out to those sockets. One background reader drains a
single pub/sub connection and dispatches by channel — cheaper and simpler than a
task per board, and it keeps fan-out latency low because there's no polling.
"""

from __future__ import annotations

import asyncio
import contextlib

import orjson
from fastapi import WebSocket
from redis.asyncio import Redis

from collaberry_common.events import board_channel


class Hub:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis
        self._pubsub = redis.pubsub()
        # board_id -> {conn_id: WebSocket}
        self._boards: dict[str, dict[str, WebSocket]] = {}
        self._reader: asyncio.Task | None = None
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        # Subscribe to a private no-op channel so listen() has something to read
        # even before any board is open, then run the dispatch loop.
        await self._pubsub.subscribe("events:__control__")
        self._reader = asyncio.create_task(self._run(), name="presence-hub-reader")

    async def stop(self) -> None:
        if self._reader:
            self._reader.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._reader
        with contextlib.suppress(Exception):
            await self._pubsub.aclose()

    async def add(self, board_id: str, conn_id: str, ws: WebSocket) -> None:
        async with self._lock:
            first = board_id not in self._boards
            self._boards.setdefault(board_id, {})[conn_id] = ws
            if first:
                await self._pubsub.subscribe(board_channel(board_id))

    async def remove(self, board_id: str, conn_id: str) -> None:
        async with self._lock:
            conns = self._boards.get(board_id)
            if not conns:
                return
            conns.pop(conn_id, None)
            if not conns:
                self._boards.pop(board_id, None)
                with contextlib.suppress(Exception):
                    await self._pubsub.unsubscribe(board_channel(board_id))

    async def broadcast(self, board_id: str, message: dict, *, exclude: str | None = None) -> None:
        """Send a JSON message to every socket on a board (optionally skip one)."""
        conns = list(self._boards.get(board_id, {}).items())
        text = orjson.dumps(message).decode()
        dead: list[str] = []
        for conn_id, ws in conns:
            if conn_id == exclude:
                continue
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(conn_id)
        for conn_id in dead:
            await self.remove(board_id, conn_id)

    async def _run(self) -> None:
        # Forward every board event Redis hands us straight to the matching sockets.
        async for message in self._pubsub.listen():
            if message.get("type") != "message":
                continue
            channel = message["channel"]
            if not channel.startswith("events:board:"):
                continue
            board_id = channel.split("events:board:", 1)[1]
            try:
                event = orjson.loads(message["data"])
            except Exception:
                continue
            await self.broadcast(board_id, {"type": "board_event", "event": event})
