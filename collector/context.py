"""Collect game context for the model: schedule, results, national TV, and injuries.

Two independent parts (one failing doesn't stop the other), both from ESPN's
public site API:

1. Schedule and results for the whole season: tip-off time, teams, arena,
   final scores, and national TV broadcasts. Team records and rest days
   before each game are computed from these results by the `game_context`
   view in Supabase. (The NBA's own schedule file blocks GitHub's servers.)

2. Injury report, saved as a daily snapshot so the model can see who was
   listed as out or questionable on each day.

These are unofficial public feeds. Fine for research; check ESPN's terms
before using them in a commercial product.

Runs twice a day (GitHub Actions). No API keys needed.

Usage:
    python collector/context.py
    python collector/context.py --dry-run
    python collector/context.py --schedule-fixture tests/fixtures/espn_scoreboard.json \
        --injury-fixture tests/fixtures/espn_injuries.json --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

from common import BROWSER_HEADERS, get_json, parse_time, supabase_upsert, to_int

SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
INJURIES_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries"
WINDOW_DAYS = 14          # about 100 games per request, well under the limit

# ESPN season types, by slug and by number.
TYPE_BY_SLUG = {"preseason": "preseason", "regular-season": "regular", "post-season": "playoffs",
                "postseason": "playoffs", "play-in": "play-in", "play-in-tournament": "play-in",
                "all-star": "all-star"}
TYPE_BY_NUMBER = {1: "preseason", 2: "regular", 3: "playoffs", 5: "play-in"}


# ---------------------------------------------------------------------------
# Schedule and results
# ---------------------------------------------------------------------------

def season_bounds(today: date) -> tuple[date, date]:
    """The NBA season runs from preseason in October to the Finals in June."""
    start_year = today.year if today.month >= 8 else today.year - 1
    return date(start_year, 10, 1), date(start_year + 1, 6, 30)


def fetch_scoreboard(today: date) -> list[dict]:
    start, end = season_bounds(today)
    events: list[dict] = []
    day = start
    while day <= end:
        stop = min(day + timedelta(days=WINDOW_DAYS - 1), end)
        params = {"dates": f"{day:%Y%m%d}-{stop:%Y%m%d}", "limit": 1000}
        events.extend(get_json(SCOREBOARD_URL, params=params, headers=BROWSER_HEADERS).get("events") or [])
        day = stop + timedelta(days=1)
        time.sleep(0.3)
    return events


def game_type(event: dict) -> str:
    season = event.get("season") or {}
    slug = (season.get("slug") or "").lower()
    if slug in TYPE_BY_SLUG:
        return TYPE_BY_SLUG[slug]
    return TYPE_BY_NUMBER.get(to_int(season.get("type")), "other")


def national_tv(comp: dict) -> str | None:
    """National TV networks for a game, e.g. 'ESPN, ABC'. None if local only."""
    names: list[str] = []
    for b in comp.get("broadcasts") or []:
        if (b.get("market") or "").lower() == "national":
            names.extend(b.get("names") or [])
    for b in comp.get("geoBroadcasts") or []:
        market = ((b.get("market") or {}).get("type") or "").lower()
        kind = ((b.get("type") or {}).get("shortName") or "TV").lower()
        name = (b.get("media") or {}).get("shortName")
        if market == "national" and kind == "tv" and name:
            names.append(name)
    unique = list(dict.fromkeys(n for n in names if n))
    return ", ".join(unique) or None


def game_status(event: dict, comp: dict) -> int:
    """1 scheduled, 2 live, 3 final (same codes as before)."""
    st = ((comp.get("status") or event.get("status") or {}).get("type")) or {}
    if st.get("completed"):
        return 3
    return 2 if st.get("state") == "in" else 1


def schedule_rows(events: list[dict], now: datetime) -> list[dict]:
    rows: dict[str, dict] = {}
    for ev in events:
        comp = (ev.get("competitions") or [{}])[0]
        sides = {c.get("homeAway"): c for c in comp.get("competitors") or []}
        home, away = sides.get("home"), sides.get("away")
        starts = parse_time(ev.get("date") or comp.get("date"))
        if not ev.get("id") or not starts or not home or not away:
            continue
        h_team, a_team = home.get("team") or {}, away.get("team") or {}
        if not h_team.get("abbreviation") or not a_team.get("abbreviation"):
            continue   # undecided playoff matchups
        status = game_status(ev, comp)
        venue = comp.get("venue") or {}
        address = venue.get("address") or {}
        row = {
            "game_id": str(ev["id"]),
            "game_type": game_type(ev),
            "starts_at": starts.isoformat(),
            "home_tricode": h_team.get("abbreviation"),
            "away_tricode": a_team.get("abbreviation"),
            "home_team": h_team.get("displayName"),
            "away_team": a_team.get("displayName"),
            "arena": venue.get("fullName"),
            "city": address.get("city"),
            "state": address.get("state"),
            "national_tv": national_tv(comp),
            "status": status,
            "home_score": to_int(home.get("score")) if status == 3 else None,
            "away_score": to_int(away.get("score")) if status == 3 else None,
            "updated_at": now.isoformat(),
        }
        # If ESPN lists a game twice, a sparser copy shouldn't erase details.
        existing = rows.get(row["game_id"], {})
        rows[row["game_id"]] = {**existing, **{k: v for k, v in row.items() if v is not None}} \
            if existing else row
    return list(rows.values())


# ---------------------------------------------------------------------------
# Injuries
# ---------------------------------------------------------------------------

def injury_rows(data: dict, now: datetime) -> list[dict]:
    captured_on = now.date().isoformat()
    rows: dict[tuple, dict] = {}
    for team in data.get("injuries") or []:
        team_label = team.get("displayName") or (team.get("team") or {}).get("displayName")
        for inj in team.get("injuries") or []:
            athlete = (inj.get("athlete") or {}).get("displayName")
            if not team_label or not athlete:
                continue
            details = inj.get("details") or {}
            rows[(team_label, athlete)] = {
                "captured_on": captured_on,
                "team": team_label,
                "player": athlete,
                "status": inj.get("status"),
                "injury": details.get("type") or (inj.get("type") or {}).get("description"),
                "detail": details.get("detail"),
                "return_date": (details.get("returnDate") or None),
                "short_comment": inj.get("shortComment"),
                "reported_at": inj.get("date"),
            }
    return list(rows.values())


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def load(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--schedule-fixture")
    parser.add_argument("--injury-fixture")
    parser.add_argument("--now")
    args = parser.parse_args()
    now = parse_time(args.now) if args.now else datetime.now(timezone.utc)

    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not args.dry_run and (not url or not key):
        print("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set (or use --dry-run).", file=sys.stderr)
        return 1

    failures = 0

    try:
        events = (load(args.schedule_fixture).get("events") or []) if args.schedule_fixture \
            else fetch_scoreboard(now.date())
        games = schedule_rows(events, now)
        finals = sum(1 for g in games if g["status"] == 3)
        regular = sum(1 for g in games if g["game_type"] == "regular")
        print(f"[{now:%Y-%m-%d %H:%M} UTC] schedule: {len(games)} games ({regular} regular season, {finals} final)")
        if args.dry_run:
            for g in games[:3]:
                print("  sample game:", g)
        else:
            supabase_upsert(url, key, "nba_games", games, on_conflict="game_id")
            print(f"  wrote {len(games)} games to Supabase")
    except Exception as exc:  # keep going so injuries still get collected
        failures += 1
        print(f"::error::Schedule failed: {exc}")

    try:
        data = load(args.injury_fixture) if args.injury_fixture else get_json(INJURIES_URL, headers=BROWSER_HEADERS)
        injuries = injury_rows(data, now)
        print(f"[{now:%Y-%m-%d %H:%M} UTC] injuries: {len(injuries)} players listed")
        if not args.dry_run:
            supabase_upsert(url, key, "injury_snapshots", injuries, on_conflict="captured_on,team,player")
            print(f"  wrote {len(injuries)} injury rows to Supabase")
    except Exception as exc:
        failures += 1
        print(f"::error::Injuries failed: {exc}")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
