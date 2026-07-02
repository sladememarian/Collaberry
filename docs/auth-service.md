# auth-service — identity & tokens

**Path:** `services/auth` · **Port (internal):** 8000 · **Envoy prefix:** `/api/v1/auth`
**Stores:** MongoDB `users` collection · **Special role:** sole holder of the RSA private key.

## What it does

Registers users, verifies logins, and mints RS256 access tokens. It also serves
the JWKS document that Envoy and any other verifier uses, which is what makes the
asymmetric scheme work: nothing else in the system *can* forge a token.

## Endpoints

| Method & path | Auth | Behaviour |
|---|---|---|
| `POST /api/v1/auth/register` | public | Validates (email format, password ≥ 8 chars, non-empty name), 409 on duplicate email, creates the user and returns a `TokenResponse` immediately — no second login round-trip |
| `POST /api/v1/auth/login` | public | bcrypt check; wrong email and wrong password return the *same* 401 message so account existence isn't leaked |
| `GET /api/v1/auth/me` | bearer | Returns the caller's profile; 404 if the account was deleted after the token was minted |
| `GET /api/v1/auth/.well-known/jwks.json` | public | The JWKS; Envoy's `jwt_authn` filter polls this (5-min cache) |
| `GET /healthz` | internal | Pings Mongo; used by the compose healthcheck |

## Files

- **`app/main.py`** — FastAPI app. The lifespan hook runs `ensure_keypair` (first
  boot writes the RSA pair into the shared `/keys` volume, restarts reuse it),
  loads both key halves onto `app.state`, connects Mongo, and creates the unique
  index on `email`. Route handlers stay thin; token assembly lives in
  `_token_response`.
- **`app/repository.py`** — `UserRepository`, the only Mongo access. Emails are
  stored lowercased (so uniqueness is case-insensitive in practice), passwords
  are hashed on the way in, and `get_by_id` tolerates malformed ObjectIds by
  returning `None` instead of raising.
- **`Dockerfile`** — python:3.12-slim; installs `common` first (best layer
  caching), then service deps, then the app. Build context is `./services`.
- **`requirements.txt`** — fastapi, uvicorn, email-validator (the rest comes via
  the common package).

## User document shape

```json
{
  "_id": ObjectId,
  "email": "ada@collaberry.dev",     // lowercased, unique index
  "password_hash": "$2b$12$…",        // bcrypt
  "display_name": "Ada",
  "created_at": ISODate
}
```

## Design notes

- The "personal workspace on first launch" the spec asks for is *not* done here —
  it's lazily provisioned by workspace-service on the first workspace list. That
  keeps auth-service completely out of the workspace collection (one owner, one
  writer).
- Registration logs you straight in. The mobile app relies on this: sign-up leads
  directly to the workspace list.
