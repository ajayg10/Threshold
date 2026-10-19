"""The resident's local time, as seen by perception and the policy agent.

Both read the clock through here so the evals can pin it: s4 (a booked 4-5 pm AC visit) is low risk
inside its window and suspicious at 10:40 pm, and an eval must not depend on when it runs.
"""

from datetime import datetime, time
from zoneinfo import ZoneInfo

_frozen: time | None = None


def local_now(timezone: str) -> datetime:
    tz = ZoneInfo(timezone)
    now = datetime.now(tz)
    return now.replace(hour=_frozen.hour, minute=_frozen.minute, second=0, microsecond=0) if _frozen else now


def freeze(at: time | None) -> None:
    """Pin the local time of day (today's date is kept). Evals only; None unpins."""
    global _frozen
    _frozen = at
