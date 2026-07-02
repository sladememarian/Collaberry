"""Pure-logic tests for the crypto layer — no network, no database."""

from __future__ import annotations

import time

import jwt
import pytest

from collaberry_common.security import (
    KEY_ID,
    decode_access_token,
    ensure_keypair,
    hash_password,
    issue_access_token,
    load_private_key,
    load_public_key,
    public_jwks,
    verify_password,
)
from collaberry_common.settings import Settings


@pytest.fixture
def keys(tmp_path):
    priv = tmp_path / "priv.pem"
    pub = tmp_path / "pub.pem"
    ensure_keypair(str(priv), str(pub))
    return load_private_key(str(priv)), load_public_key(str(pub))


def test_password_round_trip():
    hashed = hash_password("hunter2-correct-horse")
    assert hashed != "hunter2-correct-horse"
    assert verify_password("hunter2-correct-horse", hashed)
    assert not verify_password("wrong", hashed)


def test_verify_password_is_defensive():
    # Garbage hash must not raise, just fail closed.
    assert verify_password("x", "not-a-real-bcrypt-hash") is False


def test_ensure_keypair_is_idempotent(tmp_path):
    priv, pub = tmp_path / "a.pem", tmp_path / "b.pem"
    ensure_keypair(str(priv), str(pub))
    first = priv.read_bytes()
    ensure_keypair(str(priv), str(pub))
    assert priv.read_bytes() == first  # not regenerated


def test_token_round_trip(keys):
    private, public = keys
    settings = Settings()
    token = issue_access_token(
        private, settings, user_id="u1", email="a@b.com", display_name="Ada"
    )
    claims = decode_access_token(token, public, settings)
    assert claims.user_id == "u1"
    assert claims.email == "a@b.com"
    assert claims.display_name == "Ada"

    header = jwt.get_unverified_header(token)
    assert header["kid"] == KEY_ID
    assert header["alg"] == "RS256"


def test_expired_token_is_rejected(keys):
    private, public = keys
    settings = Settings(access_token_ttl_seconds=-60)  # well past the 10s leeway
    token = issue_access_token(private, settings, user_id="u", email="e", display_name="n")
    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(token, public, settings)


def test_wrong_audience_is_rejected(keys):
    private, public = keys
    minting = Settings(jwt_audience="one")
    verifying = Settings(jwt_audience="two")
    token = issue_access_token(private, minting, user_id="u", email="e", display_name="n")
    with pytest.raises(jwt.InvalidAudienceError):
        decode_access_token(token, public, verifying)


def test_jwks_shape(keys):
    _, public = keys
    doc = public_jwks(public)
    assert doc["keys"][0]["kid"] == KEY_ID
    assert doc["keys"][0]["kty"] == "RSA"
    assert set(doc["keys"][0]) >= {"n", "e", "alg", "use"}
