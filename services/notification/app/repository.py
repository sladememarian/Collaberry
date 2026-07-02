"""Mongo access for notifications.

Writes come from the background worker; reads come from the app fetching a user's
inbox. Deadline reminders are de-duplicated through a tiny ``deadline_marks``
collection keyed by item+user, so a card that stays overdue only nags once.
"""

from __future__ import annotations

from datetime import datetime

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from collaberry_common.db import Mongo, oid_to_str
from collaberry_common.models import utcnow


class NotificationRepository:
    def __init__(self, mongo: Mongo) -> None:
        self._notes = mongo.db["notifications"]
        self._marks = mongo.db["deadline_marks"]
        self._items = mongo.db["items"]

    async def ensure_indexes(self) -> None:
        await self._notes.create_index([("user_id", 1), ("created_at", -1)])
        await self._marks.create_index("key", unique=True)

    async def add(
        self, *, user_id: str, kind: str, title: str, body: str,
        board_id: str | None = None, item_id: str | None = None,
    ) -> dict:
        doc = {
            "user_id": user_id,
            "kind": kind,
            "title": title,
            "body": body,
            "board_id": board_id,
            "item_id": item_id,
            "read": False,
            "created_at": utcnow(),
        }
        res = await self._notes.insert_one(doc)
        doc["_id"] = res.inserted_id
        return oid_to_str(doc)  # type: ignore[return-value]

    async def claim_deadline(self, item_id: str, user_id: str) -> bool:
        """Reserve a one-shot deadline reminder. False if already sent."""
        try:
            await self._marks.insert_one({"key": f"{item_id}:{user_id}", "at": utcnow()})
            return True
        except DuplicateKeyError:
            return False

    async def list_for_user(self, user_id: str, *, unread_only: bool = False) -> list[dict]:
        query: dict = {"user_id": user_id}
        if unread_only:
            query["read"] = False
        cur = self._notes.find(query).sort("created_at", -1).limit(200)
        return [oid_to_str(d) for d in await cur.to_list(length=200)]  # type: ignore[misc]

    async def mark_read(self, note_id: str, user_id: str) -> dict | None:
        try:
            oid = ObjectId(note_id)
        except (InvalidId, TypeError):
            return None
        doc = await self._notes.find_one_and_update(
            {"_id": oid, "user_id": user_id},
            {"$set": {"read": True}},
            return_document=ReturnDocument.AFTER,
        )
        return oid_to_str(doc)

    async def due_between(self, start: datetime, end: datetime) -> list[dict]:
        cur = self._items.find({"due_date": {"$gte": start, "$lte": end}})
        return [oid_to_str(d) for d in await cur.to_list(length=1000)]  # type: ignore[misc]
