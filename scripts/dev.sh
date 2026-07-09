#!/usr/bin/env bash
# Start the stack in watch/hot-reload mode. Backend edits reload live (uvicorn
# --reload over bind-mounted source) - no rebuild per change.
#
#   bash scripts/dev.sh          # start, follow logs
#   bash scripts/dev.sh -d       # start detached
#
# The frontend hot-reloads on its own via Expo/Metro Fast Refresh - run it
# separately with `cd frontend && npm run web` and just save your .tsx files.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# --build the first time so the editable `common` install + any dep changes are
# baked in; after that, reloads are instant and no rebuild is needed.
exec docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build "$@"
