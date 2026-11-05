"""Build the app's game feed: one row per upcoming Lakers or Clippers home game.

For each game this joins the schedule (nba_games), resale prices (SeatGeek
price_snapshots, falling back to Ticketmaster price ranges), and the latest
injury report, then makes a beta "Buy now / Wait / Watch" call with simple,
explainable rules. The result is upserted into `app_games`, the only table
the app reads.

The rules are a placeholder until the forecast model beats them on held-out
games. Every row is labeled `model = 'rules-beta'` so the app can say so.

Usage:
    python collector/feed.py            # read Supabase, write app_games
    python collector/feed.py --dry-run  # read Supabase, print the rows
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from common import parse_time, supabase_delete, supabase_select, supabase_upsert, to_float, to_int

HOME_TEAMS = {"LAL": "lakers", "LAC": "clippers"}
HORIZON_DAYS = 180
HISTORY_DAYS = 30
BUCKET_HOURS = 3
MATCH_WINDOW = timedelta(hours=6)
LA = ZoneInfo("America/Los_Angeles")

# Opponents that reliably sell out LA games. Kept short on purpose.
MARQUEE = {"GSW", "BOS", "NYK", "LAL", "LAC", "DEN", "PHX", "DAL", "MIL", "PHI"}


# ---------------------------------------------------------------------------
# Price history
# ---------------------------------------------------------------------------

@dataclass
class Point:
    t: datetime
    p: float
    listings: int | None = None


def bucket(points: list[Point], hours: int = BUCKET_HOURS) -> list[Point]:
    """Keep the cheapest price in each `hours`-wide bucket, oldest first."""
    out: dict[int, Point] = {}
    for pt in points:
        key = int(pt.t.timestamp() // (hours * 3600))
        cur = out.get(key)
        if cur is None or pt.p < cur.p:
            out[key] = Point(pt.t, pt.p, pt.listings if pt.listings is not None else (cur.listings if cur else None))
    return [out[k] for k in sorted(out)]


def value_at(points: list[Point], when: datetime, attr: str = "p"):
    """Value of the latest point at or before `when` (None if there isn't one)."""
    best = None
    for pt in points:
        if pt.t <= when and getattr(pt, attr) is not None:
            best = getattr(pt, attr)
    return best


# ---------------------------------------------------------------------------
# Beta verdict rules
# ---------------------------------------------------------------------------

def clamp(x: float, lo: float, hi: float) -> int:
    return int(round(max(lo, min(hi, x))))


def money(x: float) -> str:
    return f"${x:,.0f}"


def decide(points: list[Point], starts_at: datetime, now: datetime, away: str,
           national_tv: str | None, injuries: list[dict]) -> dict:
    """Return the verdict fields for one game. `points` must be oldest first."""
    hours = (starts_at - now).total_seconds() / 3600
    local = starts_at.astimezone(LA)
    weekend = local.weekday() in (4, 5)  # Friday, Saturday
    marquee = away in MARQUEE
    demand = bool(national_tv) or marquee or weekend
    reasons: list[dict] = []

    out_players = [i for i in injuries if (i.get("status") or "").lower() == "out"]
    if out_players:
        names = ", ".join(i["player"] for i in out_players[:2])
        more = f" and {len(out_players) - 2} more" if len(out_players) > 2 else ""
        reasons.append({"kind": "injury", "tone": "wait",
                        "title": f"{len(out_players)} player{'s' if len(out_players) != 1 else ''} listed out",
                        "detail": f"{names}{more}. Stars sitting out usually cools demand."})

    if not points:
        return {
            "verdict": "watch", "headline": "No resale prices yet",
            "odds_label": None, "odds_pct": None, "risk_label": None, "risk_pct": None,
            "range_label": None, "range_low": None, "range_high": None,
            "reasons": reasons or [{"kind": "history", "tone": "watch", "title": "Waiting for listings",
                                    "detail": "Tixcast will start tracking as soon as tickets are listed for resale."}],
        }

    price = points[-1].p
    if len(points) < 6:
        return {
            "verdict": "watch", "headline": "Tracking started. A call needs a few more days of prices.",
            "odds_label": None, "odds_pct": None, "risk_label": None, "risk_pct": None,
            "range_label": "Cheapest so far", "range_low": min(p.p for p in points), "range_high": None,
            "reasons": [{"kind": "history", "tone": "watch", "title": "New to Tixcast",
                         "detail": "We've only seen this game's prices for a short time."}] + reasons,
        }

    low = min(p.p for p in points)
    near_low = price <= low * 1.03
    p72 = value_at(points, now - timedelta(hours=72))
    l72 = value_at(points, now - timedelta(hours=72), "listings")
    l_now = points[-1].listings
    chg = (price / p72 - 1) if p72 else 0.0
    lchg = (l_now / l72 - 1) if (l_now and l72) else None

    buy = wait = 0
    if near_low:
        buy += 2
    if lchg is not None and lchg <= -0.15:
        buy += 2
    if chg >= 0.05:
        buy += 1
    if demand:
        buy += 1
    if hours <= 24 and near_low:
        buy += 2
    if hours > 72:
        wait += 2
    if lchg is not None and lchg >= 0.10:
        wait += 2
    if chg <= -0.05:
        wait += 1
    if not demand:
        wait += 1

    if lchg is not None and abs(lchg) >= 0.10:
        word = "dropped" if lchg < 0 else "up"
        reasons.insert(0, {"kind": "listings", "tone": "buy" if lchg < 0 else "wait",
                           "title": f"Listings {word} {abs(lchg):.0%} in 3 days",
                           "detail": ("Fewer seats for sale usually means higher prices." if lchg < 0 else
                                      "More sellers are competing for the same buyers, which pushes prices down.")})
    if abs(chg) >= 0.05:
        reasons.insert(0, {"kind": "history", "tone": "buy" if chg > 0 else "wait",
                           "title": f"Cheapest seat {'up' if chg > 0 else 'down'} {abs(chg):.0%} in 3 days",
                           "detail": f"It was {money(p72)} on {(now - timedelta(hours=72)).astimezone(LA):%a}." if p72 else ""})
    if national_tv:
        reasons.append({"kind": "calendar", "tone": "buy", "title": f"On national TV ({national_tv.split(',')[0]})",
                        "detail": "Big-audience games usually hold their price close to tip-off."})
    elif marquee:
        reasons.append({"kind": "calendar", "tone": "buy", "title": "High-demand opponent",
                        "detail": "Games against this team usually sell through."})
    elif weekend:
        reasons.append({"kind": "calendar", "tone": "buy", "title": f"{local:%A} night game",
                        "detail": "Weekend games usually see more late buyers."})
    else:
        reasons.append({"kind": "calendar", "tone": "wait", "title": f"{local:%A} game, regular matchup",
                        "detail": "Across the league, weeknight prices tend to drift down in the final 48 hours."})

    gap = abs(buy - wait)
    if buy >= 4 and buy > wait:
        verdict = "buy"
        out = {"headline": "This is close to the low. Prices usually climb from here.",
               "odds_label": "Chance it gets more expensive", "odds_pct": clamp(52 + 6 * gap, 40, 88),
               "risk_label": "Chance it drops another 10%", "risk_pct": clamp(28 - 4 * gap, 5, 40),
               "range_label": "Expected at tip-off", "range_low": price * 1.06, "range_high": price * 1.22}
    elif wait >= 3 and wait > buy and hours > 6:
        verdict = "wait"
        drop = min(0.18, 0.04 + 0.0008 * hours)
        target = price * (1 - drop)
        out = {"headline": "Likely to get cheaper before tip-off.",
               "odds_label": f"Chance it drops below {money(target)}", "odds_pct": clamp(48 + 6 * gap, 35, 85),
               "risk_label": f"Chance it climbs above {money(price * 1.2)}", "risk_pct": clamp(24 - 4 * gap, 5, 40),
               "range_label": "Forecast low", "range_low": price * (1 - drop), "range_high": price * (1 - drop / 2)}
    else:
        verdict = "watch"
        out = {"headline": "No clear move yet. We'll tell you when that changes.",
               "odds_label": "Chance it drops 10% before tip-off", "odds_pct": 40,
               "risk_label": "Chance it climbs 10% before tip-off", "risk_pct": 35,
               "range_label": "Likely at tip-off", "range_low": price * 0.9, "range_high": price * 1.12}

    for k in ("range_low", "range_high"):
        out[k] = round(out[k]) if out[k] is not None else None
    return {"verdict": verdict, **out, "reasons": reasons[:3]}


# ---------------------------------------------------------------------------
# Joining sources
# ---------------------------------------------------------------------------

def nearest(candidates: list[dict], nickname: str, starts_at: datetime, team_key: str = "home_team") -> dict | None:
    best, best_gap = None, MATCH_WINDOW
    for c in candidates:
        if nickname not in (c.get(team_key) or c.get("title") or c.get("name") or "").lower():
            continue
        t = parse_time(c.get("starts_at"))
        if t is None:
            continue
        gap = abs(t - starts_at)
        if gap <= best_gap:
            best, best_gap = c, gap
    return best


CONTEXT_FIELDS = ("home_record", "away_record", "home_rest_days", "away_rest_days",
                  "home_back_to_back", "away_back_to_back")


def context_fields(ctx: dict | None) -> dict:
    """Records and rest going into a game, from the game_context view."""
    if not ctx:
        return {}
    def record(w, l):
        return f"{int(w)}-{int(l)}" if w is not None and l is not None else None
    return {
        "home_record": record(ctx.get("home_wins_before"), ctx.get("home_losses_before")),
        "away_record": record(ctx.get("away_wins_before"), ctx.get("away_losses_before")),
        "home_rest_days": to_float(ctx.get("home_rest_days")),
        "away_rest_days": to_float(ctx.get("away_rest_days")),
        "home_back_to_back": ctx.get("home_back_to_back"),
        "away_back_to_back": ctx.get("away_back_to_back"),
    }


def build_rows(nba: list[dict], sg_games: list[dict], sg_snaps: list[dict], tm_events: list[dict],
               tm_snaps: list[dict], injuries: list[dict], now: datetime,
               contexts: dict[str, dict] | None = None) -> list[dict]:
    snaps_by_sg: dict[int, list[Point]] = {}
    for s in sg_snaps:
        price = to_float(s.get("lowest_price"))
        t = parse_time(s.get("captured_at"))
        if price is None or t is None:
            continue
        snaps_by_sg.setdefault(int(s["game_id"]), []).append(Point(t, price, to_int(s.get("listing_count"))))
    snaps_by_tm: dict[str, list[Point]] = {}
    for s in tm_snaps:
        price = to_float(s.get("price_min"))
        t = parse_time(s.get("captured_at"))
        if price is None or t is None:
            continue
        snaps_by_tm.setdefault(s["event_id"], []).append(Point(t, price))

    injuries_by_team: dict[str, list[dict]] = {}
    latest_day = max((i["captured_on"] for i in injuries), default=None)
    for i in injuries:
        if i["captured_on"] == latest_day:
            injuries_by_team.setdefault((i.get("team") or "").lower(), []).append(i)

    rows = []
    for g in nba:
        home = g["home_tricode"]
        if home not in HOME_TEAMS:
            continue
        starts_at = parse_time(g["starts_at"])
        if starts_at is None or starts_at < now - timedelta(hours=3) or g.get("status") == 3:
            continue
        nick = HOME_TEAMS[home]

        points: list[Point] = []
        source = url = None
        sg = nearest(sg_games, nick, starts_at)
        if sg and snaps_by_sg.get(int(sg["id"])):
            points, source, url = snaps_by_sg[int(sg["id"])], "seatgeek", sg.get("url")
        tm = nearest(tm_events, nick, starts_at)
        if not points and tm and snaps_by_tm.get(tm["id"]):
            points, source = snaps_by_tm[tm["id"]], "ticketmaster"
        if url is None:
            url = (tm or {}).get("url") or (sg or {}).get("url")
        if url is None and sg is None and tm is None:
            source = None
        points = bucket(sorted(points, key=lambda p: p.t))
        points = [p for p in points if p.t >= now - timedelta(days=HISTORY_DAYS)]

        game_injuries = []
        for team_name in (g.get("home_team"), g.get("away_team")):
            for i in injuries_by_team.get((team_name or "").lower(), []):
                game_injuries.append({"team": home if team_name == g.get("home_team") else g["away_tricode"],
                                      "player": i["player"], "status": i.get("status"),
                                      "comment": i.get("short_comment")})

        call = decide(points, starts_at, now, g["away_tricode"], g.get("national_tv"), game_injuries)
        rows.append({
            "game_id": g["game_id"],
            "starts_at": starts_at.isoformat(),
            "home_tricode": home,
            "away_tricode": g["away_tricode"],
            "home_team": g.get("home_team"),
            "away_team": g.get("away_team"),
            "arena": g.get("arena"),
            "national_tv": g.get("national_tv"),
            "price_now": points[-1].p if points else None,
            "price_source": source if points else None,
            "buy_url": url,
            "listing_count": points[-1].listings if points else None,
            "history": [{"t": p.t.isoformat(), "p": p.p} for p in points],
            "injuries": game_injuries,
            "model": "rules-beta",
            "updated_at": now.isoformat(),
            **context_fields((contexts or {}).get(g["game_id"])),
            **call,
        })
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("::error::SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        return 1

    now = datetime.now(timezone.utc)
    since = (now - timedelta(hours=3)).isoformat()
    until = (now + timedelta(days=HORIZON_DAYS)).isoformat()
    hist = (now - timedelta(days=HISTORY_DAYS + 1)).isoformat()
    window = {"and": f"(starts_at.gte.{since},starts_at.lte.{until})"}

    nba = supabase_select(url, key, "nba_games", {**window, "home_tricode": "in.(LAL,LAC)", "order": "starts_at"})
    sg_games = supabase_select(url, key, "games", window)
    sg_ids = [str(g["id"]) for g in sg_games]
    sg_snaps = []
    for i in range(0, len(sg_ids), 100):
        sg_snaps += supabase_select(url, key, "price_snapshots", {
            "game_id": f"in.({','.join(sg_ids[i:i + 100])})", "captured_at": f"gte.{hist}",
            "select": "game_id,captured_at,lowest_price,listing_count"})
    try:
        tm_events = supabase_select(url, key, "tm_events", window)
        tm_ids = [e["id"] for e in tm_events]
        tm_snaps = []
        for i in range(0, len(tm_ids), 100):
            tm_snaps += supabase_select(url, key, "tm_price_snapshots", {
                "event_id": f"in.({','.join(tm_ids[i:i + 100])})", "captured_at": f"gte.{hist}",
                "select": "event_id,captured_at,price_min"})
    except RuntimeError as exc:
        print(f"::warning::Skipping Ticketmaster prices: {exc}")
        tm_events, tm_snaps = [], []
    injuries = supabase_select(url, key, "injury_snapshots", {
        "captured_on": f"gte.{(now - timedelta(days=2)).date().isoformat()}"})

    contexts: dict[str, dict] = {}
    ids = [g["game_id"] for g in nba]
    try:
        for i in range(0, len(ids), 100):
            for c in supabase_select(url, key, "game_context", {"game_id": f"in.({','.join(ids[i:i + 100])})"}):
                contexts[c["game_id"]] = c
    except RuntimeError as exc:
        print(f"::warning::Skipping records and rest days: {exc}")

    rows = build_rows(nba, sg_games, sg_snaps, tm_events, tm_snaps, injuries, now, contexts)
    priced = sum(1 for r in rows if r["price_now"] is not None)
    print(f"{len(rows)} upcoming LA home games, {priced} with prices "
          f"({sum(r['verdict'] == 'buy' for r in rows)} buy, {sum(r['verdict'] == 'wait' for r in rows)} wait).")
    if not rows:
        print("::warning::No upcoming Lakers or Clippers home games found. Has context.py run?")
    if args.dry_run:
        print(json.dumps(rows[:3], indent=2, default=str))
        return 0
    try:
        supabase_upsert(url, key, "app_games", rows, on_conflict="game_id")
    except RuntimeError as exc:
        if "PGRST204" not in str(exc):
            raise
        # sql/game-day.sql hasn't been run yet: write the feed without the new columns.
        print("::warning::app_games is missing the game-day columns. Run sql/game-day.sql in Supabase.")
        supabase_upsert(url, key, "app_games", [{k: v for k, v in r.items() if k not in CONTEXT_FIELDS} for r in rows],
                        on_conflict="game_id")
    supabase_delete(url, key, "app_games", {"starts_at": f"lt.{(now - timedelta(days=2)).isoformat()}"})
    return 0


if __name__ == "__main__":
    sys.exit(main())
