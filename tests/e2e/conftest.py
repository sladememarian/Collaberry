"""Fixtures for the end-to-end suite.

Everything here talks to the *running* stack through Envoy (GATEWAY_URL), exactly
like the mobile client would. Nothing is mocked — these tests prove the wiring:
Envoy routing, JWT propagation, Mongo persistence, Redis pub/sub, and the
WebSocket fan-out all working together.
"""
from __future__ import annotations

import os
import uuid

import httpx
import pytest

GATEWAY_URL = os.environ.get("GATEWAY_URL", "http://localhost:8088")
# Envoy speaks http; the socket rides the same host on the ws:// scheme.
WS_URL = GATEWAY_URL.replace("http://", "ws://").replace("https://", "wss://")

# This machine has a system-wide proxy agent that hijacks localhost HTTP. httpx
# honours proxy env vars by default; trust_env=False forces a direct connection to
# Envoy so the tests hit the real stack, not the proxy.
_HTTPX_KW = {"trust_env": False, "timeout": 15.0}


def unique_email(prefix: str = "e2e") -> str:
    # NB: not a .test/.example TLD — email-validator rejects RFC 2606 reserved
    # domains, and the auth-service (correctly) enforces that.
    return f"{prefix}-{uuid.uuid4().hex[:12]}@collaberry.dev"


@pytest.fixture(scope="session")
def base_url() -> str:
    return GATEWAY_URL


@pytest.fixture(scope="session")
def ws_url() -> str:
    return WS_URL


@pytest.fixture()
def client() -> httpx.Client:
    with httpx.Client(base_url=GATEWAY_URL, **_HTTPX_KW) as c:
        yield c


class ApiUser:
    """A registered user plus a pre-authorised httpx client."""

    def __init__(self, base: str, token: str, user: dict):
        self.token = token
        self.user = user
        self.id = user["id"]
        self.email = user["email"]
        self.http = httpx.Client(
            base_url=base, headers={"Authorization": f"Bearer {token}"}, **_HTTPX_KW
        )

    def close(self) -> None:
        self.http.close()


def _register(base: str, display_name: str) -> ApiUser:
    email = unique_email()
    r = httpx.post(
        f"{base}/api/v1/auth/register",
        json={"email": email, "password": "supersecret123", "display_name": display_name},
        **_HTTPX_KW,
    )
    r.raise_for_status()
    body = r.json()
    return ApiUser(base, body["access_token"], body["user"])


@pytest.fixture()
def owner(base_url: str) -> ApiUser:
    u = _register(base_url, "Amirpouyan")
    yield u
    u.close()


@pytest.fixture()
def collaborator(base_url: str) -> ApiUser:
    u = _register(base_url, "Maryam")
    yield u
    u.close()
