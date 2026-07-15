"""Canonical estate-plan pricing tiers — the single source of truth for checkout.

Mirrors the tiers advertised on the marketing landing page. Amounts are in cents.
"""

PRICING_TIERS: dict[str, dict] = {
    "essential": {
        "id": "essential",
        "name": "Essential",
        "amount_cents": 49900,
        "currency": "cad",
        "description": "Last Will & Testament for individuals with straightforward wishes.",
        "features": [
            "Last Will & Testament",
            "Executor & backup executor",
            "Residue distribution",
            "Free updates for 1 year",
            "Signing guide included",
        ],
    },
    "complete": {
        "id": "complete",
        "name": "Complete",
        "amount_cents": 69900,
        "currency": "cad",
        "description": "Will plus both Powers of Attorney, for full protection.",
        "features": [
            "Everything in Essential",
            "Power of Attorney (Property)",
            "Power of Attorney (Personal Care)",
            "Free updates for 3 years",
            "Priority lawyer review",
        ],
    },
    "couples": {
        "id": "couples",
        "name": "Couples",
        "amount_cents": 89900,
        "currency": "cad",
        "description": "Two complete will packages with mirror-will option.",
        "features": [
            "Two complete will packages",
            "Mirror wills option",
            "Shared asset planning",
            "Free updates for 5 years",
            "Dedicated lawyer support",
        ],
    },
}


def get_tier(tier_id: str) -> dict | None:
    return PRICING_TIERS.get(tier_id)
