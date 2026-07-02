# presence-service — live sync, presence & locks

**Path:** `services/presence` · **Port (internal):** 8000
**Envoy prefixes:** `/api/v1/presence` (REST) and `/ws/` (WebSocket, JWT-check disabled at the edge — the token rides the query string)
**Stores:** Redis only. Never touches Mongo.

## What it does

Three jobs, all ephemeral:

1. **The live channel.** Holds every open WebSocket and relays board change
   events (published by workspace-service over Redis) to the right sockets.
2. **Presence & typing.** Who is looking at a board right now; who is typing.
3. **Edit locks.** The 30-second collision guard on text cards.

## WebSocket protocol — `WS /ws/boards/{board_id}?token=JWT`

The token is verified *before* `accept()`; a bad one closes with code `4401`.
On join, the connection is registered with the hub + Redis and a fresh presence
roster is broadcast to the whole board. On disconnect the same happens in
reverse — presence updates are pushed, never polled.

**Client → server frames**

| frame | effect |
|---|---|
| `{"type":"ping"}` | Refreshes the connection's 45s presence TTL, answers `pong` (the app heartbeats every 15s) |
| `{"type":"typing"}` | 5s typing key in Redis + `typing` broadcast to everyone else on the board |
| `{"type":"lock","item_id":…}` | Try to acquire the 30s lock. Caller gets `lock_result` (granted or holder+TTL); on success everyone else gets `lock_state` |
| `{"type":"unlock","item_id":…}` | Owner-checked release; broadcasts cleared `lock_state` |

**Server → client frames:** `presence` (full roster), `typing`, `lock_result`,
`lock_state`, `pong`, and `board_event` (the relayed workspace-service event —
`event.type`, `event.payload` = the full item, `event.ts` for latency
measurement).

## REST surface

| Endpoint | Behaviour |
|---|---|
| `GET /boards/{id}/presence` | Snapshot of who's on a board (for screens without a socket) |
| `GET /items/{id}/lock` | `{locked, holder, ttl}` |
| `POST /items/{id}/lock` | Acquire; **423 Locked** with holder+TTL detail when someone else has it |
| `DELETE /items/{id}/lock` | Owner-checked release |

## Files

- **`app/store.py`** — `PresenceStore`, pure Redis operations with no WebSocket
  coupling (unit-testable against fakeredis). Presence = one 45s key per
  connection plus a set index per board; `list_presence` lazily prunes expired
  entries and dedupes multi-tab users. Locks = `SET NX EX 30`; the holder
  re-acquiring refreshes the TTL; release verifies ownership.
- **`app/hub.py`** — `Hub`, the fan-out engine. One background task drains a
  single Redis pub/sub connection and dispatches by channel; board channels are
  subscribed on the first socket for a board and unsubscribed on the last one
  leaving. `broadcast` drops dead sockets as it goes. No polling anywhere —
  that's what keeps fan-out latency in single-digit milliseconds.
- **`app/main.py`** — the FastAPI app wiring both together: WS auth, the message
  loop (`_handle_message`), presence pushes on join/leave, and the REST routes.

## Timing constants (from shared `Settings`)

lock TTL 30s · typing TTL 5s · presence TTL 45s · client heartbeat 15s
(heartbeat < presence TTL means an alive connection never looks stale).
