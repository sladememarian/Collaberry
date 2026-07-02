from __future__ import annotations

import pytest

CREDS = {"email": "ada@collaberry.dev", "password": "lovelace-1843", "display_name": "Ada"}


async def test_register_then_me(client):
    r = await client.post("/api/v1/auth/register", json=CREDS)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "ada@collaberry.dev"
    token = body["access_token"]

    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["display_name"] == "Ada"


async def test_duplicate_email_conflicts(client):
    await client.post("/api/v1/auth/register", json=CREDS)
    again = await client.post("/api/v1/auth/register", json=CREDS)
    assert again.status_code == 409


async def test_login_success_and_failure(client):
    await client.post("/api/v1/auth/register", json=CREDS)

    ok = await client.post(
        "/api/v1/auth/login", json={"email": CREDS["email"], "password": CREDS["password"]}
    )
    assert ok.status_code == 200

    bad = await client.post(
        "/api/v1/auth/login", json={"email": CREDS["email"], "password": "nope"}
    )
    assert bad.status_code == 401
    # Must not reveal whether the email exists.
    assert bad.json()["detail"] == "Invalid credentials"


async def test_me_requires_valid_token(client):
    missing = await client.get("/api/v1/auth/me")
    assert missing.status_code == 401

    garbage = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer nope"})
    assert garbage.status_code == 401


async def test_jwks_is_served(client):
    r = await client.get("/api/v1/auth/.well-known/jwks.json")
    assert r.status_code == 200
    assert r.json()["keys"][0]["kty"] == "RSA"


@pytest.mark.parametrize("bad", [
    {"email": "not-an-email", "password": "longenough", "display_name": "x"},
    {"email": "a@b.com", "password": "short", "display_name": "x"},
    {"email": "a@b.com", "password": "longenough", "display_name": ""},
])
async def test_register_validation(client, bad):
    r = await client.post("/api/v1/auth/register", json=bad)
    assert r.status_code == 422
