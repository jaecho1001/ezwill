"""Real-Postgres test: the connection pool must survive broken connections.

Before the issue #92 fix, EWDbWriter.__exit__ ran commit/rollback OUTSIDE any
try/finally: a connection whose backend had died raised InterfaceError there,
putconn never ran, and every such error permanently shrank the pool — any DB
blip eventually became a hard outage that only a restart cleared.

This test kills its own backend connection server-side (pg_terminate_backend)
and asserts the pool keeps serving. Mocked suites cannot express this at all.
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
            db.fetchone("SELECT 1 AS ok")
    except psycopg2.OperationalError as exc:
        if opened_pool:
            dbmod.close_pool()
            dbmod._pool = None
        pytest.skip(f"real DB unavailable: {exc}")

    yield schema

    if opened_pool:
        dbmod.close_pool()
        dbmod._pool = None


def test_pool_survives_server_side_connection_kill(realdb):
    schema = realdb

    pool = dbmod.get_pool()
    maxconn = getattr(pool, "maxconn", 10)

    # The killer must NOT come from the pool: a pooled killer cycles back in
    # cleanly every round and quietly keeps the pool alive, masking the leak
    # (verified: with an in-pool killer this test passed on the unfixed code).
    killer = psycopg2.connect(os.environ["DATABASE_URL"])
    killer.autocommit = True
    try:
        # One leaked connection per failure would exhaust the pool well
        # before maxconn + 3 iterations.
        for _ in range(maxconn + 3):
            try:
                with dbmod.EWDbWriter(schema) as db:
                    row = db.fetchone("SELECT pg_backend_pid() AS pid")
                    with killer.cursor() as cur:
                        cur.execute(
                            "SELECT pg_terminate_backend(%s)", (row["pid"],)
                        )
                    # Using the doomed connection raises; __exit__'s rollback
                    # on it raises InterfaceError — the pre-fix leak point.
                    db.fetchone("SELECT 1 AS x")
            except psycopg2.Error:
                pass  # the error is expected; the LEAK would be the bug

        # Every broken connection must have been discarded, not stranded.
        assert len(pool._used) == 0, (
            f"{len(pool._used)} connection(s) leaked out of the pool"
        )
        # And the pool must still hand out a working connection.
        with dbmod.EWDbWriter(schema) as db:
            assert db.fetchone("SELECT 1 AS ok")["ok"] == 1
    finally:
        killer.close()


def test_failed_search_path_returns_connection(realdb):
    # __enter__ failure must not strand the checked-out connection.
    pool = dbmod.get_pool()
    maxconn = getattr(pool, "maxconn", 10)
    for _ in range(maxconn + 3):
        with pytest.raises(Exception):
            with dbmod.EWDbWriter("no_such_schema_ever;"):
                pass  # invalid schema name fails validation/SET inside __enter__
    with dbmod.EWDbWriter(realdb) as db:
        assert db.fetchone("SELECT 1 AS ok")["ok"] == 1
