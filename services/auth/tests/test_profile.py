"""Self-service profile editing.

The interesting cases here aren't the happy path — they're the two ways this
endpoint could quietly become an account-takeover primitive:

* a password change that doesn't re-check the *current* password, which would
  let anyone holding a stolen token lock the real owner out permanently;
* a rename that doesn't re-issue the token, which would leave presence-service
  labelling the user's live cursor with their old name until the JWT expires,
  because display_name is a claim and not a database read.
"""

from __future__ import annotations

CREDS = {"email": "ada@collaberry.dev", "password": "lovelace-1843", "display_name": "Ada"}


async def _register(client) -> tuple[str, dict]:
    r = await client.post("/api/v1/auth/register", json=CREDS)
    assert r.status_code == 201, r.text
    token = r.json()["access_token"]
    return token, {"Authorization": f"Bearer {token}"}


async def test_rename_persists_and_reissues_the_token(client):
    token, headers = await _register(client)

    r = await client.patch(
        "/api/v1/auth/me", json={"display_name": "Ada Lovelace"}, headers=headers
    )
    assert r.status_code == 200, r.text
    assert r.json()["user"]["display_name"] == "Ada Lovelace"

    # A fresh token, not the one we sent — otherwise the new name would never
    # reach the services that read it from the claims.
    fresh = r.json()["access_token"]
    assert fresh != token

    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {fresh}"})
    assert me.json()["display_name"] == "Ada Lovelace"


async def test_password_change_lets_you_log_in_with_the_new_one(client):
    _, headers = await _register(client)

    r = await client.patch(
        "/api/v1/auth/me",
        json={"current_password": CREDS["password"], "new_password": "babbage-1837"},
        headers=headers,
    )
    assert r.status_code == 200, r.text

    old = await client.post(
        "/api/v1/auth/login", json={"email": CREDS["email"], "password": CREDS["password"]}
    )
    assert old.status_code == 401

    new = await client.post(
        "/api/v1/auth/login", json={"email": CREDS["email"], "password": "babbage-1837"}
    )
    assert new.status_code == 200


async def test_password_change_requires_the_current_password(client):
    _, headers = await _register(client)

    missing = await client.patch(
        "/api/v1/auth/me", json={"new_password": "babbage-1837"}, headers=headers
    )
    assert missing.status_code == 400

    wrong = await client.patch(
        "/api/v1/auth/me",
        json={"current_password": "not-it", "new_password": "babbage-1837"},
        headers=headers,
    )
    assert wrong.status_code == 403

    # Neither rejected attempt may have changed anything.
    still = await client.post(
        "/api/v1/auth/login", json={"email": CREDS["email"], "password": CREDS["password"]}
    )
    assert still.status_code == 200


async def test_rename_alone_needs_no_password(client):
    """The common edit is a rename; demanding a password for it would be hostile."""
    _, headers = await _register(client)
    r = await client.patch("/api/v1/auth/me", json={"display_name": "Ada L."}, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["display_name"] == "Ada L."


async def test_empty_patch_is_a_no_op(client):
    _, headers = await _register(client)
    r = await client.patch("/api/v1/auth/me", json={}, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["display_name"] == "Ada"


async def test_profile_edit_requires_a_token(client):
    await client.post("/api/v1/auth/register", json=CREDS)
    anon = await client.patch("/api/v1/auth/me", json={"display_name": "Nobody"})
    assert anon.status_code == 401


async def test_short_new_password_is_rejected(client):
    _, headers = await _register(client)
    r = await client.patch(
        "/api/v1/auth/me",
        json={"current_password": CREDS["password"], "new_password": "short"},
        headers=headers,
    )
    assert r.status_code == 422
