"""Semantic client-instruction checks shared by generation and review.

Placeholder checks detect blank data. These checks detect the more dangerous
case where a grammatical clause does not express the client's recorded
instructions. Both the versioned intake vault and the temporary legacy
questionnaire remain supported until the legacy route is retired.
"""

from __future__ import annotations

import html
import re

from services.document_generator import WILL_TYPES


RESIDUE_INSTRUCTION_GAP = "clientResidueInstructions"
END_OF_LIFE_INSTRUCTION_GAP = "clientEndOfLifeInstructions"
ORGAN_DONATION_INSTRUCTION_GAP = "clientOrganDonationInstructions"

_NAMED_RESIDUE_MODES = {
    "equal",
    "equal_beneficiaries",
    "percentages",
    "custom",
    "lawyer_help",
}
_PERCENTAGE_RESIDUE_MODES = {"percentages", "custom"}


def _full_name(person: dict) -> str:
    direct = str(person.get("fullName") or person.get("full_name") or "").strip()
    if direct:
        return direct
    first = person.get("firstName") or person.get("first_name")
    last = person.get("lastName") or person.get("last_name")
    return f"{str(first or '').strip()} {str(last or '').strip()}".strip()


def _share(person: dict):
    value = person.get("sharePercent")
    if value is None:
        value = person.get("percentage")
    return value


def _people(value) -> list[dict]:
    return [
        person for person in (value or [])
        if isinstance(person, dict) and _full_name(person)
    ]


def _residue_instructions(draft: dict) -> tuple[list[dict], list[dict], str]:
    """Read named residue instructions from the canonical or legacy intake."""
    vault = draft.get("vault") or {}
    vault_beneficiaries = _people(vault.get("beneficiaries"))
    vault_contingent = _people(vault.get("contingentBeneficiaries"))
    # Prefer the vault only when it actually NAMES someone. A hybrid draft
    # (legacy questionnaire answers plus a vault created by the unified
    # intake's autosave) can have residueDistribution set with an empty
    # beneficiary list — keying on the mode alone silently ungated the
    # legacy beneficiaries stored in your_estate / ew_people.
    if vault_beneficiaries or vault_contingent:
        return (
            vault_beneficiaries,
            vault_contingent,
            str(vault.get("residueDistribution") or ""),
        )

    estate = draft.get("your_estate") or {}
    estate_beneficiaries = _people(estate.get("beneficiaries"))
    estate_contingent = _people(estate.get("contingentBeneficiaries"))
    stored_people = [
        person for person in (draft.get("people") or [])
        if isinstance(person, dict)
    ]
    if not estate_beneficiaries:
        estate_beneficiaries = _people([
            person for person in stored_people
            if person.get("role") == "beneficiary"
        ])
    if not estate_contingent:
        estate_contingent = _people([
            person for person in stored_people
            if person.get("role") == "contingent_beneficiary"
        ])
    return (
        estate_beneficiaries,
        estate_contingent,
        str(estate.get("residueDistribution") or ""),
    )


def _personal_care_instructions(draft: dict) -> dict:
    """Prefer canonical answers, falling back to the legacy questionnaire."""
    vault_care = (((draft.get("vault") or {}).get("poa") or {}).get(
        "personalCare"
    ) or {})
    legacy_care = draft.get("poa_personal_care") or {}
    return {
        "lifeSupport": (
            vault_care["lifeSupport"]
            if "lifeSupport" in vault_care
            else legacy_care.get("lifeSupport")
        ),
        "organDonation": (
            vault_care["organDonation"]
            if "organDonation" in vault_care
            else legacy_care.get("organDonation")
        ),
    }


def _plain_custom_residue(clauses: list[dict]) -> str:
    custom_residue = []
    for clause in clauses:
        if not clause.get("included", True):
            continue
        clause_id = str(clause.get("clause_id") or clause.get("clauseId") or "")
        section = str(clause.get("section") or "")
        custom_text = clause.get("custom_text") or clause.get("customText")
        if custom_text and (
            clause_id.startswith("res-") or section.casefold() == "residue"
        ):
            without_tags = re.sub(r"<[^>]+>", " ", str(custom_text))
            custom_residue.append(html.unescape(without_tags))
    return re.sub(r"\s+", " ", " ".join(custom_residue)).strip()


def _name_pattern(name: str) -> str:
    """A name match that cannot be satisfied by a longer name containing it.

    Plain substring matching let 'Ann' be satisfied by 'Annette', so a will
    that omitted Ann entirely still delivered. \\w boundaries on both ends
    keep 'Ann' from matching inside 'Annette' while still matching after
    punctuation ('to Ann,').
    """
    return rf"(?<!\w){re.escape(name)}(?!\w)"


