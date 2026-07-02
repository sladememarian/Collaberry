"""Thin async Redis wrapper shared by presence, workspace and notification.

Redis plays three roles in Collaberry: the pub/sub backbone that carries board
change events between services, the store for ephemeral presence/typing state, and
the arbiter of the 30-second edit locks. All three live behind this one client.
"""

from __future__ import annotations

from redis.asyncio import Redis

from .settings import Settings


def make_redis(settings: Settings) -> Redis:
    # decode_responses keeps call sites dealing in ``str`` rather than ``bytes``;
    # our payloads are all JSON text anyway.
    return Redis.from_url(settings.redis_url, decode_responses=True)
