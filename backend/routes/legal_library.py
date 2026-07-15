"""Internal legal-source and versioned clause-library APIs.

Every route requires lawyer-dashboard authentication. Licensed source text is
served only from the explicit internal page endpoint and is never joined into
client review responses.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from routes.auth import verify_dashboard_token
from services.db import EWDbWriter

router = APIRouter()
DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")


class ClauseVersionBody(BaseModel):
    clause_text: str = ""
    internal_explanation: Optional[str] = None
    client_explanation: Optional[str] = None
    client_qa: list[dict] = Field(default_factory=list)
    statute_citations: list[str] = Field(default_factory=list)
    case_citations: list[str] = Field(default_factory=list)
    applicability_rules: dict = Field(default_factory=dict)
    change_summary: Optional[str] = None
    created_by: Optional[str] = None


class ReviewDecisionBody(BaseModel):
    reviewer_name: str = Field(min_length=1)
    reviewer_note: Optional[str] = None
    effective_from: Optional[date] = None


class SourceLinkBody(BaseModel):
    source_document_id: str
    source_page_id: Optional[str] = None
    pdf_page_number: Optional[int] = Field(None, ge=1)
    printed_page_label: Optional[str] = None
    relation_type: str = "research_basis"
    internal_note: Optional[str] = None


class ReviewActionBody(BaseModel):
    decision: str
    reviewer_name: str = Field(min_length=1)
    reviewer_note: Optional[str] = None


def _content_hash(body: ClauseVersionBody) -> str:
    canonical = json.dumps(
        body.model_dump(exclude={"created_by"}), sort_keys=True, ensure_ascii=False
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@router.get("/sources")
async def list_sources(_token: str = Depends(verify_dashboard_token)):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        rows = db.fetchall(
            """
            SELECT id, title, publisher, edition_year, publication_date,
                   source_type, original_filename, sha256, page_count,
                   access_scope, ingestion_status, imported_at, created_at
            FROM ew_legal_source_documents
            ORDER BY edition_year DESC, created_at DESC
            """
        )
    return {"sources": [dict(row) for row in rows]}


@router.get("/sources/{source_id}/pages")
async def get_source_pages(
    source_id: str,
    page: Optional[int] = Query(None, ge=1),
    query: Optional[str] = Query(None, min_length=2, max_length=200),
    limit: int = Query(20, ge=1, le=100),
    _token: str = Depends(verify_dashboard_token),
):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        source = db.fetchone(
            "SELECT id, title, edition_year, page_count, access_scope FROM ew_legal_source_documents WHERE id = %s",
            (source_id,),
        )
        if not source:
            raise HTTPException(404, "Legal source not found")
        if page is not None:
            rows = db.fetchall(
                """
                SELECT id, pdf_page_number, printed_page_label, tab_label,
                       inferred_heading, source_text, text_sha256
                FROM ew_legal_source_pages
                WHERE source_document_id = %s AND pdf_page_number = %s
                """,
                (source_id, page),
            )
        elif query:
            rows = db.fetchall(
                """
                SELECT id, pdf_page_number, printed_page_label, tab_label,
                       inferred_heading, source_text, text_sha256,
                       ts_rank(search_vector, plainto_tsquery('english', %s)) AS rank
                FROM ew_legal_source_pages
                WHERE source_document_id = %s
                  AND search_vector @@ plainto_tsquery('english', %s)
                ORDER BY rank DESC, pdf_page_number
                LIMIT %s
                """,
                (query, source_id, query, limit),
            )
        else:
            rows = db.fetchall(
                """
                SELECT id, pdf_page_number, printed_page_label, tab_label,
                       inferred_heading, source_text, text_sha256
                FROM ew_legal_source_pages
                WHERE source_document_id = %s
                ORDER BY pdf_page_number
                LIMIT %s
                """,
                (source_id, limit),
            )
    return {"source": dict(source), "pages": [dict(row) for row in rows]}


@router.get("/clauses")
async def list_clause_templates(
    status: Optional[str] = Query(None),
    _token: str = Depends(verify_dashboard_token),
):
    where = "WHERE t.lifecycle_status = %s" if status else ""
    params = (status,) if status else None
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        rows = db.fetchall(
            f"""
            SELECT t.id, t.clause_key, t.heading, t.section, t.subsection,
                   t.document_types, t.tier, t.is_folder, t.is_default,
                   t.lifecycle_status, t.current_version_id,
                   latest.id AS latest_version_id,
                   latest.version_number AS latest_version_number,
                   latest.status AS latest_version_status,
                   latest.created_at AS latest_version_created_at
            FROM ew_clause_templates t
            LEFT JOIN LATERAL (
                SELECT v.id, v.version_number, v.status, v.created_at
                FROM ew_clause_template_versions v
                WHERE v.clause_template_id = t.id
                ORDER BY v.version_number DESC
                LIMIT 1
            ) latest ON true
            {where}
            ORDER BY t.section, t.heading
            """,
            params,
        )
    return {"clauses": [dict(row) for row in rows]}


@router.get("/clauses/{clause_key}")
async def get_clause_template(clause_key: str, _token: str = Depends(verify_dashboard_token)):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        template = db.fetchone(
            "SELECT * FROM ew_clause_templates WHERE clause_key = %s", (clause_key,)
        )
        if not template:
            raise HTTPException(404, "Clause template not found")
        versions = db.fetchall(
            """
            SELECT * FROM ew_clause_template_versions
            WHERE clause_template_id = %s
            ORDER BY version_number DESC
            """,
            (template["id"],),
        )
        source_links = db.fetchall(
            """
            SELECT l.id, l.clause_version_id, l.source_document_id,
                   l.source_page_id, l.printed_page_label, l.relation_type,
                   l.internal_note, d.title AS source_title,
                   d.edition_year, p.pdf_page_number, p.inferred_heading
            FROM ew_clause_source_links l
            JOIN ew_clause_template_versions v ON v.id = l.clause_version_id
            JOIN ew_legal_source_documents d ON d.id = l.source_document_id
            LEFT JOIN ew_legal_source_pages p ON p.id = l.source_page_id
            WHERE v.clause_template_id = %s
            ORDER BY d.edition_year DESC, p.pdf_page_number
            """,
            (template["id"],),
        ) if versions else []
    return {
        "template": dict(template),
        "versions": [dict(version) for version in versions],
        "source_links": [dict(link) for link in source_links],
    }


@router.post("/clauses/{clause_key}/versions", status_code=201)
async def create_clause_version(
    clause_key: str,
    body: ClauseVersionBody,
    _token: str = Depends(verify_dashboard_token),
):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        template = db.fetchone(
            "SELECT id FROM ew_clause_templates WHERE clause_key = %s", (clause_key,)
        )
        if not template:
            raise HTTPException(404, "Clause template not found")
        version = db.fetchone(
            """
            INSERT INTO ew_clause_template_versions
                (clause_template_id, version_number, clause_text,
                 internal_explanation, client_explanation, client_qa,
                 statute_citations, case_citations, applicability_rules,
                 change_summary, content_sha256, status, created_by)
            SELECT %s, coalesce(max(version_number), 0) + 1, %s, %s, %s,
                   %s::jsonb, %s, %s, %s::jsonb, %s, %s, 'draft', %s
            FROM ew_clause_template_versions
            WHERE clause_template_id = %s
            RETURNING *
            """,
            (
                template["id"], body.clause_text, body.internal_explanation,
                body.client_explanation, json.dumps(body.client_qa),
                body.statute_citations, body.case_citations,
                json.dumps(body.applicability_rules), body.change_summary,
                _content_hash(body), body.created_by, template["id"],
            ),
        )
        db.execute(
            "UPDATE ew_clause_templates SET lifecycle_status = 'under_review', updated_at = now() WHERE id = %s",
            (template["id"],),
        )
    return {"version": dict(version)}


@router.put("/versions/{version_id}")
async def update_clause_version(
    version_id: str,
    body: ClauseVersionBody,
    _token: str = Depends(verify_dashboard_token),
):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        existing = db.fetchone(
            "SELECT id, status FROM ew_clause_template_versions WHERE id = %s",
            (version_id,),
        )
        if not existing:
            raise HTTPException(404, "Clause version not found")
        if existing["status"] not in ("draft", "in_review"):
            raise HTTPException(409, "Approved, superseded, rejected versions are immutable")
        version = db.fetchone(
            """
            UPDATE ew_clause_template_versions
            SET clause_text = %s, internal_explanation = %s,
                client_explanation = %s, client_qa = %s::jsonb,
                statute_citations = %s, case_citations = %s,
                applicability_rules = %s::jsonb, change_summary = %s,
                content_sha256 = %s, created_by = coalesce(%s, created_by)
            WHERE id = %s
            RETURNING *
            """,
            (
                body.clause_text, body.internal_explanation,
                body.client_explanation, json.dumps(body.client_qa),
                body.statute_citations, body.case_citations,
                json.dumps(body.applicability_rules), body.change_summary,
                _content_hash(body), body.created_by, version_id,
            ),
        )
    return {"version": dict(version)}


@router.post("/versions/{version_id}/source-links", status_code=201)
async def link_clause_source(
    version_id: str,
    body: SourceLinkBody,
    _token: str = Depends(verify_dashboard_token),
):
    allowed_relations = {"research_basis", "supports", "changes", "conflicts", "supersedes"}
    if body.relation_type not in allowed_relations:
        raise HTTPException(400, "Invalid source relation type")
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        version = db.fetchone(
            "SELECT id, status FROM ew_clause_template_versions WHERE id = %s", (version_id,)
        )
        if not version:
            raise HTTPException(404, "Clause version not found")
        if version["status"] not in ("draft", "in_review"):
            raise HTTPException(409, "Source links on published versions are immutable")
        source = db.fetchone(
            "SELECT id FROM ew_legal_source_documents WHERE id = %s",
            (body.source_document_id,),
        )
        if not source:
            raise HTTPException(404, "Legal source not found")
        page_id = body.source_page_id
        page_number = body.pdf_page_number
        if page_id:
            page = db.fetchone(
                """
                SELECT id, pdf_page_number FROM ew_legal_source_pages
                WHERE id = %s AND source_document_id = %s
                """,
                (page_id, body.source_document_id),
            )
            if not page:
                raise HTTPException(400, "Source page does not belong to this document")
            page_number = page["pdf_page_number"]
        elif page_number:
            page = db.fetchone(
                """
                SELECT id, pdf_page_number FROM ew_legal_source_pages
                WHERE source_document_id = %s AND pdf_page_number = %s
                """,
                (body.source_document_id, page_number),
            )
            if not page:
                raise HTTPException(404, "Source page not found")
            page_id = str(page["id"])
        else:
            raise HTTPException(400, "A source page is required")
        link = db.fetchone(
            """
            INSERT INTO ew_clause_source_links
                (clause_version_id, source_document_id, source_page_id,
                 printed_page_label, relation_type, internal_note)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (clause_version_id, source_document_id, source_page_id, relation_type)
            DO UPDATE SET printed_page_label = EXCLUDED.printed_page_label,
                          internal_note = EXCLUDED.internal_note
            RETURNING *
            """,
            (
                version_id, body.source_document_id, page_id,
                body.printed_page_label, body.relation_type, body.internal_note,
            ),
        )
    return {"source_link": dict(link), "pdf_page_number": page_number}


@router.post("/versions/{version_id}/review-decisions")
async def record_review_decision(
    version_id: str,
    body: ReviewActionBody,
    _token: str = Depends(verify_dashboard_token),
):
    allowed = {"request_changes", "reject", "defer"}
    if body.decision not in allowed:
        raise HTTPException(400, "Use the approval endpoint to approve a version")
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        version = db.fetchone(
            "SELECT id, clause_template_id, status FROM ew_clause_template_versions WHERE id = %s",
            (version_id,),
        )
        if not version:
            raise HTTPException(404, "Clause version not found")
        if version["status"] not in ("draft", "in_review"):
            raise HTTPException(409, "Only draft or in-review versions can receive a review decision")
        next_status = "rejected" if body.decision == "reject" else "draft"
        db.execute(
            "UPDATE ew_clause_template_versions SET status = %s WHERE id = %s",
            (next_status, version_id),
        )
        db.execute(
            """
            INSERT INTO ew_clause_review_decisions
                (clause_version_id, decision, reviewer_name, reviewer_note)
            VALUES (%s, %s, %s, %s)
            """,
            (version_id, body.decision, body.reviewer_name, body.reviewer_note),
        )
    return {"decision": body.decision, "status": next_status}


@router.post("/versions/{version_id}/approve")
async def approve_clause_version(
    version_id: str,
    body: ReviewDecisionBody,
    _token: str = Depends(verify_dashboard_token),
):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        version = db.fetchone(
            "SELECT id, clause_template_id, status FROM ew_clause_template_versions WHERE id = %s",
            (version_id,),
        )
        if not version:
            raise HTTPException(404, "Clause version not found")
        if version["status"] not in ("draft", "in_review"):
            raise HTTPException(409, "Only draft or in-review versions can be approved")
        requirements = db.fetchone(
            """
            SELECT t.is_folder,
                   nullif(btrim(v.clause_text), '') IS NOT NULL AS has_clause_text,
                   nullif(btrim(v.internal_explanation), '') IS NOT NULL AS has_internal_explanation,
                   nullif(btrim(v.client_explanation), '') IS NOT NULL AS has_client_explanation,
                   EXISTS (
                       SELECT 1 FROM ew_clause_source_links l
                       WHERE l.clause_version_id = v.id
                   ) AS has_source_link
            FROM ew_clause_template_versions v
            JOIN ew_clause_templates t ON t.id = v.clause_template_id
            WHERE v.id = %s
            """,
            (version_id,),
        )
        if not requirements["is_folder"]:
            missing = []
            if not requirements["has_clause_text"]:
                missing.append("clause text")
            if not requirements["has_internal_explanation"]:
                missing.append("internal explanation")
            if not requirements["has_client_explanation"]:
                missing.append("client education")
            if not requirements["has_source_link"]:
                missing.append("source page link")
            if missing:
                raise HTTPException(422, f"Approval requires: {', '.join(missing)}")
        db.execute(
            """
            UPDATE ew_clause_template_versions
            SET status = 'superseded', superseded_at = now()
            WHERE clause_template_id = %s AND status = 'approved' AND id <> %s
            """,
            (version["clause_template_id"], version_id),
        )
        approved = db.fetchone(
            """
            UPDATE ew_clause_template_versions
            SET status = 'approved', approved_by = %s, approved_at = now(),
                effective_from = coalesce(%s, current_date)
            WHERE id = %s
            RETURNING *
            """,
            (body.reviewer_name, body.effective_from, version_id),
        )
        db.execute(
            """
            UPDATE ew_clause_templates
            SET current_version_id = %s, lifecycle_status = 'active', updated_at = now()
            WHERE id = %s
            """,
            (version_id, version["clause_template_id"]),
        )
        db.execute(
            """
            INSERT INTO ew_clause_review_decisions
                (clause_version_id, decision, reviewer_name, reviewer_note)
            VALUES (%s, 'approve', %s, %s)
            """,
            (version_id, body.reviewer_name, body.reviewer_note),
        )
    return {"version": dict(approved)}
