from fastapi import APIRouter, Depends, HTTPException
from models import AgentInvokeRequest, AgentInvokeResponse
from routes.auth import AuthContext, verify_agent_or_dashboard_token
from services.db import EWDbWriter
import os
import json
import logging
import time
from uuid import UUID
import httpx

logger = logging.getLogger(__name__)

router = APIRouter()

DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")
BASE_URL = os.getenv("BASE_URL", "http://localhost:3000")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# ── Ontario Dual Will knowledge for AI prompt context ──────────────────────
ONTARIO_DUAL_WILL_CONTEXT = """
You are an Ontario estate planning AI assistant. You help select and customize
will clauses based on client questionnaire data.

ONTARIO DUAL WILL STRATEGY:
- A dual will structure uses TWO separate wills:
  1. Primary Will (Probate Will): Covers assets that require probate (real estate,
     bank accounts, publicly traded securities, registered accounts like RRSPs/TFSAs).
  2. Secondary Will (Non-Probate Will): Covers assets that do NOT require probate
     (private company shares, personal property, household goods, vehicles, jewelry,
     art, loans receivable from private companies).
- The dual will strategy saves Estate Administration Tax (probate fees) in Ontario,
  which is approximately 1.5% of estate value above $50,000.
- A dual will is recommended when the client owns shares in a private corporation
  or has significant personal property / business assets.

DOCUMENT TYPES (use these EXACT keys — the generator only recognizes these):
- "single_will": A single Last Will and Testament (use when a dual will is NOT needed)
- "probate_will": The Probate Will (primary will in a dual-will structure)
- "non_probate_will": The Non-Probate Will (secondary will in a dual-will structure)
- "poa_property": Continuing Power of Attorney for Property
- "poa_personal_care": Power of Attorney for Personal Care

KEY ONTARIO STATUTES:
- Succession Law Reform Act (SLRA), R.S.O. 1990, c. S.26
- Substitute Decisions Act, 1992, S.O. 1992, c. 30
- Estates Administration Act, R.S.O. 1990, c. E.22
- Family Law Act, R.S.O. 1990, c. F.3 (net family property equalization)

CLAUSE SELECTION RULES:
1. Always include revocation clause as the first clause in every will.
2. If married, include family law election clause (FLA s.6 election).
3. If minor children exist, include guardian appointment and trust provisions.
4. If the client has business assets (private corp shares), recommend dual will.
5. Include survival clause (typically 30 days).
6. Include executor appointment with broad powers.
7. If the client receives ODSP, consider Henson Trust provisions.
8. POA for Property should include broad financial management powers.
9. POA for Personal Care should include healthcare directives and end-of-life wishes.
"""

QUICK_DRAFT_SYSTEM_PROMPT = ONTARIO_DUAL_WILL_CONTEXT + """
Given the client data below, return a JSON object with the following structure:
{
  "needs_dual_will": true/false,
  "reasoning": "Brief explanation of why dual will is or isn't needed",
  "document_types": ["single_will", "poa_property", "poa_personal_care"],   // or ["probate_will", "non_probate_will", "poa_property", "poa_personal_care"] if dual
  "clause_selections": {
    "<document_type>": [
      {
        "clause_id": "<clause_id from library>",
        "included": true,
        "custom_text": "<customized clause text with placeholders filled OR null if default>",
        "ai_generated": false,
        "sort_order": <integer>
      }
    ]
  },
  "variables": {
    "<placeholder_name>": "<resolved_value>"
  },
  "warnings": ["any issues or missing info the lawyer should review"]
}

IMPORTANT:
- Use standard Ontario clause IDs (e.g., "revocation", "family_law_election",
  "executor_appointment", "residue_to_spouse", "survival_clause", "guardian",
  "trust_provisions", "poa_property_powers", "poa_personal_care_wishes", etc.)
- Fill in {{placeholder}} variables from client data where possible.
- If dual will is NOT needed, use "single_will" (do not emit probate_will/non_probate_will).
- Return ONLY valid JSON, no markdown fences or extra text.
"""

