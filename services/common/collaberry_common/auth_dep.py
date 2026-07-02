"""FastAPI dependency that turns a bearer token into a caller identity.

Envoy validates the JWT at the edge and forwards the verified claims, but each
service re-verifies independently — defence in depth, and it means the services are
still safe if someone reaches them directly on the internal network. The public
key is loaded once and cached on the app; here we just read + verify.
"""

from __future__ import annotations

import jwt
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
from fastapi import Depends, Header, HTTPException, Request, status

from .security import TokenClaims, decode_access_token
from .settings import Settings, get_settings


def _extract_bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return authorization.split(" ", 1)[1].strip()


async def current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> TokenClaims:
    token = _extract_bearer(authorization)
    public_key: RSAPublicKey | None = getattr(request.app.state, "jwt_public_key", None)
    if public_key is None:
        # Misconfiguration, not the client's fault.
        raise HTTPException(status_code=500, detail="Auth key not loaded")
    try:
        return decode_access_token(token, public_key, settings)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
