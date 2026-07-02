"""The event-driven worker.

Two triggers, as the spec calls for:

* **@mentions** — workspace-service publishes a ``mention`` event whenever someone
  is assigned to a card; we turn that into an inbox entry for each mentioned user.
* **approaching deadlines** — a periodic sweep finds items whose ``due_date`` lands
  inside the warning window and reminds their assignees, exactly once.

The two entry points below are plain async functions taking a repository so they
can be unit-tested with an in-memory Mongo, with no Redis loop in the way.
"""

from __future__ import annotations

import asyncio
import contextlib
from datetime import timedelta

from collaberry_common.events import BoardEvent, EventType, NOTIFY_CHANNEL, parse_event
from collaberry_common.models import utcnow

from .repository import NotificationRepository


async def process_mention(repo: NotificationRepository, event: BoardEvent) -> int:
    """Create a mention notification for each assignee who isn't the actor."""
    payload = event.payload
    assignees = payload.get("assignees", [])
    title = payload.get("title", "a card")
    created = 0
    for user_id in assignees:
        if user_id == event.actor_id:
            continue
        await repo.add(
            user_id=user_id,
            kind="mention",
            title="You were assigned",
            body=f"{event.actor_id} assigned you to “{title}”.",
            board_id=event.board_id,
            item_id=payload.get("id"),
        )
        created += 1
    return created


async def sweep_deadlines(repo: NotificationRepository, warning_hours: int) -> int:
    """Remind assignees about items due within the warning window (once each)."""
    now = utcnow()
    horizon = now + timedelta(hours=warning_hours)
    created = 0
    for item in await repo.due_between(now, horizon):
        for user_id in item.get("assignees", []):
            if not await repo.claim_deadline(item["id"], user_id):
                continue
            due = item.get("due_date")
            await repo.add(
                user_id=user_id,
                kind="deadline",
                title="Deadline approaching",
                body=f"“{item.get('title', 'A task')}” is due {due:%b %d, %H:%M}." if due else "A task is due soon.",
                board_id=item.get("board_id"),
                item_id=item["id"],
            )
            created += 1
    return created


async def run_worker(app) -> None:
    """Long-running loop: drain the notify channel and sweep deadlines on a timer."""
    repo: NotificationRepository = app.state.repo
    redis = app.state.redis
    warning_hours = app.state.settings.deadline_warning_hours

    pubsub = redis.pubsub()
    await pubsub.subscribe(NOTIFY_CHANNEL)
    app.state._pubsub = pubsub

    async def consume_events() -> None:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            with contextlib.suppress(Exception):
                event = parse_event(message["data"])
                if event.type is EventType.MENTION:
                    await process_mention(repo, event)

    async def sweep_loop() -> None:
        while True:
            with contextlib.suppress(Exception):
                await sweep_deadlines(repo, warning_hours)
            await asyncio.sleep(60)  # a minute between sweeps is plenty

    await asyncio.gather(consume_events(), sweep_loop())
