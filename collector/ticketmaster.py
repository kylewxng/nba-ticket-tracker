"""Collect NBA ticket price ranges from Ticketmaster's Discovery API.

A second, weaker source alongside SeatGeek. Ticketmaster's `priceRanges` are
mostly face-value (primary) prices and are often missing, but this collector
also captures the full schedule and on-sale status for every NBA game, and it
works with an API key you get instantly.

Runs every 6 hours (GitHub Actions). Each run saves one snapshot per game.

Environment variables:
    TICKETMASTER_API_KEY   "Consumer Key" from developer.ticketmaster.com
    SUPABASE_URL
    SUPABASE_SERVICE_KEY

Usage:
    python collector/ticketmaster.py
    python collector/ticketmaster.py --dry-run
    python collector/ticketmaster.py --fixture tests/fixtures/tm_events.json --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

from common import get_json, parse_time, supabase_upsert, to_float

EVENTS_URL = "https://app.ticketmaster.com/discovery/v2/events.json"
PAGE_SIZE = 200          # Ticketmaster's maximum
MAX_DEPTH = 1000         # Ticketmaster refuses page * size beyond 1,000 results
WINDOW_DAYS = 30         # query one month at a time to stay under that limit
HORIZON_DAYS = 240       # through the end of the playoffs

# Listings that aren't the game itself.
EXCLUDE_WORDS = ("parking", "suite", "package", "premium", "vip", "hospitality",
                 "club access", "experience", "membership", "voucher", "gift card")


def fetch_events(api_key: str, now: datetime) -> list[dict]:
    events: list[dict] = []
    start = now
    end_all = now + timedelta(days=HORIZON_DAYS)
    while start < end_all:
        end = min(start + timedelta(days=WINDOW_DAYS), end_all)
        page = 0
        while True:
            params = {
                "apikey": api_key,
                "classificationName": "NBA",
                "startDateTime": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "endDateTime": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "sort": "date,asc",
                "size": PAGE_SIZE,
                "page": page,
            }
            data = get_json(EVENTS_URL, params=params)
            batch = (data.get("_embedded") or {}).get("events", [])
            events.extend(batch)
            info = data.get("page") or {}
            total_pages = info.get("totalPages", 0)
            page += 1
            time.sleep(0.25)   # stay well under 5 requests per second
            if not batch or page >= total_pages or (page + 1) * PAGE_SIZE > MAX_DEPTH:
                break
        start = end
    return events


def load_fixture(path: str) -> list[dict]:
    with open(path) as f:
        data = json.load(f)
    if isinstance(data, dict):
        return (data.get("_embedded") or {}).get("events", [])
    return data


def is_nba_game(event: dict) -> bool:
    name = (event.get("name") or "").lower()
    if any(word in name for word in EXCLUDE_WORDS):
        return False
    if " vs" not in name and " at " not in name:
        return False
    for c in event.get("classifications") or []:
        if ((c.get("subGenre") or {}).get("name") or "").upper() == "NBA":
            return True
        if ((c.get("genre") or {}).get("name") or "").lower() == "basketball":
            return True
    return False


def teams(event: dict) -> tuple[str | None, str | None]:
    """Ticketmaster names games 'Home vs. Away' (or occasionally 'Away at Home')."""
    name = event.get("name") or ""
    for sep in (" vs. ", " vs ", " v. "):
        if sep in name:
            home, away = name.split(sep, 1)
            return home.strip(), away.strip()
    if " at " in name:
        away, home = name.split(" at ", 1)
        return home.strip(), away.strip()
    attractions = (event.get("_embedded") or {}).get("attractions") or []
    names = [a.get("name") for a in attractions]
    return (names[0] if names else None), (names[1] if len(names) > 1 else None)


def price_range(event: dict) -> tuple[float | None, float | None, str | None, str | None]:
    """Prefer the 'standard' range; fall back to whatever range is listed."""
    ranges = event.get("priceRanges") or []
    if not ranges:
        return None, None, None, None
    chosen = next((r for r in ranges if r.get("type") == "standard"), ranges[0])
    return to_float(chosen.get("min")), to_float(chosen.get("max")), chosen.get("currency"), chosen.get("type")


def event_row(event: dict, now: datetime) -> dict:
    home, away = teams(event)
    starts = parse_time(((event.get("dates") or {}).get("start") or {}).get("dateTime"))
    venues = (event.get("_embedded") or {}).get("venues") or [{}]
    venue = venues[0]
    return {
        "id": event["id"],
        "name": event.get("name"),
        "home_team": home,
        "away_team": away,
        "venue": venue.get("name"),
        "city": (venue.get("city") or {}).get("name"),
        "state": (venue.get("state") or {}).get("stateCode"),
        "starts_at": starts.isoformat() if starts else None,
        "url": event.get("url"),
        "updated_at": now.isoformat(),
    }


def snapshot_row(event: dict, captured_at: datetime) -> dict | None:
    starts = parse_time(((event.get("dates") or {}).get("start") or {}).get("dateTime"))
    if starts is None:
        return None
    lo, hi, currency, kind = price_range(event)
    return {
        "event_id": event["id"],
        "captured_at": captured_at.isoformat(),
        "price_min": lo,
        "price_max": hi,
        "currency": currency,
        "price_type": kind,
        "status": ((event.get("dates") or {}).get("status") or {}).get("code"),
        "hours_to_tip": round((starts - captured_at).total_seconds() / 3600, 2),
    }


def build_rows(events: list[dict], now: datetime) -> tuple[list[dict], list[dict], int]:
    captured_at = now.replace(second=0, microsecond=0)
    out_events, snaps, skipped = [], [], 0
    seen: set[str] = set()
    for ev in events:
        if "id" not in ev or not is_nba_game(ev):
            skipped += 1
            continue
        if ev["id"] in seen:
            continue
        seen.add(ev["id"])
        out_events.append(event_row(ev, now))
        snap = snapshot_row(ev, captured_at)
        if snap and snap["hours_to_tip"] > 0:
            snaps.append(snap)
    return out_events, snaps, skipped


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--fixture")
    parser.add_argument("--now")
    args = parser.parse_args()
    now = parse_time(args.now) if args.now else datetime.now(timezone.utc)

    if args.fixture:
        events = load_fixture(args.fixture)
    else:
        api_key = os.environ.get("TICKETMASTER_API_KEY")
        if not api_key:
            print("TICKETMASTER_API_KEY isn't set yet, so there's nothing to collect. Skipping.")
            return 0
        events = fetch_events(api_key, now)

    rows, snaps, skipped = build_rows(events, now)
    with_price = sum(1 for s in snaps if s["price_min"] is not None)
    print(f"[{now:%Y-%m-%d %H:%M} UTC] Ticketmaster: {len(events)} events -> {len(rows)} NBA games, "
          f"{len(snaps)} snapshots ({with_price} with prices), {skipped} skipped")

    if args.dry_run:
        for s in snaps[:5]:
            print("  sample snapshot:", s)
        return 0

    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set (or use --dry-run).", file=sys.stderr)
        return 1
    supabase_upsert(url, key, "tm_events", rows, on_conflict="id")
    supabase_upsert(url, key, "tm_price_snapshots", snaps, on_conflict="event_id,captured_at", ignore_duplicates=True)
    print(f"  wrote {len(rows)} events and {len(snaps)} snapshots to Supabase")
    return 0


if __name__ == "__main__":
    sys.exit(main())
