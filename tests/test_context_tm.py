import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "collector"))

import backup  # noqa: E402
import common  # noqa: E402
import context  # noqa: E402
import ticketmaster as tm  # noqa: E402

FIX = ROOT / "tests" / "fixtures"
NOW = datetime(2026, 10, 25, 9, 23, tzinfo=timezone.utc)


# --- Ticketmaster -------------------------------------------------------

def test_tm_filters_and_parses():
    events = tm.load_fixture(str(FIX / "tm_events.json"))
    rows, snaps, skipped = tm.build_rows(events, NOW)
    assert skipped == 2                                      # parking + premium package
    assert sorted(r["id"] for r in rows) == ["vvG1A", "vvG2B", "vvG5E", "vvG6F"]
    # vvG6F already tipped off -> event saved, no snapshot
    assert sorted(s["event_id"] for s in snaps) == ["vvG1A", "vvG2B", "vvG5E"]

    lakers = next(r for r in rows if r["id"] == "vvG1A")
    assert (lakers["home_team"], lakers["away_team"]) == ("Los Angeles Lakers", "Golden State Warriors")
    assert lakers["city"] == "Los Angeles" and lakers["state"] == "CA"
    assert lakers["starts_at"] == "2026-10-26T02:30:00+00:00"

    raptors = next(r for r in rows if r["id"] == "vvG5E")
    assert (raptors["home_team"], raptors["away_team"]) == ("Toronto Raptors", "Boston Celtics")


def test_tm_price_range_prefers_standard_and_handles_missing():
    events = tm.load_fixture(str(FIX / "tm_events.json"))
    _, snaps, _ = tm.build_rows(events, NOW)
    by_id = {s["event_id"]: s for s in snaps}
    assert (by_id["vvG1A"]["price_min"], by_id["vvG1A"]["price_max"]) == (89.0, 1450.0)
    assert by_id["vvG1A"]["status"] == "onsale"
    assert by_id["vvG2B"]["price_min"] is None               # no priceRanges listed
    assert by_id["vvG5E"]["currency"] == "CAD"
    assert by_id["vvG1A"]["hours_to_tip"] == pytest.approx(17.12, abs=0.01)


def test_tm_paging_by_month_windows(monkeypatch):
    calls = []

    def fake_get_json(url, params=None, headers=None):
        calls.append((params["startDateTime"], params["page"]))
        if params["page"] == 0:
            return {"_embedded": {"events": [{"id": f"{params['startDateTime']}-a"}]}, "page": {"totalPages": 2}}
        return {"_embedded": {"events": [{"id": f"{params['startDateTime']}-b"}]}, "page": {"totalPages": 2}}

    monkeypatch.setattr(tm, "get_json", fake_get_json)
    monkeypatch.setattr(tm.time, "sleep", lambda s: None)
    out = tm.fetch_events("KEY", NOW)
    windows = sorted({c[0] for c in calls})
    assert len(windows) == 8                                 # 240 days / 30-day windows
    assert len(out) == 16                                    # 2 pages per window


def test_tm_skips_cleanly_without_key(monkeypatch, capsys):
    monkeypatch.delenv("TICKETMASTER_API_KEY", raising=False)
    monkeypatch.setattr(sys, "argv", ["ticketmaster.py"])
    assert tm.main() == 0
    assert "Skipping" in capsys.readouterr().out


# --- Schedule ------------------------------------------------------------

