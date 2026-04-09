"""
End-to-end test for DocumentGenerator (python-docx).
Generates real DOCX files with Kim/Lee precedent data and verifies output.

Usage:
    .venv/bin/python3 tests/test_docgen_e2e.py
"""

from __future__ import annotations

import sys
import os

# Allow importing from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.document_generator import DocumentGenerator
from docx import Document

# ── Mock Variables (Kim/Lee precedent) ────────────────────────────────────────

VARIABLES = {
    "testatorFullName": "HYUN JUNG KIM",
    "testatorFirstName": "HYUN JUNG",
    "testatorLastName": "KIM",
    "spouseFullName": "MOONYOUNG LEE",
    "spouseFirstName": "MOONYOUNG",
    "spouseLastName": "LEE",
    "city": "City",
    "cityName": "Vaughan",
    "province": "Ontario",
    "address": "123 Main Street, Vaughan, ON",
    "pronoun": "her",
    "maritalStatus": "married",
    "primaryExecutorFullName": "MOONYOUNG LEE",
    "backupExecutorFullName": "JOON TAE PARK",
    "childNames": "SUNNY SUN KIM and HELEN SUNWOO KIM",
    "trustDistributionAge": "25",
    "survivalDays": "30",
    "numberOfPages": "12",
    "deponentName": "JAE HYON CHO",
    "otherWitnessName": "JUNKI LEE",
    "commissionerName": "JAE HYON CHO",
    "documentDate": "April 8, 2026",
    # POA-specific
    "poaPropertyAttorneyFullName": "MOONYOUNG LEE",
    "poaPersonalCareAttorneyFullName": "MOONYOUNG LEE",
    "guardianFullName": "JOON TAE PARK",
    "backupGuardianFullName": "SUNG HEE KIM",
}

# ── Mock Clause Builders ──────────────────────────────────────────────────────


def _clause(clause_id: str, title: str, text: str, sort_order: int,
            is_folder: bool = False, included: bool = True) -> dict:
    return {
        "clause_id": clause_id,
        "title": title,
        "templateText": text,
        "customText": None,
        "sortOrder": sort_order,
        "isFolder": is_folder,
        "included": included,
    }


def build_probate_will_clauses() -> list:
    """Probate will clauses matching the Kim/Lee precedent."""
    return [
        _clause("rev", "Revocation", "", 1, is_folder=True),
        _clause(
            "rev-probate", "Revocation -- Probate Will (Dual Will)",
            'I, {{testatorFullName}}, of the {{city}} of {{cityName}}, in the Province of {{province}}, '
            'revoke all former Wills and Codicils made by me EXCEPT my Non-Probate Will of even date '
            '(hereinafter my "Non-Probate Will"), and declare this to be my Last Will and Testament '
            'dealing with my Probate Assets (as defined below).',
            2,
        ),
        _clause("interp", "Interpretation", "", 10, is_folder=True),
        _clause(
            "interp-spouse", "Definition of Spouse",
            'In this my Will, "my spouse" means {{spouseFullName}}, provided that at the time of my death '
            'we are not living separate and apart and there is no subsisting order or agreement providing '
            'for our separation.',
            11,
        ),
        _clause(
            "interp-children", "Definition of Children",
            'In this my Will, "my children" means {{childNames}}, and includes any child of mine born or '
            'adopted after the date of this Will.',
            12,
        ),
        _clause(
            "interp-issue", "Definition of Issue and Per Stirpes",
            'In this my Will, "issue" means all lineal descendants of every degree, and a gift to issue '
            '"per stirpes" shall mean that each generation shall take equally the share that their deceased '
            'ancestor would have taken had such ancestor survived, by right of representation.',
            13,
        ),
        _clause(
            "interp-probate-assets", "Definition of Probate Assets (Dual Will)",
            '"Probate Assets" means all property owned by me at the date of my death that requires a '
            'Certificate of Appointment of Estate Trustee (probate) for its transfer or realization, '
            'excluding the Non-Probate Assets as defined in my Non-Probate Will of even date.',
            14,
        ),
        _clause("appt", "Executors and Trustees", "", 20, is_folder=True),
        _clause(
            "appt-primary", "Appointment of Primary Estate Trustee",
            'I appoint {{primaryExecutorFullName}} as the Estate Trustee of this my Will.',
            21,
        ),
        _clause(
            "appt-backup", "Appointment of Backup Estate Trustee",
            'If {{primaryExecutorFullName}} is unable or unwilling to act or continue to act as my '
            'Estate Trustee, I appoint {{backupExecutorFullName}} as the alternate Estate Trustee '
            'of this my Will.',
            22,
        ),
        _clause("debt", "Payment of Debts", "", 30, is_folder=True),
        _clause(
            "debt-payment", "Direction to Pay Debts",
            'I direct my Estate Trustee to pay out of and charge to the capital of my estate my just debts, '
            'funeral and testamentary expenses, and all estate, inheritance, and succession duties or taxes.',
            31,
        ),
        _clause("res", "Residue", "", 40, is_folder=True),
        _clause(
            "res-spouse", "Residue to Spouse",
            'I give all the residue of my estate to my spouse, {{spouseFullName}}, if {{pronoun}} survives me '
            'by {{survivalDays}} days.',
            41,
        ),
        _clause(
            "res-children-stirpes", "Residue to Children Per Stirpes",
            'If my spouse does not survive me, I give the residue of my estate to my children then living, '
            'in equal shares per stirpes.',
            42,
        ),
        _clause(
            "res-common-disaster", "Common Disaster Clause",
            'If my spouse and I die in a common disaster or under circumstances that make it uncertain which '
            'of us survived the other, my spouse shall be deemed to have predeceased me for the purposes of '
            'this Will.',
            43,
        ),
        _clause(
            "res-survival-period", "Survival Period",
            'No beneficiary shall be entitled to any benefit under this Will unless such beneficiary survives '
            'me by at least {{survivalDays}} days.',
            44,
        ),
        _clause("trust", "Trust Provisions", "", 50, is_folder=True),
        _clause(
            "trust-minor", "Trust for Minor Children",
            'If any beneficiary under this Will is under the age of {{trustDistributionAge}} years at the '
            'time of my death, I direct my Estate Trustee to hold such beneficiary\'s share in trust until '
            'the beneficiary attains the age of {{trustDistributionAge}} years.',
            51,
        ),
        _clause("fla", "Family Law Act Exclusion", "", 60, is_folder=True),
        _clause(
            "fla-exclusion", "FLA s.4(2) Exclusion",
            'I declare that all gifts and inheritances received by any beneficiary from my estate, and all '
            'income and capital gains derived therefrom, shall be excluded from such beneficiary\'s net family '
            'property within the meaning of the <i>Family Law Act</i>, R.S.O. 1990, c. F.3, as amended.',
            61,
        ),
    ]


