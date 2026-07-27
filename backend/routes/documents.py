"""
Document generation routes for EZWill.
Generates DOCX/PDF documents from clause selections.
"""

import io
import os
import uuid
import zipfile
import logging
from datetime import date

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse

from models import GenerateDocumentRequest
from services.db import EWDbWriter
from services.draft_service import get_full_draft
from services.jurisdictions import resolve as resolve_jurisdiction
from services.document_generator import (
    DocumentGenerator,
    DOCUMENT_TITLES,
    resolve_variables,
    map_people_to_variables,
    vault_to_variables,
    firm_variables,
)
from services.instruction_guard import (
    RESIDUE_INSTRUCTION_GAP,
    END_OF_LIFE_INSTRUCTION_GAP,
    ORGAN_DONATION_INSTRUCTION_GAP,
    semantic_instruction_gaps,
    instruction_gap_message,
)
from services.pdf_converter import convert_to_pdf
from services.payment_gate import payment_required
from routes.auth import verify_dashboard_token

logger = logging.getLogger(__name__)

router = APIRouter()

DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")

_generator = DocumentGenerator()

# ── Helpers ─────────────────────────────────────────────────────────────────

def _build_variables(draft: dict) -> dict:
    """
    Build the variables dict from a full draft record.
    Merges client info, people data, and questionnaire answers into a flat
    dict of placeholder values.
    """
    variables: dict = {}

    # Client basics
    first = draft.get("client_first_name", "")
    last = draft.get("client_last_name", "")
    variables["testatorFullName"] = f"{first} {last}".strip() or "[Client Name]"
    variables["clientFullName"] = variables["testatorFullName"]
    variables["testatorFirstName"] = first
    variables["testatorLastName"] = last
    variables["documentDate"] = date.today().strftime("%B %d, %Y")
    variables["province"] = resolve_jurisdiction(draft.get("province")).name

    # About You section
    about = draft.get("about_you") or {}
    variables["city"] = about.get("city", "")
    variables["cityName"] = about.get("city", "")
    variables["address"] = about.get("address", "")
    variables["pronoun"] = about.get("pronoun", "his/her")
    variables["maritalStatus"] = about.get("maritalStatus", "")

    # Family section
    family = draft.get("your_family") or {}
    variables["spouseFullName"] = family.get("spouseFullName", "")
    variables["spouseFirstName"] = family.get("spouseFirstName", "")
    variables["spouseLastName"] = family.get("spouseLastName", "")
    if family.get("children"):
        child_names = [
            c.get("name", f"{c.get('firstName', '')} {c.get('lastName', '')}").strip()
            for c in family["children"]
        ]
        variables["childNames"] = ", ".join(n for n in child_names if n)

    # Estate section
    estate = draft.get("your_estate") or {}
    variables["survivalDays"] = str(estate.get("survivalDays", 30))
    variables["trustDistributionAge"] = str(estate.get("trustDistributionAge", 21))

    # People -> executors, attorneys, guardians (shared role->variable mapping)
    variables.update(map_people_to_variables(draft.get("people", [])))

    # POA sections
    poa_prop = draft.get("poa_property") or {}
    variables.update({
        k: v for k, v in poa_prop.items()
        if isinstance(v, (str, int, float, bool))
    })

    poa_pc = draft.get("poa_personal_care") or {}
    variables.update({
        k: v for k, v in poa_pc.items()
        if isinstance(v, (str, int, float, bool))
    })

    # Overlay conversational AI-intake vault data (canonical when present).
    for k, val in vault_to_variables(draft.get("vault") or {}).items():
        if val:
            variables[k] = val

    # Firm identity from saved settings (cover page falls back to defaults).
    try:
        with EWDbWriter(DEFAULT_SCHEMA) as db:
            variables.update(firm_variables(db.get_firm_settings()))
    except Exception:
        logger.exception("failed to load firm settings for document variables")

    return variables


def _get_enabled_document_types(draft_id: str, schema: str) -> list[str]:
    """Get list of enabled document types for a draft."""
    with EWDbWriter(schema) as db:
        configs = db.get_document_configs(draft_id)
        if configs:
            return [c["document_type"] for c in configs if c.get("enabled", True)]
    # Default: all types
    return list(DOCUMENT_TITLES.keys())


