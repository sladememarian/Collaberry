#!/usr/bin/env bash
# Per-service unit + integration tests. These use mongomock / fakeredis, so no
# Docker stack is needed — fast feedback while developing.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

cd "$ROOT"
log "Running unit + integration suites (mongomock / fakeredis)"
python -m pytest \
  services/common/tests \
  services/auth/tests \
  services/workspace/tests \
  services/presence/tests \
  services/notification/tests \
  -q "$@"
ok "Unit suites passed"
