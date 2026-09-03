# Collaberry web client — built with `expo export`, served by nginx.
#
#   docker compose up            (from frontend/, serves on :8090)
#
# nginx does double duty: static files for the SPA *and* a reverse proxy for
# /api + /ws, so the web app is same-origin with the API — the browser never
# sends a cross-origin request, so CORS can never be an issue on any host.
# EXPO_PUBLIC_API_URL is therefore left unset by default and the app talks to
# its own origin; set the build args only to point at some OTHER gateway.
#
# Stage 1 — node: install + static export.
FROM node:26-alpine AS build
WORKDIR /app

ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_WS_URL

COPY package.json package-lock.json ./
# npm install, not npm ci: the host machine has two npms (a user-level npm 12
# shadowing Node 26's bundled npm 11), and lockfiles written by one npm major
# aren't always re-readable by another. npm install honors the lockfile when
# in sync and self-heals when it isn't, so the build never depends on which
# npm wrote it. ponytail: switch to `npm ci` if/when the toolchain is pinned.
RUN npm install --no-audit --no-fund

COPY . .
# Only pass env vars through when actually set — an empty EXPO_PUBLIC_API_URL
# would inline as "" and break the app's own fallback chain (client.ts).
RUN if [ -n "$EXPO_PUBLIC_API_URL" ]; then export EXPO_PUBLIC_API_URL; fi \
 && if [ -n "$EXPO_PUBLIC_WS_URL" ]; then export EXPO_PUBLIC_WS_URL; fi \
 && npx expo export --platform web

# Stage 2 — nginx: SPA + API/WS proxy.
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html

# Where Envoy lives, resolved at CONTAINER START (so one image serves any
# backend — no rebuild to re-point):
#   * default `collaberry-envoy-1` — the root stack's Envoy container, when the
#     web container joins the same compose network (see docker-compose.yml);
#   * a VPS domain behind TLS:  -e BACKEND_HOST=api.example.com BACKEND_PORT=443 BACKEND_SCHEME=https
#   * Envoy on the docker host: -e BACKEND_HOST=host.docker.internal
ENV BACKEND_HOST=collaberry-envoy-1 \
    BACKEND_PORT=8080 \
    BACKEND_SCHEME=http

# SPA fallback ("everything but /landing → index.html") + /api and /ws proxies,
# as an nginx template: envsubst fills the BACKEND_* values at startup.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