def _clause_to_html(clause: dict, variables: dict, missing: set = None) -> str:
    """Convert a clause to HTML for preview."""
    text = (
        clause.get("custom_text")
        or clause.get("customText")
        or clause.get("template_text")
        or clause.get("templateText")
        or ""
    )
    return resolve_variables(text, variables, missing)


# ── Routes ──────────────────────────────────────────────────────────────────

def _enforce_payment_gate(draft: dict, draft_id: str, override_payment: bool) -> None:
    """402 unless the draft is paid, exempt, or the lawyer explicitly overrides."""
    if not payment_required(draft):
        return
    if override_payment:
        logger.warning(
            "Payment gate overridden for draft %s (status=%s)",
            draft_id, draft.get("payment_status", "unpaid"),
        )
        return
    raise HTTPException(402, {
        "error": "payment_required",
        "message": (
            "This self-serve draft has not been paid for. The client must "
            "complete checkout before documents are delivered, or re-run "
            "with override_payment=true if the fee was handled outside "
            "the app."
        ),
        "payment_status": draft.get("payment_status", "unpaid"),
    })


@router.post("/{draft_id}/generate")
async def generate_document(
    draft_id: str,
    body: GenerateDocumentRequest,
    override_payment: bool = False,
    _token: str = Depends(verify_dashboard_token),
):
    """
    Generate a single document for a draft.
    Returns the generated file as a download (DOCX or PDF).
    """
    draft = get_full_draft(draft_id, DEFAULT_SCHEMA)
    if not draft:
        raise HTTPException(404, "Draft not found")

    _enforce_payment_gate(draft, draft_id, override_payment)

    document_type = body.document_type
    if document_type not in DOCUMENT_TITLES:
        raise HTTPException(
            400,
            f"Invalid document_type. Must be one of: {', '.join(DOCUMENT_TITLES.keys())}",
        )

    # Load clause selections
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        clauses = db.get_clause_selections(draft_id, document_type)
        clauses = [dict(c) for c in clauses] if clauses else []

    if not clauses:
        raise HTTPException(
            404,
            f"No clause selections found for {document_type}. "
            "Save clause selections before generating.",
        )

    variables = _build_variables(draft)

    missing: set = set()
    try:
        docx_bytes = _generator.generate_document(
            document_type=document_type,
            clauses=clauses,
            variables=variables,
            missing=missing,
        )
    except Exception:
        logger.exception("Document generation failed for %s", document_type)
        raise HTTPException(500, "Document generation failed")

    instruction_gaps = semantic_instruction_gaps(draft, document_type, clauses)
    missing.update(instruction_gaps)

    # Refuse to deliver a legal document containing literal [placeholder]
    # text — silent corruption in a signed will is the worst failure mode.
    if missing and not body.allow_incomplete:
        raise HTTPException(422, {
            "error": "unresolved_placeholders",
            "message": (
                instruction_gap_message(instruction_gaps)
                if instruction_gaps
                else (
                    "Document was not delivered: it still contains unresolved "
                    "placeholders. Complete the missing client data, or re-run "
                    "with allow_incomplete=true to override deliberately."
                )
            ),
            "document_type": document_type,
            "unresolved": sorted(missing),
            "instruction_gaps": sorted(instruction_gaps),
        })
    if missing:
        logger.warning(
            "Delivering %s for draft %s with unresolved placeholders (override): %s",
            document_type, draft_id, sorted(missing),
        )

    # PDF conversion if requested
    if body.format == "pdf":
        pdf_bytes = convert_to_pdf(docx_bytes)
        if pdf_bytes is None:
            raise HTTPException(
                503,
                "PDF conversion unavailable. LibreOffice is not installed. "
                "Returning DOCX instead is possible via format=docx.",
            )
        filename = f"{document_type}.pdf"
        media_type = "application/pdf"
        content = pdf_bytes
        file_format = "pdf"
    else:
        filename = f"{document_type}.docx"
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        content = docx_bytes
        file_format = "docx"

    # Persist the exact delivered bytes (audit trail), then point the
    # document config at the stored row instead of a throwaway marker.
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        record = db.record_document_generation(
            draft_id, document_type, file_format, content,
            generated_by="dashboard",
            params={
                "unresolved": sorted(missing),
                "instruction_gaps": sorted(instruction_gaps),
                "allow_incomplete": body.allow_incomplete,
            },
        )
        db.update_document_generated(draft_id, document_type, record["storage_path"])

    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{draft_id}/generate-all")
