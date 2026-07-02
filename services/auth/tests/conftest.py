"""Test harness for the auth-service.

We drive the real ASGI app with httpx, but wire up an in-memory Mongo
(``mongomock_motor``) and a throwaway RSA keypair instead of the containers, so
these run fast on the host with no Docker. httpx's ASGITransport does not fire the
app's lifespan, which is exactly what we want — we populate ``app.state`` ourselves.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from collaberry_common.security import ensure_keypair, load_private_key, load_public_key
from collaberry_common.settings import Settings


class _FakeMongo:
    def __init__(self) -> None:
        self._client = AsyncMongoMockClient()
        self.db = self._client["collaberry_test"]

    async def ping(self) -> bool:
        return True

    def close(self) -> None:  # pragma: no cover - nothing to release
        pass


@pytest_asyncio.fixture
async def client(tmp_path):
    from auth.app.main import app
    from auth.app.repository import UserRepository

    priv = tmp_path / "priv.pem"
    pub = tmp_path / "pub.pem"
    ensure_keypair(str(priv), str(pub))

    settings = Settings(jwt_private_key_path=str(priv), jwt_public_key_path=str(pub))
    app.state.settings = settings
    app.state.jwt_private_key = load_private_key(str(priv))
    app.state.jwt_public_key = load_public_key(str(pub))

    mongo = _FakeMongo()
    app.state.mongo = mongo
    app.state.users = UserRepository(mongo)  # type: ignore[arg-type]
    await app.state.users.ensure_indexes()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://auth.test") as ac:
        yield ac
