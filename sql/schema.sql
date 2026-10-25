-- NBA ticket price tracker schema
-- Paste this whole file into Supabase: SQL Editor -> New query -> Run.

-- One row per NBA game (keyed by SeatGeek's event id).
create table if not exists games (
  id             bigint primary key,          -- SeatGeek event id
  title          text,
  home_team      text,
  away_team      text,
  venue          text,
  city           text,
  state          text,
  starts_at      timestamptz,                 -- tip-off, stored in UTC
  time_tbd       boolean default false,       -- true if the start time isn't set yet
  url            text,                        -- SeatGeek event page
  first_seen_at  timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One row per game per collection run. This is the price history.
create table if not exists price_snapshots (
  game_id                bigint not null references games(id) on delete cascade,
  captured_at            timestamptz not null,
  lowest_price           numeric(10,2),       -- cheapest ticket, with fees
  lowest_base_price      numeric(10,2),       -- cheapest ticket, before fees
  median_price           numeric(10,2),
  average_price          numeric(10,2),
  highest_price          numeric(10,2),
  listing_count          integer,
  visible_listing_count  integer,
  hours_to_tip           numeric(8,2),        -- hours between this snapshot and tip-off
  primary key (game_id, captured_at)
);

create index if not exists price_snapshots_captured_at_idx on price_snapshots (captured_at);

-- Lock both tables down. The collector uses the service role key, which
-- bypasses these rules; the public anon key gets no access at all.
alter table games enable row level security;
alter table price_snapshots enable row level security;

-- Final pre-game price for every finished game: the last snapshot taken
-- before tip-off. This is what the model learns to predict.
create or replace view game_outcomes as
select distinct on (s.game_id)
  s.game_id,
  g.title,
  g.home_team,
  g.away_team,
  g.starts_at,
  s.captured_at   as final_captured_at,
  s.hours_to_tip  as final_hours_to_tip,
  s.lowest_price  as final_lowest_price,
  s.median_price  as final_median_price,
  s.listing_count as final_listing_count
from price_snapshots s
join games g on g.id = s.game_id
where g.starts_at < now()
  and s.captured_at <= g.starts_at
order by s.game_id, s.captured_at desc;
