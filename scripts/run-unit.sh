#!/usr/bin/env bash
# Per-service unit + integration tests. These use mongomock / fakeredis, so no
# Docker stack is needed — fast feedback while developing.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

cd "$ROOT"
# collaberry_common isn't pip-installed on the host; put it on the path the way
# pytest.ini's `pythonpath = services .` does inside the containers.
export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}services/common"
log "Running unit + integration suites (mongomock / fakeredis)"
python -m pytest \
  services/common/tests \
  services/auth/tests \
  services/workspace/tests \
  services/presence/tests \
  services/notification/tests \
  -q "$@"
ok "Unit suites passed"
