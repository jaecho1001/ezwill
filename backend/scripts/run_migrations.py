"""Apply bundled SQL migrations once, including on existing database volumes."""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path

import psycopg2
from psycopg2 import sql

MIGRATIONS = Path(__file__).resolve().parents[1] / "db" / "migrations"
TENANT_REGEX = re.compile(r"^firm_[a-z0-9_]+$")


def main() -> None:
    schema = os.getenv("DEFAULT_SCHEMA", "firm_demo")
    if not TENANT_REGEX.fullmatch(schema):
        raise ValueError(f"Invalid schema: {schema}")
    connection = psycopg2.connect(
        os.getenv("DATABASE_URL", "postgresql://localhost/caselawvision")
    )
    try:
        with connection.cursor() as cursor:
            # Serialize concurrent deploys without relying on container ordering.
            cursor.execute("SELECT pg_advisory_lock(hashtext(%s))", (f"ezwill:{schema}",))
            cursor.execute(
                sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(sql.Identifier(schema))
            )
            cursor.execute(
                sql.SQL("""
                    CREATE TABLE IF NOT EXISTS {}.ew_schema_migrations (
                        filename TEXT PRIMARY KEY,
                        checksum TEXT NOT NULL,
                        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    )
                """).format(sql.Identifier(schema))
            )
        connection.commit()

        for path in sorted(MIGRATIONS.glob("*.sql")):
            contents = path.read_text(encoding="utf-8")
            checksum = hashlib.sha256(contents.encode()).hexdigest()
            with connection.cursor() as cursor:
                cursor.execute(
                    sql.SQL("SELECT checksum FROM {}.ew_schema_migrations WHERE filename = %s").format(
                        sql.Identifier(schema)
                    ),
                    (path.name,),
                )
                applied = cursor.fetchone()
                if applied:
                    if applied[0] != checksum:
                        raise RuntimeError(f"Applied migration was modified: {path.name}")
                    continue

                # Legacy files targeted firm_demo. Replace only executable schema
                # directives so one image can initialize any validated tenant schema.
                migration = contents.replace(
                    "CREATE SCHEMA IF NOT EXISTS firm_demo;",
                    sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(sql.Identifier(schema)).as_string(connection) + ";",
                ).replace(
                    "SET search_path TO firm_demo;",
                    sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)).as_string(connection) + ";",
                )
                cursor.execute(migration)
                cursor.execute(
                    sql.SQL("INSERT INTO {}.ew_schema_migrations (filename, checksum) VALUES (%s, %s)").format(
                        sql.Identifier(schema)
                    ),
                    (path.name, checksum),
                )
            connection.commit()
            print(f"Applied {path.name}", flush=True)
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


if __name__ == "__main__":
    main()
