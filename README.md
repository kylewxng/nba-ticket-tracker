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