def build_non_probate_will_clauses() -> list:
    """Non-probate will clauses."""
    return [
        _clause("rev", "Revocation", "", 1, is_folder=True),
        _clause(
            "rev-nonprobate", "Revocation -- Non-Probate Will (Dual Will)",
            'I, {{testatorFullName}}, of the {{city}} of {{cityName}}, in the Province of {{province}}, '
            'revoke all former Wills and Codicils made by me dealing with Non-Probate Assets (as defined '
            'below) EXCEPT my Probate Will of even date (hereinafter my "Probate Will"), and declare this '
            'to be my Non-Probate Will dealing with my Non-Probate Assets.',
            2,
        ),
        _clause("interp", "Interpretation", "", 10, is_folder=True),
        _clause(
            "interp-nonprobate-assets", "Definition of Non-Probate Assets",
            '"Non-Probate Assets" means all property owned by me at the date of my death that does NOT '
            'require a Certificate of Appointment of Estate Trustee (probate) for its transfer or '
            'realization, including private company shares, limited partnership interests, trust interests, '
            'and first-dealings real property.',
            11,
        ),
        _clause("appt", "Executors and Trustees", "", 20, is_folder=True),
        _clause(
            "appt-primary", "Appointment of Primary Estate Trustee",
            'I appoint {{primaryExecutorFullName}} as the Estate Trustee of this my Non-Probate Will.',
            21,
        ),
        _clause(
            "appt-backup", "Appointment of Backup Estate Trustee",
            'If {{primaryExecutorFullName}} is unable or unwilling to act, I appoint '
            '{{backupExecutorFullName}} as the alternate Estate Trustee of this my Non-Probate Will.',
            22,
        ),
        _clause("res", "Residue", "", 40, is_folder=True),
        _clause(
            "res-spouse", "Residue to Spouse",
            'I give all the residue of my Non-Probate Assets to my spouse, {{spouseFullName}}, '
            'if {{pronoun}} survives me by {{survivalDays}} days.',
            41,
        ),
        _clause(
            "res-children-stirpes", "Residue to Children Per Stirpes",
            'If my spouse does not survive me, I give the residue of my Non-Probate Assets to my '
            'children then living, in equal shares per stirpes.',
            42,
        ),
    ]


def build_affidavit_execution_probate_clauses() -> list:
    """Affidavit of Execution for Probate Will -- minimal clauses since
    the signing page generates the affidavit body automatically."""
    return [
        _clause("aff", "Affidavit of Execution", "", 1, is_folder=True),
        _clause(
            "aff-probate-will", "Affidavit -- Probate Will",
            'This affidavit is made in connection with the Probate Will of '
            '{{testatorFullName}} dated {{documentDate}}.',
            2,
        ),
    ]


