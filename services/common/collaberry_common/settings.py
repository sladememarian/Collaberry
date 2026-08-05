"""Runtime configuration, read once from the environment.

Every service imports :func:`get_settings`. The values are deliberately shared so
that, for example, the JWT issuer/audience match across the auth-service that mints
tokens and the services that verify them.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", env_file=".env", extra="ignore")

    # --- identity ---------------------------------------------------------
    service_name: str = "collaberry"
    environment: str = "development"

    # --- datastores -------------------------------------------------------
    mongo_uri: str = "mongodb://mongo:27017"
    mongo_db: str = "collaberry"
    redis_url: str = "redis://redis:6379/0"

    # --- message queue ----------------------------------------------------
    # RabbitMQ carries work that must not be lost if a consumer is down when it
    # is produced. Redis pub/sub stays for live fan-out (presence, board events)
    # where a missed message is fine because the client refetches; the queue is
    # for durable jobs — notifications, mention processing, deadline reminders.
    amqp_url: str = "amqp://collaberry:collaberry-dev@rabbitmq:5672/"
    # Prefetch caps how many unacked messages one consumer holds. Low enough
    # that a slow worker doesn't hoard the queue, high enough to keep pipelining.
    amqp_prefetch: int = 16
    # Failed jobs are retried this many times (with backoff) before being
    # parked on the dead-letter queue for inspection.
    amqp_max_retries: int = 3

    # --- auth / jwt -------------------------------------------------------
    # Tokens are RS256. The auth-service owns the private key; everyone else
    # validates against the published JWKS (or the mounted public key).
    jwt_issuer: str = "collaberry-auth"
    jwt_audience: str = "collaberry-clients"
    jwt_algorithm: str = "RS256"
    access_token_ttl_seconds: int = 60 * 60 * 12  # 12h — generous for a dev build

    # Paths to PEM key material inside the container. auth-service writes the
    # pair on first boot if it is missing; other services only need the public.
    jwt_private_key_path: str = "/keys/jwt_private.pem"
    jwt_public_key_path: str = "/keys/jwt_public.pem"

    # Where auth-service exposes its JWKS, used by Envoy's jwt_authn filter.
    jwks_uri: str = "http://auth-service:8000/api/v1/auth/.well-known/jwks.json"

    # --- collaboration knobs ---------------------------------------------
    card_lock_ttl_seconds: int = 30      # spec: 30s edit locks on text cards
    typing_ttl_seconds: int = 5
    presence_ttl_seconds: int = 45
    deadline_warning_hours: int = 24     # notify when a due date is this close

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"prod", "production"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
