from fastapi import APIRouter, HTTPException, Query, Depends
from models import CreateDraftRequest, UpdateDraftRequest
from routes.auth import verify_dashboard_token, verify_client_or_dashboard_draft_access
from services.db import EWDbWriter
import os
import json

router = APIRouter()

DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")

@router.post("")
async def create_draft(body: CreateDraftRequest, _token: str = Depends(verify_dashboard_token)):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.create_draft(
            client_first_name=body.client_first_name,
            client_last_name=body.client_last_name,
            client_email=body.client_email,
            client_phone=body.client_phone,
            language=body.language,
        )
        if not draft:
            raise HTTPException(500, "Failed to create draft")
        return dict(draft)

@router.get("")
async def list_drafts(
    status: str = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _token: str = Depends(verify_dashboard_token),
):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        drafts = db.list_drafts(limit=limit, offset=offset, status=status)
        return {"drafts": [dict(d) for d in drafts], "total": len(drafts)}

@router.get("/{draft_id}")
async def get_draft(draft_id: str, _token: str = Depends(verify_dashboard_token)):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.get_draft(draft_id)
        if not draft:
            raise HTTPException(404, "Draft not found")
        people = db.get_people(draft_id)
        liabilities = db.get_liabilities(draft_id)
        return {
            **dict(draft),
            "people": [dict(p) for p in people],
            "liabilities": liabilities,
        }

@router.put("/{draft_id}")
async def update_draft(draft_id: str, body: UpdateDraftRequest, _auth=Depends(verify_client_or_dashboard_draft_access)):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.get_draft(draft_id)
        if not draft:
            raise HTTPException(404, "Draft not found")

        updates = {}

        # Save questionnaire section data to their own JSONB columns.
        # NOTE: tier2_clauses is NOT written here — clause selections go
        # through the dedicated /clauses routes to avoid overwrites.
        if body.about_you is not None:
            updates['about_you'] = json.dumps(body.about_you)
        if body.your_family is not None:
            updates['your_family'] = json.dumps(body.your_family)
        if body.your_estate is not None:
            updates['your_estate'] = json.dumps(body.your_estate)
        if body.your_arrangements is not None:
            updates['your_arrangements'] = json.dumps(body.your_arrangements)
        if body.poa_property is not None:
            updates['poa_property'] = json.dumps(body.poa_property)
        if body.poa_personal_care is not None:
            updates['poa_personal_care'] = json.dumps(body.poa_personal_care)

        if body.current_step is not None:
            updates['current_step'] = body.current_step
        if body.completed_steps is not None:
            updates['completed_steps'] = body.completed_steps
        if body.language is not None:
            updates['language'] = body.language
        # Lawyer-only fields set from the dashboard.
        if body.lawyer_notes is not None:
            updates['lawyer_notes'] = body.lawyer_notes
        if body.design_decisions is not None:
            updates['design_decisions'] = json.dumps(body.design_decisions)

        # Update status to in_progress if still link_sent/opened
        if dict(draft)['status'] in ('link_sent', 'opened'):
            updates['status'] = 'in_progress'

        updated = db.update_draft(draft_id, updates)

        # Upsert people
        if body.people is not None:
            db.upsert_people(draft_id, body.people)

        # Upsert assets
        if body.assets is not None:
            db.upsert_assets(draft_id, body.assets)

        # Save liabilities
        if body.liabilities is not None:
            db.save_liabilities(draft_id, body.liabilities)

        # Upsert AI flags
        if body.ai_flags is not None:
            db.upsert_ai_flags(draft_id, body.ai_flags)

        return dict(updated)

@router.post("/{draft_id}/submit")
async def submit_draft(draft_id: str, _auth=Depends(verify_client_or_dashboard_draft_access)):
    from services.notification_service import notify_lawyer_submission, track_ghl_engagement

    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.get_draft(draft_id)
        if not draft:
            raise HTTPException(404, "Draft not found")

        submitted = db.submit_draft(draft_id)
        if not submitted:
            raise HTTPException(400, "Draft cannot be submitted in its current state")

        # Get AI flags for notification
        flags = db.fetchall(
            "SELECT * FROM ew_ai_flags WHERE draft_id = %s AND dismissed = false ORDER BY severity",
            (draft_id,)
        )

    # Send email notification (non-blocking)
    try:
        submitted_dict = dict(submitted)
        await notify_lawyer_submission(submitted_dict, [dict(f) for f in flags])
        await track_ghl_engagement(
            "completed-quiz",
            email=submitted_dict.get("client_email"),
            phone=submitted_dict.get("client_phone"),
            first_name=submitted_dict.get("client_first_name"),
            last_name=submitted_dict.get("client_last_name"),
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to send notification: {e}")

    return {"submitted": True, "submitted_at": str(submitted['submitted_at'])}
