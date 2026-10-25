"""Back up one month of price snapshots (plus the games table) to Parquet files.

Runs on the 1st of each month (GitHub Actions) and backs up the previous
month. The workflow then commits the files to the repo, so your history is
safe even if Supabase is paused or its limits change.

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

    snaps = fetch_all(url, key, "price_snapshots",
                      [("captured_at", f"gte.{start}"), ("captured_at", f"lt.{end}")],
                      order="captured_at.asc,game_id.asc")
    games = fetch_all(url, key, "games", [], order="id.asc")

    (OUT_DIR / "snapshots").mkdir(parents=True, exist_ok=True)
    snap_path = OUT_DIR / "snapshots" / f"{month}.parquet"
    games_path = OUT_DIR / "games.parquet"
    pd.DataFrame(snaps).to_parquet(snap_path, index=False)
    pd.DataFrame(games).to_parquet(games_path, index=False)

    print(f"Backed up {len(snaps)} snapshots for {month} -> {snap_path.relative_to(OUT_DIR.parent)}")
    print(f"Backed up {len(games)} games -> {games_path.relative_to(OUT_DIR.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
