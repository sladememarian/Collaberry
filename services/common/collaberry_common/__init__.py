"""Collaberry shared library.

Small, dependency-light helpers that every backend service leans on: settings,
Mongo/Redis clients, the RS256 token machinery, the cross-service event bus, and
the Pydantic domain models. Keeping this in one place is what stops the four
services from drifting apart over time.
"""

from .settings import Settings, get_settings

__all__ = ["Settings", "get_settings"]
