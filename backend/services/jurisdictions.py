"""Jurisdiction registry — the single source of truth for per-jurisdiction constants.

Ontario (``CA-ON``) is the only jurisdiction today, but every jurisdiction-specific
value should flow through this module so that adding a province or US state is a
config entry here, not a code change scattered across document generation, the
rules engine, and the schema. See ``JURISDICTION_AUDIT.md`` for the full map of
seams still to route through this registry.

The frontend mirrors this in ``frontend/src/lib/jurisdictions/registry.ts`` — keep
the two in sync.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Jurisdiction:
    code: str                       # ISO-ish code, e.g. "CA-ON"
    name: str                       # "Ontario"
    country: str                    # "Canada"
    age_of_majority: int            # 18 in ON; 19 in BC — used by isMinor / attestation
    estate_trustee_term: str        # "Estate Trustee" (ON) vs "Executor" elsewhere
    probate_certificate_term: str   # "Certificate of Appointment of Estate Trustee"
    wills_statute: str              # governing wills statute citation
    # SLRA s.17: a gift to a spouse is void after N years' separation. None where N/A.
    separation_void_years: int | None = None
    # Estate Administration Tax (probate fee): rate applied above `probate_fee_threshold`.
    probate_fee_rate: float = 0.0
    probate_fee_threshold: float = 0.0
    # ODSP / disability asset limit that triggers a Henson trust recommendation.
    disability_asset_limit: float | None = None


_REGISTRY: dict[str, Jurisdiction] = {
    "CA-ON": Jurisdiction(
        code="CA-ON",
        name="Ontario",
        country="Canada",
        age_of_majority=18,
        estate_trustee_term="Estate Trustee",
        probate_certificate_term="Certificate of Appointment of Estate Trustee",
        wills_statute="Succession Law Reform Act (SLRA), R.S.O. 1990, c. S.26",
        separation_void_years=3,
        probate_fee_rate=0.015,          # ~1.5%
        probate_fee_threshold=50_000.0,  # above $50,000
        disability_asset_limit=40_000.0,
    ),
}

DEFAULT_CODE = "CA-ON"

# Accepts a stored province value ('ON', 'Ontario') or a registry code ('CA-ON').
_ALIASES = {
    "on": "CA-ON",
    "ontario": "CA-ON",
    "ca-on": "CA-ON",
}


def resolve(province: str | None) -> Jurisdiction:
    """Resolve a draft's ``province`` field (or a registry code) to a Jurisdiction,
    defaulting to Ontario. This is the ONE place a missing/unknown province maps
    to a default — everywhere else should call this instead of hardcoding 'Ontario'."""
    key = (province or "").strip().lower()
    return _REGISTRY[_ALIASES.get(key, DEFAULT_CODE)]


def get(code: str) -> Jurisdiction:
    """Look up a Jurisdiction by registry code, defaulting to Ontario."""
    return _REGISTRY.get(code, _REGISTRY[DEFAULT_CODE])


def supported_codes() -> list[str]:
    return list(_REGISTRY.keys())
