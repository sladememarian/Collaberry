"""Redis-backed presence, typing indicators and edit locks.

Deliberately kept free of any WebSocket concern so it can be unit-tested against
``fakeredis`` in isolation. The three concepts:

* **presence** — one short-TTL key per live connection, indexed in a set so we can
  list who's on a board and self-heal stale entries.
* **typing** — a 5s key per user; its mere existence means "typing".
* **lock** — ``SET NX EX 30`` on an item, the collision guard the spec asks for.
"""

from __future__ import annotations

import orjson
from redis.asyncio import Redis

from collaberry_common.settings import Settings


class PresenceStore:
    def __init__(self, redis: Redis, settings: Settings) -> None:
        self.redis = redis
        self.presence_ttl = settings.presence_ttl_seconds
        self.typing_ttl = settings.typing_ttl_seconds
        self.lock_ttl = settings.card_lock_ttl_seconds

    # ---- presence --------------------------------------------------------
    def _pkey(self, board_id: str, conn_id: str) -> str:
        return f"presence:{board_id}:{conn_id}"

    def _pindex(self, board_id: str) -> str:
        return f"presence:index:{board_id}"

    async def join(self, board_id: str, conn_id: str, user: dict) -> None:
        await self.redis.set(self._pkey(board_id, conn_id), orjson.dumps(user).decode(), ex=self.presence_ttl)
        await self.redis.sadd(self._pindex(board_id), conn_id)

    async def heartbeat(self, board_id: str, conn_id: str, user: dict) -> None:
        # Re-assert the key so an active connection never looks stale.
        await self.redis.set(self._pkey(board_id, conn_id), orjson.dumps(user).decode(), ex=self.presence_ttl)

    async def leave(self, board_id: str, conn_id: str) -> None:
        await self.redis.delete(self._pkey(board_id, conn_id))
        await self.redis.srem(self._pindex(board_id), conn_id)

    async def list_presence(self, board_id: str) -> list[dict]:
        conn_ids = await self.redis.smembers(self._pindex(board_id))
        users: dict[str, dict] = {}
        for conn_id in conn_ids:
            raw = await self.redis.get(self._pkey(board_id, conn_id))
            if raw is None:
                # Expired connection — clean the index lazily.
                await self.redis.srem(self._pindex(board_id), conn_id)
                continue
            user = orjson.loads(raw)
            users[user["user_id"]] = user  # dedupe multi-tab by user
        return list(users.values())

    # ---- typing ----------------------------------------------------------
    async def mark_typing(self, board_id: str, user_id: str) -> None:
        await self.redis.set(f"typing:{board_id}:{user_id}", "1", ex=self.typing_ttl)

    # ---- locks -----------------------------------------------------------
    def _lkey(self, item_id: str) -> str:
        return f"lock:item:{item_id}"

    async def acquire_lock(self, item_id: str, user_id: str) -> dict:
        """Try to grab a 30s edit lock. Idempotent for the current holder.

        Returns ``{granted, holder, ttl}``. A holder re-acquiring simply refreshes
        the TTL — handy while someone keeps typing in the same card.
        """
        key = self._lkey(item_id)
        ok = await self.redis.set(key, user_id, nx=True, ex=self.lock_ttl)
        if ok:
            return {"granted": True, "holder": user_id, "ttl": self.lock_ttl}

        holder = await self.redis.get(key)
        if holder == user_id:
            await self.redis.expire(key, self.lock_ttl)  # refresh own lock
            return {"granted": True, "holder": user_id, "ttl": self.lock_ttl}

        ttl = await self.redis.ttl(key)
        return {"granted": False, "holder": holder, "ttl": max(ttl, 0)}

    async def release_lock(self, item_id: str, user_id: str) -> bool:
        """Release only if the caller owns the lock (no stealing)."""
        key = self._lkey(item_id)
        holder = await self.redis.get(key)
        if holder == user_id:
            await self.redis.delete(key)
            return True
        return False

    async def lock_status(self, item_id: str) -> dict:
        key = self._lkey(item_id)
        holder = await self.redis.get(key)
        if holder is None:
            return {"locked": False, "holder": None, "ttl": 0}
        ttl = await self.redis.ttl(key)
        return {"locked": True, "holder": holder, "ttl": max(ttl, 0)}