def build_poa_property_clauses() -> list:
    """Continuing Power of Attorney for Property clauses."""
    return [
        _clause("poa-prop", "Power of Attorney for Property", "", 1, is_folder=True),
        _clause(
            "poa-prop-appt", "Appointment of Attorney for Property",
            'I, {{testatorFullName}}, of the {{city}} of {{cityName}}, in the Province of {{province}}, '
            'hereby appoint {{poaPropertyAttorneyFullName}} as my attorney for property pursuant to the '
            '<i>Substitute Decisions Act, 1992</i>, S.O. 1992, c. 30, as amended.',
            2,
        ),
        _clause(
            "poa-prop-effective", "Effective Date",
            'This continuing power of attorney for property shall take effect and be a continuing power '
            'of attorney for property under the <i>Substitute Decisions Act, 1992</i> and may be exercised '
            'during any subsequent legal incapacity on my part.',
            3,
        ),
        _clause(
            "poa-prop-compensation", "Compensation of Attorney",
            'My attorney shall be entitled to be compensated for the time and effort expended on my behalf '
            'in accordance with the guidelines prescribed under the <i>Substitute Decisions Act, 1992</i>.',
            4,
        ),
        _clause(
            "poa-prop-restrictions", "Restrictions on Attorney",
            'My attorney shall not make any gift or loan of my property except as permitted by the '
            '<i>Substitute Decisions Act, 1992</i>, and shall keep my property separate from their own '
            'property at all times.',
            5,
        ),
    ]


# ── Document Generation Configs ───────────────────────────────────────────────

DOCUMENTS_TO_GENERATE = [
    ("probate_will", build_probate_will_clauses, "ezwill-test-probate-will.docx"),
    ("non_probate_will", build_non_probate_will_clauses, "ezwill-test-non-probate-will.docx"),
    ("affidavit_execution", build_affidavit_execution_probate_clauses, "ezwill-test-affidavit-execution-probate.docx"),
    ("poa_property", build_poa_property_clauses, "ezwill-test-poa-property.docx"),
]


# ── Main Test ─────────────────────────────────────────────────────────────────

def main():
    generator = DocumentGenerator()
    results = {}
    errors = []

    print("=" * 70)
    print("EZWill Document Generator - End-to-End Test")
    print("=" * 70)
    print()

    for doc_type, clause_builder, filename in DOCUMENTS_TO_GENERATE:
        clauses = clause_builder()
        output_path = os.path.join("/tmp", filename)

        print(f"--- Generating: {doc_type} ---")
        print(f"  Clauses: {len(clauses)} ({sum(1 for c in clauses if not c.get('isFolder'))} body clauses)")

        try:
            docx_bytes = generator.generate_document(
                document_type=doc_type,
                clauses=clauses,
                variables=VARIABLES,
            )

            with open(output_path, "wb") as f:
                f.write(docx_bytes)

            size = len(docx_bytes)
            results[doc_type] = {"path": output_path, "size": size}
            print(f"  Output: {output_path}")
            print(f"  Size: {size:,} bytes")
            print(f"  Status: OK")

        except Exception as e:
            errors.append((doc_type, str(e)))
            print(f"  Status: FAILED -- {e}")
            import traceback
            traceback.print_exc()

        print()

    # ── Verification: read back each DOCX ──────────────────────────────────

    print("=" * 70)
    print("Verification: Reading back generated files")
    print("=" * 70)
    print()

    for doc_type, info in results.items():
        path = info["path"]
        print(f"--- {doc_type} ({info['size']:,} bytes) ---")

        try:
            doc = Document(path)
            paras = doc.paragraphs
            print(f"  Paragraph count: {len(paras)}")
            print(f"  First 5 paragraphs:")
            for i, p in enumerate(paras[:5]):
                text = p.text.strip()
                if text:
                    display = text[:100] + ("..." if len(text) > 100 else "")
                    print(f"    [{i}] {display}")
                else:
                    print(f"    [{i}] (empty)")
        except Exception as e:
            print(f"  Read-back FAILED: {e}")

        print()

    # ── Summary ────────────────────────────────────────────────────────────

    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)
    total = len(DOCUMENTS_TO_GENERATE)
    passed = len(results)
    failed = len(errors)
    print(f"  Generated: {passed}/{total}")
    print(f"  Failed: {failed}/{total}")
    if errors:
        for doc_type, err in errors:
            print(f"    - {doc_type}: {err}")
    print()

    if failed > 0:
        sys.exit(1)
    else:
        print("All documents generated successfully.")


if __name__ == "__main__":
    main()