# The generator only accepts these document-type keys (DOCUMENT_TITLES). Map any
# legacy/dual-will vocabulary the model might still emit onto them, else the
# saved selections are unusable and the will can't be generated.
_DOC_TYPE_ALIASES = {
    "primary_will": "probate_will",
    "secondary_will": "non_probate_will",
    "will": "single_will",
    "last_will": "single_will",
}
_VALID_DOC_TYPES = {
    "simple_will_short", "single_will", "probate_will", "non_probate_will",
    "poa_property", "poa_personal_care",
}


def _normalize_doc_type(doc_type: str, needs_dual: bool) -> str | None:
    dt = _DOC_TYPE_ALIASES.get(doc_type, doc_type)
    # A primary/probate will for a non-dual client is just a single will.
    if dt == "probate_will" and not needs_dual:
        dt = "single_will"
    return dt if dt in _VALID_DOC_TYPES else None


@router.post("/will/invoke", response_model=AgentInvokeResponse)
async def invoke_will_agent(
    body: AgentInvokeRequest,
    _auth: AuthContext = Depends(verify_agent_or_dashboard_token),
):
    capability = body.capability
    payload = body.payload

    if capability == "draft_will":
        return await _capability_draft_will(payload, body.correlation_id)
    elif capability == "get_draft_status":
        return await _capability_get_draft_status(payload, body.correlation_id)
    elif capability == "run_ai_flags":
        return await _capability_run_ai_flags(payload, body.correlation_id)
    elif capability == "quick_draft":
        return await _capability_quick_draft(payload, body.correlation_id)
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


# ── Quick Draft: AI-powered clause selection ─────────────────────────────────

# Asset types / descriptors that indicate a PRIVATE-company or business interest —
# the case where an Ontario dual will can avoid probate on the non-probate estate.
# Publicly-traded shares/stocks are deliberately excluded: they do NOT avoid
# probate on their own, so they're a lawyer-review screening flag, not an
# automatic dual-will conclusion.
_PRIVATE_ASSET_TYPES = {
    "business", "private_corp", "private_company", "sole_proprietorship", "partnership",
}
_PRIVATE_ASSET_KEYWORDS = (
    "private company", "private corp", "closely held", "closely-held",
    "family business", "holdco", "sole propriet", "partnership interest",
)


def _has_business_assets(client_data: dict) -> bool:
    """True only for private-company / business interests (dual-will territory).
    Publicly-traded shares do not qualify — see the constants above."""
    assets = client_data.get("assets") or []
    estate = client_data.get("your_estate") or {}

    for asset in assets:
        asset_type = (asset.get("assetType") or asset.get("asset_type") or "").lower()
        description = (asset.get("description") or "").lower()
        if asset_type in _PRIVATE_ASSET_TYPES:
            return True
        if any(kw in description for kw in _PRIVATE_ASSET_KEYWORDS):
            return True

    if estate.get("hasBusinessAssets") or estate.get("has_business_assets"):
        return True

    return False


def _build_client_summary(client_data: dict) -> str:
    """Build a human-readable summary of client data for the AI prompt."""
    parts = []

    first = client_data.get("firstName", client_data.get("client_first_name", ""))
    last = client_data.get("lastName", client_data.get("client_last_name", ""))
    parts.append(f"Client Name: {first} {last}".strip())

    about = client_data.get("about_you") or {}
    if about:
        if about.get("city"):
            parts.append(f"City: {about['city']}")
        if about.get("maritalStatus"):
            parts.append(f"Marital Status: {about['maritalStatus']}")
        if about.get("address"):
            parts.append(f"Address: {about['address']}")

    family = client_data.get("your_family") or {}
    if family:
        if family.get("spouseFullName"):
            parts.append(f"Spouse: {family['spouseFullName']}")
        children = family.get("children") or []
        if children:
            child_names = [
                c.get("name", f"{c.get('firstName', '')} {c.get('lastName', '')}").strip()
                for c in children
            ]
            parts.append(f"Children: {', '.join(n for n in child_names if n)}")
            minors = [c for c in children if c.get("isMinor")]
            if minors:
                parts.append(f"Minor children: {len(minors)}")

    estate = client_data.get("your_estate") or {}
    if estate:
        if estate.get("survivalDays"):
            parts.append(f"Survival Period: {estate['survivalDays']} days")
        if estate.get("trustDistributionAge"):
            parts.append(f"Trust Distribution Age: {estate['trustDistributionAge']}")

    assets = client_data.get("assets") or []
    if assets:
        parts.append(f"Assets ({len(assets)}):")
        for a in assets:
            desc = a.get("description", a.get("assetType", "Unknown"))
            val = a.get("estimatedValue", "N/A")
            parts.append(f"  - {desc}: ${val}")

    liabilities = client_data.get("liabilities") or []
    if liabilities:
        parts.append(f"Liabilities ({len(liabilities)}):")
        for li in liabilities:
            desc = li.get("description", li.get("type", "Unknown"))
            val = li.get("amount", li.get("estimatedValue", "N/A"))
            parts.append(f"  - {desc}: ${val}")

    people = client_data.get("people") or []
    if people:
        parts.append("Named People:")
        for p in people:
            role = p.get("role", "unknown")
            name = f"{p.get('firstName', p.get('first_name', ''))} {p.get('lastName', p.get('last_name', ''))}".strip()
            parts.append(f"  - {role}: {name}")

    poa_prop = client_data.get("poa_property") or {}
    if poa_prop:
        parts.append(f"POA Property preferences: {json.dumps(poa_prop, default=str)}")

    poa_pc = client_data.get("poa_personal_care") or {}
    if poa_pc:
        parts.append(f"POA Personal Care preferences: {json.dumps(poa_pc, default=str)}")

    return "\n".join(parts)


