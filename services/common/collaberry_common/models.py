"""Pydantic v2 domain models shared across services.

The interesting one is the polymorphic item: a single board slot can be a task
card, a rich-text document, or a checklist, distinguished by ``type`` and carrying
its shape-specific fields under ``data``. Validators keep ``data`` honest for each
variant so a "checklist" can never sneak in without its items.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class WorkspaceContext(str, Enum):
    personal = "personal"
    university = "university"
    work = "work"


class MemberRole(str, Enum):
    owner = "owner"
    editor = "editor"
    viewer = "viewer"


class ItemType(str, Enum):
    card = "card"
    document = "document"
    checklist = "checklist"


# --------------------------------------------------------------------------- #
# Users & auth I/O
# --------------------------------------------------------------------------- #
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)
    display_name: str = Field(min_length=1, max_length=80)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    id: str
    email: EmailStr
    display_name: str
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: UserPublic


# --------------------------------------------------------------------------- #
# Workspaces & boards
# --------------------------------------------------------------------------- #
class Member(BaseModel):
    user_id: str
    role: MemberRole = MemberRole.editor


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    context: WorkspaceContext = WorkspaceContext.personal


class WorkspacePublic(BaseModel):
    id: str
    name: str
    context: WorkspaceContext
    owner_id: str
    members: list[Member]
    created_at: datetime


class Column(BaseModel):
    id: str
    name: str
    order: int


class BoardCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    # Sensible default lanes; a human would tweak these, so we don't over-engineer.
    columns: list[str] = Field(default_factory=lambda: ["To do", "In progress", "Done"])


class BoardPublic(BaseModel):
    id: str
    workspace_id: str
    name: str
    columns: list[Column]
    created_at: datetime


# --------------------------------------------------------------------------- #
# Polymorphic items
# --------------------------------------------------------------------------- #
class ChecklistEntry(BaseModel):
    text: str
    done: bool = False


class DocumentBlock(BaseModel):
    # A minimal block model — enough to round-trip a rich-text doc, room to grow.
    # `image` carries its src in `url`; `todo` uses `checked`; `locked_by` mirrors
    # the presence-service live edit lock so the editor can paint the owner's rim.
    type: Literal["paragraph", "heading", "bullet", "todo", "code", "image"] = "paragraph"
    text: str = ""
    checked: bool | None = None
    url: str | None = None
    locked_by: str | None = None


class ItemCreate(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    type: ItemType = ItemType.card
    title: str = Field(min_length=1, max_length=200)
    column_id: str
    data: dict[str, Any] = Field(default_factory=dict)
    assignees: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    due_date: datetime | None = None

    @model_validator(mode="after")
    def _shape_matches_type(self) -> "ItemCreate":
        _validate_item_data(self.type, self.data)
        return self


class ItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    column_id: str | None = None
    order: float | None = None
    data: dict[str, Any] | None = None
    assignees: list[str] | None = None
    tags: list[str] | None = None
    due_date: datetime | None = None

    @field_validator("data")
    @classmethod
    def _non_null_data(cls, v: dict | None) -> dict | None:
        return v


class ItemPublic(BaseModel):
    id: str
    board_id: str
    workspace_id: str
    column_id: str
    type: ItemType
    title: str
    order: float
    data: dict[str, Any]
    assignees: list[str]
    tags: list[str]
    due_date: datetime | None
    created_by: str
    updated_at: datetime


def _validate_item_data(item_type: str, data: dict) -> None:
    """Coerce/verify the ``data`` blob against the item variant.

    We normalise in place so callers can persist ``data`` as-is. Raises
    ``ValueError`` (surfaced by Pydantic as a 422) when the shape is wrong.
    """
    t = item_type.value if isinstance(item_type, ItemType) else item_type
    if t == ItemType.checklist.value:
        entries = data.get("entries", [])
        # Validate each entry through the model, then re-dump to a clean list.
        data["entries"] = [ChecklistEntry.model_validate(e).model_dump() for e in entries]
    elif t == ItemType.document.value:
        blocks = data.get("blocks", [])
        data["blocks"] = [DocumentBlock.model_validate(b).model_dump() for b in blocks]
    elif t == ItemType.card.value:
        # A card just carries an optional description; anything else is ignored.
        if "description" in data and not isinstance(data["description"], str):
            raise ValueError("card description must be a string")


# --------------------------------------------------------------------------- #
# Notifications
# --------------------------------------------------------------------------- #
class NotificationPublic(BaseModel):
    id: str
    user_id: str
    kind: str
    title: str
    body: str
    board_id: str | None = None
    read: bool = False
    created_at: datetime
