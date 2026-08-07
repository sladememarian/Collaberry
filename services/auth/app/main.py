"""Auth & User service.

Responsibilities (per the architecture): register users, issue RS256 access
tokens, and publish the JWKS that Envoy and the other services verify against.
Workspace *membership* provisioning starts here too — a brand-new user gets a
"Personal" workspace so the app is never an empty void on first launch.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import ORJSONResponse

from collaberry_common.auth_dep import current_user
from collaberry_common.db import Mongo
from collaberry_common.models import (
    LoginRequest,
    ProfileUpdate,
    RegisterRequest,
    TokenResponse,
    UserPublic,
)
from collaberry_common.security import (
    TokenClaims,
    decode_access_token,  # noqa: F401  (kept for parity/testing imports)
    ensure_keypair,
    issue_access_token,
    load_private_key,
    load_public_key,
    public_jwks,
    verify_password,
)
from collaberry_common.settings import get_settings

from .repository import UserRepository


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    # Generate the signing pair on first boot, then load both halves.
    ensure_keypair(settings.jwt_private_key_path, settings.jwt_public_key_path)
    app.state.settings = settings
    app.state.jwt_private_key = load_private_key(settings.jwt_private_key_path)
    app.state.jwt_public_key = load_public_key(settings.jwt_public_key_path)

    mongo = Mongo(settings)
    app.state.mongo = mongo
    app.state.users = UserRepository(mongo)
    await app.state.users.ensure_indexes()
    try:
        yield
    finally:
        mongo.close()


app = FastAPI(
    title="Collaberry · Auth & User",
    version="0.1.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)


def repo(request: Request) -> UserRepository:
    return request.app.state.users


@app.get("/healthz", include_in_schema=False)
async def healthz(request: Request) -> dict:
    ok = await request.app.state.mongo.ping()
    return {"status": "ok" if ok else "degraded", "service": "auth"}


@app.get("/api/v1/auth/.well-known/jwks.json", tags=["auth"])
async def jwks(request: Request) -> dict:
    """Public keys for verifiers. Envoy's jwt_authn filter polls this."""
    return public_jwks(request.app.state.jwt_public_key)


def _token_response(request: Request, user: dict) -> TokenResponse:
    settings = request.app.state.settings
    token = issue_access_token(
        request.app.state.jwt_private_key,
        settings,
        user_id=user["id"],
        email=user["email"],
        display_name=user["display_name"],
    )
    return TokenResponse(
        access_token=token,
        expires_in=settings.access_token_ttl_seconds,
        user=UserPublic(
            id=user["id"],
            email=user["email"],
            display_name=user["display_name"],
            created_at=user["created_at"],
        ),
    )


@app.post("/api/v1/auth/register", response_model=TokenResponse, status_code=201, tags=["auth"])
async def register(body: RegisterRequest, request: Request) -> TokenResponse:
    users: UserRepository = repo(request)
    if await users.get_by_email(body.email):
        raise HTTPException(status_code=409, detail="That email is already registered")
    user = await users.create(
        email=body.email, password=body.password, display_name=body.display_name
    )
    # Newly registered users are logged straight in — no second round-trip.
    return _token_response(request, user)


@app.post("/api/v1/auth/login", response_model=TokenResponse, tags=["auth"])
async def login(body: LoginRequest, request: Request) -> TokenResponse:
    users: UserRepository = repo(request)
    user = await users.get_by_email(body.email)
    if not user or not await verify_password(body.password, user["password_hash"]):
        # One message for both cases so we don't leak which emails exist.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return _token_response(request, user)


@app.get("/api/v1/auth/me", response_model=UserPublic, tags=["auth"])
async def me(request: Request, claims: TokenClaims = Depends(current_user)) -> UserPublic:
    user = await repo(request).get_by_id(claims.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User no longer exists")
    return UserPublic(
        id=user["id"],
        email=user["email"],
        display_name=user["display_name"],
        created_at=user["created_at"],
    )


@app.patch("/api/v1/auth/me", response_model=TokenResponse, tags=["auth"])
async def update_me(
    body: ProfileUpdate, request: Request, claims: TokenClaims = Depends(current_user)
) -> TokenResponse:
    """Update your own profile.

    Returns a fresh TokenResponse rather than a bare UserPublic on purpose:
    ``display_name`` is a *claim* inside the JWT, and presence-service labels
    live cursors from the token, not from a database read. Handing back a
    re-signed token is what stops a renamed user showing up under their old name
    to everyone on the board until their session expires.
    """
    users: UserRepository = repo(request)
    user = await users.get_by_id(claims.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User no longer exists")

    if body.new_password is not None:
        if not body.current_password:
            raise HTTPException(
                status_code=400, detail="Enter your current password to set a new one"
            )
        if not await verify_password(body.current_password, user["password_hash"]):
            raise HTTPException(status_code=403, detail="That current password isn't right")

    updated = await users.update_profile(
        claims.user_id,
        display_name=body.display_name.strip() if body.display_name else None,
        password=body.new_password,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="User no longer exists")
    return _token_response(request, updated)


@app.get("/api/v1/auth/users/by-ids", response_model=list[UserPublic], tags=["auth"])
async def users_by_ids(
    ids: str, request: Request, claims: TokenClaims = Depends(current_user)
) -> list[UserPublic]:
    """Resolve a batch of user ids to public profiles.

    Workspace membership is stored by opaque ``user_id``, but a UI that lets you
    assign a task to a teammate needs their display name, not their id. ``ids``
    is a comma-separated list; unknown or malformed ids are dropped rather than
    erroring the whole request.
    """
    wanted = [i for i in (ids.split(",") if ids else []) if i]
    users = await repo(request).get_by_ids(wanted)
    return [
        UserPublic(
            id=u["id"], email=u["email"], display_name=u["display_name"], created_at=u["created_at"]
        )
        for u in users
    ]


@app.get("/api/v1/auth/users/by-email", response_model=UserPublic, tags=["auth"])
async def user_by_email(
    email: str, request: Request, claims: TokenClaims = Depends(current_user)
) -> UserPublic:
    """Resolve an email to its public profile.

    Workspaces are shared by email — a human knows the person they're inviting by
    address, not by opaque id — but membership is stored by ``user_id``. This is the
    lookup that bridges the two. It requires a valid token (the caller must already
    be signed in to invite anyone), which is what stops it from being an open email
    enumeration endpoint despite auth-service's routes being public at the edge.
    """
    user = await repo(request).get_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="No one is registered with that email")
    return UserPublic(
        id=user["id"],
        email=user["email"],
        display_name=user["display_name"],
        created_at=user["created_at"],
    )
