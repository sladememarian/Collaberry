# Collaberry — Documentation

Collaberry is a real-time project workspace app — think Notion's flexibility
(tasks, documents, checklists) mixed with Jira's boards (Kanban columns), built
so several people can look at the same board and see each other's changes
appear live, without refreshing.

It's built as **four small backend services** instead of one big one, sitting
behind **one traffic gate**, talking to **two databases** (one for permanent
data, one for temporary "who's online right now" data), plus a **mobile app**
in front. If any of those words feel unfamiliar, don't worry — that's exactly
what this reading order explains.

## Read these in order

Each one builds on the last. Skipping ahead is fine if you already know a
piece, but read the earlier docs first if a term feels unexplained.

**1. [architecture.md](architecture.md)** — start here.
The big picture: what the four services are, why there are four instead of
one, how a single click ("move this card") travels through the whole system
and ends up on someone else's screen a moment later. Read this even if you
only care about one part — it's the map everything else refers back to.

**2. [common-library.md](common-library.md)**
Before looking at any one service, this explains the toolbox all four of them
share: how passwords are hashed, how login tokens are created and checked, how
the database connection works, and the rules for what a "task card" is allowed
to contain. A lot of "why does X work this way" questions in later docs are
answered by something in here.

**3. [auth-service.md](auth-service.md)**
The first service a user touches: creating an account, logging in, and how the
app proves who you are on every later request without asking for your password
again.

**4. [workspace-service.md](workspace-service.md)**
The heart of the app: workspaces, boards, and the cards/documents/checklists on
them. This is also where changes get announced to everyone else watching —
important background for the next doc.

**5. [presence-service.md](presence-service.md)**
The "live" part: seeing who else is looking at a board right now, typing
indicators, and the 30-second lock that stops two people from editing the same
card at once. This is what makes the app feel real-time instead of just
"refresh to see changes."

**6. [notification-service.md](notification-service.md)**
The quiet one — no screen depends on it working instantly. Sends you a
notification when someone assigns you to a card, or when a deadline is coming
up.

**7. [envoy-gateway.md](envoy-gateway.md)**
Explains the traffic gate every request passes through before reaching any of
the four services above — why there's only one door into the system, and what
that door checks before letting a request in.

**8. [frontend.md](frontend.md)**
The mobile/web app itself: what each screen does, how it talks to the backend,
and how it stays connected for live updates.

**9. [infrastructure.md](infrastructure.md)**
The "how do I actually run this" doc: Docker setup, environment variables, and
the helper scripts for testing.

## If you just want to...

- **Run it locally** → jump straight to [infrastructure.md](infrastructure.md)
- **Understand a bug report about a specific service** → find that service's
  doc directly (step 3–6 above)
- **Understand what the tests actually check** → see `docs/tests/` (kept
  locally, not committed to git — start with `docs/tests/README.md`)
