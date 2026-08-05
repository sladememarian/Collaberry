"""All Mongo access for the auth-service lives here.

Isolating the database calls keeps the route handlers readable and makes the unit
tests easy: swap this class for an in-memory fake and the routes don't know the
difference.
"""

from __future__ import annotations

from collaberry_common.db import Mongo, oid_to_str
from collaberry_common.models import utcnow
from collaberry_common.security import hash_password


class UserRepository:
    def __init__(self, mongo: Mongo) -> None:
        self._users = mongo.db["users"]

    async def ensure_indexes(self) -> None:
        # Case-insensitive-ish uniqueness: we store emails already lowercased.
        await self._users.create_index("email", unique=True)

    async def get_by_email(self, email: str) -> dict | None:
        return oid_to_str(await self._users.find_one({"email": email.lower()}))

    async def get_by_id(self, user_id: str) -> dict | None:
        from bson import ObjectId

        try:
            oid = ObjectId(user_id)
        except Exception:
            return None
        return oid_to_str(await self._users.find_one({"_id": oid}))

    async def get_by_ids(self, user_ids: list[str]) -> list[dict]:
        """Resolve many ids at once (used to label assignees by display name).

        Invalid ids (not a valid ``ObjectId``) are silently skipped rather than
        raising — the caller passes ids it already trusts came from membership
        records, and a stray bad one shouldn't fail the whole lookup.
        """
        from bson import ObjectId

        oids = []
        for uid in user_ids:
            try:
                oids.append(ObjectId(uid))
            except Exception:
                continue
        if not oids:
            return []
        docs = await self._users.find({"_id": {"$in": oids}}).to_list(length=None)
        return [oid_to_str(d) for d in docs]

    async def create(self, *, email: str, password: str, display_name: str) -> dict:
        doc = {
            "email": email.lower(),
            "password_hash": await hash_password(password),
            "display_name": display_name,
            "created_at": utcnow(),
        }
        result = await self._users.insert_one(doc)
        doc["_id"] = result.inserted_id
        return oid_to_str(doc)  # type: ignore[return-value]