async def generate_all_documents(
    draft_id: str,
    allow_incomplete: bool = False,
    override_payment: bool = False,
    _token: str = Depends(verify_dashboard_token),
):
    """
    Generate all enabled documents for a draft.
    Returns a ZIP file containing all DOCX files.

    Rejects the whole batch with 422 if any document still contains
    unresolved [placeholder] text, unless allow_incomplete=true.
    Rejects with 402 if the draft is self-serve and unpaid, unless
    override_payment=true.
    """
    draft = get_full_draft(draft_id, DEFAULT_SCHEMA)
    if not draft:
        raise HTTPException(404, "Draft not found")

    _enforce_payment_gate(draft, draft_id, override_payment)

    variables = _build_variables(draft)

    # Get all clause selections
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        all_selections = db.get_all_clause_selections(draft_id)

    if not all_selections:
        raise HTTPException(
            404,
            "No clause selections found for any document type. "
            "Save clause selections before generating.",
        )

    # Filter to enabled document types
    enabled_types = _get_enabled_document_types(draft_id, DEFAULT_SCHEMA)
    filtered_selections = {
        dt: clauses
        for dt, clauses in all_selections.items()
        if dt in enabled_types
    }

    if not filtered_selections:
        raise HTTPException(404, "No enabled documents with clause selections found")

    # Generate all documents
    missing_by_doc: dict = {}
    results = _generator.generate_all_documents(
        draft_data=draft,
        clause_selections=filtered_selections,
        variables=variables,
        missing_by_doc=missing_by_doc,
    )

    instruction_gaps_by_doc: dict[str, set[str]] = {}
    for doc_type, clauses in filtered_selections.items():
        gaps = semantic_instruction_gaps(draft, doc_type, clauses)
        if gaps:
            instruction_gaps_by_doc[doc_type] = gaps
            missing_by_doc.setdefault(doc_type, set()).update(gaps)

    if not results:
        raise HTTPException(500, "No documents could be generated")

    # Refuse the whole batch if any document has unresolved placeholders:
    # a ZIP with one corrupted will is not a safe deliverable.
    if missing_by_doc and not allow_incomplete:
        raise HTTPException(422, {
            "error": "unresolved_placeholders",
            "message": (
                "Documents were not delivered: at least one selected clause "
                "does not match the client's recorded instructions."
                if instruction_gaps_by_doc
                else (
                    "Documents were not delivered: some still contain unresolved "
                    "placeholders. Complete the missing client data, or re-run "
                    "with allow_incomplete=true to override deliberately."
                )
            ),
            "unresolved_by_document": {
                dt: sorted(names) for dt, names in missing_by_doc.items()
            },
            "instruction_gaps_by_document": {
                dt: sorted(names) for dt, names in instruction_gaps_by_doc.items()
            },
        })
    if missing_by_doc:
        logger.warning(
            "Delivering documents for draft %s with unresolved placeholders (override): %s",
            draft_id, {dt: sorted(n) for dt, n in missing_by_doc.items()},
        )

    # Persist the exact delivered bytes of every document (audit trail).
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        for doc_type, docx_bytes in results.items():
            record = db.record_document_generation(
                draft_id, doc_type, "docx", docx_bytes,
                generated_by="dashboard",
                params={
                    "unresolved": sorted(missing_by_doc.get(doc_type, set())),
                    "instruction_gaps": sorted(
                        instruction_gaps_by_doc.get(doc_type, set())
                    ),
                    "allow_incomplete": allow_incomplete,
                    "batch": True,
                },
            )
            db.update_document_generated(draft_id, doc_type, record["storage_path"])

    # Build ZIP
    zip_buf = io.BytesIO()
    client_name = variables.get("testatorFullName", "Client").replace(" ", "_")

    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for doc_type, docx_bytes in results.items():
            title = DOCUMENT_TITLES.get(doc_type, doc_type)
            safe_title = title.replace(" ", "_").replace("(", "").replace(")", "")
            filename = f"{client_name}_{safe_title}.docx"
            zf.writestr(filename, docx_bytes)

    zip_buf.seek(0)
    zip_filename = f"{client_name}_Estate_Documents.zip"

    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_filename}"'},
    )


