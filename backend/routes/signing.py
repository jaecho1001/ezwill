"""Signing / execution events — record how a client executed each document.

Ontario: a will is signed by the testator in the presence of two witnesses
(SLRA s.4), or by audio-visual link with counterparts (s.21.1) where at least
one witness is a licensee of the Law Society of Ontario. Lawyer-recorded from
the dashboard; recording a will's execution marks the draft 'signed'.
"""

import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from routes.auth import verify_dashboard_token
from services.db import EWDbWriter

router = APIRouter()

DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")

WILL_TYPES = {"simple_will_short", "single_will", "probate_will", "non_probate_will"}
VALID_TYPES = WILL_TYPES | {"poa_property", "poa_personal_care"}


class WitnessBody(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    occupation: Optional[str] = None
    is_lso: bool = False


class RecordSigningRequest(BaseModel):
    document_type: str
    signing_method: str = "in_person"  # 'in_person' (SLRA s.4) | 'remote_video' (s.21.1)
    signed_at: Optional[str] = None     # ISO date/datetime; None = not yet executed
    location: Optional[str] = None
    witness1: Optional[WitnessBody] = None
    witness2: Optional[WitnessBody] = None
    platform: Optional[str] = None       # remote only (Zoom/Teams…)
    recording_url: Optional[str] = None


@router.get("/{draft_id}")
async def get_signing(draft_id: str, _token: str = Depends(verify_dashboard_token)):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        if not db.get_draft(draft_id):
            raise HTTPException(404, "Draft not found")
        return {"events": [dict(e) for e in db.get_signing_events(draft_id)]}


@router.post("/{draft_id}")
async def record_signing(
    draft_id: str,
    body: RecordSigningRequest,
    _token: str = Depends(verify_dashboard_token),
):
    if body.document_type not in VALID_TYPES:
        raise HTTPException(400, f"Invalid document_type: {body.document_type}")
    if body.signing_method not in ("in_person", "remote_video"):
        raise HTTPException(400, "signing_method must be 'in_person' or 'remote_video'")
    # Remote execution (SLRA s.21.1) requires at least one LSO-licensee witness.
    if body.signing_method == "remote_video" and body.signed_at:
        lso = (body.witness1 and body.witness1.is_lso) or (body.witness2 and body.witness2.is_lso)
        if not lso:
            raise HTTPException(
                400,
                "Remote video execution (SLRA s.21.1) requires at least one witness "
                "who is a licensee of the Law Society of Ontario.",
            )

    with EWDbWriter(DEFAULT_SCHEMA) as db:
        if not db.get_draft(draft_id):
            raise HTTPException(404, "Draft not found")
        event = db.upsert_signing_event(draft_id, body.document_type, {
            "signing_method": body.signing_method,
            "signed_at": body.signed_at,
            "location": body.location,
            "witness1": body.witness1.model_dump() if body.witness1 else None,
            "witness2": body.witness2.model_dump() if body.witness2 else None,
            "platform": body.platform,
            "recording_url": body.recording_url,
        })
        # Recording a will's execution marks the whole draft as signed.
        if body.document_type in WILL_TYPES and body.signed_at:
            db.update_draft(draft_id, {"status": "signed"})
        return dict(event)
