#!/usr/bin/env bash
# The full gate: unit/integration first (fast, no Docker), then e2e through the
# real stack. CI runs this.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

cd "$ROOT"
bash scripts/run-unit.sh
bash scripts/run-e2e.sh
ok "All suites green"
