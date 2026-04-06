"""
Client Review Portal routes for EZWill.
These routes are used by clients (not lawyers) to review and approve
generated will documents via magic link tokens.
"""

import os
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services.db import EWDbWriter
from services.draft_service import get_full_draft
from services.document_generator import DOCUMENT_TITLES, resolve_variables

logger = logging.getLogger(__name__)

router = APIRouter()

DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")
FIRM_NAME = os.getenv("FIRM_NAME", "Vaturi & Cho LLP")


# ── Models ───────────────────────────────────────────────────────────────────

class ApproveRequest(BaseModel):
    token: str

class CommentRequest(BaseModel):
    token: str
    document_type: str
    clause_id: str
    comment: str


# ── Helpers ──────────────────────────────────────────────────────────────────

def _validate_review_token(token: str) -> dict:
    """Resolve and validate a review token. Returns link record or raises 401."""
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        # Try review-specific link first, fall back to generic resolve_link
        link = db.resolve_review_link(token)
        if not link:
            link = db.resolve_link(token)
    if not link:
        raise HTTPException(401, "Review link expired, revoked, or invalid")
    return link


def _get_review_documents(draft_id: str) -> list[dict]:
    """Get all documents for a draft with their review status."""
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        configs = db.get_document_configs(draft_id)
        all_selections = db.get_all_clause_selections(draft_id)

    configs_map = {c["document_type"]: dict(c) for c in configs} if configs else {}

    # Get approval and comment data
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        approvals = db.get_review_approvals(draft_id) or []
        all_comments = db.get_review_comments(draft_id) or []

    approval_map = {a["document_type"]: a["approved_at"] for a in approvals}
    # Build comment count per document_type
    comment_map = {}
    for c in all_comments:
        dt = c["document_type"]
        comment_map[dt] = comment_map.get(dt, 0) + 1

    documents = []
    for doc_type, title in DOCUMENT_TITLES.items():
        config = configs_map.get(doc_type, {})
        if not config.get("enabled", True):
            continue
        clause_count = len(all_selections.get(doc_type, []))
        if clause_count == 0:
            continue

        approved_at = approval_map.get(doc_type)
        status = "approved" if approved_at else "pending"

        documents.append({
            "document_type": doc_type,
            "title": title,
            "status": status,
            "clause_count": clause_count,
            "approved_at": str(approved_at) if approved_at else None,
            "comments_count": comment_map.get(doc_type, 0),
        })

    return documents


def _build_variables(draft: dict) -> dict:
    """Build placeholder variables from draft data (simplified version)."""
    from datetime import date

    variables: dict = {}
    first = draft.get("client_first_name", "")
    last = draft.get("client_last_name", "")
    variables["testatorFullName"] = f"{first} {last}".strip() or "[Client Name]"
    variables["clientFullName"] = variables["testatorFullName"]
    variables["testatorFirstName"] = first
    variables["testatorLastName"] = last
    variables["documentDate"] = date.today().strftime("%B %d, %Y")
    variables["province"] = draft.get("province", "Ontario")

    about = draft.get("about_you") or {}
    variables["city"] = about.get("city", "")
    variables["cityName"] = about.get("city", "")
    variables["address"] = about.get("address", "")
    variables["maritalStatus"] = about.get("maritalStatus", "")

    family = draft.get("your_family") or {}
    variables["spouseFullName"] = family.get("spouseFullName", "")
    variables["spouseFirstName"] = family.get("spouseFirstName", "")
    if family.get("children"):
        child_names = [
            c.get("name", f"{c.get('firstName', '')} {c.get('lastName', '')}").strip()
            for c in family["children"]
        ]
        variables["childNames"] = ", ".join(n for n in child_names if n)

    estate = draft.get("your_estate") or {}
    variables["survivalDays"] = str(estate.get("survivalDays", 30))
    variables["trustDistributionAge"] = str(estate.get("trustDistributionAge", 21))

    for person in draft.get("people", []):
        role = person.get("role", "")
        full_name = f"{person.get('first_name', '')} {person.get('last_name', '')}".strip()
        if role == "primary_executor":
            variables["primaryExecutorFullName"] = full_name
        elif role == "backup_executor":
            variables["backupExecutorFullName"] = full_name
        elif role == "poa_property_attorney":
            variables["poaPropertyAttorneyFullName"] = full_name
        elif role == "poa_personal_care_attorney":
            variables["poaPersonalCareAttorneyFullName"] = full_name
        elif role == "guardian":
            variables["guardianFullName"] = full_name

    return variables


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/token/{token}/resolve")
async def resolve_review_token(token: str):
    """
    Resolve a review magic-link token.
    Returns client info and list of documents available for review.
    """
    link = _validate_review_token(token)
    draft_id = str(link["draft_id"])

    draft = get_full_draft(draft_id, DEFAULT_SCHEMA)
    if not draft:
        raise HTTPException(404, "Draft not found")

    documents = _get_review_documents(draft_id)
    all_approved = len(documents) > 0 and all(d["status"] == "approved" for d in documents)

    return {
        "draft_id": draft_id,
        "client_name": link.get("client_name", ""),
        "client_first_name": draft.get("client_first_name", ""),
        "client_last_name": draft.get("client_last_name", ""),
        "language": link.get("language", "en"),
        "firm_name": FIRM_NAME,
        "documents": documents,
        "all_approved": all_approved,
    }


