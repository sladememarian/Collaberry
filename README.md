# Collaberry

A real-time, mobile-first project workspace — think *Notion meets Jira*. Organise
personal tasks, university courses, and work projects on Kanban boards made of
polymorphic items (task cards, rich-text documents, and checklists), solo or with
a team that stays in sync in real time.

Built as a decoupled microservice backend behind an Envoy gateway, with a single
React Native codebase that runs on iOS, Android, and the web / Windows.

## Architecture

Collaberry is a set of small backend services behind a single gateway, with one
React Native codebase as the client (iOS, Android, web / Windows).

```
        React Native app  (iOS · Android · Web)
                         │
                         │  HTTP + WebSocket
                         ▼
   ┌──────────────────────────────────────────────┐
   │  Envoy gateway  :8080   (only public port)   │
   │  routing · CORS · JWT verification · rate    │
   │  limiting                                    │
   └───────┬──────────────────┬─────────────┬─────┘
           │ /auth            │ /workspace  │ WebSocket
           ▼                  ▼             ▼
   ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │ auth-service │  │ workspace-service│  │ presence-service │
   └──────┬───────┘  └────────┬─────────┘  └────────┬─────────┘
          │                   │                     │
          │                   │ publishes           │ subscribes
          │                   │ BoardEvents         │ + presence, locks
          ▼                   ▼                     ▼
   ┌─────────────────────────────┐    ┌──────────────────────────┐
   │ MongoDB (persistent data)   │    │ Redis (event bus,        │
   │                             │    │ presence, edit locks)    │
   └─────────────────────────────┘    └─────────────┬────────────┘
                                                    │ subscribes
                                                    ▼
                                      ┌──────────────────────────┐
                                      │ notification-service     │
                                      │ (background worker)      │
                                      └──────────────────────────┘
```

Only Envoy is published to the host. Every service, MongoDB, and Redis run on an
internal Docker bridge network and cannot be reached directly.

### Components

| Component | Role |
|-----------|------|
| **Envoy** | Single entry point. Routes requests, handles CORS and rate limiting, and verifies RS256 JWTs against the JWKS published by `auth-service`, then forwards the user identity downstream. |
| **auth-service** | Register / login, issues RS256 tokens, publishes the JWKS. |
| **workspace-service** | The single writer of board state: workspaces, boards, and polymorphic items (task cards, rich-text documents, checklists) stored in MongoDB. Every change is broadcast as a `BoardEvent` on Redis. |
| **presence-service** | WebSocket hub. Tracks who is on a board, shows typing indicators, manages 30-second card edit locks, and relays board events to connected clients. |
| **notification-service** | Background worker that reacts to events (deadlines, @mentions). It has no public route. |
| **frontend** | Expo + expo-router + NativeWind (see `frontend/README.md`). |

### How a change reaches other users

1. The client sends a request (e.g. edit a card) to Envoy, which checks the JWT.
2. Envoy routes it to `workspace-service`, which saves the change to MongoDB.
3. `workspace-service` publishes a `BoardEvent` to Redis.
4. `presence-service` receives the event and pushes it over WebSocket to everyone on that board.
5. `notification-service` receives the same event and handles any deadlines or @mentions.

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