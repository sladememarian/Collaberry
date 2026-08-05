"""Password hashing plus the RS256 token toolkit.

The asymmetric scheme is the whole point of putting Envoy in front of the
services: auth-service holds the private key and signs, while Envoy *and* the
downstream services verify with the public half. Nobody but auth-service can mint
a token, but anyone can check one — no shared secret to leak.
"""

from __future__ import annotations

import base64
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

import bcrypt
import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPrivateKey, RSAPublicKey

from .settings import Settings

# The single key id we advertise in the JWKS. A real deployment would rotate
# these; for this build one stable kid keeps Envoy's cache simple.
KEY_ID = "collaberry-signing-key-1"


# --------------------------------------------------------------------------- #
# Passwords
# --------------------------------------------------------------------------- #
def _hash_password_sync(plain: str) -> str:
    """Synchronous bcrypt hash — called from a thread pool, not the event loop."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def _verify_password_sync(plain: str, hashed: str) -> bool:
    """Synchronous bcrypt verify — called from a thread pool, not the event loop."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


async def hash_password(plain: str) -> str:
    """Hash a password without blocking the event loop.

    bcrypt is CPU-bound and takes ~100-200ms at rounds=12. Running it on the
    FastAPI request thread would block every other incoming request for that
    duration. Offloading to the thread pool keeps signups and logins from
    stalling the whole service.
    """
    import asyncio
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _hash_password_sync, plain)


async def verify_password(plain: str, hashed: str) -> bool:
    """Verify a password without blocking the event loop.

    Same rationale as hash_password: bcrypt.checkpw is CPU-bound and must not
    run on the request handler thread.
    """
    import asyncio
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _verify_password_sync, plain, hashed)


# --------------------------------------------------------------------------- #
# Key material
# --------------------------------------------------------------------------- #
def ensure_keypair(private_path: str, public_path: str) -> None:
    """Create an RSA keypair on disk if it isn't there yet.

    Called by auth-service at startup. Idempotent, so restarts keep signing the
    same way and previously issued tokens stay valid.
    """
    priv = Path(private_path)
    pub = Path(public_path)
    if priv.exists() and pub.exists():
        return

    priv.parent.mkdir(parents=True, exist_ok=True)
    pub.parent.mkdir(parents=True, exist_ok=True)

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    pub.write_bytes(
        key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )


def load_private_key(path: str) -> RSAPrivateKey:
    return serialization.load_pem_private_key(Path(path).read_bytes(), password=None)  # type: ignore[return-value]


def load_public_key(path: str) -> RSAPublicKey:
    return serialization.load_pem_public_key(Path(path).read_bytes())  # type: ignore[return-value]


def _b64url_uint(value: int) -> str:
    raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def public_jwks(public_key: RSAPublicKey) -> dict:
    """Render the public key as a JWKS document for Envoy + clients."""
    numbers = public_key.public_numbers()
    return {
        "keys": [
            {
                "kty": "RSA",
                "use": "sig",
                "alg": "RS256",
                "kid": KEY_ID,
                "n": _b64url_uint(numbers.n),
                "e": _b64url_uint(numbers.e),
            }
        ]
    }


# --------------------------------------------------------------------------- #
# Tokens
# --------------------------------------------------------------------------- #
@dataclass(slots=True)
class TokenClaims:
    user_id: str
    email: str
    display_name: str

    @classmethod
    def from_payload(cls, payload: dict) -> "TokenClaims":
        return cls(
            user_id=payload["sub"],
            email=payload.get("email", ""),
            display_name=payload.get("name", ""),
        )


def issue_access_token(
    private_key: RSAPrivateKey,
    settings: Settings,
    *,
    user_id: str,
    email: str,
    display_name: str,
) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "email": email,
        "name": display_name,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": now,
        "nbf": now,
        "exp": now + settings.access_token_ttl_seconds,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, private_key, algorithm="RS256", headers={"kid": KEY_ID})


def decode_access_token(token: str, public_key: RSAPublicKey, settings: Settings) -> TokenClaims:
    """Verify signature + standard claims and hand back the useful bits.

    Raises ``jwt.PyJWTError`` subclasses on any problem; callers turn that into a
    401. We keep a small leeway so tiny clock skew between containers is harmless.
    """
    payload = jwt.decode(
        token,
        public_key,
        algorithms=["RS256"],
        audience=settings.jwt_audience,
        issuer=settings.jwt_issuer,
        leeway=10,
        options={"require": ["exp", "iat", "sub"]},
    )
    return TokenClaims.from_payload(payload)
