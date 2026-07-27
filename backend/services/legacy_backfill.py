"""One-way projection of legacy questionnaire answers into vault shape (#78).

A client mid-way through the old /will/* wizard has answers in the section
columns (about_you, your_family, your_estate, your_arrangements, poa_property,
poa_personal_care) plus ew_people / ew_assets rows and the liabilities JSON.
The unified intake hydrates ONLY from the vault, so without this projection
those clients open their magic link onto a blank questionnaire and reasonably
conclude their work was lost.

Applied read-only at link-resolve time when the draft has NO vault of its own:
nothing is persisted until the client's first autosave writes the vault back,
so the projection is idempotent and requires no data migration. Field names
on the legacy side come from frontend/src/lib/types/will.ts (the wizard sends
its section objects verbatim); vault names from frontend/src/types/will-vault.ts.

Legacy answers with no vault home are deliberately carried into
``finalWishes.otherConcerns`` as a note for the lawyer rather than dropped
silently.
"""

from __future__ import annotations

import uuid


def _uid() -> str:
    return str(uuid.uuid4())


def _s(value) -> str:
    return str(value or "").strip()


def _full_name(person: dict) -> str:
    if not isinstance(person, dict):
        return ""
    direct = _s(person.get("fullName") or person.get("full_name"))
    if direct:
        return direct
    first = _s(person.get("firstName") or person.get("first_name"))
    last = _s(person.get("lastName") or person.get("last_name"))
    return f"{first} {last}".strip()


def _person(person: dict, is_backup: bool = False) -> dict:
    return {
        "id": _s(person.get("id")) or _uid(),
        "fullName": _full_name(person),
        "relationship": person.get("relationship"),
        "address": person.get("address"),
        "isBackup": is_backup,
    }


_MARITAL_MAP = {
    "single": "single",
    "married": "married",
    "commonlaw": "common_law",
    "common_law": "common_law",
    "divorced": "divorced",
    "widowed": "widowed",
    # Legacy has a 'separated' STATUS; the vault models separation as a flag
    # on a married spouse instead.
    "separated": "married",
}

_GIFT_TYPE_MAP = {
    "specific_item": "personal_item",
    "cash": "cash",
    "real_estate": "real_estate",
    "charity": "charity",
    "pet": "pet",
}

_ASSET_TYPE_MAP = {
    "real_estate": "real_estate",
    "bank": "bank",
    "investment": "investment",
    "rrsp": "registered_plan",
    "tfsa": "registered_plan",
    "resp": "registered_plan",
    "pension": "registered_plan",
    "insurance": "insurance",
    "business": "business",
    "digital": "digital",
    "vehicle": "other",
    "personal_property": "other",
}

_LIABILITY_TYPE_MAP = {
    "mortgage": "mortgage",
    "home_equity_line": "credit",
    "credit_card": "credit",
    "line_of_credit": "credit",
    "car_loan": "loan",
    "student_loan": "loan",
    "personal_loan": "loan",
    "business_loan": "business",
    "tax_owing": "tax",
    "other_debt": "other",
}


def has_legacy_answers(draft: dict) -> bool:
    """True when the draft carries legacy questionnaire data worth projecting."""
    if any(draft.get(col) for col in (
        "about_you", "your_family", "your_estate",
        "your_arrangements", "poa_property", "poa_personal_care",
    )):
        return True
    if draft.get("people") or draft.get("assets"):
        return True
    return False


