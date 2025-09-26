"""Shared Flask extensions initialized lazily for the application."""

from __future__ import annotations

import os

from flask_wtf import CSRFProtect
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

csrf = CSRFProtect()


def _default_rate_limit_storage() -> str:
    """Pick a sane default rate-limit storage backend."""
    return os.getenv('RATE_LIMIT_STORAGE_URI', 'memory://')


limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=_default_rate_limit_storage(),
    default_limits=[]  # Prefer explicit per-route limits
)

__all__ = ["csrf", "limiter"]
