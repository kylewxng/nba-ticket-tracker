# NBA ticket price tracker

Collects resale ticket prices for every NBA game from SeatGeek, every few hours, into a Supabase database. This price history trains the "buy now or wait" model and later feeds the app.

## How it works

- **`collector/collect.py`** runs every hour on GitHub Actions. It fetches all upcoming NBA games from SeatGeek, updates the `games` table, and saves a price snapshot for each game that's due:
  - more than 7 days before tip-off: every 6 hours
  - 2 to 7 days before: every 3 hours
  - last 48 hours: every hour
- **`collector/backup.py`** runs on the 1st of each month and saves the previous month's snapshots to `data/snapshots/YYYY-MM.parquet`, committed to this repo.
- **`sql/schema.sql`** creates the tables and a `game_outcomes` view: the final pre-game price for each finished game, which is what the model predicts.

Each snapshot stores the cheapest price (with and without fees), median, average and highest price, listing counts, and hours until tip-off. Prices are game-level totals; SeatGeek's API doesn't give per-section prices.

## Setup (about 15 minutes)

### 1. Supabase
1. Create a free project at supabase.com.
2. Open **SQL Editor → New query**, paste all of `sql/schema.sql`, and click **Run**.
3. Go to **Project Settings → API** and copy:
   - the **Project URL** (looks like `https://abcd1234.supabase.co`)
   - the **service_role** key (not the anon key). Treat it like a password.

### 2. GitHub
1. Create a repo and push this folder to it.
   - A **public** repo gets unlimited free Actions minutes. A private repo's free 2,000 minutes a month should still cover hourly runs, but with less room to spare. Your secrets stay hidden either way.
2. Go to **Settings → Secrets and variables → Actions → New repository secret** and add:
   - `SEATGEEK_CLIENT_ID`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`

### 3. First run
1. Go to **Actions → Collect NBA ticket prices → Run workflow**, tick **force**, and run it. This saves a snapshot for every upcoming game right away.
2. Check Supabase's **Table Editor**: `games` should have hundreds of rows and `price_snapshots` should have one row per game.
3. From then on it runs by itself every hour.

## Testing locally

```bash
pip install -r requirements.txt
pytest -q
python collector/collect.py --fixture tests/fixtures/sample_events.json --dry-run --force
```

With a real client ID, try a live fetch that writes nothing:

```bash
SEATGEEK_CLIENT_ID=your_id python collector/collect.py --dry-run --force
```

## Notes

- **GitHub pauses scheduled workflows** in public repos after 60 days with no commits. The monthly backup commit keeps the repo active.
- **Supabase free projects pause** after 7 days of inactivity. Hourly writes should keep it awake; check the dashboard after the first week.
- **Scheduled runs can be late.** GitHub sometimes delays or skips scheduled runs at busy times, so expect some gaps in the history.
- **Check SeatGeek's API terms** before using the data commercially.