def legacy_draft_to_vault(draft: dict) -> dict:
    """Project the legacy sections + relational rows into a v2 vault dict."""
    about = draft.get("about_you") or {}
    family = draft.get("your_family") or {}
    estate = draft.get("your_estate") or {}
    arrangements = draft.get("your_arrangements") or {}
    poa_prop = draft.get("poa_property") or {}
    poa_care = draft.get("poa_personal_care") or {}
    people_rows = [p for p in (draft.get("people") or []) if isinstance(p, dict)]
    asset_rows = [a for a in (draft.get("assets") or []) if isinstance(a, dict)]
    liabilities = [
        liability for liability in (draft.get("liabilities") or [])
        if isinstance(liability, dict)
    ]

    def rows_with_role(*roles: str) -> list[dict]:
        return [p for p in people_rows if p.get("role") in roles]

    # ── testator ────────────────────────────────────────────────────────────
    legacy_status = _s(about.get("maritalStatus") or family.get("maritalStatus"))
    testator_name = _full_name({
        "firstName": about.get("legalFirstName") or draft.get("client_first_name"),
        "lastName": about.get("legalLastName") or draft.get("client_last_name"),
    })
    testator = {
        "fullName": testator_name or None,
        "preferredName": about.get("preferredName"),
        "dob": about.get("dateOfBirth"),
        "email": about.get("email") or draft.get("client_email"),
        "phone": about.get("phone") or draft.get("client_phone"),
        "maritalStatus": _MARITAL_MAP.get(legacy_status.lower()) if legacy_status else None,
    }

    # ── spouse / children ───────────────────────────────────────────────────
    spouse_row = family.get("spouse") or next(iter(rows_with_role("spouse")), None)
    spouse = {}
    if spouse_row and _full_name(spouse_row):
        spouse = {
            "fullName": _full_name(spouse_row),
            "included": bool(family.get("hasSpouse", True)),
        }
    if legacy_status.lower() == "separated":
        spouse["separated"] = True
        if family.get("separationDate"):
            spouse["separationDate"] = family["separationDate"]

    children = [
        {
            "id": _s(child.get("id")) or _uid(),
            "fullName": _full_name(child),
            "dob": child.get("birthDate") or child.get("birth_date"),
            "receivesODSP": bool(
                child.get("receivesODSP") or child.get("receives_odsp")
            ),
        }
        for child in (family.get("children") or rows_with_role("child"))
        if _full_name(child)
    ]

    # ── executors / guardians (arrangements first, people rows as fallback) ─
    executors: list[dict] = []
    if _full_name(arrangements.get("primaryExecutor") or {}):
        executors.append(_person(arrangements["primaryExecutor"], is_backup=False))
    for backup in arrangements.get("backupExecutors") or []:
        if _full_name(backup):
            executors.append(_person(backup, is_backup=True))
    if not executors:
        rows = rows_with_role("executor")
        executors = [
            _person(row, is_backup=index > 0)
            for index, row in enumerate(rows)
            if _full_name(row)
        ]

    guardians = [
        _person(guardian, is_backup=index > 0)
        for index, guardian in enumerate(
            family.get("guardians") or rows_with_role("guardian")
        )
        if _full_name(guardian)
    ]

    # ── beneficiaries ────────────────────────────────────────────────────────
    def beneficiary(entry: dict) -> dict:
        share = entry.get("percentage")
        if share is None:
            share = entry.get("sharePercent")
        out = _person(entry)
        if share is not None:
            out["sharePercent"] = share
        return out

    beneficiaries = [
        beneficiary(entry)
        for entry in (estate.get("beneficiaries") or rows_with_role("beneficiary"))
        if _full_name(entry)
    ]
    contingent = [
        beneficiary(entry)
        for entry in (
            estate.get("contingentBeneficiaries")
            or rows_with_role("contingent_beneficiary")
        )
        if _full_name(entry)
    ]

    # ── gifts (recipientId resolved against every known person) ─────────────
    person_names = {}
    for pool in (
        people_rows, family.get("children") or [],
        estate.get("beneficiaries") or [], [family.get("spouse") or {}],
    ):
        for person in pool:
            if isinstance(person, dict) and person.get("id"):
                person_names[_s(person["id"])] = _full_name(person)

    gifts = []
    for gift in list(estate.get("gifts") or []) + list(estate.get("donations") or []):
        if not isinstance(gift, dict):
            continue
        if not (_s(gift.get("description")) or _s(gift.get("charityName"))):
            continue
        gifts.append({
            "id": _s(gift.get("id")) or _uid(),
            "type": _GIFT_TYPE_MAP.get(_s(gift.get("type")), "personal_item"),
            "description": _s(gift.get("description")),
            "recipientName": person_names.get(_s(gift.get("recipientId"))) or None,
            "amount": gift.get("amount"),
            "charityName": gift.get("charityName"),
            "charityNumber": gift.get("charityNumber"),
            "condition": gift.get("condition"),
        })
    for pet in family.get("pets") or []:
        if isinstance(pet, dict) and _s(pet.get("name")):
            gifts.append({
                "id": _s(pet.get("id")) or _uid(),
                "type": "pet",
                "description": f"{_s(pet.get('type')) or 'Pet'} — {_s(pet.get('name'))}",
                "recipientName": _s(pet.get("caregiverName")) or None,
            })

    # ── trusts / goals ───────────────────────────────────────────────────────
    trust_types = {
        _s(trust.get("trustType"))
        for trust in (estate.get("trusts") or [])
        if isinstance(trust, dict)
    }
    goals = {
        "minorChildrenTrust": "childrens" in trust_types or None,
        "spousalTrust": "spousal" in trust_types or None,
        "henson": "henson" in trust_types or None,
        "hasDualWill": bool(estate.get("includeDualWill")) or None,
        "hasPoaProperty": bool(poa_prop.get("hasAttorney")) or None,
        "hasPoaPersonalCare": bool(poa_care.get("hasAttorney")) or None,
        "charitableGiving": bool(estate.get("hasDonations")) or None,
    }
    goals = {key: value for key, value in goals.items() if value is not None}

    # ── POAs ─────────────────────────────────────────────────────────────────
    def poa_attorneys(section: dict, *roles: str) -> list[dict]:
        attorneys = []
        if _full_name(section.get("attorney") or {}):
            attorneys.append(_person(section["attorney"], is_backup=False))
        if _full_name(section.get("backupAttorney") or {}):
            attorneys.append(_person(section["backupAttorney"], is_backup=True))
        if not attorneys:
            attorneys = [
                _person(row, is_backup=index > 0)
                for index, row in enumerate(rows_with_role(*roles))
                if _full_name(row)
            ]
        return attorneys

    poa = {
        "property": {
            "requested": bool(poa_prop.get("hasAttorney")) or None,
            "attorneys": poa_attorneys(poa_prop, "attorney_property"),
            "effective": (
                "immediately" if poa_prop.get("effectiveImmediately") is True
                else "incapacity" if poa_prop.get("effectiveImmediately") is False
                else None
            ),
            "restrictions": poa_prop.get("restrictions"),
            "compensation": poa_prop.get("compensation"),
        },
        "personalCare": {
            "requested": bool(poa_care.get("hasAttorney")) or None,
            "attorneys": poa_attorneys(poa_care, "attorney_care"),
            "lifeSupport": poa_care.get("lifeSupport"),
            "careInstructions": poa_care.get("careInstructions"),
            "organDonation": poa_care.get("organDonation"),
        },
    }

    # ── assets / liabilities ────────────────────────────────────────────────
    asset_items = []
    for row in asset_rows:
        description = _s(row.get("description"))
        asset_type = _s(row.get("asset_type") or row.get("assetType"))
        if not description and not asset_type:
            continue
        asset_items.append({
            "id": _s(row.get("id")) or _uid(),
            "type": _ASSET_TYPE_MAP.get(asset_type, "other"),
            "description": description or asset_type,
            "estimatedValue": row.get("estimated_value") or row.get("estimatedValue"),
            "hasDesignatedBeneficiary": bool(
                row.get("beneficiary_designation")
                or row.get("beneficiaryDesignation")
            ) or None,
        })

    vault_liabilities = []
    for liability in liabilities:
        description = _s(liability.get("description"))
        if not description:
            continue
        vault_liabilities.append({
            "id": _s(liability.get("id")) or _uid(),
            "type": _LIABILITY_TYPE_MAP.get(
                _s(liability.get("liabilityType") or liability.get("liability_type")),
                "other",
            ),
            "description": description,
            "estimatedBalance": (
                liability.get("outstandingBalance")
                or liability.get("outstanding_balance")
            ),
        })

    assets = {
        "items": asset_items,
        "liabilities": vault_liabilities,
        "privateCompanyShares": (
            True if any(item["type"] == "business" for item in asset_items) else None
        ),
    }
    assets = {key: value for key, value in assets.items() if value not in (None, [])}

    # ── final wishes + carried-over notes ────────────────────────────────────
    final_wishes = {
        "restingPlace": arrangements.get("restingPlace"),
        "ceremonyWishes": arrangements.get("ceremonyWishes"),
    }
    carried: list[str] = []
    if arrangements.get("hasNoSurvivingExecutor"):
        carried.append(
            f"Corporate trustee if no executor survives: "
            f"{_s(arrangements['hasNoSurvivingExecutor'])}"
        )
    if poa_prop.get("disputeResolution"):
        carried.append(
            f"POA property dispute resolution: {_s(poa_prop['disputeResolution'])}"
        )
    if poa_care.get("painPref"):
        carried.append(f"Pain management preference: {_s(poa_care['painPref'])}")
    if carried:
        final_wishes["otherConcerns"] = (
            "Carried over from the earlier questionnaire — lawyer to review: "
            + " | ".join(carried)
        )
    final_wishes = {
        key: value for key, value in final_wishes.items() if value
    }

    vault = {
        "schemaVersion": 2,
        "testator": {k: v for k, v in testator.items() if v},
        "spouse": spouse,
        "children": children,
        "executors": executors,
        "guardians": guardians,
        "beneficiaries": beneficiaries,
        "contingentBeneficiaries": contingent,
        "gifts": gifts,
        "residueDistribution": estate.get("residueDistribution"),
        "trustDistributionAge": estate.get("minorTrustAge"),
        "assets": assets,
        "goals": goals,
        "poa": poa,
        "finalWishes": final_wishes,
    }
    corporate = _s(arrangements.get("hasNoSurvivingExecutor"))
    if corporate:
        vault["corporateTrusteeName"] = corporate
    return {
        key: value for key, value in vault.items()
        if value not in (None, "", [], {})
    }
