"""Timestamps.

One place so every record uses the same clock and the same timezone. A signature's
time is part of what it proves, so it must never come from a naive `datetime.now()`.
"""

from datetime import UTC, datetime


def now_utc() -> datetime:
    return datetime.now(UTC)
