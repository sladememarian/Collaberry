# Collaberry

A real-time, mobile-first project workspace — think *Notion meets Jira*. Organise
personal tasks, university courses, and work projects on Kanban boards made of
polymorphic items (task cards, rich-text documents, and checklists), solo or with
a team that stays in sync in real time.

Built as a decoupled microservice backend behind an Envoy gateway, with a single
React Native codebase that runs on iOS, Android, and the web / Windows.

## Architecture

```
                       ┌─────────────────────────────┐
   React Native app ──▶│  Envoy  (:8080, only public) │
   (iOS/Android/web)   │  routing · CORS · JWT · RL   │
                       └───┬───────┬───────┬───────┬──┘
                           │       │       │       │
              /auth   auth-service │  presence-service   notification-service
           /workspace  workspace-service  (WS + Redis)   (event worker)
                           │       │       │       │
                        ┌──▼───────▼──┐ ┌──▼───────▼──┐
                        │   MongoDB   │ │    Redis    │
                        │ (persistent)│ │ (presence,  │
                        │             │ │  locks, bus)│
                        └─────────────┘ └─────────────┘
```

Only Envoy is published to the host; every service, Mongo, and Redis live on an
internal bridge network. Envoy verifies RS256 tokens against the JWKS that
`auth-service` publishes and forwards identity downstream.

- **auth-service** — register / login, RS256 tokens, JWKS.
- **workspace-service** — the single writer of board state (workspaces, boards,
  polymorphic items in MongoDB). Every mutation fans a `BoardEvent` out on Redis.
- **presence-service** — WebSocket hub: who's on a board, typing indicators, and
  30-second card edit locks. Relays board events to connected clients.
- **notification-service** — event-driven worker (deadlines, @mentions).
- **frontend** — Expo + expo-router + NativeWind (see `frontend/README.md`).

## Quick start

```bash
cp .env.example .env
make up            # build + start the whole stack; Envoy on :8080

# In another terminal — the app:
cd frontend && npm install && npm run web
```

## Make targets

| target        | what it does                                             |
|---------------|----------------------------------------------------------|
| `make up`     | build + start the stack (Envoy on `:8080`)               |
| `make down`   | stop and remove everything (incl. volumes)               |
| `make logs`   | tail all service logs                                    |
| `make test`   | unit/integration **and** e2e (brings the stack up)       |
| `make test-unit` | per-service tests (mongomock/fakeredis, no Docker)    |
| `make test-e2e`  | end-to-end tests through Envoy                         |
| `make stress` | Locust REST load + WebSocket fan-out storm               |
| `make fe-check`  | type-check the React Native app                       |

## Testing

- **Unit / integration** (`services/*/tests`) run against `mongomock` + `fakeredis`
  — fast, no Docker. Cover models, security, repositories, the hub, and the worker.
- **End-to-end** (`tests/e2e`) drive the *running* stack through Envoy: auth,
  workspaces/boards, all three item shapes, workspace isolation, card locking, and
  the real-time WebSocket fan-out (with a latency check against the 100ms target).
- **Stress** (`tests/stress`) — `locustfile.py` loads the REST surface;
  `ws_storm.py` opens many concurrent board sockets and reports fan-out delivery
  and latency percentiles.

```bash
make test-unit          # seconds, no Docker
make test               # full gate (Docker required)
START=1 make stress     # load test, bringing the stack up first
```

## Tech

FastAPI (async, Pydantic v2) · MongoDB · Redis · Envoy · Docker Compose ·
React Native / Expo / TypeScript / NativeWind.
