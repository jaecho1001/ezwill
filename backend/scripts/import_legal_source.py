"""Import an authorized legal source and the firm's clause library.

The original file stays in private storage outside Git. PDF text is stored in
internal-only page records for lawyer research and provenance. Client-facing
content lives separately on clause versions and is never populated from source
text by this importer.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import re
import subprocess
from datetime import date
from pathlib import Path
from typing import Any

import psycopg2
from psycopg2 import sql
from psycopg2.extras import Json

TENANT_REGEX = re.compile(r"^firm_[a-z0-9_]+$")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run_tool(*command: str) -> str:
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError as exc:
        raise RuntimeError(f"Required command is not installed: {command[0]}") from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or "").strip()
        raise RuntimeError(f"{' '.join(command)} failed: {detail}") from exc
    return result.stdout


def pdf_page_count(path: Path) -> int:
    info = run_tool("pdfinfo", str(path))
    match = re.search(r"^Pages:\s+(\d+)\s*$", info, re.MULTILINE)
    if not match:
        raise RuntimeError("pdfinfo did not report a page count")
    return int(match.group(1))


def infer_heading(page_text: str) -> str | None:
    lines = [re.sub(r"\s+", " ", line).strip() for line in page_text.splitlines()]
    candidates = [line for line in lines if 3 <= len(line) <= 180]
    for line in candidates[:15]:
        if re.fullmatch(r"\d+|FOR REFERENCE ONLY|The Annotated Will \d{4}", line, re.I):
            continue
        if line.upper() == line and any(char.isalpha() for char in line):
            return line.title()
    return candidates[0] if candidates else None


def extract_pdf_pages(path: Path, expected_pages: int) -> list[str]:
    text = run_tool("pdftotext", "-layout", "-enc", "UTF-8", str(path), "-")
    pages = text.split("\f")
    if pages and not pages[-1].strip():
        pages.pop()
    # pdftotext occasionally omits a final blank page. Preserve provenance by
    # padding; never silently renumber extracted content.
    if len(pages) < expected_pages:
        pages.extend([""] * (expected_pages - len(pages)))
    if len(pages) > expected_pages:
        pages = pages[:expected_pages]
    return [page.replace("\x00", "").strip() for page in pages]


def canonical_clause_hash(clause: dict[str, Any]) -> str:
    content = {
        "templateText": clause.get("templateText", ""),
        "annotation": clause.get("annotation"),
        "statute": clause.get("statute"),
        "caselaw": clause.get("caselaw"),
        "applicableWhen": clause.get("applicableWhen") or {},
    }
    return sha256_bytes(json.dumps(content, sort_keys=True, ensure_ascii=False).encode("utf-8"))


def import_source(cursor, path: Path, args: argparse.Namespace) -> tuple[str, int]:
    digest = file_sha256(path)
    pages_count = pdf_page_count(path)
    mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    cursor.execute(
        """
        INSERT INTO ew_legal_source_documents
            (title, publisher, edition_year, publication_date, source_type,
             original_filename, mime_type, sha256, private_storage_uri,
             page_count, access_scope, licence_note, ingestion_status)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                'legal_admin', %s, 'processing')
        ON CONFLICT (sha256) DO UPDATE SET
            title = EXCLUDED.title,
            publisher = EXCLUDED.publisher,
            private_storage_uri = EXCLUDED.private_storage_uri,
            licence_note = EXCLUDED.licence_note,
            updated_at = now(),
            ingestion_status = 'processing',
            ingestion_error = NULL
        RETURNING id
        """,
        (
            args.title,
            args.publisher,
            args.edition,
            args.publication_date,
            args.source_type,
            path.name,
            mime_type,
            digest,
            path.as_uri(),
            pages_count,
            args.licence_note,
        ),
    )
    document_id = str(cursor.fetchone()[0])
    pages = extract_pdf_pages(path, pages_count)
    for page_number, source_text in enumerate(pages, start=1):
        cursor.execute(
            """
            INSERT INTO ew_legal_source_pages
                (source_document_id, pdf_page_number, inferred_heading,
                 source_text, text_sha256, extraction_method, extraction_metadata)
            VALUES (%s, %s, %s, %s, %s, 'pdftotext-layout', %s)
            ON CONFLICT (source_document_id, pdf_page_number) DO UPDATE SET
                inferred_heading = EXCLUDED.inferred_heading,
                source_text = EXCLUDED.source_text,
                text_sha256 = EXCLUDED.text_sha256,
                extraction_method = EXCLUDED.extraction_method,
                extraction_metadata = EXCLUDED.extraction_metadata
            """,
            (
                document_id,
                page_number,
                infer_heading(source_text),
                source_text,
                sha256_bytes(source_text.encode("utf-8")),
                Json({"authorized_for_internal_app_use": True}),
            ),
        )
    cursor.execute(
        "DELETE FROM ew_legal_source_pages WHERE source_document_id = %s AND pdf_page_number > %s",
        (document_id, len(pages)),
    )
    cursor.execute(
        """
        UPDATE ew_legal_source_documents
        SET ingestion_status = 'ready', imported_at = now(), updated_at = now()
        WHERE id = %s
        """,
        (document_id,),
    )
    cursor.execute(
        """
        INSERT INTO ew_annual_source_reviews (source_document_id, status)
        VALUES (%s, 'mapping')
        ON CONFLICT (source_document_id) DO NOTHING
        """,
        (document_id,),
    )
    return document_id, len(pages)


def seed_clause_library(cursor, export_path: Path) -> tuple[int, int]:
    payload = json.loads(export_path.read_text(encoding="utf-8"))
    clauses = payload.get("clauses") or []
    document_types = payload.get("documentTypes") or []
    default_ids = {
        clause_id
        for document_type in document_types
        for clause_id in document_type.get("defaultClauseIds", [])
    }
    created_templates = 0
    created_versions = 0
    for clause in clauses:
        clause_key = clause["id"]
        document_type = clause.get("documentType", "all")
        cursor.execute(
            """
            INSERT INTO ew_clause_templates
                (clause_key, heading, section, subsection, document_types,
                 tier, is_folder, is_default, lifecycle_status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'under_review')
            ON CONFLICT (clause_key) DO UPDATE SET
                heading = EXCLUDED.heading,
                section = EXCLUDED.section,
                subsection = EXCLUDED.subsection,
                document_types = EXCLUDED.document_types,
                tier = EXCLUDED.tier,
                is_folder = EXCLUDED.is_folder,
                is_default = EXCLUDED.is_default,
                updated_at = now()
            RETURNING id, (xmax = 0) AS inserted
            """,
            (
                clause_key,
                clause.get("name") or clause_key,
                clause.get("section") or "Uncategorized",
                clause.get("subsection"),
                [document_type],
                clause.get("tier", 1),
                bool(clause.get("isFolder")),
                clause_key in default_ids,
            ),
        )
        template_id, inserted = cursor.fetchone()
        created_templates += int(inserted)
        content_hash = canonical_clause_hash(clause)
        cursor.execute(
            """
            SELECT id FROM ew_clause_template_versions
            WHERE clause_template_id = %s AND content_sha256 = %s
            """,
            (template_id, content_hash),
        )
        if cursor.fetchone():
            continue
        cursor.execute(
            "SELECT coalesce(max(version_number), 0) + 1 FROM ew_clause_template_versions WHERE clause_template_id = %s",
            (template_id,),
        )
        version_number = cursor.fetchone()[0]
        cursor.execute(
            """
            INSERT INTO ew_clause_template_versions
                (clause_template_id, version_number, clause_text,
                 internal_explanation, statute_citations, case_citations,
                 applicability_rules, content_sha256, status, change_summary,
                 created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'draft', %s, %s)
            """,
            (
                template_id,
                version_number,
                clause.get("templateText", ""),
                clause.get("annotation"),
                [clause["statute"]] if clause.get("statute") else [],
                [clause["caselaw"]] if clause.get("caselaw") else [],
                Json(clause.get("applicableWhen") or {}),
                content_hash,
                "Initial database seed from the existing firm-authored clause library.",
                "system-import",
            ),
        )
        created_versions += 1
    return created_templates, created_versions


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--publisher", default="Law Society of Ontario")
    parser.add_argument("--edition", type=int, required=True)
    parser.add_argument("--publication-date", type=date.fromisoformat)
    parser.add_argument("--source-type", default="annotated_will")
    parser.add_argument("--licence-note", default="Licensed by the firm for private internal application use.")
    parser.add_argument("--clause-library-json", type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    path = args.file.expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(path)
    if path.suffix.lower() != ".pdf":
        raise ValueError("This importer currently accepts PDF legal sources only")
    schema = os.getenv("DEFAULT_SCHEMA", "firm_demo")
    if not TENANT_REGEX.fullmatch(schema):
        raise ValueError(f"Invalid schema: {schema}")
    connection = psycopg2.connect(os.getenv("DATABASE_URL", "postgresql://localhost/caselawvision"))
    try:
        with connection.cursor() as cursor:
            cursor.execute(sql.SQL("SET search_path TO {}").format(sql.Identifier(schema)))
            document_id, page_count = import_source(cursor, path, args)
            seeded = (0, 0)
            if args.clause_library_json:
                seeded = seed_clause_library(cursor, args.clause_library_json.resolve())
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
    print(json.dumps({
        "source_document_id": document_id,
        "pages_imported": page_count,
        "templates_created": seeded[0],
        "versions_created": seeded[1],
    }))


if __name__ == "__main__":
    main()
