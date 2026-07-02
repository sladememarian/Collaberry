#!/usr/bin/env bash
# Shared helpers for the test/dev scripts. Sourced, not run directly.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="docker compose"
GATEWAY_URL="${GATEWAY_URL:-http://localhost:8088}"

# Bypass any machine-level HTTP proxy for localhost so curl/httpx reach Envoy
# directly rather than a system proxy agent that squats on localhost ports.
export NO_PROXY="localhost,127.0.0.1,::1"
export no_proxy="$NO_PROXY"

log()  { printf '\033[1;35m▸\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

ensure_env() {
  if [[ ! -f "$ROOT/.env" ]]; then
    log "No .env found — copying .env.example"
    cp "$ROOT/.env.example" "$ROOT/.env"
  fi
}

# Poll the Envoy gateway until an auth call round-trips (or give up).
wait_for_gateway() {
  local tries="${1:-60}"
  log "Waiting for the gateway at $GATEWAY_URL ..."
  for ((i = 1; i <= tries; i++)); do
    # A 404/401 still proves Envoy is routing; only connection refusal is a miss.
    if curl --noproxy '*' -fsS -o /dev/null "$GATEWAY_URL/api/v1/auth/.well-known/jwks.json" 2>/dev/null; then
      ok "Gateway is up (after ${i}s)"
      return 0
    fi
    sleep 1
  done
  die "Gateway never came up. Try: $COMPOSE logs envoy auth-service"
}
