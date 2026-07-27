from fastapi import APIRouter, HTTPException, Depends, Request, Response
from models import CreateLinkRequest, CreateLinkResponse
from services.db import EWDbWriter
from services.notification_service import send_magic_link_to_client, _notification_mode as notification_mode
from services.link_service import build_questionnaire_url
from services.client_ip import client_ip
from services.legacy_backfill import has_legacy_answers, legacy_draft_to_vault
from services.draft_service import get_full_draft
from routes.auth import verify_dashboard_token
from collections import deque
import os
import time
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")

# Resolve is public (a bare token is the only credential), so cap probing:
# generous enough for a client reopening their link across devices, far too
# slow for enumerating 122-bit random tokens.
RESOLVE_WINDOW_SECONDS = int(os.getenv("LINK_RESOLVE_RATE_WINDOW_SECS", "60"))
RESOLVE_MAX_PER_WINDOW = int(os.getenv("LINK_RESOLVE_RATE_MAX_REQS", "30"))
_resolve_hits: dict = {}


def _resolve_rate_limit(client: str) -> None:
    now = time.time()
    hits = _resolve_hits.setdefault(client, deque())
    while hits and now - hits[0] > RESOLVE_WINDOW_SECONDS:
        hits.popleft()
    if len(hits) >= RESOLVE_MAX_PER_WINDOW:
        raise HTTPException(429, "Too many link lookups; please try again shortly")
    hits.append(now)


@router.post("/create", response_model=CreateLinkResponse)
async def create_link(
    body: CreateLinkRequest,
    _token: str = Depends(verify_dashboard_token),
):
    """
    Create a new draft + magic link, then deliver the link to the client.
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
        link_url = build_questionnaire_url(str(draft["id"]), token, body.language)

    # Deliver link via the configured notification provider. The response
    # carries HONEST per-channel status (#88): in stdout mode the message is
    # written to the server log and discarded, which previously surfaced to
    # the lawyer as unqualified success — a client who never receives their
    # link then reads as an unresponsive client for weeks.
    delivery = {"email_sent": False, "sms_sent": False}
    delivery_failed = False
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
        delivery_failed = True
        logger.error(f"Magic link delivery failed: {e}")

    def _channel_status(requested: bool, sent: bool) -> str:
        if not requested:
            return "not_requested"
        if delivery_failed:
            return "failed"
        if notification_mode() == "stdout":
            return "logged_only"
        return "sent" if sent else "failed"

    return CreateLinkResponse(
        token=token,
        draft_id=str(draft["id"]),
        link_url=link_url,
        expires_at=str(link["expires_at"]),
        email_delivery=_channel_status(
            bool(body.send_email and body.client_email), delivery["email_sent"]
        ),
        sms_delivery=_channel_status(
            bool(body.send_sms and body.client_phone), delivery["sms_sent"]
        ),
        client_name=f"{body.client_first_name} {body.client_last_name}",
    )


@router.get("/{token}/resolve")
async def resolve_link(token: str, request: Request, response: Response):
    """Client-facing — resolves a magic link token (no auth).

    Scope discipline (issue #77): this endpoint answers to a bare token, so it
    returns only what resuming the questionnaire needs. The vault is required
    for cross-device resume; the client's email and phone are NOT — the
    summary flow collects contact details from the client directly, and a
    leaked link must not also hand out how to reach them.
    """
    _resolve_rate_limit(client_ip(request))
    response.headers["Cache-Control"] = "no-store"
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        link = db.resolve_link(token)
        if not link:
            raise HTTPException(404, "Link not found, expired, or revoked")

        db.mark_link_opened(token)

    vault = link.get("vault") or None
    if not vault:
        # Legacy backfill (issue #78): a client mid-way through the old
        # /will/* wizard has answers in the section columns, not the vault.
        # Project them read-only so the unified intake opens populated
        # instead of blank; nothing persists until the client's first save.
        full = get_full_draft(str(link["draft_id"]), DEFAULT_SCHEMA)
        if full and has_legacy_answers(full):
            vault = legacy_draft_to_vault(full)

    return {
        "draft_id": str(link["draft_id"]),
        "client_name": link["client_name"],
        "language": link["language"],
        "status": link["draft_status"],
        "current_step": link["current_step"],
        "completed_steps": link["completed_steps"] or [],
        "vault": vault,
        # Concurrency baseline for autosave (issue #92) — a counter, not PII.
        "revision": link.get("revision", 0),
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
