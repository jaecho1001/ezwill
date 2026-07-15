"""Best-effort persistence for billable AI provider usage."""

from __future__ import annotations

import logging
import os

from services.db import EWDbWriter

logger = logging.getLogger(__name__)


def record_ai_usage_event(
    *,
    provider: str,
    model: str,
    feature: str,
    draft_id: str | None = None,
    request_count: int = 1,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cache_read_input_tokens: int = 0,
    cache_creation_input_tokens: int = 0,
    latency_ms: int | None = None,
    correlation_id: str | None = None,
    metadata: dict | None = None,
) -> bool:
    """Record usage without ever breaking the user-facing AI operation.

    Provider calls can succeed even when metering storage is temporarily
    unavailable. The provider dashboard remains the billing source of truth,
    while this local event store powers the firm's operational dashboard.
    """
    schema = os.getenv("DEFAULT_SCHEMA", "firm_demo")

    def write(attributed_draft_id: str | None, event_metadata: dict) -> None:
        with EWDbWriter(schema) as db:
            db.record_ai_usage(
                provider=provider,
                model=model,
                feature=feature,
                draft_id=attributed_draft_id,
                request_count=request_count,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cache_read_input_tokens=cache_read_input_tokens,
                cache_creation_input_tokens=cache_creation_input_tokens,
                latency_ms=latency_ms,
                correlation_id=correlation_id,
                metadata=event_metadata,
            )

    try:
        write(draft_id, metadata or {})
        return True
    except Exception:  # noqa: BLE001 - metering must not interrupt an AI response
        # A stale or malformed optional draft id must not discard otherwise
        # valid billing history. Retry unattributed; if the database itself is
        # unavailable, this second best-effort write will fail safely too.
        if draft_id:
            try:
                fallback_metadata = dict(metadata or {})
                fallback_metadata["unattributed_draft_id"] = draft_id
                write(None, fallback_metadata)
                logger.warning(
                    "AI usage persisted without draft attribution provider=%s feature=%s draft=%s",
                    provider,
                    feature,
                    draft_id,
                )
                return True
            except Exception:  # noqa: BLE001
                pass

        logger.exception(
            "failed to persist AI usage provider=%s model=%s feature=%s draft=%s",
            provider,
            model,
            feature,
            draft_id,
        )
        return False
