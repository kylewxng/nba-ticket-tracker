"""Back up one month of collected data to Parquet files in the repo.

Runs on the 1st of each month (GitHub Actions) and backs up the previous
month. The workflow then commits the files, so your history is safe even if
Supabase is paused or its limits change.

  data/<table>/YYYY-MM.parquet   time-stamped tables, one file per month
  data/<table>.parquet           small reference tables, full copy each time

Tables that don't exist yet (for example, if you haven't run context.sql)
are skipped with a note instead of failing the backup.

Usage:
    python collector/backup.py                  # previous month
    python collector/backup.py --month 2026-11  # a specific month
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd
import requests

PAGE = 1000          # Supabase's default max rows per request
TIMEOUT = 60
OUT_DIR = Path(__file__).resolve().parent.parent / "data"

# (table, time column used to slice by month, sort order)
MONTHLY = [
    ("price_snapshots", "captured_at", "captured_at.asc,game_id.asc"),
    ("tm_price_snapshots", "captured_at", "captured_at.asc,event_id.asc"),
    ("injury_snapshots", "captured_on", "captured_on.asc,team.asc,player.asc"),
]
# (table, sort order): copied in full every month
FULL = [
    ("games", "id.asc"),
    ("tm_events", "id.asc"),
    ("nba_games", "game_id.asc"),
]


class MissingTable(Exception):
    pass


def month_bounds(month: str) -> tuple[str, str]:
    start = datetime.strptime(month, "%Y-%m").replace(tzinfo=timezone.utc)
    end = start.replace(year=start.year + 1, month=1) if start.month == 12 else start.replace(month=start.month + 1)
    return start.isoformat(), end.isoformat()


def previous_month(today: date) -> str:
    year, month = (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)
    return f"{year:04d}-{month:02d}"


def fetch_all(base_url: str, key: str, table: str, filters: list[tuple[str, str]], order: str) -> list[dict]:
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    url = f"{base_url.rstrip('/')}/rest/v1/{table}"
    rows: list[dict] = []
    offset = 0
    while True:
        params = [("select", "*"), ("order", order), ("limit", str(PAGE)), ("offset", str(offset)), *filters]
        resp = requests.get(url, headers=headers, params=params, timeout=TIMEOUT)
        missing_markers = ("PGRST205", "Could not find the table", "does not exist")
        if resp.status_code == 404 or (resp.status_code >= 400 and any(m in resp.text for m in missing_markers)):
            raise MissingTable(table)
        if resp.status_code >= 400:
            raise RuntimeError(f"Read from {table} failed ({resp.status_code}): {resp.text[:500]}")
        batch = resp.json()
        rows.extend(batch)
        if len(batch) < PAGE:
            return rows
        offset += PAGE


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--month", help="month to back up, as YYYY-MM (default: previous month)")
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.", file=sys.stderr)
        return 1

    month = args.month or previous_month(datetime.now(timezone.utc).date())
    start, end = month_bounds(month)

    for table, col, order in MONTHLY:
        lo, hi = (start[:10], end[:10]) if col == "captured_on" else (start, end)
        try:
            rows = fetch_all(url, key, table, [(col, f"gte.{lo}"), (col, f"lt.{hi}")], order)
        except MissingTable:
            print(f"Skipped {table}: table doesn't exist yet")
            continue
        path = OUT_DIR / table / f"{month}.parquet"
        path.parent.mkdir(parents=True, exist_ok=True)
        pd.DataFrame(rows).to_parquet(path, index=False)
        print(f"Backed up {len(rows)} rows of {table} for {month} -> {path.relative_to(OUT_DIR.parent)}")

    for table, order in FULL:
        try:
            rows = fetch_all(url, key, table, [], order)
        except MissingTable:
            print(f"Skipped {table}: table doesn't exist yet")
            continue
        path = OUT_DIR / f"{table}.parquet"
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        pd.DataFrame(rows).to_parquet(path, index=False)
        print(f"Backed up {len(rows)} rows of {table} -> {path.relative_to(OUT_DIR.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