@router.get("/{draft_id}/preview/{document_type}")
async def preview_document(
    draft_id: str,
    document_type: str,
    _token: str = Depends(verify_dashboard_token),
):
    """
    Get HTML preview of a document.
    Returns clause text as rendered HTML for the preview panel in frontend.

    Dashboard-only: this returns the fully-rendered will/POA (testator name,
    beneficiaries, executors, addresses, resolved clause bodies), so it must not
    be reachable without lawyer auth. Clients use the review portal's own
    token-bound preview route instead.
    """
    draft = get_full_draft(draft_id, DEFAULT_SCHEMA)
    if not draft:
        raise HTTPException(404, "Draft not found")

    if document_type not in DOCUMENT_TITLES:
        raise HTTPException(400, f"Invalid document_type: {document_type}")

    with EWDbWriter(DEFAULT_SCHEMA) as db:
        clauses = db.get_clause_selections(draft_id, document_type)
        clauses = [dict(c) for c in clauses] if clauses else []

    variables = _build_variables(draft)

    # Build HTML preview
    title = DOCUMENT_TITLES.get(document_type, document_type)
    html_parts = [
        f"<h1 style='text-align:center'>{DOCUMENT_TITLES.get(document_type, document_type)}</h1>",
        f"<p style='text-align:center'><strong>{variables.get('testatorFullName', '')}</strong></p>",
        f"<p style='text-align:center'>{variables.get('documentDate', '')}</p>",
        "<hr/>",
    ]

    included = [c for c in clauses if c.get("included", True)]
    included.sort(key=lambda c: c.get("sort_order", c.get("sortOrder", 0)))

    clause_number = 0
    for clause in included:
        is_folder = clause.get("is_folder", clause.get("isFolder", False))
        text = _clause_to_html(clause, variables)

        if is_folder:
            clause_title = clause.get("title", clause.get("clause_id", ""))
            clause_title = resolve_variables(clause_title, variables)
            html_parts.append(
                f"<h2 style='margin-top:1.5em'>{clause_title.upper()}</h2>"
            )
        else:
            clause_number += 1
            clause_title = clause.get("title", "")
            if clause_title:
                clause_title = resolve_variables(clause_title, variables)
                html_parts.append(
                    f"<p style='margin-top:1em'>"
                    f"<strong>{clause_number}. {clause_title}</strong></p>"
                )
            html_parts.append(
                f"<p style='margin-left:2em'>"
                f"{text if clause_title else f'<strong>{clause_number}.</strong> {text}'}"
                f"</p>"
            )

    # Compute the warning list with a real (discarded) generation pass so the
    # preview agrees with what POST /generate will actually refuse: folders
    # contribute only their titles, and the cover/signing-page bracket
    # literals — which this HTML preview never renders — are included.
    missing: set = set()
    try:
        _generator.generate_document(
            document_type=document_type,
            clauses=clauses,
            variables=variables,
            missing=missing,
        )
    except Exception:
        logger.exception("Preview parity pass failed for %s", document_type)
    missing.update(semantic_instruction_gaps(draft, document_type, clauses))

    return {
        "document_type": document_type,
        "title": title,
        "html": "\n".join(html_parts),
        "clause_count": clause_number,
        "variables_used": list(variables.keys()),
        # Informational: preview never blocks, but the dashboard can warn the
        # lawyer that generation will be refused until these are filled.
        "unresolved_placeholders": sorted(missing),
    }


@router.get("/{draft_id}/list")
async def list_documents(draft_id: str, _token: str = Depends(verify_dashboard_token)):
    """
    List available documents for a draft with generation status.
    """
    draft = get_full_draft(draft_id, DEFAULT_SCHEMA)
    if not draft:
        raise HTTPException(404, "Draft not found")

    with EWDbWriter(DEFAULT_SCHEMA) as db:
        configs = db.get_document_configs(draft_id)
        all_selections = db.get_all_clause_selections(draft_id)

    configs_map = {c["document_type"]: dict(c) for c in configs} if configs else {}

    documents = []
    for doc_type, title in DOCUMENT_TITLES.items():
        config = configs_map.get(doc_type, {})
        clause_count = len(all_selections.get(doc_type, []))
        documents.append({
            "document_type": doc_type,
            "title": title,
            "enabled": config.get("enabled", True),
            "clause_count": clause_count,
            "generated_at": config.get("generated_at"),
            "generated_file_path": config.get("generated_file_path"),
            "lawyer_approved_at": config.get("lawyer_approved_at"),
            "lawyer_approved_by": config.get("lawyer_approved_by"),
        })

    return {"draft_id": draft_id, "documents": documents}


