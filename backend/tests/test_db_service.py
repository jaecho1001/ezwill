from services.db import EWDbWriter


def test_create_draft_persists_province(monkeypatch):
    writer = EWDbWriter("firm_test")
    captured = {}

    def fake_fetchone(query, params=None):
        captured["query"] = query
        captured["params"] = params
        return {"province": params[-1]}

    monkeypatch.setattr(writer, "fetchone", fake_fetchone)
    result = writer.create_draft("Ada", "Lovelace", language="en", province="BC")

    assert "province" in captured["query"]
    assert captured["params"][-1] == "BC"
    assert result["province"] == "BC"


def test_count_drafts_uses_filtered_database_count(monkeypatch):
    writer = EWDbWriter("firm_test")
    captured = {}

    def fake_fetchone(query, params=None):
        captured["query"] = query
        captured["params"] = params
        return {"total": 137}

    monkeypatch.setattr(writer, "fetchone", fake_fetchone)

    assert writer.count_drafts(status="submitted") == 137
    assert "COUNT(*)" in captured["query"]
    assert captured["params"] == ("submitted",)


def test_count_drafts_without_filter(monkeypatch):
    writer = EWDbWriter("firm_test")
    monkeypatch.setattr(writer, "fetchone", lambda query, params=None: {"total": 251})

    assert writer.count_drafts() == 251
