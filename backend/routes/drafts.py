import time
from collections import deque

from fastapi import APIRouter, HTTPException, Query, Depends, Request
from pydantic import BaseModel
from models import CreateDraftRequest, UpdateDraftRequest
from routes.auth import verify_dashboard_token, verify_dashboard_actor, verify_client_or_dashboard_draft_access
from services.db import EWDbWriter
from services.client_ip import client_ip
import os
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")

# --- Public self-serve draft creation (a client starts their own will online) ---
# Rate-limited per client IP so the unauthenticated endpoint can't be used to
# mass-create drafts.
_self_serve_hits: dict[str, deque] = {}
SELF_SERVE_WINDOW_SECONDS = 3600
SELF_SERVE_MAX_PER_WINDOW = 10


class SelfServeDraftRequest(BaseModel):
    language: str = "en"
    province: str = "ON"


def _self_serve_rate_limit(client: str) -> None:
    now = time.time()
    hits = _self_serve_hits.setdefault(client, deque())
    while hits and now - hits[0] > SELF_SERVE_WINDOW_SECONDS:
        hits.popleft()
    if len(hits) >= SELF_SERVE_MAX_PER_WINDOW:
        raise HTTPException(429, "Too many wills started from this network; please try again later")
    hits.append(now)


@router.post("/self-serve")
async def create_self_serve_draft(body: SelfServeDraftRequest, request: Request):
    """Public: a client starts their own will without a lawyer. Creates an empty
    draft plus a client link token bound to it, so the existing magic-token
    autosave/submit path works. The lawyer sees the draft in the dashboard as it
    fills in."""
    client = client_ip(request)
    _self_serve_rate_limit(client)
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.create_draft(
            client_first_name="",
            client_last_name="",
            language=body.language or "en",
            province=body.province or "ON",
            origin="self_serve",
        )
        if not draft:
            raise HTTPException(500, "Failed to create draft")
        draft_id = str(dict(draft)["id"])
        link = db.create_link(draft_id)
        return {
            "draft_id": draft_id,
            "token": str(dict(link)["token"]),
            "language": dict(draft)["language"],
            "province": dict(draft)["province"],
        }


