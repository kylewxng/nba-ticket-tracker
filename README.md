# Tixcast data collector

Collects NBA resale ticket prices and game context every few hours into a Supabase database. This history trains the "buy now or wait" model and later feeds the Tixcast app. The `site/` folder holds the landing page.

## What runs, and when

| Workflow | Script | Schedule | Needs | Saves to |
|---|---|---|---|---|
| Collect NBA ticket prices | `collector/collect.py` | hourly | `SEATGEEK_CLIENT_ID` | `games`, `price_snapshots` |
| Collect Ticketmaster prices | `collector/ticketmaster.py` | every 6 hours | `TICKETMASTER_API_KEY` | `tm_events`, `tm_price_snapshots` |
| Collect NBA schedule and injuries | `collector/context.py` | twice a day | nothing extra | `nba_games`, `injury_snapshots` |
| Monthly backup to Parquet | `collector/backup.py` | 1st of each month | nothing extra | `data/` in this repo |

All workflows also need `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. If a price source's key isn't set yet, its workflow skips with a note instead of failing.

**SeatGeek** (the main source) saves a snapshot for each game that's due: every 6 hours when tip-off is more than 7 days away, every 3 hours in the final week, and every hour in the last 48 hours. Each snapshot has the cheapest price (with and without fees), median, average and highest price, listing counts, and hours until tip-off. These are game-level totals; the API doesn't give per-section prices.

**Ticketmaster** is a weaker backup. Its price ranges are mostly face value, not resale, and are often missing. It still records the schedule and on-sale status for every game.

**Game context** comes from ESPN's unofficial public feeds: the season scoreboard (tip-off times, results, national TV) and the injury report (saved as a daily snapshot). They're fine for research; check their terms before using them in a commercial product.

## Views for modeling

- **`game_outcomes`**: the last price before tip-off for every finished game. This is what the model predicts.
- **`game_context`**: for every game, each team's regular-season record going in, days of rest, back-to-back flags, national TV, and day of the week.

## Setup

### 1. Supabase
1. Create a free project at supabase.com.
2. In **SQL Editor → New query**, run each of these files in order: `sql/schema.sql`, `sql/context.sql`, `sql/waitlist.sql`. Each is safe to run again.
3. In **Project Settings → API**, copy the **Project URL** and the **service_role** key. Treat the service_role key like a password.

### 2. GitHub secrets
In **Settings → Secrets and variables → Actions**, add:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `TICKETMASTER_API_KEY`: the "Consumer Key" from a free app at developer.ticketmaster.com
- `SEATGEEK_CLIENT_ID`: once SeatGeek approves your account

### 3. First runs
In the **Actions** tab, open each workflow and click **Run workflow**. For the SeatGeek collector, tick **force** to save a snapshot for every upcoming game right away. Then check the tables in Supabase's **Table Editor**.

## Testing locally

```bash
pip install -r requirements.txt
pytest -q
cd collector
python collect.py --fixture ../tests/fixtures/sample_events.json --dry-run --force
python ticketmaster.py --fixture ../tests/fixtures/tm_events.json --dry-run
python context.py --schedule-fixture ../tests/fixtures/espn_scoreboard.json \
  --injury-fixture ../tests/fixtures/espn_injuries.json --dry-run
```

Drop the fixture flags to try live data without writing anything (with `--dry-run`).

## Notes

- **GitHub pauses scheduled workflows** in public repos after 60 days with no commits. The monthly backup commit keeps the repo active.
- **Supabase free projects pause** after 7 days of inactivity. The collectors write often enough to keep it awake.
- **Scheduled runs can be late or skipped** when GitHub is busy, so expect some gaps.
- **Check SeatGeek's and Ticketmaster's API terms** before using their data commercially.

## The Tixcast app

The web app lives in [`app/`](app/README.md). The pieces fit together like this:

1. The collectors write prices, schedules and injuries to Supabase (above).
2. `collector/feed.py` turns them into one row per upcoming Lakers or Clippers home game in `app_games`, with a beta Buy now / Wait / Watch call. Rules for now; the model replaces them once it wins the backtest.
3. `collector/alerts.py` checks every active alert against the feed and sends a web push notification, or an email when push isn't available.
4. The app reads `app_games` and each signed-in person's own watches and alerts. Row-level security keeps everyone's data private.

Workflow: `.github/workflows/feed.yml`, twice an hour.

### One-time setup

1. **Supabase:** restore the project, then run `sql/schema.sql`, `sql/context.sql`, `sql/waitlist.sql` and `sql/app.sql` in the SQL Editor, in that order.
2. **Supabase Auth:** under Authentication, URL Configuration, set the Site URL to `https://tixcast.app` and add `http://localhost:5173` as a redirect URL. Turn on the Google provider if you want Google sign-in.
3. **Push keys:** run `npx web-push generate-vapid-keys` once.
4. **GitHub secrets** (Settings, Secrets and variables, Actions): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` plus your email), and for email alerts `RESEND_API_KEY` and `ALERT_FROM_EMAIL` (for example `Tixcast <alerts@tixcast.app>`, after verifying the domain in Resend).
5. **Vercel:** follow [app/README.md](app/README.md). Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_VAPID_PUBLIC_KEY`.
