"""Dashboard-only reporting for locally tracked AI provider usage."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from routes.auth import verify_dashboard_token
from services.db import EWDbWriter

router = APIRouter()
DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")

_COUNT_FIELDS = (
    "events",
    "requests",
    "input_tokens",
    "output_tokens",
    "cache_read_input_tokens",
    "cache_creation_input_tokens",
    "total_tokens",
)


def _with_integer_counts(row: dict | None, *, ensure_totals: bool = False) -> dict:
    result = dict(row or {})
    for field in _COUNT_FIELDS:
        if field in result or ensure_totals:
            result[field] = int(result.get(field) or 0)
    return result


@router.get("")
async def get_usage_report(
    days: int = Query(30, ge=0, le=3650),
    limit: int = Query(50, ge=1, le=100),
    _token: str = Depends(verify_dashboard_token),
):
    """Return all-time and date-filtered usage for the lawyer dashboard.

    `days=0` selects all recorded history. Tracking begins when migration 36 is
    deployed; this endpoint intentionally does not imply provider-billing
    history from before that point.
    """
    generated_at = datetime.now(timezone.utc)
    since = generated_at - timedelta(days=days) if days else None

    with EWDbWriter(DEFAULT_SCHEMA) as db:
        totals = _with_integer_counts(
            db.get_ai_usage_totals(since), ensure_totals=True
        )
        all_time = (
            dict(totals)
            if since is None
            else _with_integer_counts(
                db.get_ai_usage_totals(), ensure_totals=True
            )
        )
        by_model = [
            _with_integer_counts(dict(row))
            for row in db.get_ai_usage_by_model(since)
        ]
        daily = [
            _with_integer_counts(dict(row))
            for row in db.get_ai_usage_daily(since)
        ]
        recent = [
            _with_integer_counts(dict(row))
            for row in db.list_ai_usage_events(since, limit=limit)
        ]
        tracked_since = db.get_ai_usage_tracked_since()

    return {
        "generated_at": generated_at,
        "range": {
            "days": days,
            "since": since,
            "tracked_since": tracked_since,
        },
        "totals": totals,
        "all_time": all_time,
        "by_model": by_model,
        "daily": daily,
        "recent": recent,
    }
