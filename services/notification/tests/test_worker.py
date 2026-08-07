"""Worker logic: mentions create inbox entries; deadlines fire once per user."""

from __future__ import annotations

from datetime import timedelta

import pytest
import pytest_asyncio
from mongomock_motor import AsyncMongoMockClient

from collaberry_common.events import BoardEvent, EventType
from collaberry_common.models import utcnow
from notification.app.repository import NotificationRepository
from notification.app.worker import process_mention, sweep_deadlines


class _FakeMongo:
    def __init__(self) -> None:
        self.db = AsyncMongoMockClient()["collaberry_test"]


@pytest_asyncio.fixture
async def repo():
    r = NotificationRepository(_FakeMongo())  # type: ignore[arg-type]
    await r.ensure_indexes()
    return r


async def test_mention_notifies_everyone_but_the_actor(repo):
    event = BoardEvent(
        type=EventType.MENTION,
        board_id="b1",
        workspace_id="w1",
        actor_id="alice",
        payload={"id": "card-1", "title": "Design review", "assignees": ["alice", "bob", "cara"]},
    )
    created = await process_mention(repo, event)
    assert created == 2  # bob + cara, not alice

    bob_inbox = await repo.list_for_user("bob")
    assert len(bob_inbox) == 1
    assert bob_inbox[0]["kind"] == "mention"
    assert "Design review" in bob_inbox[0]["body"]
    assert await repo.list_for_user("alice") == []


async def test_mention_body_names_the_actor_not_their_id(repo):
    """An inbox line must read like a sentence about a person.

    The publisher carries ``actor_name`` precisely so the worker never has to
    fall back to the raw ObjectId, which renders as
    "6a735cba202232e3b6170493 assigned you to ..." — indistinguishable from a bug.
    """
    event = BoardEvent(
        type=EventType.MENTION,
        board_id="b1",
        workspace_id="w1",
        actor_id="6a735cba202232e3b6170493",
        actor_name="Amirpouyan",
        payload={"id": "card-1", "title": "Ship it", "assignees": ["bob"]},
    )
    await process_mention(repo, event)

    body = (await repo.list_for_user("bob"))[0]["body"]
    assert body.startswith("Amirpouyan assigned you to")
    assert "6a735cba202232e3b6170493" not in body


async def test_mention_body_falls_back_when_the_actor_has_no_name(repo):
    """An event minted before ``actor_name`` existed still has to read sanely."""
    event = BoardEvent(
        type=EventType.MENTION,
        board_id="b1",
        workspace_id="w1",
        actor_id="6a735cba202232e3b6170493",
        payload={"id": "card-1", "title": "Ship it", "assignees": ["bob"]},
    )
    await process_mention(repo, event)

    body = (await repo.list_for_user("bob"))[0]["body"]
    assert body.startswith("Someone assigned you to")
    assert "6a735cba202232e3b6170493" not in body


async def test_deadline_sweep_fires_once_per_user(repo):
    # Seed an item due in 2 hours, assigned to bob.
    soon = utcnow() + timedelta(hours=2)
    await repo._items.insert_one(  # type: ignore[attr-defined]
        {"board_id": "b1", "title": "Submit report", "assignees": ["bob"], "due_date": soon}
    )

    first = await sweep_deadlines(repo, warning_hours=24)
    assert first == 1
    # A second sweep must not double-notify.
    second = await sweep_deadlines(repo, warning_hours=24)
    assert second == 0

    inbox = await repo.list_for_user("bob")
    assert len(inbox) == 1
    assert inbox[0]["kind"] == "deadline"


async def test_far_off_deadline_is_ignored(repo):
    far = utcnow() + timedelta(days=10)
    await repo._items.insert_one(  # type: ignore[attr-defined]
        {"board_id": "b1", "title": "Later", "assignees": ["bob"], "due_date": far}
    )
    assert await sweep_deadlines(repo, warning_hours=24) == 0


async def test_mark_read(repo):
    note = await repo.add(user_id="bob", kind="mention", title="t", body="b")
    updated = await repo.mark_read(note["id"], "bob")
    assert updated["read"] is True
    # Wrong user can't flip someone else's notification.
    assert await repo.mark_read(note["id"], "eve") is None
