# Envoy — the edge gateway

**Config:** `infra/envoy/envoy.yaml` · **Image:** `envoyproxy/envoy:v1.31-latest`
**Host ports:** `8080` (the only application entry point) and `9901` (admin, dev only)

## What it does

Envoy is the single public door. The React Native app talks to exactly one host
and Envoy fans requests out to the right microservice by path prefix — the
client never knows the backend is four services.

| Route match | Cluster | JWT at edge? |
|---|---|---|
| `/ws/` | presence-service | **disabled** — browsers can't set headers on a WS handshake; the token rides the query string and presence-service verifies it itself. `timeout: 0s` so sockets are never culled |
| `/api/v1/auth` | auth-service | **disabled** — login/register have no token yet; JWKS must be public |
| `/api/v1/workspace` | workspace-service | required |
| `/api/v1/presence` | presence-service | required |
| `/api/v1/notifications` | notification-service | required |

## The HTTP filter chain (order matters)

1. **CORS** — answers browser preflights at the edge; permissive origin for dev.
   *Note:* configured via the `cors:` field on the virtual host, which logs a
   deprecation warning on v1.31 but works; the replacement
   (`typed_per_filter_config` with `CorsPolicy`) broke request handling when
   combined with `jwt_authn` in this version, so the working form stays,
   documented in a comment in the YAML.
2. **Local rate limit** — token bucket, 200 tokens refilled per second, 100%
   enforced. Excess requests get 429 with an `x-ratelimit: edge` header. This is
   the "shed load before it reaches Python" layer.
3. **jwt_authn** — validates RS256 tokens against auth-service's JWKS
   (`remote_jwks`, 5-min cache, async fetch). Checks issuer `collaberry-auth`
   and audience `collaberry-clients`. On success it *forwards* the original
   Authorization header (services re-verify — defence in depth) and also maps
   claims to headers: `sub → x-user-id`, `email → x-user-email`. The rule
   applies to `/api/*` except where a route disables it (auth, ws).
4. **Router** — terminal filter, sends the request to the matched cluster.

## Other details

- `upgrade_configs: websocket` at both the connection-manager and `/ws/` route
  level — the HTTP→WS upgrade passes through cleanly.
- `idle_timeout: 900s` on downstream connections so long-lived sockets survive.
- Clusters use `STRICT_DNS` — Docker's embedded DNS re-resolves service names,
  so a restarted container is picked up without an Envoy restart.
- Envoy listens on host port **8080**, which the boxd proxy exposes publicly as
  `envoy.collaberry.boxd.sh`. Inside the compose network Envoy listens on 8080.
