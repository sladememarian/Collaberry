# Architecture

## The shape of the system

```
 React Native app (Expo)
        │  HTTP + WebSocket, one host: localhost:8088
        ▼
 ┌────────────────────  Envoy (edge proxy)  ────────────────────┐
 │  routing by path · CORS · rate limit · RS256 JWT verification │
 └──┬──────────────┬───────────────────┬────────────────────────┘
    │ /api/v1/auth │ /api/v1/workspace │ /api/v1/presence, /ws/…, /api/v1/notifications
    ▼              ▼                   ▼
 auth-service   workspace-service   presence-service     notification-service
 (users, JWT)   (Mongo content)     (Redis live state)   (background worker)
    │              │        │            │  ▲                  ▲
    ▼              ▼        └── publish ─┴──┘ subscribe        │ subscribe
  MongoDB       MongoDB          Redis pub/sub ────────────────┘
                                 (events:board:{id}, events:notify)
```

Everything except Envoy lives on an internal Docker bridge network (`nexus-net`)
and is unreachable from the host. Envoy publishes host port **8088** (8080 was
hijacked by a system proxy agent on the dev machine — see `infrastructure.md`).

## Why four services

The split follows *data ownership*, not size:

1. **auth-service** owns identity. It's the only holder of the RSA private key,
   so it's the only thing that can mint tokens. Everything else just verifies.
2. **workspace-service** owns persistent content (workspaces, boards, items) in
   MongoDB. Because it's the *single writer*, every mutation can be paired with
   exactly one published event — real-time consumers can't miss or double-count.
3. **presence-service** owns ephemeral state (who's viewing, who's typing, edit
   locks) in Redis, plus the live WebSocket connections. It never touches Mongo.
4. **notification-service** owns the inbox. It has no synchronous dependency on
   the others — it just reacts to events and the clock.

## The event flow (real-time sync)

1. A client PATCHes a card through Envoy → workspace-service.
2. workspace-service writes to Mongo, then publishes a `BoardEvent` to the Redis
   channel `events:board:{board_id}` (with a server timestamp in epoch millis).
3. presence-service's hub — a single background pub/sub reader — receives it and
   fans it out to every WebSocket currently open on that board.
4. Each client patches its local state. The E2E suite asserts the whole path
   completes well within the 100ms budget on a healthy stack.

Mentions ride a second channel (`events:notify`) consumed by the
notification-service worker.

## The locking model

Editing a text card takes a Redis `SET key value NX EX 30` lock:

- **NX** — first writer wins; a second editor gets back who holds it and the TTL.
- **EX 30** — abandoned locks self-heal in 30 seconds; no janitor process.
- The holder re-acquiring refreshes the TTL (keeps the lock alive while typing).
- Release is owner-checked — you can't unlock someone else's card.

Lock changes are also broadcast on the board socket so other viewers grey the
card out instantly rather than discovering the lock when their save fails.

## Auth flow

1. Register/login at auth-service → RS256 JWT (12h TTL) signed with the private
   key from the shared `keys` volume.
2. Envoy's `jwt_authn` filter validates every `/api/*` request against
   auth-service's JWKS endpoint (cached 5 min), forwarding claims as
   `x-user-id` / `x-user-email` headers.
3. Each service *re-verifies* the token with the mounted public key — defence in
   depth; a request that somehow bypassed Envoy still can't forge identity.
4. WebSockets can't carry an Authorization header from browsers, so the token
   rides the query string and presence-service verifies it before accepting.

## Data stores

**MongoDB** (persistent): `users`, `workspaces`, `boards`, `items` (polymorphic),
`notifications`, `deadline_marks`. See the per-service docs for schemas.

**Redis** (ephemeral + transport):

| Key / channel | Type | TTL | Purpose |
|---|---|---|---|
| `presence:{board}:{conn}` | string (JSON user) | 45s | one live connection |
| `presence:index:{board}` | set | — | which conn-ids to look up |
| `typing:{board}:{user}` | string | 5s | typing indicator |
| `lock:item:{item}` | string (user_id) | 30s | edit lock |
| `events:board:{board}` | pub/sub | — | board change fan-out |
| `events:notify` | pub/sub | — | mention events for the notifier |
