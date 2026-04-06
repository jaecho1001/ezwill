"""
Excel-compatible CSV export routes for EZWill.
Exports client assets, liabilities, and estate summaries.
"""

import io
import csv
import os
import logging
from decimal import Decimal

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from services.db import EWDbWriter
from services.draft_service import get_full_draft

logger = logging.getLogger(__name__)

router = APIRouter(tags=["export"])

DEFAULT_SCHEMA = os.getenv("DEFAULT_SCHEMA", "firm_demo")


def _decimal_or_zero(value) -> Decimal:
    """Safely convert a value to Decimal, defaulting to 0."""
    if value is None:
        return Decimal("0")
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0")


def _csv_response(rows: list[list[str]], headers: list[str], filename: str) -> StreamingResponse:
    """Build a StreamingResponse with CSV content and BOM for Excel compatibility."""
    buf = io.StringIO()
    # Write UTF-8 BOM so Excel auto-detects encoding
    buf.write('\ufeff')
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerows(rows)
    buf.seek(0)
    content = buf.getvalue().encode("utf-8")

    return StreamingResponse(
        io.BytesIO(content),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


def _classify_probate(asset: dict) -> str:
    """Classify an asset for probate vs non-probate (Ontario dual will)."""
    asset_type = (asset.get("asset_type") or asset.get("assetType") or "").lower()
    description = (asset.get("description") or "").lower()

    # Non-probate assets: private corp shares, personal property, vehicles, jewelry
    non_probate_types = ("business", "private_corp", "vehicle", "jewelry", "art",
                         "household", "personal_property", "collectibles")
    non_probate_keywords = ("private company", "corporation shares", "vehicle",
                            "jewelry", "art", "furniture", "household")

    if asset_type in non_probate_types:
        return "Non-Probate (Secondary Will)"
    if any(kw in description for kw in non_probate_keywords):
        return "Non-Probate (Secondary Will)"

    # Probate assets: real estate, bank accounts, registered accounts, public securities
    probate_types = ("real_estate", "bank_account", "rrsp", "tfsa", "resp",
                     "investment", "pension", "life_insurance")
    if asset_type in probate_types:
        return "Probate (Primary Will)"

    # Check for beneficiary designation — these bypass probate
    if asset.get("beneficiary_designation") or asset.get("beneficiaryDesignation"):
        return "Beneficiary Designation (Bypasses Probate)"

    return "Probate (Primary Will)"


def _get_ownership(asset: dict) -> str:
    """Determine ownership type from asset data."""
    joint_owner = asset.get("joint_owner_name") or asset.get("jointOwnerName")
    if joint_owner:
        return "Joint"
    return "Sole"


@router.get("/{draft_id}/assets")
async def export_assets_csv(draft_id: str):
    """Export client assets as CSV (Excel-compatible)."""
    draft = get_full_draft(draft_id, DEFAULT_SCHEMA)
    if not draft:
        raise HTTPException(404, "Draft not found")

    assets = draft.get("assets", [])
    client_name = f"{draft.get('client_first_name', '')} {draft.get('client_last_name', '')}".strip()

    headers = [
        "Type", "Description", "Estimated Value", "Ownership",
        "Joint Owner", "Beneficiary Designation", "Probate Classification",
        "Institution", "Notes",
    ]

    rows = []
    for a in assets:
        asset_type = a.get("asset_type") or a.get("assetType") or ""
        description = a.get("description") or ""
        value = a.get("estimated_value") or a.get("estimatedValue") or ""
        ownership = _get_ownership(a)
        joint_owner = a.get("joint_owner_name") or a.get("jointOwnerName") or ""
        beneficiary = "Yes" if (a.get("beneficiary_designation") or a.get("beneficiaryDesignation")) else "No"
        probate_class = _classify_probate(a)
        institution = a.get("institution") or ""
        address = a.get("address") or ""
        notes = address if address else ""

        rows.append([
            asset_type, description, str(value), ownership,
            joint_owner, beneficiary, probate_class,
            institution, notes,
        ])

    safe_name = client_name.replace(" ", "_") or "Client"
    return _csv_response(rows, headers, f"{safe_name}_Assets.csv")


@router.get("/{draft_id}/liabilities")
async def export_liabilities_csv(draft_id: str):
    """Export client liabilities as CSV (Excel-compatible)."""
    draft = get_full_draft(draft_id, DEFAULT_SCHEMA)
    if not draft:
        raise HTTPException(404, "Draft not found")

    liabilities = draft.get("liabilities") or []
    # Liabilities may be stored in the draft JSONB column
    if not liabilities:
        with EWDbWriter(DEFAULT_SCHEMA) as db:
            liabilities = db.get_liabilities(draft_id)

    client_name = f"{draft.get('client_first_name', '')} {draft.get('client_last_name', '')}".strip()

    headers = [
        "Type", "Description", "Amount", "Creditor",
        "Secured", "Monthly Payment", "Notes",
    ]

    rows = []
    for li in liabilities:
        li_type = li.get("type") or li.get("liabilityType") or ""
        description = li.get("description") or ""
        amount = li.get("amount") or li.get("estimatedValue") or ""
        creditor = li.get("creditor") or li.get("institution") or ""
        secured = "Yes" if li.get("secured") else "No"
        monthly = li.get("monthlyPayment") or li.get("monthly_payment") or ""
        notes = li.get("notes") or ""

        rows.append([
            li_type, description, str(amount), creditor,
            secured, str(monthly), notes,
        ])

    safe_name = client_name.replace(" ", "_") or "Client"
    return _csv_response(rows, headers, f"{safe_name}_Liabilities.csv")


@router.get("/{draft_id}/estate-summary")
async def export_estate_summary_csv(draft_id: str):
    """Export complete estate summary (assets + liabilities + net worth) as CSV."""
    draft = get_full_draft(draft_id, DEFAULT_SCHEMA)
    if not draft:
        raise HTTPException(404, "Draft not found")

    assets = draft.get("assets", [])
    liabilities = draft.get("liabilities") or []
    if not liabilities:
        with EWDbWriter(DEFAULT_SCHEMA) as db:
            liabilities = db.get_liabilities(draft_id)

    client_name = f"{draft.get('client_first_name', '')} {draft.get('client_last_name', '')}".strip()

    headers = [
        "Category", "Type", "Description", "Value",
        "Ownership", "Probate Classification", "Notes",
    ]

    rows = []

    # Assets section
    total_assets = Decimal("0")
    probate_total = Decimal("0")
    non_probate_total = Decimal("0")

    for a in assets:
        asset_type = a.get("asset_type") or a.get("assetType") or ""
        description = a.get("description") or ""
        value = _decimal_or_zero(a.get("estimated_value") or a.get("estimatedValue"))
        ownership = _get_ownership(a)
        probate_class = _classify_probate(a)
        institution = a.get("institution") or ""

        total_assets += value
        if "Non-Probate" in probate_class:
            non_probate_total += value
        elif "Beneficiary" in probate_class:
            pass  # Bypasses estate entirely
        else:
            probate_total += value

        rows.append([
            "ASSET", asset_type, description, str(value),
            ownership, probate_class, institution,
        ])

    # Subtotal row for assets
    rows.append(["", "", "TOTAL ASSETS", str(total_assets), "", "", ""])
    rows.append(["", "", "", "", "", "", ""])

    # Liabilities section
    total_liabilities = Decimal("0")
    for li in liabilities:
        li_type = li.get("type") or li.get("liabilityType") or ""
        description = li.get("description") or ""
        amount = _decimal_or_zero(li.get("amount") or li.get("estimatedValue"))
        creditor = li.get("creditor") or li.get("institution") or ""

        total_liabilities += amount
        rows.append([
            "LIABILITY", li_type, description, str(amount),
            "", "", creditor,
        ])

    rows.append(["", "", "TOTAL LIABILITIES", str(total_liabilities), "", "", ""])
    rows.append(["", "", "", "", "", "", ""])

    # Net worth summary
    net_worth = total_assets - total_liabilities
    rows.append(["SUMMARY", "", "NET ESTATE VALUE", str(net_worth), "", "", ""])
    rows.append(["SUMMARY", "", "Probate Estate (Primary Will)", str(probate_total), "", "", ""])
    rows.append(["SUMMARY", "", "Non-Probate Estate (Secondary Will)", str(non_probate_total), "", "", ""])

    # Estimated probate tax (Ontario: $5/$1000 for first $50K, $15/$1000 thereafter)
    if probate_total > Decimal("50000"):
        probate_tax = (Decimal("50000") * Decimal("5") / Decimal("1000")) + \
                      ((probate_total - Decimal("50000")) * Decimal("15") / Decimal("1000"))
    else:
        probate_tax = probate_total * Decimal("5") / Decimal("1000")

    rows.append(["SUMMARY", "", "Estimated Probate Tax (Primary Will)", str(probate_tax.quantize(Decimal("0.01"))), "", "", ""])

    # Savings if using dual will
    if non_probate_total > 0:
        savings = non_probate_total * Decimal("15") / Decimal("1000")
        rows.append(["SUMMARY", "", "Estimated Savings from Dual Will", str(savings.quantize(Decimal("0.01"))), "", "", ""])

    safe_name = client_name.replace(" ", "_") or "Client"
    return _csv_response(rows, headers, f"{safe_name}_Estate_Summary.csv")
