"""Collect game context for the model: schedule, results, national TV, and injuries.

Two independent parts (one failing doesn't stop the other):

1. Schedule and results from the NBA's public schedule file (cdn.nba.com).
   Every game of the season: tip-off time, teams, arena, final scores, and
   national TV broadcasts. Team records and rest days before each game are
   computed from these results by the `game_context` view in Supabase.

2. Injury report from ESPN's public site API, saved as a daily snapshot so
   the model can see who was listed as out or questionable on each day.

Both sources are unofficial public feeds. Fine for research; check their
terms before using them in a commercial product.

Runs twice a day (GitHub Actions). No API keys needed.

Usage:
    python collector/context.py
    python collector/context.py --dry-run
    python collector/context.py --schedule-fixture tests/fixtures/nba_schedule.json \
        --injury-fixture tests/fixtures/espn_injuries.json --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

from common import BROWSER_HEADERS, get_json, parse_time, supabase_upsert, to_int

SCHEDULE_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json"
INJURIES_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries"
NBA_HEADERS = {**BROWSER_HEADERS, "Referer": "https://www.nba.com/", "Origin": "https://www.nba.com"}

# The first three digits of an NBA game id tell you the kind of game,
# e.g. 0022600001 = regular season (002), 2026-27 season (26), game 00001.
GAME_TYPES = {"001": "preseason", "002": "regular", "003": "all-star", "004": "playoffs",
              "005": "play-in", "006": "cup-final"}


# ---------------------------------------------------------------------------
# Schedule and results
# ---------------------------------------------------------------------------

def national_tv(game: dict) -> str | None:
    """Join every national broadcaster name, e.g. 'ESPN, ABC'."""
    names: list[str] = []
    for key, value in (game.get("broadcasters") or {}).items():
        if not key.lower().startswith("national") or not isinstance(value, list):
            continue
        for b in value:
            name = (b or {}).get("broadcasterDisplay") or (b or {}).get("broadcasterAbbreviation")
            if name and name not in names:
                names.append(name)
    return ", ".join(names) or None


def team_name(team: dict) -> str | None:
    city, name = team.get("teamCity"), team.get("teamName")
    return f"{city} {name}".strip() if city and name else (name or city)


def schedule_rows(data: dict, now: datetime) -> list[dict]:
    rows = []
    for day in (data.get("leagueSchedule") or {}).get("gameDates") or []:
        for g in day.get("games") or []:
            gid = g.get("gameId")
            starts = parse_time(g.get("gameDateTimeUTC"))
            home, away = g.get("homeTeam") or {}, g.get("awayTeam") or {}
            if not gid or not starts or not home.get("teamTricode") or not away.get("teamTricode"):
                continue   # skips placeholders like undecided playoff matchups
            status = to_int(g.get("gameStatus"))
            final = status == 3
            rows.append({
                "game_id": gid,
                "game_type": GAME_TYPES.get(gid[:3], "other"),
                "starts_at": starts.isoformat(),
                "home_tricode": home.get("teamTricode"),
                "away_tricode": away.get("teamTricode"),
                "home_team": team_name(home),
                "away_team": team_name(away),
                "arena": g.get("arenaName"),
                "city": g.get("arenaCity"),
                "state": g.get("arenaState"),
                "national_tv": national_tv(g),
                "status": status,
                "home_score": to_int(home.get("score")) if final else None,
                "away_score": to_int(away.get("score")) if final else None,
                "updated_at": now.isoformat(),
            })
    return rows


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
        data = load(args.schedule_fixture) if args.schedule_fixture else get_json(SCHEDULE_URL, headers=NBA_HEADERS)
        games = schedule_rows(data, now)
        finals = sum(1 for g in games if g["status"] == 3)
        print(f"[{now:%Y-%m-%d %H:%M} UTC] schedule: {len(games)} games ({finals} final)")
        if not args.dry_run:
            supabase_upsert(url, key, "nba_games", games, on_conflict="game_id")
            print(f"  wrote {len(games)} games to Supabase")
    except Exception as exc:  # keep going so injuries still get collected
        failures += 1
        print(f"  schedule failed: {exc}", file=sys.stderr)

    try:
        data = load(args.injury_fixture) if args.injury_fixture else get_json(INJURIES_URL, headers=BROWSER_HEADERS)
        injuries = injury_rows(data, now)
        print(f"[{now:%Y-%m-%d %H:%M} UTC] injuries: {len(injuries)} players listed")
        if not args.dry_run:
            supabase_upsert(url, key, "injury_snapshots", injuries, on_conflict="captured_on,team,player")
            print(f"  wrote {len(injuries)} injury rows to Supabase")
    except Exception as exc:
        failures += 1
        print(f"  injuries failed: {exc}", file=sys.stderr)

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
