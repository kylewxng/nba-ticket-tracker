"""Check every active price alert against the latest feed and notify people.

An alert has up to two conditions:
  * target hit: the cheapest ticket is at or below the person's target price
  * buy signal: Tixcast's call for the game turned to Buy now

Each condition fires once, then re-arms only after it stops being true
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
    if not alerts:
        print("No active alerts.")
        return 0
    game_ids = sorted({a["game_id"] for a in alerts})
    games = {g["game_id"]: g for g in supabase_select(base, key, "app_games", {"game_id": f"in.({','.join(game_ids)})"})}
    user_ids = sorted({a["user_id"] for a in alerts})
    subs: dict[str, list[dict]] = {}
    for s in supabase_select(base, key, "push_subscriptions", {"user_id": f"in.({','.join(user_ids)})"}):
        subs.setdefault(s["user_id"], []).append(s)

    sent = 0
    for alert in alerts:
        game = games.get(alert["game_id"])
        if not game:
            continue
        fire, updates = evaluate(alert, game, now)
        for kind in fire:
            title, body = compose(kind, game, alert)
            link = f"{app_url}/game/{game['game_id']}"
            channel, delivered = None, False
            if args.dry_run:
                print(f"[dry run] {alert['user_id'][:8]} {kind}: {title} / {body}")
                continue
            if alert.get("channel", "push") == "push" and push_ready and subs.get(alert["user_id"]):
                channel = "push"
                for sub in subs[alert["user_id"]]:
                    result = send_push(sub, {"title": title, "body": body, "url": link, "tag": f"{game['game_id']}-{kind}"})
                    delivered = delivered or result == "sent"
                    if result == "gone":
                        supabase_delete(base, key, "push_subscriptions", {"id": f"eq.{sub['id']}"})
            if not delivered:
                email = user_email(base, key, alert["user_id"])
                if email:
                    channel = "email"
                    delivered = send_email(email, title, body, link)
            supabase_insert(base, key, "alert_events", [{
                "alert_id": alert["id"], "user_id": alert["user_id"], "game_id": game["game_id"], "kind": kind,
                "price": to_float(game.get("price_now")), "message": f"{title}. {body}",
                "channel": channel, "delivered": delivered}])
            sent += int(delivered)
        if updates and not args.dry_run:
            supabase_update(base, key, "alerts", {"id": alert["id"]}, {**updates, "updated_at": now.isoformat()})
    print(f"Checked {len(alerts)} alerts, sent {sent} notifications.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
