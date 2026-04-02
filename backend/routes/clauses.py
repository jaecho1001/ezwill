"""
Clause selection routes for EZWill.
Manages lawyer's clause selections per draft per document type.
"""

from fastapi import APIRouter, HTTPException
from models import SaveClausesRequest, DocumentConfigUpdate
from services.db import EWDbWriter
import os

router = APIRouter()

DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")


@router.get("/{draft_id}/clauses")
async def get_all_clause_selections(draft_id: str):
    """Get all clause selections for a draft, grouped by document type."""
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.get_draft(draft_id)
        if not draft:
            raise HTTPException(404, "Draft not found")
        selections = db.get_all_clause_selections(draft_id)
        return {"selections": selections}


@router.get("/{draft_id}/clauses/{document_type}")
async def get_clause_selections(draft_id: str, document_type: str):
    """Get clause selections for a specific document type."""
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.get_draft(draft_id)
        if not draft:
            raise HTTPException(404, "Draft not found")
        clauses = db.get_clause_selections(draft_id, document_type)
        return {"document_type": document_type, "clauses": [dict(c) for c in clauses]}


@router.put("/{draft_id}/clauses/{document_type}")
async def save_clause_selections(draft_id: str, document_type: str, body: SaveClausesRequest):
    """Save (upsert) all clause selections for a draft + document type."""
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.get_draft(draft_id)
        if not draft:
            raise HTTPException(404, "Draft not found")

        clauses_data = [c.model_dump() for c in body.clauses]
        success = db.save_clause_selections(draft_id, document_type, clauses_data)
        if not success:
            raise HTTPException(500, "Failed to save clause selections")

        saved = db.get_clause_selections(draft_id, document_type)
        return {"document_type": document_type, "clauses": [dict(c) for c in saved]}


@router.delete("/{draft_id}/clauses/{document_type}")
async def reset_clause_selections(draft_id: str, document_type: str):
    """Delete all saved selections for a draft + document type (frontend reloads defaults)."""
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.get_draft(draft_id)
        if not draft:
            raise HTTPException(404, "Draft not found")

        success = db.reset_clause_selections(draft_id, document_type)
        if not success:
            raise HTTPException(500, "Failed to reset clause selections")

        return {"reset": True, "document_type": document_type}


@router.get("/{draft_id}/documents")
async def get_document_configs(draft_id: str):
    """List document configs for a draft with generation status."""
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.get_draft(draft_id)
        if not draft:
            raise HTTPException(404, "Draft not found")

        configs = db.get_document_configs(draft_id)
        return {"documents": [dict(c) for c in configs]}


@router.put("/{draft_id}/documents/{document_type}")
async def update_document_config(draft_id: str, document_type: str, body: DocumentConfigUpdate):
    """Enable or disable a document type for a draft."""
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.get_draft(draft_id)
        if not draft:
            raise HTTPException(404, "Draft not found")

        success = db.save_document_config(draft_id, document_type, body.enabled)
        if not success:
            raise HTTPException(500, "Failed to update document config")

        return {"document_type": document_type, "enabled": body.enabled}
