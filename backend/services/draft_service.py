"""
Higher-level draft service — business logic layer above db.py.
Used by routes and agents.
"""
import os
from services.db import EWDbWriter

DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")

def get_full_draft(draft_id: str, schema: str = None) -> dict:
    """Get draft with all related data (people, assets, flags)."""
    schema = schema or DEFAULT_SCHEMA
    with EWDbWriter(schema) as db:
        draft = db.get_draft(draft_id)
        if not draft:
            return None
        people = db.get_people(draft_id)
        assets = db.fetchall("SELECT * FROM ew_assets WHERE draft_id = %s", (draft_id,))
        flags = db.fetchall("SELECT * FROM ew_ai_flags WHERE draft_id = %s", (draft_id,))
        return {
            **dict(draft),
            "people": [dict(p) for p in people],
            "assets": [dict(a) for a in assets],
            "ai_flags": [dict(f) for f in flags],
        }
