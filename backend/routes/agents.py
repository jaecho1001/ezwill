from fastapi import APIRouter, Depends, HTTPException
from models import AgentInvokeRequest, AgentInvokeResponse
from routes.auth import AuthContext, verify_agent_or_dashboard_token
from services.db import EWDbWriter
import os
import json
import logging
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

DOCUMENT TYPES:
- "primary_will": The Probate Will (Last Will and Testament - Primary)
- "secondary_will": The Non-Probate Will (Last Will and Testament - Secondary)
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
  "document_types": ["primary_will", "secondary_will", "poa_property", "poa_personal_care"],
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
- If dual will is NOT needed, omit "secondary_will" from document_types.
- Return ONLY valid JSON, no markdown fences or extra text.
"""


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

def _has_business_assets(client_data: dict) -> bool:
    """Check if client has private corp shares or significant business assets."""
    assets = client_data.get("assets", [])
    estate = client_data.get("your_estate", {})

    for asset in assets:
        asset_type = (asset.get("assetType") or asset.get("asset_type") or "").lower()
        description = (asset.get("description") or "").lower()
        if asset_type in ("business", "private_corp", "shares", "corporation"):
            return True
        if any(kw in description for kw in ("private company", "corporation", "shares", "business")):
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

    about = client_data.get("about_you", {})
    if about:
        if about.get("city"):
            parts.append(f"City: {about['city']}")
        if about.get("maritalStatus"):
            parts.append(f"Marital Status: {about['maritalStatus']}")
        if about.get("address"):
            parts.append(f"Address: {about['address']}")

    family = client_data.get("your_family", {})
    if family:
        if family.get("spouseFullName"):
            parts.append(f"Spouse: {family['spouseFullName']}")
        children = family.get("children", [])
        if children:
            child_names = [
                c.get("name", f"{c.get('firstName', '')} {c.get('lastName', '')}").strip()
                for c in children
            ]
            parts.append(f"Children: {', '.join(n for n in child_names if n)}")
            minors = [c for c in children if c.get("isMinor")]
            if minors:
                parts.append(f"Minor children: {len(minors)}")

    estate = client_data.get("your_estate", {})
    if estate:
        if estate.get("survivalDays"):
            parts.append(f"Survival Period: {estate['survivalDays']} days")
        if estate.get("trustDistributionAge"):
            parts.append(f"Trust Distribution Age: {estate['trustDistributionAge']}")

    assets = client_data.get("assets", [])
    if assets:
        parts.append(f"Assets ({len(assets)}):")
        for a in assets:
            desc = a.get("description", a.get("assetType", "Unknown"))
            val = a.get("estimatedValue", "N/A")
            parts.append(f"  - {desc}: ${val}")

    liabilities = client_data.get("liabilities", [])
    if liabilities:
        parts.append(f"Liabilities ({len(liabilities)}):")
        for li in liabilities:
            desc = li.get("description", li.get("type", "Unknown"))
            val = li.get("amount", li.get("estimatedValue", "N/A"))
            parts.append(f"  - {desc}: ${val}")

    people = client_data.get("people", [])
    if people:
        parts.append("Named People:")
        for p in people:
            role = p.get("role", "unknown")
            name = f"{p.get('firstName', p.get('first_name', ''))} {p.get('lastName', p.get('last_name', ''))}".strip()
            parts.append(f"  - {role}: {name}")

    poa_prop = client_data.get("poa_property", {})
    if poa_prop:
        parts.append(f"POA Property preferences: {json.dumps(poa_prop, default=str)}")

    poa_pc = client_data.get("poa_personal_care", {})
    if poa_pc:
        parts.append(f"POA Personal Care preferences: {json.dumps(poa_pc, default=str)}")

    return "\n".join(parts)


async def _call_openai_quick_draft(client_summary: str) -> dict:
    """Call OpenAI chat completions to generate clause selections."""
    if not OPENAI_API_KEY:
        raise HTTPException(503, "OPENAI_API_KEY not configured. Cannot run quick_draft.")

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
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
    content = result["choices"][0]["message"]["content"]
    return json.loads(content)


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

    # Step 1: Determine if dual will is needed (quick local check)
    needs_dual = _has_business_assets(client_data)

    # Step 2: Build client summary for AI
    client_summary = _build_client_summary(client_data)
    if needs_dual:
        client_summary += "\n\nNOTE: Client has business/private corporation assets. Dual will strategy is recommended."
    else:
        client_summary += "\n\nNOTE: Client does not appear to have private corporation assets. Single primary will is likely sufficient."

    # Step 3: Call OpenAI for clause selection and customization
    ai_result = await _call_openai_quick_draft(client_summary)

    # Step 4: Optionally save clause selections to an existing draft
    if draft_id:
        try:
            clause_selections = ai_result.get("clause_selections", {})
            with EWDbWriter(DEFAULT_SCHEMA) as db:
                draft = db.get_draft(draft_id)
                if not draft:
                    raise HTTPException(404, f"Draft {draft_id} not found")

                for doc_type, clauses in clause_selections.items():
                    db.save_clause_selections(draft_id, doc_type, clauses)

                    # Ensure document config is enabled
                    db.save_document_config(draft_id, doc_type, True)

                # If dual will is not needed, disable secondary_will
                if not ai_result.get("needs_dual_will", False):
                    db.save_document_config(draft_id, "secondary_will", False)

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
