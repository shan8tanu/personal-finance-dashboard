"""Shared helpers: id generation and Prisma-compatible ISO timestamps."""
import uuid
from datetime import datetime, timezone


def new_id() -> str:
    return str(uuid.uuid4())


def iso_now() -> str:
    """Current time as Prisma-style ISO-8601 (e.g. 2026-06-06T10:30:00.000+00:00)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000+00:00")


def iso_date(dt: datetime) -> str:
    """A datetime as Prisma-style ISO-8601 with +00:00 offset."""
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000+00:00")


def parse_iso(s: str) -> datetime:
    """Parse an ISO-8601 string (tolerant of trailing Z) to an aware datetime."""
    if not s:
        return datetime.min.replace(tzinfo=timezone.utc)
    s = s.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        # Fall back to date-only
        return datetime.fromisoformat(s[:10]).replace(tzinfo=timezone.utc)


def _iso_month_start(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}-01T00:00:00.000+00:00"


def date_bounds(month: int | None, year: int | None) -> tuple[str | None, str | None]:
    """Return (gte, lt) ISO bounds for a month+year, year-only, or all-time (None,None).
    Uses half-open [start, next) so it works on ISO-text date columns via string compare.
    """
    if month and year:
        nm, ny = (1, year + 1) if month == 12 else (month + 1, year)
        return _iso_month_start(year, month), _iso_month_start(ny, nm)
    if year:
        return _iso_month_start(year, 1), _iso_month_start(year + 1, 1)
    return None, None


def months_ago_start(num_months: int) -> str:
    """ISO start-of-month for (now - num_months + 1), matching analytics monthly-trend."""
    now = datetime.now(timezone.utc)
    total = (now.year * 12 + (now.month - 1)) - (num_months - 1)
    y, m = divmod(total, 12)
    return _iso_month_start(y, m + 1)
