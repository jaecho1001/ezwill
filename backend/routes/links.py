from fastapi import APIRouter, HTTPException, Depends
from models import CreateLinkRequest, CreateLinkResponse
from services.db import EWDbWriter
from services.notification_service import send_magic_link_to_client
from routes.auth import verify_dashboard_token
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")
BASE_URL = os.getenv("BASE_URL", "http://localhost:3000")


@router.post("/create", response_model=CreateLinkResponse)
async def create_link(
    body: CreateLinkRequest,
    _token: str = Depends(verify_dashboard_token),
):
    """
    Create a new draft + magic link, then deliver the link to the client via GHL.
    - Sends email if body.send_email=True and client_email is provided
    - Sends SMS if body.send_sms=True and client_phone is provided
    """
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.create_draft(
            client_first_name=body.client_first_name,
            client_last_name=body.client_last_name,
            client_email=body.client_email,
            client_phone=body.client_phone,
            language=body.language,
        )

        link = db.create_link(
            draft_id=str(draft["id"]),
            client_email=body.client_email,
            client_name=f"{body.client_first_name} {body.client_last_name}",
        )

        token = str(link["token"])
        link_url = f"{BASE_URL}/will?t={token}"
        if body.language == "ko":
            link_url += "&lang=ko"

    # Deliver link via GHL (email + SMS)
    try:
        delivery = await send_magic_link_to_client(
            client_email=body.client_email,
            client_phone=body.client_phone,
            client_first_name=body.client_first_name,
            client_last_name=body.client_last_name,
            magic_link_url=link_url,
            language=body.language,
            send_email=body.send_email,
            send_sms=body.send_sms,
        )
        logger.info(
            f"Magic link delivery: email_sent={delivery['email_sent']} sms_sent={delivery['sms_sent']}"
        )
    except Exception as e:
        logger.error(f"Magic link delivery failed: {e}")

    return CreateLinkResponse(
        token=token,
        draft_id=str(draft["id"]),
        link_url=link_url,
        expires_at=str(link["expires_at"]),
        client_name=f"{body.client_first_name} {body.client_last_name}",
    )


@router.get("/{token}/resolve")
async def resolve_link(token: str):
    """Client-facing — resolves a magic link token (no auth)."""
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        link = db.resolve_link(token)
        if not link:
            raise HTTPException(404, "Link not found, expired, or revoked")

        db.mark_link_opened(token)

        return {
            "draft_id": str(link["draft_id"]),
            "client_name": link["client_name"],
            "language": link["language"],
            "status": link["draft_status"],
            "current_step": link["current_step"],
            "completed_steps": link["completed_steps"] or [],
        }


@router.post("/{token}/revoke")
async def revoke_link(
    token: str,
    _tok: str = Depends(verify_dashboard_token),
):
    """Revoke a magic link (dashboard-only)."""
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        db.execute(
            "UPDATE ew_client_links SET revoked = true WHERE token = %s",
            (token,),
        )
        return {"revoked": True}
