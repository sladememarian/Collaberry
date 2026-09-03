"""Board access checks for presence-service.

Presence deliberately owns no board state — workspace-service is the single
writer, and this service only relays. But "I hold a valid token" is not the same
claim as "I may watch this board": without a membership check any signed-in user
could open a socket on an arbitrary board id and receive every card event on it.

So we do the cheapest possible authorization: read the board's ``workspace_id``
and that workspace's member list straight from Mongo, then cache the yes/no in
Redis for a short window. Membership changes rarely, sockets connect often, and a
60-second stale window is an acceptable trade for keeping this off the hot path.
The read is strictly read-only — the one-writer rule is untouched.
"""

from __future__ import annotations

from redis.asyncio import Redis

from collaberry_common.db import Mongo, parse_oid

# Long enough to absorb a burst of reconnects, short enough that revoking
# someone's membership takes effect while they're still looking at the screen.
CACHE_TTL_SECONDS = 60


class BoardAccess:
    def __init__(self, mongo: Mongo, redis: Redis) -> None:
        self._boards = mongo.db["boards"]
        self._ws = mongo.db["workspaces"]
        self._items = mongo.db["items"]
        self._redis = redis

    @staticmethod
    def _key(board_id: str, user_id: str) -> str:
        return f"authz:board:{board_id}:{user_id}"

    async def may_view(self, board_id: str, user_id: str) -> bool:
        """True when ``user_id`` is a member of the board's workspace."""
        key = self._key(board_id, user_id)
        cached = await self._redis.get(key)
        if cached is not None:
            return cached == "1"

        allowed = await self._lookup(board_id, user_id)
        # Negative answers are cached too, so a probe loop can't hammer Mongo.
        await self._redis.set(key, "1" if allowed else "0", ex=CACHE_TTL_SECONDS)
        return allowed

    async def board_for_item(self, item_id: str) -> str | None:
        """Resolve an item to its board id, so the lock API can be gated too.

        Cached on the item id alone — an item never changes boards, so this one
        is safe to hold much longer than a membership answer.
        """
        key = f"authz:item-board:{item_id}"
        cached = await self._redis.get(key)
        if cached is not None:
            return cached or None

        oid = parse_oid(item_id)
        if oid is None:
            return None

        item = await self._items.find_one({"_id": oid}, {"board_id": 1})
        board_id = item.get("board_id") if item else None
        # Empty string is the "no such item" tombstone; short TTL for that case
        # so an item created moments later isn't shadowed by a stale miss.
        await self._redis.set(key, board_id or "", ex=600 if board_id else 10)
        return board_id

    async def _lookup(self, board_id: str, user_id: str) -> bool:
        oid = parse_oid(board_id)
        if oid is None:
            return False

        board = await self._boards.find_one({"_id": oid}, {"workspace_id": 1})
        if not board:
            return False

        ws_oid = parse_oid(board.get("workspace_id", ""))
        if ws_oid is None:
            return False

        # Projection of _id only: we want existence, not the document.
        hit = await self._ws.find_one(
            {"_id": ws_oid, "members.user_id": user_id}, {"_id": 1}
        )
        return hit is not None
