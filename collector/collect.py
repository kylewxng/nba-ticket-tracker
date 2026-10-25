"""Collect NBA resale ticket prices from SeatGeek and store them in Supabase.

Runs every hour (GitHub Actions). Each run fetches every upcoming NBA game,
updates the games table, and saves a price snapshot for each game that is
"due" based on how close it is to tip-off:

    more than 7 days away  -> every 6 hours
    2 to 7 days away       -> every 3 hours
    last 48 hours          -> every hour

Environment variables:
    SEATGEEK_CLIENT_ID     required unless --fixture is used
    SUPABASE_URL           e.g. https://abcd1234.supabase.co
    SUPABASE_SERVICE_KEY   the service_role key (keep it secret)

Usage:
    python collector/collect.py                 # normal run
    python collector/collect.py --force         # snapshot every game now
    python collector/collect.py --dry-run       # fetch and print, write nothing
    python collector/collect.py --fixture tests/fixtures/sample_events.json --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone

import requests

SEATGEEK_EVENTS_URL = "https://api.seatgeek.com/2/events"
PER_PAGE = 100
MAX_PAGES = 40          # safety cap: 4,000 events is far more than one NBA season
WRITE_CHUNK = 500
TIMEOUT = 30


# ---------------------------------------------------------------------------
# Fetching
# ---------------------------------------------------------------------------

def _get_with_retry(url: str, params: dict, attempts: int = 4) -> requests.Response:
    """GET with exponential backoff on rate limits and server errors."""
    delay = 2
    for attempt in range(1, attempts + 1):
        resp = requests.get(url, params=params, timeout=TIMEOUT)
        if resp.status_code < 400:
            return resp
        if resp.status_code in (429, 500, 502, 503, 504) and attempt < attempts:
            time.sleep(delay)
            delay *= 2
            continue
        resp.raise_for_status()
    return resp  # unreachable, keeps type checkers happy


def fetch_events(client_id: str, now: datetime) -> list[dict]:
    """Fetch every upcoming NBA event from SeatGeek, page by page."""
    events: list[dict] = []
    for page in range(1, MAX_PAGES + 1):
        params = {
            "client_id": client_id,
            "taxonomies.name": "nba",
            "datetime_utc.gte": now.strftime("%Y-%m-%dT%H:%M:%S"),
            "sort": "datetime_utc.asc",
            "per_page": PER_PAGE,
            "page": page,
        }
        data = _get_with_retry(SEATGEEK_EVENTS_URL, params).json()
        batch = data.get("events", [])
        events.extend(batch)
        total = (data.get("meta") or {}).get("total", 0)
        if not batch or page * PER_PAGE >= total:
            break
        time.sleep(0.5)  # be polite to the API
    return events


def load_fixture(path: str) -> list[dict]:
    with open(path) as f:
        data = json.load(f)
    return data.get("events", data) if isinstance(data, dict) else data


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

def parse_time(value: str | None) -> datetime | None:
    """SeatGeek returns UTC times without a timezone, like 2026-11-02T03:30:00."""
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace("Z", ""))
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def is_nba_game(event: dict) -> bool:
    """Keep real NBA games; drop parking passes and other add-on listings."""
    title = (event.get("title") or "").lower()
    if "parking" in title:
        return False
    if event.get("type") == "nba":
        return True
    return any((t or {}).get("name") == "nba" for t in event.get("taxonomies") or [])


def teams(event: dict) -> tuple[str | None, str | None]:
    """Return (home_team, away_team), using performer flags or the title."""
    home = away = None
    for p in event.get("performers") or []:
        if p.get("home_team"):
            home = p.get("name")
        elif p.get("away_team"):
            away = p.get("name")
    if home and away:
        return home, away
    title = event.get("title") or ""
    for sep in (" at ", " vs. ", " vs "):
        if sep in title:
            left, right = title.split(sep, 1)
            # "Away at Home" for " at ", "Home vs. Away" otherwise
            return (right.strip(), left.strip()) if sep == " at " else (left.strip(), right.strip())
    return home, away


def to_price(value) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), 2)
    except (TypeError, ValueError):
        return None


def to_int(value) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def game_row(event: dict, now: datetime) -> dict:
    venue = event.get("venue") or {}
    home, away = teams(event)
    starts = parse_time(event.get("datetime_utc"))
    return {
        "id": int(event["id"]),
        "title": event.get("title"),
        "home_team": home,
        "away_team": away,
        "venue": venue.get("name"),
        "city": venue.get("city"),
        "state": venue.get("state"),
        "starts_at": starts.isoformat() if starts else None,
        "time_tbd": bool(event.get("time_tbd") or event.get("datetime_tbd")),
        "url": event.get("url"),
        "updated_at": now.isoformat(),
    }


def snapshot_row(event: dict, captured_at: datetime) -> dict | None:
    starts = parse_time(event.get("datetime_utc"))
    if starts is None:
        return None
    stats = event.get("stats") or {}
    return {
        "game_id": int(event["id"]),
        "captured_at": captured_at.isoformat(),
        "lowest_price": to_price(stats.get("lowest_price")),
        "lowest_base_price": to_price(stats.get("lowest_sg_base_price")),
        "median_price": to_price(stats.get("median_price")),
        "average_price": to_price(stats.get("average_price")),
        "highest_price": to_price(stats.get("highest_price")),
        "listing_count": to_int(stats.get("listing_count")),
        "visible_listing_count": to_int(stats.get("visible_listing_count")),
        "hours_to_tip": round((starts - captured_at).total_seconds() / 3600, 2),
    }


# ---------------------------------------------------------------------------
# Cadence
# ---------------------------------------------------------------------------

def is_due(hours_to_tip: float, run_hour_utc: int, force: bool = False) -> bool:
    """Decide whether this game gets a snapshot on this hourly run."""
    if hours_to_tip <= 0:
        return False                      # game already started
    if force or hours_to_tip <= 48:
        return True                       # last 48h: every run (hourly)
    if hours_to_tip <= 7 * 24:
        return run_hour_utc % 3 == 0      # 2-7 days out: every 3 hours
    return run_hour_utc % 6 == 0          # further out: every 6 hours


# ---------------------------------------------------------------------------
# Supabase (REST, no extra client library needed)
# ---------------------------------------------------------------------------

def supabase_upsert(base_url: str, key: str, table: str, rows: list[dict],
                    on_conflict: str, ignore_duplicates: bool = False) -> None:
    if not rows:
        return
    resolution = "ignore-duplicates" if ignore_duplicates else "merge-duplicates"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": f"resolution={resolution},return=minimal",
    }
    url = f"{base_url.rstrip('/')}/rest/v1/{table}?on_conflict={on_conflict}"
    for i in range(0, len(rows), WRITE_CHUNK):
        chunk = rows[i:i + WRITE_CHUNK]
        resp = requests.post(url, headers=headers, data=json.dumps(chunk), timeout=TIMEOUT)
        if resp.status_code >= 400:
            raise RuntimeError(f"Supabase write to {table} failed ({resp.status_code}): {resp.text[:500]}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def build_rows(events: list[dict], now: datetime, force: bool) -> tuple[list[dict], list[dict], int]:
    captured_at = now.replace(second=0, microsecond=0)
    games, snapshots, skipped = [], [], 0
    seen: set[int] = set()
    for ev in events:
        if not is_nba_game(ev) or "id" not in ev:
            skipped += 1
            continue
        gid = int(ev["id"])
        if gid in seen:
            continue
        seen.add(gid)
        games.append(game_row(ev, now))
        snap = snapshot_row(ev, captured_at)
        if snap and is_due(snap["hours_to_tip"], captured_at.hour, force):
            snapshots.append(snap)
    return games, snapshots, skipped


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true", help="snapshot every upcoming game this run")
    parser.add_argument("--dry-run", action="store_true", help="fetch and summarize, but write nothing")
    parser.add_argument("--fixture", help="read events from a JSON file instead of the SeatGeek API")
    parser.add_argument("--now", help="override the current UTC time (ISO format), for testing")
    args = parser.parse_args()

    now = parse_time(args.now) if args.now else datetime.now(timezone.utc)

    if args.fixture:
        events = load_fixture(args.fixture)
    else:
        client_id = os.environ.get("SEATGEEK_CLIENT_ID")
        if not client_id:
            print("SEATGEEK_CLIENT_ID is not set.", file=sys.stderr)
            return 1
        events = fetch_events(client_id, now)

    games, snapshots, skipped = build_rows(events, now, args.force)
    print(f"[{now:%Y-%m-%d %H:%M} UTC] fetched {len(events)} events -> "
          f"{len(games)} NBA games, {len(snapshots)} snapshots due, {skipped} skipped")

    if args.dry_run:
        for s in snapshots[:5]:
            print("  sample snapshot:", s)
        return 0

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set (or use --dry-run).", file=sys.stderr)
        return 1

    supabase_upsert(url, key, "games", games, on_conflict="id")
    supabase_upsert(url, key, "price_snapshots", snapshots,
                    on_conflict="game_id,captured_at", ignore_duplicates=True)
    print(f"  wrote {len(games)} games and {len(snapshots)} snapshots to Supabase")
    return 0


if __name__ == "__main__":
    sys.exit(main())
