"""Mongo persistence for workspaces, boards and the polymorphic items.

Access control lives here as well: every read/write is scoped to a user who must
be a member of the owning workspace. Route handlers pass the caller's id in and
trust this layer to refuse anything they shouldn't see.
"""

from __future__ import annotations

import uuid

from bson import ObjectId
from bson.errors import InvalidId

from collaberry_common.db import Mongo, oid_to_str
from collaberry_common.models import (
    BoardCreate,
    Column,
    ItemCreate,
    ItemUpdate,
    WorkspaceContext,
    utcnow,
)


class NotFound(Exception):
    """Raised when a document is absent *or* the caller may not see it."""


class ConflictError(Exception):
    """Raised when a request is valid but conflicts with current state (e.g.
    deleting a lane that still holds cards). Surfaced by routes as a 409."""


def _oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise NotFound(value)


class WorkspaceRepository:
    def __init__(self, mongo: Mongo) -> None:
        self._ws = mongo.db["workspaces"]
        self._boards = mongo.db["boards"]
        self._items = mongo.db["items"]

    async def ensure_indexes(self) -> None:
        await self._ws.create_index("members.user_id")
        await self._boards.create_index("workspace_id")
        # The hot query is "give me a board's items, in order".
        await self._items.create_index([("board_id", 1), ("column_id", 1), ("order", 1)])

    # ---- workspaces ------------------------------------------------------
    async def create_workspace(self, *, owner_id: str, name: str, context: WorkspaceContext) -> dict:
        doc = {
            "name": name,
            "context": context.value if isinstance(context, WorkspaceContext) else context,
            "owner_id": owner_id,
            "members": [{"user_id": owner_id, "role": "owner"}],
            "created_at": utcnow(),
        }
        res = await self._ws.insert_one(doc)
        doc["_id"] = res.inserted_id
        return oid_to_str(doc)  # type: ignore[return-value]

    async def list_workspaces(self, user_id: str) -> list[dict]:
        cur = self._ws.find({"members.user_id": user_id}).sort("created_at", 1)
        rows = [oid_to_str(d) for d in await cur.to_list(length=500)]  # type: ignore[misc]
        # First visit: hand the user a "Personal" workspace so the app is never an
        # empty void on first launch (per the spec). Lazily provisioned here rather
        # than at register time, which keeps auth-service decoupled from Mongo's
        # workspace collection — the one owner of this data stays the one writer.
        if not rows:
            personal = await self.create_workspace(
                owner_id=user_id, name="Personal", context=WorkspaceContext.personal
            )
            rows = [personal]
        return rows

    async def get_workspace_for_member(self, workspace_id: str, user_id: str) -> dict:
        doc = await self._ws.find_one({"_id": _oid(workspace_id), "members.user_id": user_id})
        if not doc:
            raise NotFound(workspace_id)
        return oid_to_str(doc)  # type: ignore[return-value]

    async def _assert_member(self, workspace_id: str, user_id: str) -> None:
        await self.get_workspace_for_member(workspace_id, user_id)

    async def add_member(self, workspace_id: str, owner_id: str, new_user_id: str, role: str) -> dict:
        ws = await self.get_workspace_for_member(workspace_id, owner_id)
        if ws["owner_id"] != owner_id:
            raise NotFound(workspace_id)  # only the owner invites; hide otherwise
        if any(m["user_id"] == new_user_id for m in ws["members"]):
            return ws
        await self._ws.update_one(
            {"_id": _oid(workspace_id)},
            {"$push": {"members": {"user_id": new_user_id, "role": role}}},
        )
        return await self.get_workspace_for_member(workspace_id, owner_id)

    # ---- boards ----------------------------------------------------------
    async def create_board(self, *, workspace_id: str, user_id: str, body: BoardCreate) -> dict:
        await self._assert_member(workspace_id, user_id)
        columns = [
            Column(id=uuid.uuid4().hex[:8], name=name, order=i).model_dump()
            for i, name in enumerate(body.columns)
        ]
        doc = {
            "workspace_id": workspace_id,
            "name": body.name,
            "columns": columns,
            "created_at": utcnow(),
        }
        res = await self._boards.insert_one(doc)
        doc["_id"] = res.inserted_id
        return oid_to_str(doc)  # type: ignore[return-value]

    async def list_boards(self, workspace_id: str, user_id: str) -> list[dict]:
        await self._assert_member(workspace_id, user_id)
        cur = self._boards.find({"workspace_id": workspace_id}).sort("created_at", 1)
        return [oid_to_str(d) for d in await cur.to_list(length=500)]  # type: ignore[misc]

    async def get_board(self, board_id: str, user_id: str) -> dict:
        board = await self._boards.find_one({"_id": _oid(board_id)})
        if not board:
            raise NotFound(board_id)
        await self._assert_member(board["workspace_id"], user_id)
        return oid_to_str(board)  # type: ignore[return-value]

    async def add_column(self, board_id: str, user_id: str, name: str) -> dict:
        """Append a new lane to a board (e.g. 'Code review'). Order is one past
        the current max so it lands on the right of the existing lanes."""
        board = await self.get_board(board_id, user_id)
        next_order = max((c["order"] for c in board["columns"]), default=-1) + 1
        column = Column(id=uuid.uuid4().hex[:8], name=name, order=next_order).model_dump()
        await self._boards.update_one(
            {"_id": _oid(board_id)}, {"$push": {"columns": column}}
        )
        return await self.get_board(board_id, user_id)

    async def reorder_columns(self, board_id: str, user_id: str, ordered_ids: list[str]) -> dict:
        """Rewrite lane order from a full list of column ids (drag-to-reorder).
        The list must be a permutation of the board's current columns — any
        mismatch is rejected so a stale client can't drop or duplicate a lane."""
        board = await self.get_board(board_id, user_id)
        current = {c["id"] for c in board["columns"]}
        if set(ordered_ids) != current or len(ordered_ids) != len(board["columns"]):
            raise ConflictError("column order must list every lane exactly once")
        by_id = {c["id"]: c for c in board["columns"]}
        new_columns = [{**by_id[cid], "order": i} for i, cid in enumerate(ordered_ids)]
        await self._boards.update_one(
            {"_id": _oid(board_id)}, {"$set": {"columns": new_columns}}
        )
        return await self.get_board(board_id, user_id)

    async def rename_column(self, board_id: str, user_id: str, column_id: str, name: str) -> dict:
        board = await self.get_board(board_id, user_id)
        if not any(c["id"] == column_id for c in board["columns"]):
            raise NotFound(f"column {column_id}")
        await self._boards.update_one(
            {"_id": _oid(board_id), "columns.id": column_id},
            {"$set": {"columns.$.name": name}},
        )
        return await self.get_board(board_id, user_id)

    async def delete_column(self, board_id: str, user_id: str, column_id: str) -> dict:
        """Remove a lane. Refuses the last remaining lane (a board needs one) and
        refuses a non-empty lane so cards are never silently orphaned."""
        board = await self.get_board(board_id, user_id)
        if not any(c["id"] == column_id for c in board["columns"]):
            raise NotFound(f"column {column_id}")
        if len(board["columns"]) <= 1:
            raise ConflictError("a board must keep at least one column")
        count = await self._items.count_documents({"board_id": board_id, "column_id": column_id})
        if count:
            raise ConflictError("move or delete this column's cards first")
        await self._boards.update_one(
            {"_id": _oid(board_id)}, {"$pull": {"columns": {"id": column_id}}}
        )
        return await self.get_board(board_id, user_id)

    # ---- items -----------------------------------------------------------
    async def _next_order(self, board_id: str, column_id: str) -> float:
        last = await self._items.find_one(
            {"board_id": board_id, "column_id": column_id}, sort=[("order", -1)]
        )
        return (last["order"] + 1.0) if last else 1.0

    async def create_item(self, *, board_id: str, user_id: str, body: ItemCreate) -> dict:
        board = await self.get_board(board_id, user_id)
        if not any(c["id"] == body.column_id for c in board["columns"]):
            raise NotFound(f"column {body.column_id}")
        doc = {
            "board_id": board_id,
            "workspace_id": board["workspace_id"],
            "column_id": body.column_id,
            "type": body.type if isinstance(body.type, str) else body.type.value,
            "title": body.title,
            "order": await self._next_order(board_id, body.column_id),
            "data": body.data,
            "assignees": body.assignees,
            "tags": body.tags,
            "due_date": body.due_date,
            "estimation_time": body.estimation_time,
            "start_date": body.start_date,
            "end_date": body.end_date,
            "priority": body.priority,
            "created_by": user_id,
            "updated_at": utcnow(),
        }
        res = await self._items.insert_one(doc)
        doc["_id"] = res.inserted_id
        return oid_to_str(doc)  # type: ignore[return-value]

    async def list_items(self, board_id: str, user_id: str) -> list[dict]:
        await self.get_board(board_id, user_id)
        cur = self._items.find({"board_id": board_id}).sort([("column_id", 1), ("order", 1)])
        return [oid_to_str(d) for d in await cur.to_list(length=2000)]  # type: ignore[misc]

    async def get_item(self, item_id: str, user_id: str) -> dict:
        item = await self._items.find_one({"_id": _oid(item_id)})
        if not item:
            raise NotFound(item_id)
        await self._assert_member(item["workspace_id"], user_id)
        return oid_to_str(item)  # type: ignore[return-value]

    async def update_item(self, item_id: str, user_id: str, patch: ItemUpdate) -> dict:
        item = await self.get_item(item_id, user_id)
        changes: dict = {"updated_at": utcnow()}
        moved = False

        if patch.title is not None:
            changes["title"] = patch.title
        if patch.type is not None:
            changes["type"] = patch.type.value if hasattr(patch.type, "value") else patch.type
        if patch.data is not None:
            changes["data"] = patch.data
        if patch.assignees is not None:
            changes["assignees"] = patch.assignees
        if patch.tags is not None:
            changes["tags"] = patch.tags
        # These four are cleared with an explicit null, so "was it sent at all"
        # (not "is it non-null") is what decides whether to touch the field.
        if "due_date" in patch.model_fields_set:
            changes["due_date"] = patch.due_date
        if "estimation_time" in patch.model_fields_set:
            changes["estimation_time"] = patch.estimation_time
        if "start_date" in patch.model_fields_set:
            changes["start_date"] = patch.start_date
        if "end_date" in patch.model_fields_set:
            changes["end_date"] = patch.end_date
        if patch.priority is not None:
            changes["priority"] = patch.priority
        if patch.column_id is not None and patch.column_id != item["column_id"]:
            changes["column_id"] = patch.column_id
            moved = True
        if patch.order is not None:
            changes["order"] = patch.order
        elif moved:
            # Moved columns without an explicit slot → drop it at the bottom.
            changes["order"] = await self._next_order(item["board_id"], patch.column_id)

        await self._items.update_one({"_id": _oid(item_id)}, {"$set": changes})
        return await self.get_item(item_id, user_id)

    async def delete_item(self, item_id: str, user_id: str) -> dict:
        item = await self.get_item(item_id, user_id)
        await self._items.delete_one({"_id": _oid(item_id)})
        return item