@router.post("/{draft_id}/{document_type}/approve")
async def approve_document(
    draft_id: str,
    document_type: str,
    _token: str = Depends(verify_dashboard_token),
):
    """Record the lawyer's explicit approval of a generated document (#86).

    Approval is what makes a document eligible for client review: the review
    portal refuses to create links for, list, display, or accept approval of
    documents the lawyer has not signed off. Re-generating a document clears
    its approval automatically.
    """
    if document_type not in DOCUMENT_TITLES:
        raise HTTPException(400, "Invalid document_type")
    draft = get_full_draft(draft_id, DEFAULT_SCHEMA)
    if not draft:
        raise HTTPException(404, "Draft not found")

    with EWDbWriter(DEFAULT_SCHEMA) as db:
        # Approval must be of the ACTUAL current text: run the same guards
        # delivery runs, so a lawyer cannot approve a document that the
        # system itself refuses to deliver.
        clauses = [dict(c) for c in db.get_clause_selections(draft_id, document_type) or []]
        if not clauses:
            raise HTTPException(409, "Nothing to approve: no clause selections saved")
        gaps = semantic_instruction_gaps(draft, document_type, clauses)
        if gaps:
            raise HTTPException(422, {
                "error": "approval_blocked",
                "message": instruction_gap_message(gaps),
                "instruction_gaps": sorted(gaps),
            })
        # NOTE: lawyer_approved_by is the shared dashboard identity until
        # per-lawyer accounts (#52) land; the column is ready for real names.
        row = db.set_lawyer_approval(draft_id, document_type, "dashboard")
        if row is None:
            raise HTTPException(409, "Generate the document before approving it")

    return {
        "approved": True,
        "document_type": document_type,
        "approved_at": str(row["lawyer_approved_at"]),
        "approved_by": row["lawyer_approved_by"],
    }


@router.delete("/{draft_id}/{document_type}/approve")
async def revoke_document_approval(
    draft_id: str,
    document_type: str,
    _token: str = Depends(verify_dashboard_token),
):
    """Withdraw a recorded approval (e.g. instructions changed)."""
    if document_type not in DOCUMENT_TITLES:
        raise HTTPException(400, "Invalid document_type")
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        db.revoke_lawyer_approval(draft_id, document_type)
    return {"approved": False, "document_type": document_type}


@router.get("/{draft_id}/generations")
async def list_generations(draft_id: str, _token: str = Depends(verify_dashboard_token)):
    """
    Audit trail: every document ever generated for this draft, with checksum
    and size — metadata only, the bytes stay in the database.
    """
    draft = get_full_draft(draft_id, DEFAULT_SCHEMA)
    if not draft:
        raise HTTPException(404, "Draft not found")

    with EWDbWriter(DEFAULT_SCHEMA) as db:
        rows = db.get_document_generations(draft_id)

    return {
        "draft_id": draft_id,
        "generations": [
            {
                "id": str(r["id"]),
                "document_type": r["document_type"],
                "format": r["format"],
                "content_sha256": r["content_sha256"],
                "byte_size": r["byte_size"],
                "generation_params": r["generation_params"],
                "generated_by": r["generated_by"],
                "created_at": str(r["created_at"]),
            }
            for r in (rows or [])
        ],
    }


@router.get("/{draft_id}/generations/{generation_id}/download")
async def download_generation(
    draft_id: str,
    generation_id: str,
    _token: str = Depends(verify_dashboard_token),
):
    """Re-download the exact bytes of a previously generated document."""
    # Validate before querying: a non-UUID string would make Postgres raise
    # on the uuid cast and surface as a 500 instead of this route's 404.
    try:
        uuid.UUID(generation_id)
    except ValueError:
        raise HTTPException(404, "Generated document not found")

    with EWDbWriter(DEFAULT_SCHEMA) as db:
        row = db.get_document_generation_content(generation_id)

    # Bind the generation to the draft in the path so one draft's audit
    # trail can never be fetched through another draft's URL.
    if not row or str(row["draft_id"]) != str(draft_id):
        raise HTTPException(404, "Generated document not found")

    if row.get("content") is None:
        raise HTTPException(404, "This generation predates stored content")

    content = bytes(row["content"])
    if row["format"] == "pdf":
        media_type = "application/pdf"
        ext = "pdf"
    else:
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ext = "docx"
    filename = f"{row['document_type']}_{str(row['id'])[:8]}.{ext}"

    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
