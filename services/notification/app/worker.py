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

from collaberry_common.events import BoardEvent
from collaberry_common.models import utcnow

from .repository import NotificationRepository


async def process_mention(repo: NotificationRepository, event: BoardEvent) -> int:
    """Create a mention notification for each assignee who isn't the actor."""
    payload = event.payload
    assignees = payload.get("assignees", [])
    title = payload.get("title", "a card")
    # An id in an inbox line reads as a glitch, not a person. The publisher
    # carries the name for exactly this; "Someone" covers an event minted before
    # the field existed, which is still truthful.
    actor = event.actor_name.strip() or "Someone"
    created = 0
    for user_id in assignees:
        if user_id == event.actor_id:
            continue
        await repo.add(
            user_id=user_id,
            kind="mention",
            title="You were assigned",
            body=f"{actor} assigned you to “{title}”.",
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
    """Long-running loop: sweep deadlines on a timer.

    Mentions used to be consumed here off Redis pub/sub. They now arrive as
    durable RabbitMQ jobs (see ``JobConsumer`` in notification/app/main.py),
    which is what makes them survive this service being down. Do not re-add a
    subscription to the notify channel here as a "safety net": workspace-service
    publishes each mention to exactly one transport, and a second consumer would
    write two inbox rows for one mention.

    The deadline sweep stays here because it's a timer, not a message — there is
    nothing to queue, and a missed tick is corrected by the next one a minute
    later.
    """
    repo: NotificationRepository = app.state.repo
    warning_hours = app.state.settings.deadline_warning_hours

    while True:
        with contextlib.suppress(Exception):
            await sweep_deadlines(repo, warning_hours)
        await asyncio.sleep(60)  # a minute between sweeps is plenty
