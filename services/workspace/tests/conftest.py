"""Workspace-service test harness.

Real ASGI app, but backed by in-memory Mongo (``mongomock_motor``) and Redis
(``fakeredis``), and with the JWT dependency overridden to a fixed caller. That
lets us test authorisation logic (membership scoping) without minting tokens,
while still exercising the true route + repository code paths.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from fakeredis import aioredis as fake_aioredis
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from fastapi import Header

from collaberry_common.auth_dep import current_user
from collaberry_common.security import TokenClaims
from collaberry_common.settings import Settings


class _FakeMongo:
    def __init__(self) -> None:
        self._client = AsyncMongoMockClient()
        self.db = self._client["collaberry_test"]

    async def ping(self) -> bool:
        return True

    def close(self) -> None:  # pragma: no cover
        pass


def _claims_for(user_id: str) -> TokenClaims:
    return TokenClaims(user_id=user_id, email=f"{user_id}@t.dev", display_name=user_id)


@pytest_asyncio.fixture
async def ctx():
    """Return a factory that builds an authenticated client for a given user id.

    All clients share one in-memory Mongo/Redis so multi-user scenarios (member
    can see, stranger cannot) work across clients.
    """
    from workspace.app.main import app
    from workspace.app.repository import WorkspaceRepository

    app.state.settings = Settings()
    mongo = _FakeMongo()
    app.state.mongo = mongo
    app.state.repo = WorkspaceRepository(mongo)  # type: ignore[arg-type]
    await app.state.repo.ensure_indexes()
    app.state.redis = fake_aioredis.FakeRedis(decode_responses=True)

    # Identity comes from a test header so several clients (different users) can
    # hit the same app concurrently without stepping on a shared override.
    def _override(x_test_user: str = Header(default="anonymous")) -> TokenClaims:
        return _claims_for(x_test_user)

    app.dependency_overrides[current_user] = _override

    clients: list[AsyncClient] = []

    def as_user(user_id: str) -> AsyncClient:
        c = AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://ws.test",
            headers={"X-Test-User": user_id},
        )
        clients.append(c)
        return c

    # A tiny wrapper so a test can switch identity per request.
    class Ctx:
        def __init__(self):
            self.app = app
            self.redis = app.state.redis

        def user(self, user_id: str) -> AsyncClient:
            return as_user(user_id)

    try:
        yield Ctx()
    finally:
        for c in clients:
            await c.aclose()
        app.dependency_overrides.clear()
        await app.state.redis.aclose()
