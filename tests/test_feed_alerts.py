import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "collector"))

from alerts import compose, evaluate  # noqa: E402
from feed import Point, bucket, build_rows, decide  # noqa: E402

NOW = datetime(2026, 11, 4, 20, 0, tzinfo=timezone.utc)


def series(prices, listings=None, step_h=6):
    start = NOW - timedelta(hours=step_h * (len(prices) - 1))
    return [Point(start + timedelta(hours=step_h * i), p, (listings or [None] * len(prices))[i])
            for i, p in enumerate(prices)]


def test_no_prices_is_watch():
    out = decide([], NOW + timedelta(days=5), NOW, "SAC", None, [])
    assert out["verdict"] == "watch" and out["odds_pct"] is None


def test_short_history_is_watch():
    out = decide(series([80, 78, 79]), NOW + timedelta(days=5), NOW, "SAC", None, [])
    assert out["verdict"] == "watch"
    assert "few more days" in out["headline"]


def test_far_out_rising_supply_is_wait():
    # Tuesday game 10 days out, prices sliding and more listings appearing.
    pts = series([120, 118, 116, 112, 110, 105, 100], [400, 410, 430, 450, 470, 480, 500])
    out = decide(pts, datetime(2026, 11, 17, 3, 30, tzinfo=timezone.utc), NOW, "SAC", None, [])
    assert out["verdict"] == "wait"
    assert out["range_low"] < 100 and out["odds_pct"] >= 35


def test_near_low_shrinking_supply_close_to_tip_is_buy():
    pts = series([150, 140, 130, 125, 122, 120, 121], [300, 280, 250, 220, 200, 180, 170])
    out = decide(pts, NOW + timedelta(hours=20), NOW, "GSW", "ESPN", [])
    assert out["verdict"] == "buy"
    assert out["range_low"] > 121
    assert len(out["reasons"]) <= 3


def test_bucket_keeps_cheapest():
    t = NOW
    pts = [Point(t, 100), Point(t + timedelta(minutes=30), 90), Point(t + timedelta(hours=4), 95)]
    assert [p.p for p in bucket(pts)] == [90, 95]


def test_build_rows_matches_seatgeek_by_team_and_time():
    nba = [{"game_id": "0022600100", "starts_at": "2026-11-10T03:30:00+00:00", "home_tricode": "LAL",
            "away_tricode": "SAS", "home_team": "Los Angeles Lakers", "away_team": "San Antonio Spurs",
            "arena": "Crypto.com Arena", "national_tv": None, "status": 1},
           {"game_id": "0022600101", "starts_at": "2026-11-10T03:00:00+00:00", "home_tricode": "BOS",
            "away_tricode": "NYK", "status": 1}]
    sg = [{"id": 555, "home_team": "Los Angeles Lakers", "starts_at": "2026-11-10T03:30:00Z", "url": "https://seatgeek.com/x"}]
    snaps = [{"game_id": 555, "captured_at": (NOW - timedelta(hours=h)).isoformat(), "lowest_price": 90 + h,
              "listing_count": 300} for h in range(0, 48, 6)]
    rows = build_rows(nba, sg, snaps, [], [], [], NOW)
    assert len(rows) == 1
    r = rows[0]
    assert r["price_now"] == 90 and r["price_source"] == "seatgeek" and r["buy_url"] == "https://seatgeek.com/x"
    assert r["history"][0]["p"] > r["history"][-1]["p"]


def game(price, verdict="wait", hours=48):
    return {"game_id": "g1", "starts_at": (NOW + timedelta(hours=hours)).isoformat(), "price_now": price,
            "verdict": verdict, "home_tricode": "LAL", "away_tricode": "GSW",
            "home_team": "Los Angeles Lakers", "away_team": "Golden State Warriors", "headline": "Close to the low."}


def test_target_fires_once_then_rearms():
    alert = {"target_price": 125, "on_buy_signal": False}
    fire, upd = evaluate(alert, game(120), NOW)
    assert fire == ["target_hit"] and upd["target_fired_at"]
    alert["target_fired_at"] = upd["target_fired_at"]
    assert evaluate(alert, game(119), NOW) == ([], {})
    fire, upd = evaluate(alert, game(140), NOW)
    assert fire == [] and upd == {"target_fired_at": None}


def test_buy_signal_and_started_games():
    fire, _ = evaluate({"target_price": None, "on_buy_signal": True}, game(150, "buy"), NOW)
    assert fire == ["buy_signal"]
    assert evaluate({"target_price": 200, "on_buy_signal": True}, game(150, "buy", hours=-1), NOW) == ([], {})


def test_compose_mentions_price_and_matchup():
    title, body = compose("target_hit", game(120), {"target_price": 125})
    assert title == "Warriors at Lakers hit your price"
    assert "$120" in body and "$125" in body
