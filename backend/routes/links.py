from fastapi import APIRouter, HTTPException
from models import CreateLinkRequest, CreateLinkResponse
from services.db import EWDbWriter
import os

router = APIRouter()

DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")
BASE_URL = os.getenv("BASE_URL", "http://localhost:3000")

@router.post("/create", response_model=CreateLinkResponse)
async def create_link(body: CreateLinkRequest):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        # Create draft first
        draft = db.create_draft(
            client_first_name=body.client_first_name,
            client_last_name=body.client_last_name,
            client_email=body.client_email,
            client_phone=body.client_phone,
            language=body.language,
        )

        # Create magic link
        link = db.create_link(
            draft_id=str(draft['id']),
            client_email=body.client_email,
            client_name=f"{body.client_first_name} {body.client_last_name}",
        )

        token = str(link['token'])
        link_url = f"{BASE_URL}/will?t={token}"
        if body.language == 'ko':
            link_url += "&lang=ko"

        return CreateLinkResponse(
            token=token,
            draft_id=str(draft['id']),
            link_url=link_url,
            expires_at=str(link['expires_at']),
            client_name=f"{body.client_first_name} {body.client_last_name}",
        )

@router.get("/{token}/resolve")
async def resolve_link(token: str):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        link = db.resolve_link(token)
        if not link:
            raise HTTPException(404, "Link not found, expired, or revoked")

        # Mark as opened
        db.mark_link_opened(token)

        return {
            "draft_id": str(link['draft_id']),
            "client_name": link['client_name'],
            "language": link['language'],
            "status": link['draft_status'],
            "current_step": link['current_step'],
            "completed_steps": link['completed_steps'] or [],
        }

@router.post("/{token}/revoke")
async def revoke_link(token: str):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        db.execute(
            "UPDATE ew_client_links SET revoked = true WHERE token = %s",
            (token,)
        )
        return {"revoked": True}