async def _call_openai_quick_draft(
    client_summary: str,
    *,
    draft_id: str | None = None,
    correlation_id: str | None = None,
) -> dict:
    """Call OpenAI chat completions to generate clause selections."""
    from services.ai_usage import record_ai_usage_event

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(503, "OPENAI_API_KEY not configured. Cannot run quick_draft.")

    started = time.time()
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "gpt-4o",
                "temperature": 0.2,
                "messages": [
                    {"role": "system", "content": QUICK_DRAFT_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Client data:\n\n{client_summary}"},
                ],
                "response_format": {"type": "json_object"},
            },
        )

    if response.status_code != 200:
        logger.error("OpenAI API error: %s %s", response.status_code, response.text)
        raise HTTPException(502, f"OpenAI API error: {response.status_code}")

    result = response.json()
    usage = result.get("usage") or {}
    prompt_tokens = int(usage.get("prompt_tokens") or 0)
    completion_tokens = int(usage.get("completion_tokens") or 0)
    prompt_details = usage.get("prompt_tokens_details") or {}
    cached_tokens = min(
        prompt_tokens,
        max(0, int(prompt_details.get("cached_tokens") or 0)),
    )
    # OpenAI reports cached input as a subset of prompt_tokens. Store only the
    # uncached remainder in input_tokens so cross-provider totals do not double
    # count the cached portion.
    try:
        record_ai_usage_event(
            provider="openai",
            model=result.get("model") or "gpt-4o",
            feature="quick_draft",
            draft_id=draft_id,
            request_count=1,
            input_tokens=max(0, prompt_tokens - cached_tokens),
            output_tokens=completion_tokens,
            cache_read_input_tokens=cached_tokens,
            latency_ms=int((time.time() - started) * 1000),
            correlation_id=correlation_id,
            metadata={"provider_response_id": result.get("id")},
        )
    except Exception:  # noqa: BLE001 - metering cannot discard a valid result
        logger.exception("unexpected OpenAI usage recorder failure")
    content = result["choices"][0]["message"]["content"]
    return json.loads(content)


def _deterministic_quick_draft(client_data: dict, needs_dual: bool) -> dict:
    """Rules-based document recommendation used when no LLM key is configured.

    Decides the highest-value Ontario question — single vs dual will — plus the
    two standard Powers of Attorney, and gives the lawyer a plain-language
    rationale. Individual clause bodies are filled by the Will Editor's per-
    document defaults, so this works without a backend clause library.
    """
    if needs_dual:
        document_types = ["probate_will", "non_probate_will", "poa_property", "poa_personal_care"]
        reasoning = (
            "The client holds private-corporation shares or significant business / "
            "personal-property assets, so an Ontario dual-will structure is "
            "recommended: a Probate Will for assets that require probate and a "
            "Non-Probate Will for the rest, reducing Estate Administration Tax "
            "(~1.5% above $50,000) on the non-probate estate."
        )
    else:
        document_types = ["single_will", "poa_property", "poa_personal_care"]
        reasoning = (
            "No private-corporation or significant business assets were detected, "
            "so a single Last Will and Testament plus a Continuing POA for Property "
            "and a POA for Personal Care is sufficient."
        )
    return {
        "needs_dual_will": needs_dual,
        "reasoning": reasoning,
        "document_types": document_types,
        "clause_selections": {},
        "warnings": [],
        "engine": "rules",
    }


