"""Legacy → vault backfill tests (issue #78).

A client mid-way through the old /will/* wizard must open their magic link
onto a populated unified intake, not a blank one. These tests pin the
projection field-by-field against the REAL legacy shapes (types/will.ts sends
its section objects verbatim) and the vault v2 contract.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.legacy_backfill import has_legacy_answers, legacy_draft_to_vault


LEGACY_DRAFT = {
    "client_first_name": "Hyun Jung",
    "client_last_name": "Kim",
    "client_email": "hj@example.com",
    "about_you": {
        "legalFirstName": "Hyun Jung", "legalLastName": "Kim",
        "dateOfBirth": "1962-03-15", "city": "Vaughan", "province": "ON",
        "maritalStatus": "commonlaw",
    },
    "your_family": {
        "maritalStatus": "commonlaw",
        "hasSpouse": True,
        "spouse": {"id": "p-sp", "role": "spouse", "firstName": "Min Su", "lastName": "Park"},
        "children": [
            {"id": "p-c1", "role": "child", "firstName": "Grace", "lastName": "Kim",
             "birthDate": "2011-07-01", "receivesODSP": True},
        ],
        "guardians": [
            {"id": "p-g1", "role": "guardian", "firstName": "Joon", "lastName": "Lee"},
        ],
        "pets": [{"id": "pet1", "name": "Mochi", "type": "Dog", "caregiverName": "Joon Lee"}],
    },
    "your_estate": {
        "beneficiaries": [
            {"id": "p-b1", "role": "beneficiary", "firstName": "Grace",
             "lastName": "Kim", "percentage": 60},
            {"id": "p-b2", "role": "beneficiary", "firstName": "Min Su",
             "lastName": "Park", "percentage": 40},
        ],
        "contingentBeneficiaries": [],
        "residueDistribution": "custom",
        "minorTrustAge": 25,
        "gifts": [
            {"id": "g1", "type": "specific_item", "description": "my mother's ring",
             "recipientId": "p-b1"},
        ],
        "donations": [
            {"id": "g2", "type": "charity", "description": "gift to charity",
             "charityName": "SickKids Foundation", "charityNumber": "10808 4419 RR0001",
             "amount": 5000},
        ],
        "hasDonations": True,
        "trusts": [{"id": "t1", "trustType": "henson", "beneficiaryIds": ["p-c1"],
                    "trusteeIds": []}],
        "includeDualWill": True,
    },
    "your_arrangements": {
        "primaryExecutor": {"id": "p-e1", "firstName": "Dan", "lastName": "Cho"},
        "backupExecutors": [{"id": "p-e2", "firstName": "Sue", "lastName": "Han"}],
        "hasNoSurvivingExecutor": "Trust Co of Canada",
        "restingPlace": "cremation",
        "ceremonyWishes": "Small family gathering",
    },
    "poa_property": {
        "hasAttorney": True,
        "attorney": {"id": "p-a1", "firstName": "Dan", "lastName": "Cho"},
        "backupAttorney": {"id": "p-a2", "firstName": "Sue", "lastName": "Han"},
        "effectiveImmediately": False,
        "restrictions": "No sale of the home without court approval",
    },
    "poa_personal_care": {
        "hasAttorney": True,
        "attorney": {"id": "p-a3", "firstName": "Min Su", "lastName": "Park"},
        "lifeSupport": "withhold",
        "painPref": "Prioritize comfort",
        "organDonation": True,
    },
    "people": [],
    "assets": [
        {"id": "a1", "asset_type": "real_estate", "description": "123 Main St",
         "estimated_value": 900000, "beneficiary_designation": False},
        {"id": "a2", "asset_type": "business", "description": "Kim Holdings Inc."},
    ],
    "liabilities": [
        {"id": "l1", "liabilityType": "mortgage", "description": "Main St mortgage",
         "outstandingBalance": 250000},
    ],
}


def test_empty_draft_has_no_legacy_answers():
    assert not has_legacy_answers({"vault": None, "about_you": None, "people": []})


def test_projection_covers_the_guarded_fields():
    vault = legacy_draft_to_vault(LEGACY_DRAFT)

    # Identity + marital mapping ('commonlaw' -> 'common_law')
    assert vault["testator"]["fullName"] == "Hyun Jung Kim"
    assert vault["testator"]["maritalStatus"] == "common_law"

    # The residue instructions the instruction guard reads MUST survive.
    names = [b["fullName"] for b in vault["beneficiaries"]]
    shares = [b["sharePercent"] for b in vault["beneficiaries"]]
    assert names == ["Grace Kim", "Min Su Park"]
    assert shares == [60, 40]
    assert vault["residueDistribution"] == "custom"

    # Executors keep primary/backup ordering.
    assert [(e["fullName"], e["isBackup"]) for e in vault["executors"]] == [
        ("Dan Cho", False), ("Sue Han", True),
    ]

    # Gifts resolve recipientId -> a real name; charity fields carry over.
    ring = next(g for g in vault["gifts"] if "ring" in g["description"])
    assert ring["recipientName"] == "Grace Kim"
    assert ring["type"] == "personal_item"
    charity = next(g for g in vault["gifts"] if g.get("charityName"))
    assert charity["charityNumber"] == "10808 4419 RR0001"
    pet = next(g for g in vault["gifts"] if g["type"] == "pet")
    assert "Mochi" in pet["description"] and pet["recipientName"] == "Joon Lee"

    # POA consent values the guard checks arrive verbatim.
    assert vault["poa"]["personalCare"]["lifeSupport"] == "withhold"
    assert vault["poa"]["personalCare"]["organDonation"] is True
    assert vault["poa"]["property"]["effective"] == "incapacity"

    # Trusts -> goals; dual-will intent restored (#82's lost writer).
    assert vault["goals"]["henson"] is True
    assert vault["goals"]["hasDualWill"] is True

    # Assets + liabilities land in vault shape.
    assert any(i["type"] == "business" for i in vault["assets"]["items"])
    assert vault["assets"]["privateCompanyShares"] is True
    assert vault["assets"]["liabilities"][0]["type"] == "mortgage"
    assert vault["trustDistributionAge"] == 25

    # No-vault-home answers are carried as a lawyer note, not dropped.
    concerns = vault["finalWishes"]["otherConcerns"]
    assert "Trust Co of Canada" in concerns
    assert "Pain management" in concerns
    assert vault["corporateTrusteeName"] == "Trust Co of Canada"

    # ODSP fact survives (feeds the Henson flag downstream).
    assert vault["children"][0]["receivesODSP"] is True


def test_people_rows_fill_when_sections_are_empty():
    draft = {
        "people": [
            {"role": "executor", "first_name": "Dan", "last_name": "Cho"},
            {"role": "beneficiary", "first_name": "Grace", "last_name": "Kim",
             "percentage": 100},
            {"role": "attorney_care", "first_name": "Min", "last_name": "Park"},
        ],
    }
    assert has_legacy_answers(draft)
    vault = legacy_draft_to_vault(draft)
    assert vault["executors"][0]["fullName"] == "Dan Cho"
    assert vault["beneficiaries"][0]["sharePercent"] == 100
    assert vault["poa"]["personalCare"]["attorneys"][0]["fullName"] == "Min Park"


def test_projection_is_pure_and_repeatable():
    first = legacy_draft_to_vault(LEGACY_DRAFT)
    second = legacy_draft_to_vault(LEGACY_DRAFT)
    # ids for entries lacking one are generated, so compare everything else.
    for key in ("testator", "residueDistribution", "goals", "poa"):
        assert first[key] == second[key]
