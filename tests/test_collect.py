import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "collector"))

import backup  # noqa: E402
import collect  # noqa: E402

FIXTURE = ROOT / "tests" / "fixtures" / "sample_events.json"
NOW = datetime(2026, 10, 25, 9, 7, tzinfo=timezone.utc)  # 09:07 UTC -> hour 9


def events():
    return collect.load_fixture(str(FIXTURE))


# --- cadence -------------------------------------------------------------

@pytest.mark.parametrize("hours,hour,expected", [
    (-1, 0, False),     # already started
    (20, 5, True),      # last 48h: every run
    (48, 7, True),
    (100, 9, True),     # 2-7 days out: hours divisible by 3
    (100, 10, False),
    (300, 12, True),    # >7 days: hours divisible by 6
    (300, 9, False),
])
def test_is_due(hours, hour, expected):
    assert collect.is_due(hours, hour) is expected


def test_force_snapshots_everything_upcoming():
    assert collect.is_due(500, 1, force=True)
    assert not collect.is_due(-5, 1, force=True)


# --- parsing -------------------------------------------------------------

def test_parse_time_is_utc():
    dt = collect.parse_time("2026-10-26T02:30:00")
    assert dt == datetime(2026, 10, 26, 2, 30, tzinfo=timezone.utc)


def test_teams_from_performers_and_title():
    ev = events()
    assert collect.teams(ev[0]) == ("Los Angeles Lakers", "Golden State Warriors")
    # no performers: falls back to "Away at Home" title
    assert collect.teams(ev[2]) == ("New York Knicks", "Boston Celtics")


def test_parking_is_filtered():
    ev = events()
    assert not collect.is_nba_game(ev[3])
    assert collect.is_nba_game(ev[0])


# --- full run on the fixture --------------------------------------------

def test_build_rows():
    games, snaps, skipped = collect.build_rows(events(), NOW, force=False)
    assert skipped == 1                                   # parking
    assert sorted(g["id"] for g in games) == [7001, 7002, 7003, 7005]   # duplicate 7001 removed
    # 7001: ~17h out -> due; 7002: ~90h out, hour 9 -> due;
    # 7003: ~423h out, hour 9 -> not due; 7005: already started -> not due
    assert sorted(s["game_id"] for s in snaps) == [7001, 7002]

    lakers = next(s for s in snaps if s["game_id"] == 7001)
    assert lakers["lowest_price"] == 142.5
    assert lakers["lowest_base_price"] == 118.0
    assert lakers["listing_count"] == 812
    assert lakers["captured_at"] == "2026-10-25T09:07:00+00:00"
    assert lakers["hours_to_tip"] == pytest.approx(17.38, abs=0.01)


def test_missing_stats_become_null():
    _, snaps, _ = collect.build_rows(events(), NOW, force=True)
    knicks = next(s for s in snaps if s["game_id"] == 7003)
    assert knicks["average_price"] is None
    assert knicks["visible_listing_count"] is None


# --- Supabase writes (mocked) -------------------------------------------

class FakeResp:
    def __init__(self, status=201, payload=None):
        self.status_code = status
        self._payload = payload or {}
        self.text = json.dumps(self._payload)

    def json(self):
        return self._payload


def test_upsert_sends_conflict_and_chunks(monkeypatch):
    calls = []

    def fake_post(url, headers, data, timeout):
        calls.append((url, headers, json.loads(data)))
        return FakeResp(201)

    monkeypatch.setattr(collect.requests, "post", fake_post)
    rows = [{"game_id": i, "captured_at": "x"} for i in range(1200)]
    collect.supabase_upsert("https://p.supabase.co/", "KEY", "price_snapshots", rows,
                            on_conflict="game_id,captured_at", ignore_duplicates=True)
    assert len(calls) == 3                               # 500 + 500 + 200
    url, headers, body = calls[0]
    assert url == "https://p.supabase.co/rest/v1/price_snapshots?on_conflict=game_id,captured_at"
    assert headers["Prefer"].startswith("resolution=ignore-duplicates")
    assert headers["Authorization"] == "Bearer KEY"
    assert len(body) == 500


def test_upsert_raises_on_error(monkeypatch):
    monkeypatch.setattr(collect.requests, "post", lambda *a, **k: FakeResp(401, {"message": "bad key"}))
    with pytest.raises(RuntimeError):
        collect.supabase_upsert("https://p.supabase.co", "KEY", "games", [{"id": 1}], on_conflict="id")


# --- SeatGeek paging (mocked) -------------------------------------------

def test_fetch_events_pages_until_total(monkeypatch):
    pages = []

    def fake_get(url, params, timeout):
        pages.append(params["page"])
        n = 100 if params["page"] < 3 else 30
        evs = [{"id": params["page"] * 1000 + i} for i in range(n)]
        return FakeResp(200, {"meta": {"total": 230}, "events": evs})

    monkeypatch.setattr(collect.requests, "get", fake_get)
    monkeypatch.setattr(collect.time, "sleep", lambda s: None)
    out = collect.fetch_events("CID", NOW)
    assert pages == [1, 2, 3]
    assert len(out) == 230


# --- backup helpers -------------------------------------------------------

def test_month_bounds_and_previous_month():
    assert backup.month_bounds("2026-12") == ("2026-12-01T00:00:00+00:00", "2027-01-01T00:00:00+00:00")
    assert backup.previous_month(date(2027, 1, 1)) == "2026-12"
    assert backup.previous_month(date(2026, 11, 1)) == "2026-10"
