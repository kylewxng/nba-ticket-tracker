"""Check every active price alert against the latest feed and notify people.

An alert has up to two conditions:
  * target hit: the cheapest ticket is at or below the person's target price
  * buy signal: Tixcast's call for the game turned to Buy now

Watched games also get one "first call is ready" notification when a game
gets its first Buy now / Wait / Watch call.

Each price condition fires once, then re-arms only after it stops being true
(price back above target by 5%, or the call moves off Buy now), so nobody
gets the same alert every 30 minutes.

Notifications go out by web push (VAPID) when the person has a push
subscription and chose push, otherwise by email through Resend.

Env:
    SUPABASE_URL, SUPABASE_SERVICE_KEY        required
    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
    VAPID_SUBJECT (mailto:you@example.com)    for push
    RESEND_API_KEY, ALERT_FROM_EMAIL          for email
    APP_URL (default https://tixcast.app)

Usage:
    python collector/alerts.py
    python collector/alerts.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import requests

from common import (TIMEOUT, parse_time, supabase_delete, supabase_insert, supabase_select,
                    supabase_update, to_float)

LA = ZoneInfo("America/Los_Angeles")
REARM_MARGIN = 1.05


def evaluate(alert: dict, game: dict, now: datetime) -> tuple[list[str], dict]:
    """Return (conditions that fire now, field updates for the alert row)."""
    fire: list[str] = []
    updates: dict = {}
    starts_at = parse_time(game.get("starts_at"))
    if starts_at is None or starts_at <= now:
        return fire, updates
    price = to_float(game.get("price_now"))
    target = to_float(alert.get("target_price"))

    if target is not None and price is not None:
        if price <= target and not alert.get("target_fired_at"):
            fire.append("target_hit")
            updates["target_fired_at"] = now.isoformat()
        elif price > target * REARM_MARGIN and alert.get("target_fired_at"):
            updates["target_fired_at"] = None

    if alert.get("on_buy_signal"):
        if game.get("verdict") == "buy" and not alert.get("buy_fired_at"):
            fire.append("buy_signal")
            updates["buy_fired_at"] = now.isoformat()
        elif game.get("verdict") != "buy" and alert.get("buy_fired_at"):
            updates["buy_fired_at"] = None
    return fire, updates


def game_title(game: dict) -> str:
    away = (game.get("away_team") or game["away_tricode"]).split()[-1]
    home = (game.get("home_team") or game["home_tricode"]).split()[-1]
    return f"{away} at {home}"


def compose(kind: str, game: dict, alert: dict) -> tuple[str, str]:
    price = to_float(game.get("price_now"))
    when = parse_time(game["starts_at"]).astimezone(LA)
    date = f"{when:%a, %b} {when.day}"
    title = game_title(game)
    if kind == "target_hit":
        return (f"{title} hit your price",
                f"Cheapest ticket is ${price:,.0f}, at or below your ${to_float(alert['target_price']):,.0f} target. {date}.")
    return (f"Tixcast says Buy now: {title}",
            f"${price:,.0f} for the cheapest ticket. {game.get('headline') or ''} {date}.".strip())


def send_push(sub: dict, payload: dict) -> str:
    """Return 'sent', 'gone' (subscription expired), or 'failed'."""
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        return "failed"
    try:
        webpush(
            subscription_info={"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
            data=json.dumps(payload),
            vapid_private_key=os.environ["VAPID_PRIVATE_KEY"],
            vapid_claims={"sub": os.environ.get("VAPID_SUBJECT", "mailto:alerts@tixcast.app")},
            ttl=3600,
        )
        return "sent"
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        return "gone" if status in (404, 410) else "failed"


def user_email(base: str, key: str, user_id: str) -> str | None:
    resp = requests.get(f"{base.rstrip('/')}/auth/v1/admin/users/{user_id}",
                        headers={"apikey": key, "Authorization": f"Bearer {key}"}, timeout=TIMEOUT)
    return resp.json().get("email") if resp.ok else None


def send_email(to: str, subject: str, body: str, link: str) -> bool:
    api_key, sender = os.environ.get("RESEND_API_KEY"), os.environ.get("ALERT_FROM_EMAIL")
    if not api_key or not sender:
        return False
    html = (f"<p style=\"font:16px/1.5 system-ui,sans-serif;color:#0F1B33\">{body}</p>"
            f"<p><a href=\"{link}\" style=\"font:600 16px system-ui,sans-serif;color:#2388CC\">View the game</a></p>"
            "<p style=\"font:12px system-ui,sans-serif;color:#8593AB\">You're getting this because you set a price alert on Tixcast. "
            "Turn alerts off any time from the Alerts tab.</p>")
    resp = requests.post("https://api.resend.com/emails", timeout=TIMEOUT,
                         headers={"Authorization": f"Bearer {api_key}"},
                         json={"from": sender, "to": [to], "subject": subject, "html": html, "text": f"{body}\n\n{link}"})
    return resp.ok


def has_call(game: dict) -> bool:
    """A game has a real call once it has prices and enough history for odds."""
    return game.get("price_now") is not None and game.get("odds_pct") is not None


VERDICT_WORD = {"buy": "Buy now", "wait": "Wait", "watch": "Watch"}


def compose_call_ready(game: dict) -> tuple[str, str]:
    when = parse_time(game["starts_at"]).astimezone(LA)
    verdict = VERDICT_WORD.get(game.get("verdict"), "Watch")
    price = to_float(game.get("price_now"))
    return (f"First call for {game_title(game)}: {verdict}",
            f"Cheapest ticket is ${price:,.0f}. {game.get('headline') or ''} {when:%a, %b} {when.day}.".replace("  ", " ").strip())


class Notifier:
    """Sends one notification by push (preferred) or email, and cleans up dead push subscriptions."""

    def __init__(self, base: str, key: str, subs: dict[str, list[dict]], push_ready: bool, dry_run: bool):
        self.base, self.key, self.subs, self.push_ready, self.dry_run = base, key, subs, push_ready, dry_run
        self.emails: dict[str, str | None] = {}

    def send(self, user_id: str, title: str, body: str, link: str, tag: str, prefer_push: bool = True,
             allow_email: bool = True) -> tuple[str | None, bool]:
        if self.dry_run:
            print(f"[dry run] {user_id[:8]}: {title} / {body}")
            return None, False
        channel, delivered = None, False
        if prefer_push and self.push_ready and self.subs.get(user_id):
            channel = "push"
            for sub in self.subs[user_id]:
                result = send_push(sub, {"title": title, "body": body, "url": link, "tag": tag})
                delivered = delivered or result == "sent"
                if result == "gone":
                    supabase_delete(self.base, self.key, "push_subscriptions", {"id": f"eq.{sub['id']}"})
        if not delivered and allow_email:
            if user_id not in self.emails:
                self.emails[user_id] = user_email(self.base, self.key, user_id)
            if self.emails[user_id]:
                channel = "email"
                delivered = send_email(self.emails[user_id], title, body, link)
        return channel, delivered


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    base, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    if not base or not key:
        print("::error::SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        return 1
    app_url = os.environ.get("APP_URL", "https://tixcast.app").rstrip("/")
    push_ready = bool(os.environ.get("VAPID_PRIVATE_KEY"))
    if not push_ready:
        print("::warning::VAPID_PRIVATE_KEY not set; push alerts will fall back to email.")

    now = datetime.now(timezone.utc)
    alerts = supabase_select(base, key, "alerts", {"active": "is.true"})
    try:
        waiting = supabase_select(base, key, "watches", {"call_notified_at": "is.null"})
    except RuntimeError as exc:
        print(f"::warning::Skipping first-call alerts (run sql/game-day.sql): {exc}")
        waiting = []
    if not alerts and not waiting:
        print("No active alerts or watches waiting for a first call.")
        return 0

    game_ids = sorted({a["game_id"] for a in alerts} | {w["game_id"] for w in waiting})
    games: dict[str, dict] = {}
    for i in range(0, len(game_ids), 100):
        for g in supabase_select(base, key, "app_games", {"game_id": f"in.({','.join(game_ids[i:i + 100])})"}):
            games[g["game_id"]] = g
    user_ids = sorted({a["user_id"] for a in alerts} | {w["user_id"] for w in waiting})
    subs: dict[str, list[dict]] = {}
    prefs: dict[str, dict] = {}
    for i in range(0, len(user_ids), 100):
        chunk = ",".join(user_ids[i:i + 100])
        for s in supabase_select(base, key, "push_subscriptions", {"user_id": f"in.({chunk})"}):
            subs.setdefault(s["user_id"], []).append(s)
        for p in supabase_select(base, key, "profiles", {"user_id": f"in.({chunk})", "select": "user_id,notify_push,notify_email"}):
            prefs[p["user_id"]] = p
    notifier = Notifier(base, key, subs, push_ready, args.dry_run)

    sent = 0
    for alert in alerts:
        game = games.get(alert["game_id"])
        if not game:
            continue
        fire, updates = evaluate(alert, game, now)
        for kind in fire:
            title, body = compose(kind, game, alert)
            channel, delivered = notifier.send(alert["user_id"], title, body, f"{app_url}/game/{game['game_id']}",
                                               f"{game['game_id']}-{kind}", prefer_push=alert.get("channel", "push") == "push")
            if not args.dry_run:
                supabase_insert(base, key, "alert_events", [{
                    "alert_id": alert["id"], "user_id": alert["user_id"], "game_id": game["game_id"], "kind": kind,
                    "price": to_float(game.get("price_now")), "message": f"{title}. {body}",
                    "channel": channel, "delivered": delivered}])
            sent += int(delivered)
        if updates and not args.dry_run:
            supabase_update(base, key, "alerts", {"id": alert["id"]}, {**updates, "updated_at": now.isoformat()})

    first_calls = 0
    for watch in waiting:
        game = games.get(watch["game_id"])
        starts = parse_time(game.get("starts_at")) if game else None
        if not game or not has_call(game) or (starts and starts <= now):
            continue
        pref = prefs.get(watch["user_id"], {})
        title, body = compose_call_ready(game)
        channel, delivered = notifier.send(watch["user_id"], title, body, f"{app_url}/game/{game['game_id']}",
                                           f"{game['game_id']}-call", prefer_push=pref.get("notify_push", True),
                                           allow_email=pref.get("notify_email", True))
        if args.dry_run:
            continue
        supabase_insert(base, key, "alert_events", [{
            "user_id": watch["user_id"], "game_id": game["game_id"], "kind": "call_ready",
            "price": to_float(game.get("price_now")), "message": f"{title}. {body}",
            "channel": channel, "delivered": delivered}])
        supabase_update(base, key, "watches", {"user_id": watch["user_id"], "game_id": watch["game_id"]},
                        {"call_notified_at": now.isoformat()})
        first_calls += 1
        sent += int(delivered)

    print(f"Checked {len(alerts)} alerts and {len(waiting)} watches; {first_calls} first calls, {sent} notifications sent.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
