"""Workspace & Content service.

Owns everything that lives in MongoDB: workspaces, boards, and the polymorphic
items (cards / documents / checklists). It is the single writer of board state, so
it is also the single *publisher* of change events — every mutation fans out a
:class:`BoardEvent` on Redis for presence-service to broadcast and
notification-service to react to. That one-writer rule is what keeps real-time
sync consistent.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import ORJSONResponse

from collaberry_common.auth_dep import current_user
from collaberry_common.db import Mongo
from collaberry_common.events import (
    BoardEvent,
    EventType,
    publish_board_event,
    publish_notify_event,
)
from collaberry_common.models import (
    BoardCreate,
    BoardPublic,
    ItemCreate,
    ItemPublic,
    ItemUpdate,
    Member,
    WorkspaceContext,
    WorkspaceCreate,
    WorkspacePublic,
)
from collaberry_common.redis_client import make_redis
from collaberry_common.security import TokenClaims, load_public_key
from collaberry_common.settings import get_settings

from .repository import NotFound, WorkspaceRepository


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    app.state.jwt_public_key = load_public_key(settings.jwt_public_key_path)

    mongo = Mongo(settings)
    app.state.mongo = mongo
    app.state.repo = WorkspaceRepository(mongo)
    await app.state.repo.ensure_indexes()

    app.state.redis = make_redis(settings)
    try:
        yield
    finally:
        mongo.close()
        await app.state.redis.aclose()


app = FastAPI(
    title="Collaberry · Workspace & Content",
    version="0.1.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)


def repo(request: Request) -> WorkspaceRepository:
    return request.app.state.repo


@app.get("/healthz", include_in_schema=False)
async def healthz(request: Request) -> dict:
    await request.app.state.mongo.ping()
    await request.app.state.redis.ping()
    return {"status": "ok", "service": "workspace"}


# --------------------------------------------------------------------------- #
# Workspaces
# --------------------------------------------------------------------------- #
@app.post("/api/v1/workspace/workspaces", response_model=WorkspacePublic, status_code=201, tags=["workspaces"])
async def create_workspace(
    body: WorkspaceCreate, request: Request, claims: TokenClaims = Depends(current_user)
) -> WorkspacePublic:
    ws = await repo(request).create_workspace(
        owner_id=claims.user_id, name=body.name, context=body.context
    )
    return _to_workspace(ws)


@app.get("/api/v1/workspace/workspaces", response_model=list[WorkspacePublic], tags=["workspaces"])
async def list_workspaces(request: Request, claims: TokenClaims = Depends(current_user)):
    rows = await repo(request).list_workspaces(claims.user_id)
    return [_to_workspace(w) for w in rows]


@app.post(
    "/api/v1/workspace/workspaces/{workspace_id}/members",
    response_model=WorkspacePublic,
    tags=["workspaces"],
)
async def add_member(
    workspace_id: str,
    body: Member,
    request: Request,
    claims: TokenClaims = Depends(current_user),
):
    try:
        ws = await repo(request).add_member(
            workspace_id, claims.user_id, body.user_id, body.role.value
        )
    except NotFound:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return _to_workspace(ws)


# --------------------------------------------------------------------------- #
# Boards
# --------------------------------------------------------------------------- #
@app.post(
    "/api/v1/workspace/workspaces/{workspace_id}/boards",
    response_model=BoardPublic,
    status_code=201,
    tags=["boards"],
)
async def create_board(
    workspace_id: str,
    body: BoardCreate,
    request: Request,
    claims: TokenClaims = Depends(current_user),
):
    try:
        board = await repo(request).create_board(
            workspace_id=workspace_id, user_id=claims.user_id, body=body
        )
    except NotFound:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return _to_board(board)


@app.get(
    "/api/v1/workspace/workspaces/{workspace_id}/boards",
    response_model=list[BoardPublic],
    tags=["boards"],
)
async def list_boards(
    workspace_id: str, request: Request, claims: TokenClaims = Depends(current_user)
):
    try:
        rows = await repo(request).list_boards(workspace_id, claims.user_id)
    except NotFound:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return [_to_board(b) for b in rows]


@app.get("/api/v1/workspace/boards/{board_id}", response_model=BoardPublic, tags=["boards"])
async def get_board(board_id: str, request: Request, claims: TokenClaims = Depends(current_user)):
    try:
        return _to_board(await repo(request).get_board(board_id, claims.user_id))
    except NotFound:
        raise HTTPException(status_code=404, detail="Board not found")


# --------------------------------------------------------------------------- #
# Items (the polymorphic cards / docs / checklists)
# --------------------------------------------------------------------------- #
@app.get("/api/v1/workspace/boards/{board_id}/items", response_model=list[ItemPublic], tags=["items"])
async def list_items(board_id: str, request: Request, claims: TokenClaims = Depends(current_user)):
    try:
        rows = await repo(request).list_items(board_id, claims.user_id)
    except NotFound:
        raise HTTPException(status_code=404, detail="Board not found")
    return [_to_item(i) for i in rows]


@app.post(
    "/api/v1/workspace/boards/{board_id}/items",
    response_model=ItemPublic,
    status_code=201,
    tags=["items"],
)
async def create_item(
    board_id: str,
    body: ItemCreate,
    request: Request,
    claims: TokenClaims = Depends(current_user),
):
    try:
        item = await repo(request).create_item(
            board_id=board_id, user_id=claims.user_id, body=body
        )
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc) or "Board not found")
    await _emit(request, EventType.CARD_CREATED, item, claims.user_id)
    return _to_item(item)


@app.patch("/api/v1/workspace/items/{item_id}", response_model=ItemPublic, tags=["items"])
async def update_item(
    item_id: str,
    body: ItemUpdate,
    request: Request,
    claims: TokenClaims = Depends(current_user),
):
    try:
        before = await repo(request).get_item(item_id, claims.user_id)
        item = await repo(request).update_item(item_id, claims.user_id, body)
    except NotFound:
        raise HTTPException(status_code=404, detail="Item not found")

    # A column change is a "move" for the client's animation; otherwise "update".
    moved = before["column_id"] != item["column_id"]
    await _emit(request, EventType.CARD_MOVED if moved else EventType.CARD_UPDATED, item, claims.user_id)
    return _to_item(item)


@app.delete("/api/v1/workspace/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["items"])
async def delete_item(item_id: str, request: Request, claims: TokenClaims = Depends(current_user)):
    try:
        item = await repo(request).delete_item(item_id, claims.user_id)
    except NotFound:
        raise HTTPException(status_code=404, detail="Item not found")
    await _emit(request, EventType.CARD_DELETED, item, claims.user_id)
    return None


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
async def _emit(request: Request, event_type: EventType, item: dict, actor_id: str) -> None:
    """Publish a board event, and a notify event when someone got mentioned."""
    payload = _to_item(item).model_dump(mode="json")
    event = BoardEvent(
        type=event_type,
        board_id=item["board_id"],
        workspace_id=item["workspace_id"],
        actor_id=actor_id,
        payload=payload,
    )
    redis = request.app.state.redis
    await publish_board_event(redis, event)

    # Assignees other than the actor are "mentions" the notifier cares about.
    if event_type in {EventType.CARD_CREATED, EventType.CARD_UPDATED} and item.get("assignees"):
        if any(a != actor_id for a in item["assignees"]):
            await publish_notify_event(
                redis, BoardEvent(**{**event.model_dump(), "type": EventType.MENTION})
            )


def _to_workspace(doc: dict) -> WorkspacePublic:
    return WorkspacePublic(
        id=doc["id"],
        name=doc["name"],
        context=WorkspaceContext(doc["context"]),
        owner_id=doc["owner_id"],
        members=[Member(**m) for m in doc["members"]],
        created_at=doc["created_at"],
    )


def _to_board(doc: dict) -> BoardPublic:
    return BoardPublic(
        id=doc["id"],
        workspace_id=doc["workspace_id"],
        name=doc["name"],
        columns=doc["columns"],
        created_at=doc["created_at"],
    )


def _to_item(doc: dict) -> ItemPublic:
    return ItemPublic(
        id=doc["id"],
        board_id=doc["board_id"],
        workspace_id=doc["workspace_id"],
        column_id=doc["column_id"],
        type=doc["type"],
        title=doc["title"],
        order=doc["order"],
        data=doc["data"],
        assignees=doc["assignees"],
        tags=doc["tags"],
        due_date=doc.get("due_date"),
        created_by=doc["created_by"],
        updated_at=doc["updated_at"],
    )
