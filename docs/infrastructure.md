# Infrastructure — how it all gets run

## docker-compose.yml

Defines 7 containers on one internal network (`nexus-net`):

| Container | What | Reachable from host? |
|---|---|---|
| `mongo` | MongoDB 7 | No |
| `redis` | Redis 7 | No |
| `auth-service` | FastAPI | No |
| `workspace-service` | FastAPI | No |
| `presence-service` | FastAPI + WebSocket | No |
| `notification-service` | FastAPI worker | No |
| `envoy` | Edge proxy | **Yes — port 8088** (and 9901 for the admin UI) |

Two named volumes: `mongo-data` (so your data survives `docker compose down`,
but NOT `docker compose down -v` — the `-v` deletes it) and `keys` (the shared
RSA keypair auth-service generates on first boot; other services mount it
read-only to verify tokens).

Health checks gate startup order — e.g. `workspace-service` won't start until
`mongo`, `redis`, and `auth-service` all report healthy — so a fresh `docker
compose up` reliably comes up in the right sequence.

**Why port 8088 and not 8080:** on this dev machine something else (a proxy
agent) already answers on port 8080, so Envoy is mapped to 8088 instead. Inside
Docker, Envoy still listens on 8080 — only the *host-visible* port changed.

## .env / .env.example

`.env.example` documents every setting (Mongo/Redis URLs, JWT issuer/audience,
token TTL, lock/typing/presence TTLs, deadline warning window). Copy it to `.env`
before running — `docker compose` and the test scripts both read it.

## Makefile

Shortcuts: `make up` (build+start), `make down` (stop, keep data), `make logs`,
`make test` (full suite), `make test-unit` (fast, no Docker), `make test-e2e`,
`make stress`, `make fe-check` (frontend type-check).

## scripts/

- **`lib.sh`** — shared helpers: `GATEWAY_URL` (defaults to `localhost:8088`),
  `wait_for_gateway` (polls the JWKS endpoint until Envoy answers), and a
  `NO_PROXY` export so `curl`/`httpx` don't get intercepted by a system proxy
  agent on this machine.
- **`run-unit.sh`** — the fast suite: per-service tests against mongomock/
  fakeredis, no Docker needed.
- **`run-e2e.sh`** — brings the stack up (unless `KEEP_UP=1`), waits for Envoy,
  runs `tests/e2e`, tears down.
- **`run-stress.sh`** — Locust REST load, then the WebSocket storm script.
  Assumes the stack is already up unless `START=1`.
- **`run-tests.sh`** — the full gate: unit then e2e. What CI would run.

## Why some odd choices exist

- **Registry pinned in `frontend/.npmrc`.** This machine's global npm config
  pointed at a broken third-party mirror; the project `.npmrc` pins the official
  registry so `npm install` works regardless of machine-level config.
- **`legacy-peer-deps=true`** in the same file — the Expo/React Native dependency
  graph has intentional overlapping peer ranges; this matches what `npx expo
  install` does under the hood.
- **Test emails use `@collaberry.dev`, not `.test`.** The `.test` TLD is an
  IANA-reserved, non-routable domain, and the `email-validator` library
  (correctly) rejects it — so anything hitting real validation needs a
  syntactically normal-looking domain instead.