@router.post("")
async def create_draft(body: CreateDraftRequest, _token: str = Depends(verify_dashboard_token)):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.create_draft(
            client_first_name=body.client_first_name,
            client_last_name=body.client_last_name,
            client_email=body.client_email,
            client_phone=body.client_phone,
            language=body.language,
            province=body.province,
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
        return {"drafts": [dict(d) for d in drafts], "total": db.count_drafts(status)}

@router.get("/overview")
async def pipeline_overview(_token: str = Depends(verify_dashboard_token)):
    """The lawyer's home screen: pipeline counts + the four action queues.

    Declared BEFORE /{draft_id} on purpose — FastAPI matches routes in
    declaration order, and 'overview' must not be captured as a draft id.
    """
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        overview = db.get_pipeline_overview()

    # ISO-8601 timestamps (str() on a datetime is not ISO and WebKit's
    # Date parser rejects it).
    def _clean(queue):
        return {
            "total": queue["total"],
            "rows": [
                {k: (v.isoformat() if hasattr(v, "isoformat") else v)
                 for k, v in row.items()}
                for row in queue["rows"]
            ],
        }
    return {
        "status_counts": overview["status_counts"],
        "awaiting_review": _clean(overview["awaiting_review"]),
        "open_questions": _clean(overview["open_questions"]),
        "awaiting_approval": _clean(overview["awaiting_approval"]),
        "failed_deliveries": _clean(overview["failed_deliveries"]),
    }


@router.get("/{draft_id}")
async def get_draft(draft_id: str, _token: str = Depends(verify_dashboard_token)):
    """The lawyer's working payload (#87): everything the client supplied.

    Assets and AI flags were structurally absent here, which is why the
    dashboard's Overview and flag panel rendered empty for every client.
    Client review comments/approvals are included so the lawyer actually
    sees what the client said about each clause.
    """
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.get_draft(draft_id)
        if not draft:
            raise HTTPException(404, "Draft not found")
        people = db.get_people(draft_id)
        liabilities = db.get_liabilities(draft_id)
        assets = db.fetchall(
            "SELECT * FROM ew_assets WHERE draft_id = %s", (draft_id,)
        )
        ai_flags = db.fetchall(
            "SELECT * FROM ew_ai_flags WHERE draft_id = %s", (draft_id,)
        )
        review_comments = db.get_review_comments(draft_id) or []
        review_approvals = db.get_review_approvals(draft_id) or []
        try:
            delivery_log = db.get_delivery_log(draft_id) or []
        except Exception:
            delivery_log = []  # pre-migration-43 schema
        return {
            **dict(draft),
            "people": [dict(p) for p in people],
            "liabilities": liabilities,
            "assets": [dict(a) for a in assets],
            "ai_flags": [dict(f) for f in ai_flags],
            "review_comments": [dict(c) for c in review_comments],
            "review_approvals": [dict(a) for a in review_approvals],
            "delivery_log": [dict(d) for d in delivery_log],
        }

@router.put("/{draft_id}")
async def update_draft(draft_id: str, body: UpdateDraftRequest, _auth=Depends(verify_client_or_dashboard_draft_access)):
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        draft = db.get_draft(draft_id)
        if not draft:
            raise HTTPException(404, "Draft not found")
        if (
            _auth.kind == "magic_link"
            and dict(draft)["status"] not in ("link_sent", "opened", "in_progress")
        ):
            raise HTTPException(
                409,
                "This questionnaire has already been submitted and can no longer be changed",
            )

        updates = {}

        # Save questionnaire section data to their own JSONB columns.
        # NOTE: tier2_clauses is NOT written here — clause selections go
        # through the dedicated /clauses routes to avoid overwrites.
        if body.about_you is not None:
            updates['about_you'] = json.dumps(body.about_you)
            # Keep the client_first/last_name columns (the document generator's
            # testator-name source) in sync with the questionnaire's legal name,
            # so self-serve drafts generate with the correct name.
            ay = body.about_you or {}
            fn = ay.get('legalFirstName') or ay.get('firstName')
            ln = ay.get('legalLastName') or ay.get('lastName')
            if fn:
                updates['client_first_name'] = fn
            if ln:
                updates['client_last_name'] = ln
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

        # AI-intake vault snapshot + summary-page contact info: the client's
        # own data, so magic-token access may write them (token is draft-bound).
        if body.vault is not None:
            updates['vault'] = json.dumps(body.vault)
        if body.client_email is not None:
            updates['client_email'] = body.client_email
        if body.client_phone is not None:
            updates['client_phone'] = body.client_phone

        if body.current_step is not None:
            updates['current_step'] = body.current_step
        if body.completed_steps is not None:
            updates['completed_steps'] = body.completed_steps
        if body.language is not None:
            updates['language'] = body.language
        # Lawyer-only fields set from the dashboard.
        if _auth.kind == "dashboard" and body.lawyer_notes is not None:
            updates['lawyer_notes'] = body.lawyer_notes
        if _auth.kind == "dashboard" and body.design_decisions is not None:
            updates['design_decisions'] = json.dumps(body.design_decisions)

        # Update status to in_progress if still link_sent/opened
        if dict(draft)['status'] in ('link_sent', 'opened'):
            updates['status'] = 'in_progress'

        updated = db.update_draft(draft_id, updates,
                                  expected_revision=body.revision)
        if updated is None:
            # Someone else (another device, or the lawyer) wrote since this
            # writer last read. Refuse the overwrite and hand back the fresh
            # state so the client can re-hydrate (issue #92).
            fresh = db.get_draft(draft_id)
            raise HTTPException(409, {
                "error": "draft_conflict",
                "message": (
                    "These answers were updated somewhere else since this "
                    "device last loaded them. Reload to continue from the "
                    "latest version."
                ),
                "revision": (fresh or {}).get("revision"),
            })

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


# ── Lawyer ↔ client follow-up questions (#98) ────────────────────────────────

class AskQuestionRequest(BaseModel):
    question_text: str
    required: bool = False
    document_type: str | None = None
    clause_id: str | None = None
    section: str | None = None


class AnswerQuestionRequest(BaseModel):
    answer_text: str


class ResolveQuestionRequest(BaseModel):
    resolution_note: str | None = None


@router.post("/{draft_id}/questions")
async def ask_client_question(
    draft_id: str,
    body: AskQuestionRequest,
    actor: dict = Depends(verify_dashboard_actor),
):
    """Lawyer sends the client a follow-up question. Required questions
    block lawyer approval of the targeted document (or every document
    when unscoped) until resolved."""
    text = body.question_text.strip()
    if not text:
        raise HTTPException(400, "Question text is required")
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        if not db.get_draft(draft_id):
            raise HTTPException(404, "Draft not found")
        question = db.create_client_question(
            draft_id, text, required=body.required,
            document_type=body.document_type, clause_id=body.clause_id,
            section=body.section, asked_by=actor.get("name") or "dashboard",
        )

    # Best-effort notification: the client answers via their existing
    # questionnaire link, so the message simply points them back at it.
    try:
        from services.notification_service import notify_client_question
        await notify_client_question(draft_id, text)
    except Exception:
        logger.exception("client-question notification failed (non-fatal)")

    return dict(question)


@router.get("/{draft_id}/questions")
async def list_client_questions(
    draft_id: str,
    _auth=Depends(verify_client_or_dashboard_draft_access),
):
    """Both sides read the same list: the client via their draft-bound
    magic token, the lawyer via the dashboard session."""
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        questions = db.get_client_questions(draft_id)
    return {"questions": [dict(question) for question in questions]}


@router.post("/{draft_id}/questions/{question_id}/answer")
async def answer_client_question(
    draft_id: str,
    question_id: str,
    body: AnswerQuestionRequest,
    _auth=Depends(verify_client_or_dashboard_draft_access),
):
    text = body.answer_text.strip()
    if not text:
        raise HTTPException(400, "Answer text is required")
    import uuid as _uuid
    try:
        _uuid.UUID(question_id)
    except ValueError:
        raise HTTPException(404, "Question not found")
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        row = db.answer_client_question(draft_id, question_id, text)
    if row is None:
        raise HTTPException(404, "Question not found or already resolved")
    return dict(row)


@router.post("/{draft_id}/questions/{question_id}/resolve")
async def resolve_client_question(
    draft_id: str,
    question_id: str,
    body: ResolveQuestionRequest,
    _token: str = Depends(verify_dashboard_token),
):
    import uuid as _uuid
    try:
        _uuid.UUID(question_id)
    except ValueError:
        raise HTTPException(404, "Question not found")
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        row = db.resolve_client_question(
            draft_id, question_id, body.resolution_note
        )
    if row is None:
        raise HTTPException(404, "Question not found")
    return dict(row)
