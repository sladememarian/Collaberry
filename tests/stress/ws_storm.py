"""WebSocket fan-out storm.

Opens WS_CLIENTS sockets on a single board, then one actor rapidly creates cards
over REST. Every socket should receive every card.created; we measure the
publish→deliver latency (using the server-stamped `ts`) across all of them and
print a percentile summary. This is the real-time claim under pressure.

Run standalone:  GATEWAY_URL=http://localhost:8080 WS_CLIENTS=40 python tests/stress/ws_storm.py
"""
from __future__ import annotations

import asyncio
import json
import os
import statistics
import time
import uuid

import httpx
import websockets

GATEWAY_URL = os.environ.get("GATEWAY_URL", "http://localhost:8080")
WS_URL = GATEWAY_URL.replace("http://", "ws://").replace("https://", "wss://")
WS_CLIENTS = int(os.environ.get("WS_CLIENTS", "40"))
CARDS = int(os.environ.get("WS_CARDS", "25"))

# Force direct connections past any localhost-squatting system proxy.
_HTTPX = {"trust_env": False, "timeout": 15.0}


def _register(name: str) -> dict:
    email = f"storm-{uuid.uuid4().hex[:12]}@collaberry.dev"
    r = httpx.post(
        f"{GATEWAY_URL}/api/v1/auth/register",
        json={"email": email, "password": "storm-pass-123", "display_name": name},
        **_HTTPX,
    )
    r.raise_for_status()
    return r.json()


def _setup() -> tuple[dict, dict, dict]:
    """Owner + one viewer identity + a shared board they can both see."""
    owner = _register("Storm Owner")
    viewer = _register("Storm Viewer")
    oh = {"Authorization": f"Bearer {owner['access_token']}"}

    ws = httpx.post(
        f"{GATEWAY_URL}/api/v1/workspace/workspaces",
        headers=oh,
        json={"name": "Storm", "context": "work"},
        **_HTTPX,
    ).json()
    httpx.post(
        f"{GATEWAY_URL}/api/v1/workspace/workspaces/{ws['id']}/members",
        headers=oh,
        json={"user_id": viewer["user"]["id"], "role": "viewer"},
        **_HTTPX,
    )
    board = httpx.post(
        f"{GATEWAY_URL}/api/v1/workspace/workspaces/{ws['id']}/boards",
        headers=oh,
        json={"name": "Storm board"},
        **_HTTPX,
    ).json()
    return owner, viewer, board


async def _client(board_id: str, token: str, expected: int, latencies: list[float]) -> int:
    uri = f"{WS_URL}/ws/boards/{board_id}?token={token}"
    received = 0
    async with websockets.connect(uri, max_queue=None) as ws:
        try:
            while received < expected:
                raw = await asyncio.wait_for(ws.recv(), timeout=15.0)
                frame = json.loads(raw)
                if frame.get("type") == "board_event" and frame["event"]["type"] == "card.created":
                    latencies.append(time.time() * 1000.0 - frame["event"]["ts"])
                    received += 1
        except asyncio.TimeoutError:
            pass
    return received


async def _produce(board_id: str, token: str, col: str, n: int) -> None:
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(base_url=GATEWAY_URL, headers=headers, **_HTTPX) as c:
        for i in range(n):
            await c.post(
                f"/api/v1/workspace/boards/{board_id}/items",
                json={"type": "card", "title": f"storm-{i}", "column_id": col},
            )
            await asyncio.sleep(0.02)  # ~50 cards/sec


async def main() -> None:
    print(f"Setting up storm: {WS_CLIENTS} sockets, {CARDS} cards on {GATEWAY_URL}")
    owner, viewer, board = _setup()
    col = board["columns"][0]["id"]

    latencies: list[float] = []
    consumers = [
        asyncio.create_task(_client(board["id"], viewer["access_token"], CARDS, latencies))
        for _ in range(WS_CLIENTS)
    ]
    # Give the sockets a moment to subscribe before we start publishing.
    await asyncio.sleep(1.0)

    t0 = time.time()
    await _produce(board["id"], owner["access_token"], col, CARDS)
    got = await asyncio.gather(*consumers)
    elapsed = time.time() - t0

    total_expected = WS_CLIENTS * CARDS
    total_got = sum(got)
    print("\n─── WebSocket storm results ───")
    print(f"clients            : {WS_CLIENTS}")
    print(f"cards published    : {CARDS} in {elapsed:.1f}s")
    print(f"frames delivered   : {total_got}/{total_expected} "
          f"({100 * total_got / total_expected:.1f}%)")
    if latencies:
        latencies.sort()
        p = lambda q: latencies[min(len(latencies) - 1, int(len(latencies) * q))]
        print(f"fan-out latency ms : p50={statistics.median(latencies):.0f} "
              f"p95={p(0.95):.0f} p99={p(0.99):.0f} max={max(latencies):.0f}")
    delivery = total_got / total_expected if total_expected else 0
    print("verdict            :", "PASS" if delivery >= 0.99 else "DEGRADED")


if __name__ == "__main__":
    asyncio.run(main())
