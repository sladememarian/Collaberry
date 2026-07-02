#!/usr/bin/env bash
# Load + stress. Two phases:
#   1) Locust hammers the REST surface through Envoy (register/login/board/items).
#   2) A WebSocket storm opens N concurrent board sockets and measures fan-out.
# Both assume the stack is already up (run `make up` first) or set START=1.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

cd "$ROOT"
ensure_env

if [[ "${START:-0}" == "1" ]]; then
  $COMPOSE up --build -d
  trap '$COMPOSE down -v' EXIT
fi

wait_for_gateway 90

USERS="${USERS:-50}"
SPAWN="${SPAWN:-10}"
DURATION="${DURATION:-60s}"
WS_CLIENTS="${WS_CLIENTS:-40}"

log "Phase 1 — REST load: ${USERS} users, ${DURATION}"
locust -f tests/stress/locustfile.py \
  --headless -u "$USERS" -r "$SPAWN" -t "$DURATION" \
  --host "$GATEWAY_URL" \
  --csv tests/stress/report || warn "Locust reported failures — inspect tests/stress/report_*.csv"

log "Phase 2 — WebSocket storm: ${WS_CLIENTS} concurrent sockets"
GATEWAY_URL="$GATEWAY_URL" WS_CLIENTS="$WS_CLIENTS" \
  python tests/stress/ws_storm.py

ok "Stress run complete — see tests/stress/report_*.csv"