def test_schedule_rows():
    events = context.load(str(FIX / "espn_scoreboard.json"))["events"]
    rows = context.schedule_rows(events, NOW)
    ids = [r["game_id"] for r in rows]
    assert "401820001" not in ids                            # undecided playoff matchup skipped
    assert ids.count("401810030") == 1                       # duplicate event merged
    by_id = {r["game_id"]: r for r in rows}

    opener = by_id["401810001"]
    assert opener["game_type"] == "regular"
    assert opener["starts_at"] == "2026-10-21T02:30:00+00:00"
    assert (opener["home_tricode"], opener["away_tricode"]) == ("LAL", "GS")
    assert opener["home_team"] == "Los Angeles Lakers"
    assert (opener["arena"], opener["city"]) == ("Crypto.com Arena", "Los Angeles")
    assert (opener["home_score"], opener["away_score"]) == (112, 108)
    assert opener["national_tv"] == "TNT"                    # broadcasts + geoBroadcasts merged
    assert opener["status"] == 3

    assert by_id["401809999"]["game_type"] == "preseason"
    assert by_id["401810005"]["game_type"] == "regular"      # falls back to season type number
    assert by_id["401810005"]["national_tv"] is None         # no national broadcast
    upcoming = by_id["401810030"]
    assert upcoming["national_tv"] == "ESPN, ABC"
    assert upcoming["home_score"] is None and upcoming["status"] == 1


def test_season_bounds_and_windows(monkeypatch):
    from datetime import date
    assert context.season_bounds(date(2026, 11, 2)) == (date(2026, 10, 1), date(2027, 6, 30))
    assert context.season_bounds(date(2027, 3, 1)) == (date(2026, 10, 1), date(2027, 6, 30))
    ranges = []

    def fake_get_json(url, params=None, headers=None):
        ranges.append(params["dates"])
        return {"events": [{"id": params["dates"]}]}

    monkeypatch.setattr(context, "get_json", fake_get_json)
    monkeypatch.setattr(context.time, "sleep", lambda s: None)
    out = context.fetch_scoreboard(date(2026, 11, 2))
    assert ranges[0] == "20261001-20261014"
    assert ranges[-1].endswith("-20270630")
    assert len(out) == len(ranges) == 20                     # Oct 1 - Jun 30 in 14-day windows


# --- Injuries -------------------------------------------------------------

def test_injury_rows():
    data = context.load(str(FIX / "espn_injuries.json"))
    rows = context.injury_rows(data, NOW)
    assert len(rows) == 3                                    # player with no name skipped
    one = next(r for r in rows if r["player"] == "Player One")
    assert one["team"] == "Los Angeles Lakers"
    assert one["status"] == "Out"
    assert one["injury"] == "Ankle" and one["detail"] == "Sprain"
    assert one["return_date"] == "2026-11-01"
    assert one["captured_on"] == "2026-10-25"
    three = next(r for r in rows if r["player"] == "Player Three")
    assert three["injury"] == "questionable"                 # falls back to type.description


def test_context_one_part_failing_doesnt_stop_the_other(monkeypatch, capsys):
    def boom(*a, **k):
        raise RuntimeError("blocked")

    monkeypatch.setattr(context, "get_json", boom)
    monkeypatch.setattr(sys, "argv", ["context.py", "--dry-run",
                                      "--injury-fixture", str(FIX / "espn_injuries.json")])
    assert context.main() == 1                               # schedule failed -> nonzero exit
    out = capsys.readouterr().out
    assert "injuries: 3 players listed" in out               # injuries still ran
    assert "::error::Schedule failed" in out                 # shows as an error in GitHub Actions


# --- common + backup ----------------------------------------------------------

def test_parse_time_handles_z_and_naive():
    assert common.parse_time("2026-10-26T02:30:00Z") == datetime(2026, 10, 26, 2, 30, tzinfo=timezone.utc)
    assert common.parse_time("2026-10-26T02:30:00") == datetime(2026, 10, 26, 2, 30, tzinfo=timezone.utc)


class Resp:
    def __init__(self, status, payload=None, text=""):
        self.status_code, self._p, self.text = status, payload, text

    def json(self):
        return self._p


def test_backup_skips_missing_tables(monkeypatch):
    monkeypatch.setattr(backup.requests, "get",
                        lambda *a, **k: Resp(404, text='{"code":"PGRST205","message":"Could not find the table"}'))
    with pytest.raises(backup.MissingTable):
        backup.fetch_all("https://p.supabase.co", "KEY", "tm_events", [], "id.asc")
