-- Ticketmaster prices + NBA game context (schedule, results, injuries).
-- Run this AFTER schema.sql: Supabase -> SQL Editor -> New query -> Run.

-- ---------------------------------------------------------------------------
-- Ticketmaster
-- ---------------------------------------------------------------------------

create table if not exists tm_events (
  id          text primary key,          -- Ticketmaster event id
  name        text,
  home_team   text,
  away_team   text,
  venue       text,
  city        text,
  state       text,
  starts_at   timestamptz,
  url         text,
  first_seen_at timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists tm_price_snapshots (
  event_id      text not null references tm_events(id) on delete cascade,
  captured_at   timestamptz not null,
  price_min     numeric(10,2),             -- mostly face value, often missing
  price_max     numeric(10,2),
  currency      text,
  price_type    text,
  status        text,                      -- onsale, offsale, postponed, ...
  hours_to_tip  numeric(8,2),
  primary key (event_id, captured_at)
);

-- ---------------------------------------------------------------------------
-- NBA schedule and results (one row per game, updated as games finish)
-- ---------------------------------------------------------------------------

create table if not exists nba_games (
  game_id       text primary key,          -- NBA game id, e.g. 0022600001
  game_type     text,                      -- preseason, regular, play-in, playoffs, ...
  starts_at     timestamptz not null,
  home_tricode  text not null,
  away_tricode  text not null,
  home_team     text,
  away_team     text,
  arena         text,
  city          text,
  state         text,
  national_tv   text,                      -- e.g. 'ESPN, ABC'; null if local only
  status        smallint,                  -- 1 scheduled, 2 live, 3 final
  home_score    smallint,
  away_score    smallint,
  updated_at    timestamptz not null default now()
);

create index if not exists nba_games_starts_at_idx on nba_games (starts_at);

-- ---------------------------------------------------------------------------
-- Daily injury report snapshots
-- ---------------------------------------------------------------------------

create table if not exists injury_snapshots (
  captured_on    date not null,
  team           text not null,
  player         text not null,
  status         text,                     -- Out, Questionable, Day-To-Day, ...
  injury         text,
  detail         text,
  return_date    text,
  short_comment  text,
  reported_at    text,
  primary key (captured_on, team, player)
);

alter table tm_events enable row level security;
alter table tm_price_snapshots enable row level security;
alter table nba_games enable row level security;
alter table injury_snapshots enable row level security;

-- ---------------------------------------------------------------------------
-- game_context: each team's record and rest going into every game.
-- Records count regular-season results only; rest days count any prior game.
-- ---------------------------------------------------------------------------

create or replace view game_context as
with team_games as (
  select game_id, starts_at, game_type, status, home_tricode as team,
         (home_score > away_score) as won
  from nba_games
  union all
  select game_id, starts_at, game_type, status, away_tricode as team,
         (away_score > home_score) as won
  from nba_games
),
running as (
  select
    game_id,
    team,
    coalesce(sum(case when game_type = 'regular' and status = 3 and won then 1 else 0 end)
             over prior, 0) as wins_before,
    coalesce(sum(case when game_type = 'regular' and status = 3 and not won then 1 else 0 end)
             over prior, 0) as losses_before,
    lag(starts_at) over (partition by team order by starts_at) as prev_game_at,
    starts_at
  from team_games
  window prior as (partition by team order by starts_at
                   rows between unbounded preceding and 1 preceding)
)
select
  g.game_id,
  g.game_type,
  g.starts_at,
  g.home_tricode,
  g.away_tricode,
  g.national_tv,
  (g.national_tv is not null) as on_national_tv,
  extract(isodow from g.starts_at at time zone 'America/New_York')::int as day_of_week_et,
  h.wins_before   as home_wins_before,
  h.losses_before as home_losses_before,
  a.wins_before   as away_wins_before,
  a.losses_before as away_losses_before,
  round(extract(epoch from (g.starts_at - h.prev_game_at)) / 86400.0, 1) as home_rest_days,
  round(extract(epoch from (g.starts_at - a.prev_game_at)) / 86400.0, 1) as away_rest_days,
  coalesce(extract(epoch from (g.starts_at - h.prev_game_at)) < 36 * 3600, false) as home_back_to_back,
  coalesce(extract(epoch from (g.starts_at - a.prev_game_at)) < 36 * 3600, false) as away_back_to_back,
  g.status,
  g.home_score,
  g.away_score
from nba_games g
join running h on h.game_id = g.game_id and h.team = g.home_tricode
join running a on a.game_id = g.game_id and a.team = g.away_tricode;
