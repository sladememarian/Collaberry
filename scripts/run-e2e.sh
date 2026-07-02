#!/usr/bin/env bash
# End-to-end tests that drive the real stack through Envoy. Brings the whole
# thing up (unless KEEP_UP=1 says it's already running), waits for the gateway,
# runs the e2e suite, then tears down.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

cd "$ROOT"
ensure_env

KEEP_UP="${KEEP_UP:-0}"

if [[ "$KEEP_UP" != "1" ]]; then
  log "Building + starting the stack"
  $COMPOSE up --build -d
  cleanup() { log "Tearing the stack down"; $COMPOSE down -v; }
  trap cleanup EXIT
fi

wait_for_gateway 90

log "Running e2e suite against $GATEWAY_URL"
GATEWAY_URL="$GATEWAY_URL" python -m pytest tests/e2e -m e2e -q "$@"
ok "E2E suite passed"
