"""REST load profile for Collaberry, driven through Envoy.

Each simulated user registers once, gets their auto Personal workspace, spins up a
board, then loops the everyday actions — list boards, create cards, move them,
read them back. The mix is weighted to look like real usage: lots of reads, fewer
writes. Run via `make stress` (see scripts/run-stress.sh).
"""
from __future__ import annotations

import random
import uuid

from locust import HttpUser, between, task


class WorkspaceUser(HttpUser):
    # Think time between actions — keeps the load realistic rather than a tight loop.
    wait_time = between(0.2, 1.2)

    def on_start(self) -> None:
        email = f"load-{uuid.uuid4().hex[:12]}@collaberry.dev"
        r = self.client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": "loadtest-pass-1", "display_name": "Load Bot"},
            name="POST /auth/register",
        )
        if r.status_code != 201:
            self.environment.runner.quit()
            return
        body = r.json()
        self.client.headers.update({"Authorization": f"Bearer {body['access_token']}"})

        ws = self.client.post(
            "/api/v1/workspace/workspaces",
            json={"name": "Load WS", "context": random.choice(["work", "university", "personal"])},
            name="POST /workspaces",
        ).json()
        self.workspace_id = ws["id"]

        board = self.client.post(
            f"/api/v1/workspace/workspaces/{self.workspace_id}/boards",
            json={"name": "Load board"},
            name="POST /boards",
        ).json()
        self.board_id = board["id"]
        self.columns = [c["id"] for c in board["columns"]]
        self.items: list[str] = []

    @task(6)
    def list_items(self) -> None:
        self.client.get(
            f"/api/v1/workspace/boards/{self.board_id}/items", name="GET /board/items"
        )

    @task(3)
    def create_card(self) -> None:
        r = self.client.post(
            f"/api/v1/workspace/boards/{self.board_id}/items",
            json={
                "type": "card",
                "title": f"Card {random.randint(1, 9999)}",
                "column_id": random.choice(self.columns),
            },
            name="POST /board/items",
        )
        if r.status_code == 201:
            self.items.append(r.json()["id"])

    @task(2)
    def move_card(self) -> None:
        if not self.items:
            return
        self.client.patch(
            f"/api/v1/workspace/items/{random.choice(self.items)}",
            json={"column_id": random.choice(self.columns)},
            name="PATCH /items (move)",
        )

    @task(1)
    def list_boards(self) -> None:
        self.client.get(
            f"/api/v1/workspace/workspaces/{self.workspace_id}/boards", name="GET /workspace/boards"
        )
