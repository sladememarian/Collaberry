# `services/common` — the shared library (`collaberry_common`)

One pip-installable package (each service's Docker image runs
`pip install ./common`) holding everything the four services must agree on.
Centralising these is what stops the services drifting: a JWT claim name, an
event field, or a Redis channel can't silently diverge between publisher and
subscriber.

## Files

### `settings.py`
`Settings` (pydantic-settings) reads configuration from env vars / `.env` once,
cached via `get_settings()`. Notable knobs: Mongo/Redis URLs, JWT
issuer/audience/TTL, key file paths, and the collaboration timings
(`card_lock_ttl_seconds=30`, `typing_ttl_seconds=5`, `presence_ttl_seconds=45`,
`deadline_warning_hours=24`). Shared so the token *minter* and *verifiers* always
agree on issuer/audience.

### `security.py`
The crypto toolkit:
- `hash_password` / `verify_password` — bcrypt (12 rounds); `verify_password`
  fails closed on garbage input instead of raising.
- `ensure_keypair` — generates the RSA-2048 pair on first boot (idempotent, so
  restarts keep old tokens valid). Only auth-service calls this.
- `issue_access_token` — RS256 JWT with `sub`/`email`/`name`/`iss`/`aud`/
  `iat`/`nbf`/`exp`/`jti`, header `kid` set to the advertised key id.
- `decode_access_token` — verifies signature + audience + issuer with 10s clock
  leeway, requires `exp`/`iat`/`sub`, returns a `TokenClaims` dataclass.
- `public_jwks` — renders the public key as a JWKS document (what Envoy polls).

### `db.py`
`Mongo` wraps one Motor client per service (connection pooling inside), exposes
`.db`, `.ping()`, `.close()`. `oid_to_str` normalises Mongo's `_id: ObjectId`
into `id: str` for the API layer — no ObjectIds ever leak to clients.

### `redis_client.py`
`make_redis(settings)` — one async Redis client, `decode_responses=True` so call
sites deal in `str` not `bytes`.

### `events.py`
The cross-service event contract:
- `EventType` enum — `card.created/updated/moved/deleted`, `board.updated`,
  `mention`, `deadline.approaching`.
- `BoardEvent` model — type, board/workspace/actor ids, a client-ready `payload`
  dict, and `ts` (server epoch-millis; used by tests and the storm harness to
  measure fan-out latency).
- `board_channel(board_id)` → `events:board:{id}`.
- `publish_board_event` / `parse_event` — orjson serialisation both ways.

Board events are Redis pub/sub: at-most-once fan-out to whoever is watching the
board right now, and a dropped one is harmless because clients refetch. Work
that *must* happen regardless of who is connected — mention notifications —
goes through `queue.py` instead.

### `queue.py`
The durable-job layer, on RabbitMQ via `aio-pika`. A direct exchange
(`collaberry.jobs`) routes to `jobs.notify`, which dead-letters to
`collaberry.jobs.dlx` → `jobs.notify.dead`.
- `connect()` — `connect_robust`, so a broker restart self-heals.
- `declare_topology(channel)` — idempotent, called by both producer and
  consumer so neither has to start first.
- `JobPublisher` — one connection/channel per process, `PERSISTENT` delivery.
- `JobConsumer` — `prefetch_count = settings.amqp_prefetch`; a handler that
  raises is retried with exponential backoff (attempt count in the
  `x-collaberry-attempts` header) up to `amqp_max_retries`, then rejected to
  the DLX. So handlers should raise on transient failure rather than swallow.

### `models.py`
All Pydantic v2 domain models: auth I/O (`RegisterRequest` enforces ≥8-char
passwords and valid emails), workspaces/boards, notifications — and the
**polymorphic item** engine. An item's `type` (`card` | `document` | `checklist`)
decides how its `data` blob is validated:
- checklist → `data.entries` each validated as `ChecklistEntry {text, done}`
- document → `data.blocks` each validated as `DocumentBlock` (paragraph, heading,
  bullet, todo, code, image; `url` for images, `checked` for todos, `locked_by`
  mirrors the live edit lock)
- card → optional string `description`

`_validate_item_data` normalises in place, so what's persisted is exactly the
validated shape. A wrong shape surfaces to the client as a 422.

### `auth_dep.py`
`current_user` — the FastAPI dependency protected routes use. Extracts the
bearer token, verifies it against the public key cached on `app.state`, returns
`TokenClaims`; any failure is a 401 with `WWW-Authenticate: Bearer`. This is the
defence-in-depth layer behind Envoy's edge check.

### `pyproject.toml`
Package metadata + pinned deps (motor, redis, pydantic v2, PyJWT, cryptography,
bcrypt, orjson).
