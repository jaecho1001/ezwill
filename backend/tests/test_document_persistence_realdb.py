"""Real-Postgres integration test for the document persistence audit trail.

The mocked route tests verify call shapes but would pass a broken INSERT, a
bytea adaptation bug, or a missing migration straight through. This test
round-trips real bytes through ew_document_generations against a live
Postgres: insert, checksum, metadata listing, content fetch, byte equality.

Self-isolating like test_ai_usage_realdb: it only touches rows it creates and
deletes exactly those in teardown. If no database is reachable, or migration
37 has not been applied to the target schema, the whole module skips.
"""

from __future__ import annotations

import hashlib
import os

import pytest

from services import db as dbmod


@pytest.fixture(scope="module")
def realdb():
    opened_pool = False
    if dbmod.get_pool() is None:
        try:
            dbmod.init_pool()
            opened_pool = True
        except (
            dbmod.psycopg2.OperationalError,
            dbmod.psycopg2.InterfaceError,
        ) as exc:
            pytest.skip(f"real DB pool unavailable: {exc}")

    schema = os.getenv("DEFAULT_SCHEMA", "firm_demo")
    try:
        with dbmod.EWDbWriter(schema) as db:
            present = db.fetchone(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = %s
                  AND table_name = 'ew_document_generations'
                  AND column_name = 'content'
                """,
                (schema,),
            )
    except (
        dbmod.psycopg2.OperationalError,
        dbmod.psycopg2.InterfaceError,
    ) as exc:
        if opened_pool:
            dbmod.close_pool()
            dbmod._pool = None
        pytest.skip(f"real DB unavailable: {exc}")

    if not present:
        if opened_pool:
            dbmod.close_pool()
            dbmod._pool = None
        pytest.skip(
            "ew_document_generations.content missing (migration 37 not applied)"
        )

    yield schema

    if opened_pool:
        dbmod.close_pool()
        dbmod._pool = None


def test_document_generation_roundtrip_against_real_postgres(realdb):
    schema = realdb
    draft_id = None
    generation_ids: list = []
    # Non-UTF8 bytes on purpose: DOCX/PDF are binary, and a text-typed column
    # or naive adaptation would corrupt or reject this.
    payload = b"PK\x03\x04" + bytes(range(256)) * 4

    try:
        with dbmod.EWDbWriter(schema) as db:
            draft = db.create_draft("Audit", "Trail", language="en", province="ON")
            draft_id = draft["id"]

            rec = db.record_document_generation(
                draft_id, "single_will", "docx", payload,
                generated_by="dashboard",
                params={"unresolved": [], "allow_incomplete": False},
            )
            generation_ids.append(rec["id"])

            # Checksum computed over the exact stored bytes.
            assert rec["content_sha256"] == hashlib.sha256(payload).hexdigest()
            assert rec["byte_size"] == len(payload)
            assert rec["storage_path"] == f"db://ew_document_generations/{rec['id']}"

            # Metadata listing: newest first, no content column.
            rec2 = db.record_document_generation(
                draft_id, "poa_property", "pdf", b"%PDF-1.7 fake",
                generated_by="dashboard", params={"batch": True},
            )
            generation_ids.append(rec2["id"])

            rows = db.get_document_generations(draft_id)
            assert [str(r["id"]) for r in rows] == [str(rec2["id"]), str(rec["id"])]
            assert all("content" not in r for r in rows)
            assert rows[1]["generation_params"] == {
                "unresolved": [], "allow_incomplete": False,
            }

            # Content fetch: byte-for-byte identical after the round trip.
            stored = db.get_document_generation_content(rec["id"])
            assert bytes(stored["content"]) == payload
            assert stored["format"] == "docx"
            assert str(stored["draft_id"]) == str(draft_id)
    finally:
        # Delete only what this test created — never a blanket wipe.
        with dbmod.EWDbWriter(schema) as db:
            for gen_id in generation_ids:
                db.execute(
                    "DELETE FROM ew_document_generations WHERE id = %s", (gen_id,)
                )
            if draft_id is not None:
                db.execute("DELETE FROM ew_will_drafts WHERE id = %s", (draft_id,))
