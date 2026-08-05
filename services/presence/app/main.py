"""Presence & Sync service.

Holds the live WebSocket connections and everything ephemeral about a session:
who is looking at a board, who is typing, and the 30-second edit locks that stop
two people clobbering the same card. Board *content* changes arrive indirectly —
workspace-service publishes them to Redis and the hub relays them here — so this
service never talks to Mongo.
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

import jwt
from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import ORJSONResponse

from collaberry_common.auth_dep import current_user
from collaberry_common.db import Mongo
from collaberry_common.redis_client import make_redis
from collaberry_common.security import TokenClaims, decode_access_token, load_public_key
from collaberry_common.settings import get_settings

from .authz import BoardAccess
from .hub import Hub
from .store import PresenceStore


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    app.state.jwt_public_key = load_public_key(settings.jwt_public_key_path)
    app.state.redis = make_redis(settings)
    app.state.store = PresenceStore(app.state.redis, settings)
    app.state.hub = Hub(app.state.redis)
    # Read-only Mongo handle, used solely to answer "may this user watch this
    # board?". Presence still writes nothing to Mongo.
    mongo = Mongo(settings)
    app.state.mongo = mongo
    app.state.access = BoardAccess(mongo, app.state.redis)
    await app.state.hub.start()
    try:
        yield
    finally:
        await app.state.hub.stop()
        mongo.close()
        await app.state.redis.aclose()


app = FastAPI(
    title="Collaberry · Presence & Sync",
    version="0.1.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)


def store(request: Request) -> PresenceStore:
    return request.app.state.store


async def _require_board_access(request: Request, board_id: str, user_id: str) -> None:
    """404 unless the caller is a member of the board's workspace.

    404 rather than 403 so this can't be used to probe which board ids exist —
    the same choice workspace-service makes by raising NotFound for both cases.
    """
    if not await request.app.state.access.may_view(board_id, user_id):
        raise HTTPException(status_code=404, detail="Board not found")


async def _require_item_access(request: Request, item_id: str, user_id: str) -> None:
    """Same gate for the lock API, which is addressed by item rather than board."""
    board_id = await request.app.state.access.board_for_item(item_id)
    if board_id is None:
        raise HTTPException(status_code=404, detail="Item not found")
    await _require_board_access(request, board_id, user_id)


@app.get("/healthz", include_in_schema=False)
async def healthz(request: Request) -> dict:
    await request.app.state.redis.ping()
    return {"status": "ok", "service": "presence"}


# --------------------------------------------------------------------------- #
# REST surface (through Envoy) — snapshots + a lock API for non-socket clients
# --------------------------------------------------------------------------- #
@app.get("/api/v1/presence/boards/{board_id}/presence", tags=["presence"])
async def get_presence(board_id: str, request: Request, claims: TokenClaims = Depends(current_user)):
    await _require_board_access(request, board_id, claims.user_id)
    return {"board_id": board_id, "users": await store(request).list_presence(board_id)}


@app.get("/api/v1/presence/items/{item_id}/lock", tags=["locks"])
async def get_lock(item_id: str, request: Request, claims: TokenClaims = Depends(current_user)):
    await _require_item_access(request, item_id, claims.user_id)
    return await store(request).lock_status(item_id)


@app.post("/api/v1/presence/items/{item_id}/lock", tags=["locks"])
async def acquire_lock(item_id: str, request: Request, claims: TokenClaims = Depends(current_user)):
    await _require_item_access(request, item_id, claims.user_id)
    result = await store(request).acquire_lock(item_id, claims.user_id)
    if not result["granted"]:
        # 423 Locked is exactly the right status for "someone else holds it".
        raise HTTPException(status_code=423, detail=result)
    return result


@app.delete("/api/v1/presence/items/{item_id}/lock", tags=["locks"])
async def release_lock(item_id: str, request: Request, claims: TokenClaims = Depends(current_user)):
    await _require_item_access(request, item_id, claims.user_id)
    released = await store(request).release_lock(item_id, claims.user_id)
    return {"released": released}


# --------------------------------------------------------------------------- #
# WebSocket — the live channel
# --------------------------------------------------------------------------- #
def _authenticate_ws(app: FastAPI, token: str | None) -> TokenClaims:
    if not token:
        raise ValueError("missing token")
    return decode_access_token(token, app.state.jwt_public_key, app.state.settings)


@app.websocket("/ws/boards/{board_id}")
async def board_socket(websocket: WebSocket, board_id: str, token: str | None = None):
    # Browsers/RN can't set Authorization on a WS handshake, so the JWT rides in
    # the query string. Reject before accepting if it doesn't check out.
    try:
        claims = _authenticate_ws(websocket.app, token)
    except (ValueError, jwt.PyJWTError):
        await websocket.close(code=4401)  # our convention: 4401 == unauthorized
        return

    # A valid token says who you are, not what you may watch. Without this a
    # signed-in user could open a socket on any board id and receive every card
    # event on it. 4403 is our "authenticated but not a member" convention.
    if not await websocket.app.state.access.may_view(board_id, claims.user_id):
        await websocket.close(code=4403)
        return

    await websocket.accept()
    st: PresenceStore = websocket.app.state.store
    hub: Hub = websocket.app.state.hub
    conn_id = uuid.uuid4().hex
    user = {"user_id": claims.user_id, "display_name": claims.display_name}

    await hub.add(board_id, conn_id, websocket)
    await st.join(board_id, conn_id, user)
    await _push_presence(hub, st, board_id)

    try:
        while True:
            msg = await websocket.receive_json()
            await _handle_message(msg, websocket, hub, st, board_id, conn_id, claims)
    except WebSocketDisconnect:
        pass
    except Exception:
        # Malformed frame or client vanished — treat as a disconnect.
        pass
    finally:
        await st.leave(board_id, conn_id)
        await hub.remove(board_id, conn_id)
        await _push_presence(hub, st, board_id)


async def _handle_message(
    msg: dict,
    websocket: WebSocket,
    hub: Hub,
    st: PresenceStore,
    board_id: str,
    conn_id: str,
    claims: TokenClaims,
) -> None:
    kind = msg.get("type")

    if kind in ("ping", "heartbeat"):
        await st.heartbeat(board_id, conn_id, {"user_id": claims.user_id, "display_name": claims.display_name})
        await websocket.send_json({"type": "pong"})

    elif kind == "typing":
        await st.mark_typing(board_id, claims.user_id)
        await hub.broadcast(
            board_id,
            {"type": "typing", "user_id": claims.user_id, "display_name": claims.display_name},
            exclude=conn_id,
        )

    elif kind == "lock":
        item_id = msg.get("item_id", "")
        if not await _item_on_board(websocket.app, item_id, board_id):
            await websocket.send_json({"type": "lock_result", "item_id": item_id, "granted": False, "holder": None, "ttl": 0})
            return
        result = await st.acquire_lock(item_id, claims.user_id)
        await websocket.send_json({"type": "lock_result", "item_id": item_id, **result})
        if result["granted"]:
            await hub.broadcast(
                board_id,
                {"type": "lock_state", "item_id": item_id, "locked_by": claims.user_id, "ttl": result["ttl"]},
                exclude=conn_id,
            )

    elif kind == "unlock":
        item_id = msg.get("item_id", "")
        if not await _item_on_board(websocket.app, item_id, board_id):
            return
        released = await st.release_lock(item_id, claims.user_id)
        if released:
            await hub.broadcast(
                board_id,
                {"type": "lock_state", "item_id": item_id, "locked_by": None, "ttl": 0},
            )


async def _item_on_board(app: FastAPI, item_id: str, board_id: str) -> bool:
    """Guard the lock verbs against an item id from some other board.

    The socket is authorized for exactly one board, but the lock/unlock frames
    carry an arbitrary item id — without this, a member of board A could take or
    drop edit locks on board B's cards.
    """
    if not item_id:
        return False
    return await app.state.access.board_for_item(item_id) == board_id


async def _push_presence(hub: Hub, st: PresenceStore, board_id: str) -> None:
    users = await st.list_presence(board_id)
    await hub.broadcast(board_id, {"type": "presence", "users": users})
