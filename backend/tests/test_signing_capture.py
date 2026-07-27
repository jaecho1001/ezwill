"""Signing-record capture tests (issue #84).

The affidavit of execution swears to facts about the will's signing — the
attesting witness, where, when. Before this, the generate routes never read
the recorded signing event at all, so those facts could only come from
firm-settings defaults and the affidavit was blocked or wrong. These tests
pin the mapping: which document reads which event, what overrides what.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routes.documents import (
    _SIGNING_EVENT_KEY,
    _derived_title_variables,
    _signing_overlay,
)
from services.document_generator import DOCUMENT_TITLES


class FakeDb:
    events: list = []

    def get_signing_events(self, draft_id):
        return list(type(self).events)


WILL_EVENT = {
    "document_type": "will",
    "signing_method": "in_person",
    "signed_at": datetime(2026, 7, 20, 14, 0),
    "location": "Vaughan",
    "witness1_name": "Joon Tae Park",
    "witness1_address": "1 King St, Vaughan",
    "witness2_name": "Sue Han",
    "witness2_address": "2 Queen St, Vaughan",
}


def test_every_generatable_document_has_a_signing_key_or_none():
    # New document types must make a deliberate choice here.
    unmapped = set(DOCUMENT_TITLES) - set(_SIGNING_EVENT_KEY)
    assert not unmapped, f"unmapped document types: {sorted(unmapped)}"


def test_affidavit_reads_the_wills_signing_event():
    FakeDb.events = [WILL_EVENT]
    signing_data, overrides = _signing_overlay(FakeDb(), "d1", "affidavit_execution")
    # The deponent is the attesting witness — the person who watched the
    # signing and now swears the affidavit.
    assert overrides["deponentName"] == "Joon Tae Park"
    assert overrides["witness2Name"] == "Sue Han"
    assert overrides["deponentCity"] == "Vaughan"
    assert overrides["dateOfWill"] == "July 20, 2026"
    assert signing_data["deponentName"] == "Joon Tae Park"


def test_poa_reads_its_own_event_not_the_wills():
    FakeDb.events = [WILL_EVENT]
    signing_data, overrides = _signing_overlay(FakeDb(), "d1", "poa_property")
    assert overrides == {} and signing_data == {}

    FakeDb.events = [WILL_EVENT, {
        "document_type": "poa_property",
        "signing_method": "remote_video",
        "platform": "Zoom",
        "witness1_name": "Grace Lee",
    }]
    signing_data, overrides = _signing_overlay(FakeDb(), "d1", "poa_property")
    assert overrides["witness1Name"] == "Grace Lee"
    assert signing_data["remotePlatform"] == "Zoom"


def test_no_event_changes_nothing():
    FakeDb.events = []
    assert _signing_overlay(FakeDb(), "d1", "single_will") == ({}, {})


def test_dual_will_companion_titles_are_derived():
    assert _derived_title_variables("probate_will")["otherWillType"] == "Non-Probate Will"
    assert _derived_title_variables("non_probate_will")["otherWillType"] == "Probate Will"
    assert "otherWillType" not in _derived_title_variables("single_will")
    # 'Trustee' matches the TypeScript projection (documented mirrors).
    assert _derived_title_variables("single_will")["trusteeTitle"] == "Trustee"


def test_ts_mirror_agrees_on_trustee_title():
    ts = open(os.path.join(
        os.path.dirname(__file__), "..", "..",
        "frontend", "src", "lib", "will-documents", "vault-to-variables.ts",
    ), encoding="utf-8").read()
    assert "v.trusteeTitle = 'Trustee'" in ts