def _share_is_associated(
    text: str, name: str, share, all_names: list[str]
) -> bool:
    """Require a percentage to be syntactically attached to its beneficiary.

    Accepted drafting shapes are ``60% ... to Alex Kim`` and
    ``Alex Kim (60%)``. The first form cannot cross another percentage,
    another beneficiary's name, or a sentence boundary. The second requires
    the percentage immediately after the name. This intentionally fails
    closed for ambiguous prose.
    """
    try:
        rendered = f"{float(share):g}"
    except (TypeError, ValueError):
        return False

    name_re = _name_pattern(name)
    # Digit boundary: share 5 must not be satisfied by the '15' in '15%'.
    percent = rf"(?<![\d.]){re.escape(rendered)}\s*%"
    other_names = [
        _name_pattern(other) for other in all_names
        if other.casefold() != name.casefold()
    ]
    # [.;] stops the association window at a sentence boundary, so a
    # percentage in one sentence cannot claim a name in the next. Initials
    # like "J. Kim" inside the window fail closed — acceptable by design.
    forbidden = r"[%.;]"
    if other_names:
        forbidden = rf"(?:[%.;]|{'|'.join(other_names)})"

    percent_before_name = re.compile(
        rf"{percent}(?:(?!{forbidden}).){{0,120}}?{name_re}",
        re.IGNORECASE,
    )
    name_before_percent = re.compile(
        rf"{name_re}\s*(?:\(|\[|:|,|-|–|—)?\s*{percent}",
        re.IGNORECASE,
    )
    return bool(
        percent_before_name.search(text)
        or name_before_percent.search(text)
    )


def semantic_instruction_gaps(
    draft: dict, document_type: str, clauses: list[dict]
) -> set[str]:
    """Return delivery-blocking mismatches between answers and clauses."""
    gaps: set[str] = set()
    included = [clause for clause in clauses if clause.get("included", True)]

    if document_type in WILL_TYPES:
        beneficiaries, contingent, mode = _residue_instructions(draft)
        people = beneficiaries + contingent
        named_distribution = bool(people) and (
            mode in _NAMED_RESIDUE_MODES or not mode
        )
        if named_distribution:
            text = _plain_custom_residue(included)
            all_names = [_full_name(person) for person in people]
            # Word-boundary matching: 'Ann' must not be satisfied by
            # 'Annette' — that let a will omit a beneficiary entirely.
            names_present = all(
                re.search(_name_pattern(name), text, re.IGNORECASE)
                for name in all_names
            )
            shares_match = True
            # Run the share check whenever shares were actually recorded,
            # not only when the mode says 'percentages' — legacy rows can
            # carry percentages under any (or no) recorded mode.
            has_recorded_shares = any(
                _share(beneficiary) is not None
                for beneficiary in beneficiaries
            )
            if mode in _PERCENTAGE_RESIDUE_MODES or has_recorded_shares:
                shares_match = all(
                    _share_is_associated(
                        text,
                        _full_name(beneficiary),
                        _share(beneficiary),
                        all_names,
                    )
                    for beneficiary in beneficiaries
                    if _share(beneficiary) is not None
                    or mode in _PERCENTAGE_RESIDUE_MODES
                )
            if not text or not names_present or not shares_match:
                gaps.add(RESIDUE_INSTRUCTION_GAP)

    if document_type == "poa_personal_care":
        clause_ids = {
            str(clause.get("clause_id") or clause.get("clauseId") or "")
            for clause in included
        }
        personal_care = _personal_care_instructions(draft)
        if (
            "poa-care-wishes" in clause_ids
            and personal_care.get("lifeSupport") != "withhold"
        ):
            gaps.add(END_OF_LIFE_INSTRUCTION_GAP)
        if (
            "poa-care-organ" in clause_ids
            and personal_care.get("organDonation") is not True
        ):
            gaps.add(ORGAN_DONATION_INSTRUCTION_GAP)

    return gaps


def instruction_gap_message(gaps: set[str]) -> str:
    if RESIDUE_INSTRUCTION_GAP in gaps:
        return (
            "Document was not delivered: the selected residue clauses do not "
            "express the beneficiaries and shares recorded in the client intake. "
            "A lawyer must draft and review a matching residue clause."
        )
    return (
        "Document was not delivered: a selected personal-care clause records "
        "an end-of-life or organ-donation instruction the client did not "
        "affirmatively provide."
    )
