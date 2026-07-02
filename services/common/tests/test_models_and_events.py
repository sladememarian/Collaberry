"""Validation rules for the polymorphic item model + event serialisation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from collaberry_common.events import BoardEvent, EventType, board_channel, parse_event
from collaberry_common.models import ItemCreate, ItemType


def test_checklist_item_normalises_entries():
    item = ItemCreate(
        type=ItemType.checklist,
        title="Packing list",
        column_id="todo",
        data={"entries": [{"text": "passport"}, {"text": "charger", "done": True}]},
    )
    assert item.data["entries"][0] == {"text": "passport", "done": False}
    assert item.data["entries"][1]["done"] is True


def test_document_item_normalises_blocks():
    item = ItemCreate(
        type=ItemType.document,
        title="Spec",
        column_id="todo",
        data={"blocks": [{"type": "heading", "text": "Goals"}, {"text": "ship it"}]},
    )
    assert item.data["blocks"][0]["type"] == "heading"
    assert item.data["blocks"][1]["type"] == "paragraph"  # defaulted


def test_card_rejects_non_string_description():
    with pytest.raises(ValidationError):
        ItemCreate(
            type=ItemType.card,
            title="Bug",
            column_id="todo",
            data={"description": 123},
        )


def test_blank_title_is_rejected():
    with pytest.raises(ValidationError):
        ItemCreate(type=ItemType.card, title="", column_id="todo")


def test_board_event_round_trip():
    ev = BoardEvent(
        type=EventType.CARD_MOVED,
        board_id="b1",
        workspace_id="w1",
        actor_id="u1",
        payload={"id": "c1", "column_id": "done"},
    )
    wire = ev.model_dump_json()
    back = parse_event(wire)
    assert back.type is EventType.CARD_MOVED
    assert back.payload["column_id"] == "done"
    assert back.ts == pytest.approx(ev.ts)
    assert board_channel("b1") == "events:board:b1"