@router.get("/{draft_id}/status")
async def get_review_status(draft_id: str, token: str = Query(...)):
    """Get review status for all documents in a draft."""
    _validate_review_token(token)

    documents = _get_review_documents(draft_id)
    approved_count = sum(1 for d in documents if d["status"] == "approved")

    return {
        "draft_id": draft_id,
        "documents": documents,
        "all_approved": len(documents) > 0 and approved_count == len(documents),
        "approved_count": approved_count,
        "total_count": len(documents),
    }


@router.get("/{draft_id}/preview/{document_type}")
async def get_review_preview(draft_id: str, document_type: str, token: str = Query(...)):
    """
    Get clause-level preview of a document for client review.
    Returns structured clauses (not just raw HTML) so the frontend
    can render clause-by-clause review UI.
    """
    link = _validate_review_token(token)

    # Allow __from_token__ as a placeholder — resolve to actual draft_id
    if draft_id == "__from_token__":
        draft_id = str(link["draft_id"])

    draft = get_full_draft(draft_id, DEFAULT_SCHEMA)
    if not draft:
        raise HTTPException(404, "Draft not found")

    if document_type not in DOCUMENT_TITLES:
        raise HTTPException(400, f"Invalid document_type: {document_type}")

    with EWDbWriter(DEFAULT_SCHEMA) as db:
        clause_rows = db.get_clause_selections(draft_id, document_type)
        clause_rows = [dict(c) for c in clause_rows] if clause_rows else []

    variables = _build_variables(draft)

    # Build structured clause data
    title = DOCUMENT_TITLES.get(document_type, document_type)
    clauses = []
    included = [c for c in clause_rows if c.get("included", True)]
    included.sort(key=lambda c: c.get("sort_order", 0))

    # Load clause library metadata for annotations
    clause_meta = _load_clause_metadata()

    for clause in included:
        clause_id = clause.get("clause_id", "")
        is_folder = clause.get("is_folder", False)
        text = (
            clause.get("custom_text")
            or clause.get("template_text")
            or ""
        )
        resolved_text = resolve_variables(text, variables)

        meta = clause_meta.get(clause_id, {})
        clause_title = clause.get("title", meta.get("name", ""))
        if clause_title:
            clause_title = resolve_variables(clause_title, variables)

        clauses.append({
            "clause_id": clause_id,
            "section": clause.get("section", meta.get("section", "")),
            "title": clause_title,
            "html": resolved_text,
            "is_folder": is_folder,
            "annotation": meta.get("annotation"),
            "annotation_ko": meta.get("annotationKo"),
            "statute": meta.get("statute"),
        })

    return {
        "document_type": document_type,
        "title": title,
        "html": "",  # Not used in clause-by-clause mode
        "clause_count": sum(1 for c in clauses if not c["is_folder"]),
        "clauses": clauses,
    }


@router.post("/{draft_id}/approve/{document_type}")
async def approve_document(draft_id: str, document_type: str, body: ApproveRequest):
    """
    Client approves a reviewed document.
    Records the approval timestamp.
    """
    link = _validate_review_token(body.token)

    if document_type not in DOCUMENT_TITLES:
        raise HTTPException(400, f"Invalid document_type: {document_type}")

    # Verify draft exists
    draft = get_full_draft(draft_id, DEFAULT_SCHEMA)
    if not draft:
        raise HTTPException(404, "Draft not found")

    with EWDbWriter(DEFAULT_SCHEMA) as db:
        db.save_review_approval(
            draft_id, document_type, link.get("client_name", "client")
        )

    logger.info("Document %s approved for draft %s", document_type, draft_id)
    return {"approved": True, "document_type": document_type}


@router.post("/{draft_id}/comment")
async def add_comment(draft_id: str, body: CommentRequest):
    """
    Client adds a comment/question on a specific clause.
    The lawyer sees these in the dashboard.
    """
    link = _validate_review_token(body.token)

    draft = get_full_draft(draft_id, DEFAULT_SCHEMA)
    if not draft:
        raise HTTPException(404, "Draft not found")

    with EWDbWriter(DEFAULT_SCHEMA) as db:
        db.save_review_comment(
            draft_id,
            body.document_type,
            body.clause_id,
            body.comment,
            link.get("client_name", "client"),
        )

    logger.info("Comment added on clause %s for draft %s", body.clause_id, draft_id)
    return {"added": True}


# ── Clause Metadata Loader ───────────────────────────────────────────────────

_clause_meta_cache: dict | None = None

def _load_clause_metadata() -> dict:
    """
    Load clause metadata (annotations, statutes) from the clause library.
    Returns a dict keyed by clause_id.
    Falls back to empty dict if not available.
    """
    global _clause_meta_cache
    if _clause_meta_cache is not None:
        return _clause_meta_cache

    try:
        import json
        clause_lib_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            "data", "clause-library.json"
        )
        if os.path.exists(clause_lib_path):
            with open(clause_lib_path, "r") as f:
                library = json.load(f)
            meta = {}
            for clause in library:
                _extract_meta(clause, meta)
            _clause_meta_cache = meta
            return meta
    except Exception:
        logger.warning("Could not load clause library metadata", exc_info=True)

    _clause_meta_cache = {}
    return _clause_meta_cache


def _extract_meta(clause: dict, result: dict):
    """Recursively extract metadata from a clause tree."""
    clause_id = clause.get("id", "")
    if clause_id:
        result[clause_id] = {
            "name": clause.get("name", ""),
            "section": clause.get("section", ""),
            "annotation": clause.get("annotation"),
            "annotationKo": clause.get("annotationKo"),
            "statute": clause.get("statute"),
            "caselaw": clause.get("caselaw"),
        }
    for child in clause.get("children", []):
        _extract_meta(child, result)
