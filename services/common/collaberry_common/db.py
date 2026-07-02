"""Async MongoDB access via Motor.

Each service creates one :class:`Mongo` on startup and shares its database handle
through FastAPI's app state. The client is safe to reuse across requests — Motor
pools connections internally.
"""

from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from .settings import Settings


class Mongo:
    def __init__(self, settings: Settings) -> None:
        self._client: AsyncIOMotorClient = AsyncIOMotorClient(
            settings.mongo_uri,
            uuidRepresentation="standard",
            serverSelectionTimeoutMS=5000,
        )
        self._db: AsyncIOMotorDatabase = self._client[settings.mongo_db]

    @property
    def db(self) -> AsyncIOMotorDatabase:
        return self._db

    async def ping(self) -> bool:
        await self._client.admin.command("ping")
        return True

    def close(self) -> None:
        self._client.close()


def oid_to_str(document: dict | None) -> dict | None:
    """Normalise Mongo's ``_id`` into a plain ``id`` string for the API layer."""
    if document is None:
        return None
    doc = dict(document)
    if "_id" in doc:
        doc["id"] = str(doc.pop("_id"))
    return doc
