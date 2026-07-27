"""Canonical estate-plan pricing tiers — the single source of truth for checkout.

Mirrors the tiers advertised on the marketing landing page. Amounts are in cents.
"""

PRICING_TIERS: dict[str, dict] = {
    "essential": {
        "id": "essential",
        "name": "Essential",
        "amount_cents": 49900,
        "currency": "cad",
        "description": "Will intake and drafting scope for one individual.",
        "features": [
            "Last Will & Testament intake",
            "Executor and backup-executor instructions",
            "Residue instructions",
            "Questions prepared for lawyer review",
            "Signing requirements discussed by the firm",
        ],
    },
    "complete": {
        "id": "complete",
        "name": "Complete",
        "amount_cents": 69900,
        "currency": "cad",
        "description": "Individual will and Power of Attorney intake and drafting scope.",
        "features": [
            "Everything in Essential",
            "Power of Attorney for Property intake",
            "Power of Attorney for Personal Care intake",
            "Personal-care wishes and restrictions",
            "One structured file for legal review",
        ],
    },
    "couples": {
        "id": "couples",
        "name": "Couples",
        "amount_cents": 89900,
        "currency": "cad",
        "description": "Coordinated intake and drafting scope for two individuals.",
        "features": [
            "Two individual intake files",
            "Coordinated family information",
            "Shared-asset questions",
            "Separate executor and attorney choices",
            "Legal review required for each person",
        ],
    },
}


def get_tier(tier_id: str) -> dict | None:
    return PRICING_TIERS.get(tier_id)
