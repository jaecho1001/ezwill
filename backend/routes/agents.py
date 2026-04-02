from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from models import AgentInvokeRequest, AgentInvokeResponse
from services.db import EWDbWriter
import os

router = APIRouter()

DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")
BASE_URL = os.getenv("BASE_URL", "http://localhost:3000")

@router.post("/will/invoke", response_model=AgentInvokeResponse)
async def invoke_will_agent(
    body: AgentInvokeRequest,
    authorization: Optional[str] = Header(None),
):
    capability = body.capability
    payload = body.payload

    if capability == "draft_will":
        return await _capability_draft_will(payload, body.correlation_id)
    elif capability == "get_draft_status":
        return await _capability_get_draft_status(payload, body.correlation_id)
    elif capability == "run_ai_flags":
        return await _capability_run_ai_flags(payload, body.correlation_id)
    else:
        raise HTTPException(400, f"Unknown capability: {capability}")

async def _capability_draft_will(payload: dict, correlation_id: str) -> AgentInvokeResponse:
    prefill = payload.get('prefill', {})
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.create_draft(
            client_first_name=prefill.get('firstName', ''),
            client_last_name=prefill.get('lastName', ''),
            client_email=prefill.get('email'),
            client_phone=prefill.get('phone'),
            language=prefill.get('language', 'en'),
        )
        link = db.create_link(
            draft_id=str(draft['id']),
            client_email=prefill.get('email'),
            client_name=f"{prefill.get('firstName', '')} {prefill.get('lastName', '')}".strip(),
        )

        token = str(link['token'])
        magic_link = f"{BASE_URL}/will?t={token}"
        if prefill.get('language') == 'ko':
            magic_link += "&lang=ko"

    return AgentInvokeResponse(
        capability="draft_will",
        result={"draft_id": str(draft['id']), "magic_link": magic_link, "token": token},
        correlation_id=correlation_id,
    )

async def _capability_get_draft_status(payload: dict, correlation_id: str) -> AgentInvokeResponse:
    draft_id = payload.get('draft_id') or payload.get('ew_client_id')
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.get_draft(draft_id)
        if not draft:
            raise HTTPException(404, "Draft not found")
        flags = db.fetchall(
            "SELECT * FROM ew_ai_flags WHERE draft_id = %s AND dismissed = false",
            (draft_id,)
        )
        critical = [f for f in flags if f['severity'] == 'critical']

    total_steps = 7
    completed = dict(draft).get('completed_steps') or []
    progress_pct = int((len(completed) / total_steps) * 100)

    return AgentInvokeResponse(
        capability="get_draft_status",
        result={
            "status": dict(draft)['status'],
            "progress_pct": progress_pct,
            "completed_steps": completed,
            "critical_flag_count": len(critical),
            "critical_flags": [dict(f) for f in critical],
        },
        correlation_id=correlation_id,
    )

async def _capability_run_ai_flags(payload: dict, correlation_id: str) -> AgentInvokeResponse:
    draft_id = payload.get('draft_id')
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        flags = db.fetchall(
            "SELECT * FROM ew_ai_flags WHERE draft_id = %s ORDER BY severity",
            (draft_id,)
        )
    return AgentInvokeResponse(
        capability="run_ai_flags",
        result={"flags": [dict(f) for f in flags]},
        correlation_id=correlation_id,
    )
