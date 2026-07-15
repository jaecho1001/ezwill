"""Jurisdiction registry — the seam that makes multi-province a config change."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from services.jurisdictions import resolve, get, DEFAULT_CODE, supported_codes


def test_ontario_aliases_all_resolve_to_ca_on():
    for p in [None, "", "ON", "on", "Ontario", "ontario", "CA-ON", "ca-on"]:
        assert resolve(p).code == "CA-ON"
        assert resolve(p).name == "Ontario"


def test_unknown_province_defaults_to_ontario():
    assert resolve("Atlantis").code == DEFAULT_CODE


def test_ontario_constants():
    on = get("CA-ON")
    assert on.age_of_majority == 18
    assert on.estate_trustee_term == "Estate Trustee"
    assert on.separation_void_years == 3
    assert on.probate_fee_threshold == 50_000


def test_supported_codes_includes_ontario():
    assert "CA-ON" in supported_codes()
