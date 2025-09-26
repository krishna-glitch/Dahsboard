"""Simple in-memory account lockout guard for login endpoints."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Dict, Tuple


@dataclass
class AttemptRecord:
    failures: int
    locked_until: float
    last_failure: float


class AccountGuard:
    """Track login failures and enforce temporary lockouts."""

    def __init__(self, max_attempts: int = 5, lockout_seconds: int = 15 * 60):
        self.max_attempts = max_attempts
        self.lockout_seconds = lockout_seconds
        self._lock = threading.Lock()
        self._records: Dict[Tuple[str, str], AttemptRecord] = {}

    def _key(self, username: str, ip_address: str) -> Tuple[str, str]:
        return (username.lower().strip(), ip_address or 'unknown')

    def is_locked(self, username: str, ip_address: str) -> Tuple[bool, float]:
        now = time.monotonic()
        with self._lock:
            record = self._records.get(self._key(username, ip_address))
            if not record:
                return False, 0.0
            if record.locked_until > now:
                return True, max(0.0, record.locked_until - now)
            if record.failures >= self.max_attempts:
                # Lock expired, clear failures
                record.failures = 0
                record.locked_until = 0.0
            return False, 0.0

    def register_failure(self, username: str, ip_address: str) -> Tuple[int, float]:
        now = time.monotonic()
        key = self._key(username, ip_address)
        with self._lock:
            record = self._records.get(key)
            if record and record.locked_until > now:
                # Already locked
                return record.failures, max(0.0, record.locked_until - now)

            if not record:
                record = AttemptRecord(failures=0, locked_until=0.0, last_failure=0.0)
                self._records[key] = record

            record.failures += 1
            record.last_failure = now

            if record.failures >= self.max_attempts:
                record.locked_until = now + self.lockout_seconds
                return record.failures, self.lockout_seconds

            return record.failures, 0.0

    def reset(self, username: str, ip_address: str) -> None:
        with self._lock:
            self._records.pop(self._key(username, ip_address), None)


# Shared singleton for the application
account_guard = AccountGuard()

