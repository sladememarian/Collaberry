# Collaberry — Documentation

Collaberry is a real-time, mobile-first project workspace (think Notion meets a
Kanban board) built as a microservices system. This folder documents every piece:
what each service does, what each file is for, and how data moves through the
system.

## Map

| Doc | Covers |
|---|---|
| [architecture.md](architecture.md) | The big picture: services, network topology, data flow, and why it's shaped this way |
| [common-library.md](common-library.md) | `services/common` — the shared Python package every service uses |
| [auth-service.md](auth-service.md) | Registration, login, RS256 JWTs, JWKS |
| [workspace-service.md](workspace-service.md) | Workspaces, boards, polymorphic items, event publishing |
| [presence-service.md](presence-service.md) | WebSockets, live presence, typing, 30-second card locks |
| [notification-service.md](notification-service.md) | Mention + deadline notifications (background worker) |
| [envoy-gateway.md](envoy-gateway.md) | The edge proxy: routing, JWT verification, CORS, rate limiting |
| [frontend.md](frontend.md) | The React Native (Expo) app — screens, components, realtime hook |
| [infrastructure.md](infrastructure.md) | docker-compose, env config, Makefile, scripts |
| `tests/` | Per-suite documentation of what every test actually verifies *(local only — gitignored)* |

## Quick orientation

- **One public door.** Only Envoy is reachable from outside Docker (host port
  `8088`). Every request and WebSocket goes through it.
- **One writer per datum.** workspace-service is the only thing that writes board
  content; presence-service is the only thing that owns live/ephemeral state.
  Cross-service coordination happens over Redis pub/sub, never by services
  calling each other.
- **Asymmetric auth.** auth-service holds the RSA private key and mints tokens;
  Envoy and the other services only ever verify with the public half.
