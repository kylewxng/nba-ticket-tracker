"""Shared helpers for the collectors: HTTP with retries, UTC parsing, Supabase writes."""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone

import requests

TIMEOUT = 30
WRITE_CHUNK = 500

# Some sports sites reject requests that don't look like a browser.
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
}


def get_json(url: str, params: dict | None = None, headers: dict | None = None,
             attempts: int = 4) -> dict:
    """GET a JSON document, backing off on rate limits and server errors."""
    delay = 2
    for attempt in range(1, attempts + 1):
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=TIMEOUT)
        except requests.RequestException:
            if attempt == attempts:
                raise
            time.sleep(delay)
            delay *= 2
            continue
        if resp.status_code < 400:
            return resp.json()
        if resp.status_code in (429, 500, 502, 503, 504) and attempt < attempts:
            time.sleep(delay)
            delay *= 2
            continue
        resp.raise_for_status()
    raise RuntimeError("unreachable")


def parse_time(value: str | None) -> datetime | None:
    """Parse an ISO timestamp; values without a timezone are treated as UTC."""
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def to_float(value) -> float | None:
    try:
        return None if value is None else round(float(value), 2)
    except (TypeError, ValueError):
        return None


def to_int(value) -> int | None:
    try:
        return None if value is None else int(value)
    except (TypeError, ValueError):
        return None


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


def _headers(key: str, extra: dict | None = None) -> dict:
    h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if extra:
        h.update(extra)
    return h


def supabase_select(base_url: str, key: str, table: str, params: dict | None = None,
                    page_size: int = 1000) -> list[dict]:
    """Read every row matching PostgREST filters in `params`, paging past the 1,000-row cap."""
    url = f"{base_url.rstrip('/')}/rest/v1/{table}"
    rows: list[dict] = []
    start = 0
    while True:
        headers = _headers(key, {"Range-Unit": "items", "Range": f"{start}-{start + page_size - 1}"})
        resp = requests.get(url, headers=headers, params=params or {}, timeout=TIMEOUT)
        if resp.status_code >= 400:
            raise RuntimeError(f"Supabase read from {table} failed ({resp.status_code}): {resp.text[:500]}")
        page = resp.json()
        rows.extend(page)
        if len(page) < page_size:
            return rows
        start += page_size


def supabase_insert(base_url: str, key: str, table: str, rows: list[dict]) -> list[dict]:
    if not rows:
        return []
    url = f"{base_url.rstrip('/')}/rest/v1/{table}"
    resp = requests.post(url, headers=_headers(key, {"Prefer": "return=representation"}),
                         data=json.dumps(rows), timeout=TIMEOUT)
    if resp.status_code >= 400:
        raise RuntimeError(f"Supabase insert into {table} failed ({resp.status_code}): {resp.text[:500]}")
    return resp.json()


def supabase_update(base_url: str, key: str, table: str, match: dict, values: dict) -> None:
    url = f"{base_url.rstrip('/')}/rest/v1/{table}"
    params = {k: f"eq.{v}" for k, v in match.items()}
    resp = requests.patch(url, headers=_headers(key, {"Prefer": "return=minimal"}), params=params,
                          data=json.dumps(values), timeout=TIMEOUT)
    if resp.status_code >= 400:
        raise RuntimeError(f"Supabase update of {table} failed ({resp.status_code}): {resp.text[:500]}")


def supabase_delete(base_url: str, key: str, table: str, params: dict) -> None:
    url = f"{base_url.rstrip('/')}/rest/v1/{table}"
    resp = requests.delete(url, headers=_headers(key, {"Prefer": "return=minimal"}), params=params,
                           timeout=TIMEOUT)
    if resp.status_code >= 400:
        raise RuntimeError(f"Supabase delete from {table} failed ({resp.status_code}): {resp.text[:500]}")
