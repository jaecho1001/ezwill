"""
Document generation routes for EZWill.
Generates DOCX/PDF documents from clause selections.
"""

import io
import os
import zipfile
import logging
from datetime import date

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse

from models import GenerateDocumentRequest
from services.db import EWDbWriter
from services.draft_service import get_full_draft
from services.document_generator import (
    DocumentGenerator,
    DOCUMENT_TITLES,
    resolve_variables,
    map_people_to_variables,
)
from services.pdf_converter import convert_to_pdf
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
    variables["province"] = draft.get("province", "Ontario")

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

    return variables


def _get_enabled_document_types(draft_id: str, schema: str) -> list[str]:
    """Get list of enabled document types for a draft."""
    with EWDbWriter(schema) as db:
        configs = db.get_document_configs(draft_id)
        if configs:
            return [c["document_type"] for c in configs if c.get("enabled", True)]
    # Default: all types
    return list(DOCUMENT_TITLES.keys())


def _clause_to_html(clause: dict, variables: dict) -> str:
    """Convert a clause to HTML for preview."""
    text = (
        clause.get("custom_text")
        or clause.get("customText")
        or clause.get("template_text")
        or clause.get("templateText")
        or ""
    )
    return resolve_variables(text, variables)


# ── Routes ──────────────────────────────────────────────────────────────────

@router.post("/{draft_id}/generate")
async def generate_document(draft_id: str, body: GenerateDocumentRequest, _token: str = Depends(verify_dashboard_token)):
    """
    Generate a single document for a draft.
    Returns the generated file as a download (DOCX or PDF).
    """
    draft = get_full_draft(draft_id, DEFAULT_SCHEMA)
    if not draft:
        raise HTTPException(404, "Draft not found")

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

    try:
        docx_bytes = _generator.generate_document(
            document_type=document_type,
            clauses=clauses,
            variables=variables,
        )
    except Exception:
        logger.exception("Document generation failed for %s", document_type)
        raise HTTPException(500, "Document generation failed")

    # Record generation
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        db.update_document_generated(draft_id, document_type, f"memory://{document_type}")

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
    else:
        filename = f"{document_type}.docx"
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        content = docx_bytes

    return StreamingResponse(
        io.BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{draft_id}/generate-all")
async def generate_all_documents(draft_id: str, _token: str = Depends(verify_dashboard_token)):
    """
    Generate all enabled documents for a draft.
    Returns a ZIP file containing all DOCX files.
    """
    draft = get_full_draft(draft_id, DEFAULT_SCHEMA)
    if not draft:
        raise HTTPException(404, "Draft not found")

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
    results = _generator.generate_all_documents(
        draft_data=draft,
        clause_selections=filtered_selections,
        variables=variables,
    )

    if not results:
        raise HTTPException(500, "No documents could be generated")

    # Record generation for each
    with EWDbWriter(DEFAULT_SCHEMA) as db:
        for doc_type in results:
            db.update_document_generated(draft_id, doc_type, f"memory://{doc_type}")

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

    return {
        "document_type": document_type,
        "title": title,
        "html": "\n".join(html_parts),
        "clause_count": clause_number,
        "variables_used": list(variables.keys()),
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
        })

    return {"draft_id": draft_id, "documents": documents}
