# Collaberry — mobile & desktop client

React Native (Expo, TypeScript) app for the Collaberry workspace. One codebase
runs on **iOS, Android, and the web / Windows** (via `react-native-web`).

Design language: *Deep Futuristic Cyber-Minimalism* — pitch-black canvas, slate
surfaces, neon purple + electric blue accents, glassmorphic depth. All iconography
is hand-drawn SVG (`src/components/icons`), no emoji.

## Run it

```bash
cd frontend
npm install

# Point the app at your gateway. On a simulator/web, localhost is fine.
# On a physical device, use your machine's LAN IP (see below).
npm run web        # opens in the browser (great on Windows)
npm run ios        # iOS simulator
npm run android    # Android emulator
```

The backend must be up first (`make up` from the repo root — Envoy listens on
`:8080`, which is this app's default API host).

### Talking to the backend from a real device

`localhost` on a phone points at the phone, not your dev box. Override the host:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.50:8080 \
EXPO_PUBLIC_WS_URL=ws://192.168.1.50:8080 \
npm run start
```

(Defaults live in `app.json → expo.extra`; env vars win when set.)

## Layout

```
app/                       expo-router screens
  _layout.tsx              providers (auth, gesture handler, safe areas) + dark Stack
  index.tsx                boot gate → app or sign-in
  (auth)/login|register    auth screens
  (app)/index.tsx          home: workspaces + boards
  (app)/board/[id].tsx     the live Kanban board (WebSocket sync)
  (app)/item/[id].tsx      polymorphic editor: card / document / checklist
src/
  theme/tokens.ts          typed design system (mirrors tailwind.config.js)
  types/index.ts           domain types, 1:1 with the FastAPI models
  api/                     fetch client + typed endpoints (all via Envoy)
  context/AuthContext.tsx  session, token persistence, /me revalidation
  realtime/useBoardSocket  presence, typing, live locks, board events
  components/
    AppContainer.tsx       glassmorphic backdrop
    icons/                 SVG icon set + brand mark
    ui/                    Button, TextField, GlassCard, Badge, Avatar, …
    kanban/                KanbanBoard, KanbanColumn, TaskCard
    editor/                DocumentView + block renderers
```

## How real-time works

`useBoardSocket` opens `ws://…/ws/boards/{id}?token=…` (the JWT rides the query
string because browsers can't set headers on a WS handshake). It keeps the socket
warm with a heartbeat, reconnects with backoff, and surfaces presence, typing, and
per-card locks. Content changes arrive as `board_event` frames — the same events
`workspace-service` publishes to Redis — so an optimistic local edit and the
echoed event always agree.

## Checks

```bash
npm run typecheck   # tsc --noEmit  (currently clean)
npm run lint
```
