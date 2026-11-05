-- Game-day details and "first call is ready" alerts. Run AFTER app.sql:
-- Supabase -> SQL Editor -> New query -> paste this file -> Run. Safe to run again.

-- Records and rest going into each game, copied from the game_context view by feed.py.
alter table app_games add column if not exists home_record text;          -- e.g. '5-3'
alter table app_games add column if not exists away_record text;
alter table app_games add column if not exists home_rest_days numeric(4,1);
alter table app_games add column if not exists away_rest_days numeric(4,1);
alter table app_games add column if not exists home_back_to_back boolean;
alter table app_games add column if not exists away_back_to_back boolean;

-- Each watch hears once when its game gets its first Buy now / Wait / Watch call.
alter table watches add column if not exists call_notified_at timestamptz;

alter table alert_events drop constraint if exists alert_events_kind_check;
alter table alert_events add constraint alert_events_kind_check
  check (kind in ('target_hit', 'buy_signal', 'call_ready'));
