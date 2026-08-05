"""Notification service.

Primarily a background worker (mentions + deadline sweeps), but it also serves the
user's inbox over REST so the app can render a bell with a badge. The worker runs
as a lifespan task; the HTTP surface is tiny.
"""

from __future__ import annotations

import asyncio
import contextlib
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import ORJSONResponse

from collaberry_common.auth_dep import current_user
from collaberry_common.db import Mongo
from collaberry_common.events import BoardEvent
from collaberry_common.models import NotificationPublic
from collaberry_common.queue import JobConsumer, QUEUE_NOTIFY, ROUTE_NOTIFY
from collaberry_common.redis_client import make_redis
from collaberry_common.security import TokenClaims, load_public_key
from collaberry_common.settings import get_settings

from .repository import NotificationRepository
from .worker import process_mention, run_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    app.state.jwt_public_key = load_public_key(settings.jwt_public_key_path)

    mongo = Mongo(settings)
    app.state.mongo = mongo
    app.state.repo = NotificationRepository(mongo)
    await app.state.repo.ensure_indexes()
    app.state.redis = make_redis(settings)

    # Start the queue consumer for durable notification jobs
    app.state.consumer = await JobConsumer.create(settings)

    async def handle_notify_job(payload: dict) -> None:
        """Turn one queued mention into inbox rows.

        Raising here is meaningful: JobConsumer catches it, backs off, and
        redelivers, so a transient Mongo blip retries instead of losing the
        notification. Don't swallow exceptions in this function.
        """
        await process_mention(app.state.repo, BoardEvent.model_validate(payload))

    await app.state.consumer.start(QUEUE_NOTIFY, ROUTE_NOTIFY, handle_notify_job)

    # Deadline sweeps stay on a plain timer loop — there's no message to queue,
    # and a missed tick self-corrects on the next one.
    worker_task = asyncio.create_task(run_worker(app), name="notification-worker")
    try:
        yield
    finally:
        worker_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker_task
        await app.state.consumer.close()
        mongo.close()
        await app.state.redis.aclose()


app = FastAPI(
    title="Collaberry · Notifications",
    version="0.1.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)


def repo(request: Request) -> NotificationRepository:
    return request.app.state.repo


@app.get("/healthz", include_in_schema=False)
async def healthz(request: Request) -> dict:
    await request.app.state.mongo.ping()
    await request.app.state.redis.ping()
    return {"status": "ok", "service": "notification"}


@app.get("/api/v1/notifications", response_model=list[NotificationPublic], tags=["notifications"])
async def list_notifications(
    request: Request,
    unread: bool = False,
    claims: TokenClaims = Depends(current_user),
):
    rows = await repo(request).list_for_user(claims.user_id, unread_only=unread)
    return [_to_note(n) for n in rows]


@app.patch("/api/v1/notifications/{note_id}/read", response_model=NotificationPublic, tags=["notifications"])
async def read_notification(
    note_id: str, request: Request, claims: TokenClaims = Depends(current_user)
):
    note = await repo(request).mark_read(note_id, claims.user_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    return _to_note(note)


def _to_note(doc: dict) -> NotificationPublic:
    return NotificationPublic(
        id=doc["id"],
        user_id=doc["user_id"],
        kind=doc["kind"],
        title=doc["title"],
        body=doc["body"],
        board_id=doc.get("board_id"),
        read=doc["read"],
        created_at=doc["created_at"],
    )
