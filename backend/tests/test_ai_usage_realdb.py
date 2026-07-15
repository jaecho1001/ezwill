"""Real-Postgres integration test for the AI-usage aggregation SQL.

The rest of the usage tests mock the DB cursor, so they verify the query
*strings* but never execute them — a reversed COALESCE, a bad GROUP BY, or a
timezone mistake would pass straight through. This test runs the actual
aggregation queries against a live Postgres so CI guards them.

It is self-isolating and safe against a populated database: every read is
filtered to a `since` window covering only the rows it inserts, and teardown
deletes exactly the rows/draft it created (never a blanket wipe). If no
database is reachable (or migration 36 has not been applied to the target
schema), the whole module skips.
"""

from __future__ import annotations

import os
from datetime import date

import pytest

from services import db as dbmod


@pytest.fixture(scope="module")
def realdb():
    opened_pool = False
    if dbmod.get_pool() is None:
        try:
            dbmod.init_pool()
            opened_pool = True
        except Exception as exc:  # noqa: BLE001 - no DB in this environment
            pytest.skip(f"real DB pool unavailable: {exc}")

    schema = os.getenv("DEFAULT_SCHEMA", "firm_demo")
    try:
        with dbmod.EWDbWriter(schema) as db:
            present = db.fetchone(
                "SELECT to_regclass(%s) AS t", (f"{schema}.ew_ai_usage_events",)
            )
    except Exception as exc:  # noqa: BLE001 - connection refused, auth, etc.
        if opened_pool:
            dbmod.close_pool()
            dbmod._pool = None
        pytest.skip(f"real DB unavailable: {exc}")

    if not present or not present.get("t"):
        if opened_pool:
            dbmod.close_pool()
            dbmod._pool = None
        pytest.skip("ew_ai_usage_events missing (migration 36 not applied)")

    yield schema

    if opened_pool:
        dbmod.close_pool()
        dbmod._pool = None


def test_ai_usage_aggregations_against_real_postgres(realdb):
    schema = realdb
    inserted_ids: list = []
    draft_id = None
    try:
        with dbmod.EWDbWriter(schema) as db:
            draft = db.create_draft("Ledger", "Verify", language="en", province="ON")
            draft_id = draft["id"]

            # anthropic intake, attributed to the draft (exercises the LEFT JOIN)
            r1 = db.record_ai_usage(
                provider="anthropic", model="claude-opus-4-8", feature="intake_chat",
                draft_id=draft_id, request_count=2, input_tokens=300, output_tokens=50,
                cache_read_input_tokens=50, cache_creation_input_tokens=20,
            )
            # openai quick-draft, unattributed (draft_id NULL -> null client_name)
            r2 = db.record_ai_usage(
                provider="openai", model="gpt-4o", feature="quick_draft",
                draft_id=None, request_count=1, input_tokens=750, output_tokens=80,
                cache_read_input_tokens=250, cache_creation_input_tokens=0,
            )
            inserted_ids = [r1["id"], r2["id"]]
            # now() is the transaction timestamp, so both rows share it; filter the
            # aggregations to exactly these rows regardless of other DB history.
            since = min(r1["created_at"], r2["created_at"])

            totals = db.get_ai_usage_totals(since)
            assert totals["events"] == 2
            assert totals["requests"] == 3
            assert totals["input_tokens"] == 1050
            assert totals["output_tokens"] == 130
            assert totals["cache_read_input_tokens"] == 300
            assert totals["cache_creation_input_tokens"] == 20
            # guards reversed-COALESCE / wrong total: 1050+130+300+20
            assert totals["total_tokens"] == 1500

            # ordered by total_tokens DESC: openai 1080 before anthropic 420
            by_model = [
                (m["provider"], m["model"], m["total_tokens"])
                for m in db.get_ai_usage_by_model(since)
            ]
            assert by_model == [
                ("openai", "gpt-4o", 1080),
                ("anthropic", "claude-opus-4-8", 420),
            ]

            daily = db.get_ai_usage_daily(since)
            assert sum(row["total_tokens"] for row in daily) == 1500
            # bucketed on a Toronto-local calendar date, not a raw timestamp
            assert all(isinstance(row["date"], date) for row in daily)

            recent = db.list_ai_usage_events(since, limit=10)
            attribution = {(e["provider"], e["client_name"]) for e in recent}
            assert ("anthropic", "Ledger Verify") in attribution  # JOIN resolved
            assert ("openai", None) in attribution                # unattributed
            assert all(e["total_tokens"] == (
                e["input_tokens"] + e["output_tokens"]
                + e["cache_read_input_tokens"] + e["cache_creation_input_tokens"]
            ) for e in recent)
    finally:
        # Delete only what this test created — never a blanket wipe.
        with dbmod.EWDbWriter(schema) as db:
            for event_id in inserted_ids:
                db.execute("DELETE FROM ew_ai_usage_events WHERE id = %s", (event_id,))
            if draft_id is not None:
                db.execute("DELETE FROM ew_will_drafts WHERE id = %s", (draft_id,))