async def _capability_quick_draft(payload: dict, correlation_id: str) -> AgentInvokeResponse:
    """
    AI-powered quick draft: takes client questionnaire data and generates
    complete clause selections for all required document types.

    Uses Ontario dual will knowledge to determine if a secondary will is needed,
    then selects and customizes clauses from the library.

    payload keys:
      - client_data: dict with all questionnaire answers (about_you, your_family,
        your_estate, assets, liabilities, people, poa_property, poa_personal_care)
      - draft_id: (optional) existing draft to save selections to
    """
    client_data = payload.get("client_data", {})
    draft_id = payload.get("draft_id")

    if not client_data:
        raise HTTPException(400, "client_data is required for quick_draft")

    # Reject a stale/typoed target before making a paid provider call. The
    # draft is checked again when saving to handle deletion during the call.
    if draft_id:
        try:
            UUID(str(draft_id))
        except (TypeError, ValueError, AttributeError):
            raise HTTPException(400, "draft_id must be a valid UUID")
        with EWDbWriter(DEFAULT_SCHEMA) as db:
            if not db.get_draft(draft_id):
                raise HTTPException(404, f"Draft {draft_id} not found")

    # Step 1: Determine if dual will is needed (quick local check)
    needs_dual = _has_business_assets(client_data)

    # Step 2: Build client summary for AI
    client_summary = _build_client_summary(client_data)
    if needs_dual:
        client_summary += "\n\nNOTE: Client has business/private corporation assets. Dual will strategy is recommended."
    else:
        client_summary += "\n\nNOTE: Client does not appear to have private corporation assets. Single primary will is likely sufficient."

    # Step 3: Select documents/clauses — LLM when configured, else deterministic
    # rules so the flow works without an API key. (Read at call time so it's
    # runtime-configurable and testable.)
    if os.getenv("OPENAI_API_KEY"):
        ai_result = await _call_openai_quick_draft(
            client_summary,
            draft_id=draft_id,
            correlation_id=correlation_id,
        )
        ai_result.setdefault("engine", "openai")
    else:
        ai_result = _deterministic_quick_draft(client_data, needs_dual)

    # Step 4: Optionally save document config + clause selections to an existing draft
    if draft_id:
        try:
            needs_dual = ai_result.get("needs_dual_will", needs_dual)
            clause_selections = ai_result.get("clause_selections", {})
            document_types = ai_result.get("document_types", [])
            with EWDbWriter(DEFAULT_SCHEMA) as db:
                draft = db.get_draft(draft_id)
                if not draft:
                    raise HTTPException(404, f"Draft {draft_id} not found")

                saved_types: list[str] = []
                # Enable the recommended documents (clause bodies default in the editor).
                for dt in document_types:
                    norm = _normalize_doc_type(dt, needs_dual)
                    if norm and norm not in saved_types:
                        db.save_document_config(draft_id, norm, True)
                        saved_types.append(norm)
                # Save any explicit clause selections the LLM provided.
                for doc_type, clauses in clause_selections.items():
                    norm = _normalize_doc_type(doc_type, needs_dual)
                    if not norm:
                        continue
                    db.save_clause_selections(draft_id, norm, clauses)
                    db.save_document_config(draft_id, norm, True)
                    if norm not in saved_types:
                        saved_types.append(norm)

                # If dual will is not needed, ensure the non-probate will is disabled.
                if not needs_dual:
                    db.save_document_config(draft_id, "non_probate_will", False)

            ai_result["saved_document_types"] = saved_types
            ai_result["draft_id"] = draft_id
            ai_result["saved"] = True
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Failed to save quick_draft selections to draft %s", draft_id)
            ai_result["saved"] = False
            ai_result["save_error"] = str(e)
    else:
        ai_result["saved"] = False

    return AgentInvokeResponse(
        capability="quick_draft",
        result=ai_result,
        correlation_id=correlation_id,
    )
