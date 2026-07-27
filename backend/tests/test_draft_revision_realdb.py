"""Real-Postgres test for optimistic draft concurrency (issue #92).

Two devices editing one draft had no conflict detection: last write silently
erased the other's answers. Migration 39 adds a revision counter; an update
presenting a stale revision must affect zero rows so the route can 409.
"""

from __future__ import annotations

import os

import pytest
import psycopg2

from services import db as dbmod


@pytest.fixture(scope="module")
def realdb():
    opened_pool = False
    if dbmod.get_pool() is None:
        try:
            dbmod.init_pool()
            opened_pool = True
        except psycopg2.Error as exc:
            pytest.skip(f"real DB pool unavailable: {exc}")

    schema = os.getenv("DEFAULT_SCHEMA", "firm_demo")
    try:
        with dbmod.EWDbWriter(schema) as db:
            present = db.fetchone(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = %s AND table_name = 'ew_will_drafts'
                  AND column_name = 'revision'
                """,
                (schema,),
            )
    except psycopg2.OperationalError as exc:
        if opened_pool:
            dbmod.close_pool()
            dbmod._pool = None
        pytest.skip(f"real DB unavailable: {exc}")

    if not present:
        if opened_pool:
            dbmod.close_pool()
            dbmod._pool = None
        pytest.skip("ew_will_drafts.revision missing (migration 39 not applied)")

    yield schema

    if opened_pool:
        dbmod.close_pool()
        dbmod._pool = None


def test_stale_revision_update_affects_zero_rows(realdb):
    schema = realdb
    draft_id = None
    try:
        with dbmod.EWDbWriter(schema) as db:
            draft = db.create_draft("Rev", "Probe", language="en", province="ON")
            draft_id = draft["id"]
            base = draft.get("revision", 0)

            # Device A reads at revision N, device B writes (bumps to N+1).
            b_row = db.update_draft(draft_id, {"language": "ko"},
                                    expected_revision=base)
            assert b_row is not None
            assert b_row["revision"] == base + 1

            # Device A now writes with its stale revision N: must be refused.
            a_row = db.update_draft(draft_id, {"language": "en"},
                                    expected_revision=base)
            assert a_row is None, "stale revision overwrote a newer write"

            # And the winning write survived.
            current = db.get_draft(draft_id)
            assert current["language"] == "ko"
            assert current["revision"] == base + 1

            # A writer that sends no revision keeps the old unconditional
            # behaviour (legacy wizard path, pre-migration clients).
            unconditional = db.update_draft(draft_id, {"language": "en"})
            assert unconditional["revision"] == base + 2
    finally:
        if draft_id is not None:
            with dbmod.EWDbWriter(schema) as db:
                db.execute("DELETE FROM ew_will_drafts WHERE id = %s", (draft_id,))
