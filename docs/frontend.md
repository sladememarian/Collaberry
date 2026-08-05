# frontend — the React Native app (Expo SDK 57)

**Path:** `frontend/` · **Stack:** Expo Router v57, TypeScript strict, NativeWind v4
(Tailwind classes on native), react-native-svg, FlashList v2.
**Design language:** dark "cyber-minimal" — pitch-black canvas, slate surfaces,
neon purple/blue accents. All icons are hand-built SVG; **no emoji in the UI**.

## Running it

```bash
cd frontend
npm install          # .npmrc pins the official registry + legacy-peer-deps
npm run web          # or: npm start → scan QR in Expo Go
npm run type-check   # tsc --noEmit
```

The API host defaults to `https://envoy.collaberry.boxd.sh` (Envoy via the boxd
proxy). On a physical phone or local dev, point at your machine instead:
`EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:8080 npm start`

## Routes (`app/` — Expo Router file-based)

| Route file | Screen |
|---|---|
| `_layout.tsx` | Root providers: gesture handler, safe area, `AuthProvider`, dark stack |
| `index.tsx` | Entry gate — routes to auth or app depending on session |
| `(auth)/login.tsx`, `(auth)/register.tsx` | Sign-in / sign-up forms |
| `(app)/index.tsx` | Home: workspaces grouped by context, boards, notifications entry |
| `(app)/board/[id].tsx` | **The live board** — loads board+items, opens the WebSocket, reconciles incoming `card.*` events into local state, presence avatars, connection dot, add-item sheet |
| `(app)/item/[id].tsx` | Item detail — card description / document blocks / checklist, edit-lock aware |

## `src/` modules

### `api/`
- **`client.ts`** — one fetch wrapper for the whole app. `API_BASE`/`WS_BASE`
  resolve from `EXPO_PUBLIC_API_URL` → `app.json extra` → localhost default.
  Bearer token injection, 204 handling, and `ApiError` with human-readable
  messages per status (423 → "Someone else is editing this right now", 429 →
  "Slow down a moment…", plus a LAN-IP hint on native network failures).
- **`endpoints.ts`** — typed helpers grouped by answering service: `authApi`
  (register/login/me), `workspaceApi` (full workspace/board/item CRUD),
  `presenceApi` (presence snapshot + lock REST), `notificationApi`.

### `realtime/useBoardSocket.ts`
The live-board hook. Opens `WS /ws/boards/{id}?token=…`, then:
- 15s heartbeat pings (keeps the server-side 45s presence TTL fresh);
- auto-reconnect with exponential backoff capped at 15s;
- surfaces `presence` (roster), `typing` (with local 3.5s expiry timers),
  `locks` (itemId → holder/ttl map), and hands `board_event` frames to the
  screen via `onEvent`;
- helpers: `lock(itemId)`, `unlock(itemId)`, throttled `signalTyping()` (max one
  ping per 1.5s so keystrokes don't flood the socket).

### `context/AuthContext.tsx`
Session state. Persists token+user in AsyncStorage, rehydrates on boot and
revalidates with `/me` (a hard 401 signs out; network flakiness keeps the cached
session). Exposes `signIn` / `signUp` / `signOut` / `booting`.

### `components/`
- **`kanban/KanbanBoard.tsx`** — horizontally snapping columns; responsive column
  width (~1 column on phones, ~2.4 on wide screens); groups+sorts items per
  column by `order`; single `onDragEnd` seam for structural mutations.
- **`kanban/KanbanColumn.tsx`** — one lane: FlashList v2 (auto-measuring) of
  memoised cards, count pill, add button, dashed empty-drop hint.
- **`kanban/TaskCard.tsx`** — the card renderer: type icon, tags, due date,
  assignee avatars, and a lock rim + "name is editing" state when someone holds
  the edit lock.
- **`editor/DocumentView.tsx`** + `blocks/` — block-based document renderer
  (paragraph/heading/bullet/todo/code/image), checkbox block, image block.
- **`ui/`** — the design-system primitives: `Button` (loading state), `TextField`
  (label + error), `Sheet` (bottom sheet), `GlassCard` (blur surface), `Avatar` +
  `AvatarStack` (presence), `Badge`, `Skeleton`, `EmptyState` + `ConnectionDot`,
  `AppContainer` (safe-area page shell).
- **`icons/index.tsx`** — 18 hand-drawn SVG icons (Plus, Kanban, Document,
  Checklist, Check, User/Users, Bell, Lock, Search, chevrons/arrows, Close,
  Spark, Image, Trash, Logout, DotGrid) sharing one props contract
  (`size/color/strokeWidth`, round caps).

### `theme/tokens.ts` + `tailwind.config.js`
The same design tokens in two forms: a `palette` object for style props, and
Tailwind theme extensions (ink surface stack, text hierarchy, brand
purple/blue/cyan, per-context colors for work/university/personal, radii, type
scale) for NativeWind classes. They are kept in lockstep by hand.

### `types/index.ts`
TypeScript mirrors of the backend models (`Workspace`, `Board`, `Item`,
`UserPublic`, …) plus the WebSocket frame unions (`ServerFrame` / `ClientFrame`)
and `BoardChange`.

## Config files

- **`app.json`** — Expo config: dark UI, `collaberry` scheme, typed routes,
  plugins (router, secure-store, status-bar, splash, localization), and the
  `extra.apiBaseUrl` / `wsBaseUrl` defaults (`envoy.collaberry.boxd.sh`).
- **`babel.config.js`** — `babel-preset-expo` with `jsxImportSource: nativewind`
  + `nativewind/babel`, and the `@ → ./src` module-resolver alias.
- **`metro.config.js`** — Expo default config wrapped in `withNativeWind`
  (`global.css` as input).
- **`.npmrc`** — `legacy-peer-deps=true` + official npm registry (the machine had
  a broken mirror configured globally).
- **`tsconfig.json`** — strict, `@/*` path alias matching Babel.

## Gotchas that cost time (so they're recorded)

- `react-native-worklets` must be installed even though the app doesn't use
  Reanimated — SDK 57's `babel-preset-expo` requires its Babel plugin.
- FlashList v2 removed `estimatedItemSize`; it auto-measures.
- AsyncStorage v3 removed the `multi*` batch APIs.
- Versions are managed by `npx expo install <pkg>` — never hand-pin RN-ecosystem
  packages; two of the original errors came from guessing versions.
