-- Tixcast app tables. Run AFTER schema.sql and context.sql:
-- Supabase -> SQL Editor -> New query -> paste this file -> Run.
-- Safe to run again; every statement is idempotent.

-- ---------------------------------------------------------------------------
-- app_games: one row per upcoming LA home game, rebuilt by collector/feed.py.
-- This is the only game data the app reads. Anyone can read it.
-- ---------------------------------------------------------------------------

create table if not exists app_games (
  game_id        text primary key,            -- nba_games.game_id
  starts_at      timestamptz not null,
  home_tricode   text not null,
  away_tricode   text not null,
  home_team      text,
  away_team      text,
  arena          text,
  national_tv    text,
  price_now      numeric(10,2),               -- cheapest ticket right now, with fees when known
  price_source   text,                        -- seatgeek | ticketmaster
  buy_url        text,
  listing_count  integer,
  history        jsonb not null default '[]', -- [{"t": iso8601, "p": number}], oldest first
  verdict        text not null default 'watch' check (verdict in ('buy', 'wait', 'watch')),
  headline       text,
  odds_label     text,
  odds_pct       smallint,
  risk_label     text,
  risk_pct       smallint,
  range_label    text,
  range_low      numeric(10,2),
  range_high     numeric(10,2),
  reasons        jsonb not null default '[]', -- [{"kind": "listings|calendar|injury|history", "tone": "buy|wait|watch", "title": "...", "detail": "..."}]
  injuries       jsonb not null default '[]', -- [{"team": "LAL", "player": "...", "status": "Out"}]
  model          text not null default 'rules-beta',
  updated_at     timestamptz not null default now()
);

create index if not exists app_games_starts_at_idx on app_games (starts_at);

alter table app_games enable row level security;
drop policy if exists "anyone can read games" on app_games;
create policy "anyone can read games" on app_games for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Per-user tables. Each user can only see and change their own rows.
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  display_name     text,
  teams            text[] not null default '{LAL,LAC}',
  ticket_count     smallint not null default 2 check (ticket_count between 1 and 8),
  max_price        numeric(10,2),
  notify_push      boolean not null default true,
  notify_email     boolean not null default true,
  weekly_digest    boolean not null default true,
  founding_member  boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists watches (
  user_id     uuid not null references auth.users(id) on delete cascade,
  game_id     text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, game_id)
);

create table if not exists alerts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  game_id         text not null,
  target_price    numeric(10,2),               -- null = only alert on Buy now
  on_buy_signal   boolean not null default true,
  channel         text not null default 'push' check (channel in ('push', 'email')),
  active          boolean not null default true,
  target_fired_at timestamptz,                 -- each condition fires once until it resets
  buy_fired_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, game_id)
);

create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create table if not exists alert_events (
  id            uuid primary key default gen_random_uuid(),
  alert_id      uuid references alerts(id) on delete set null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  game_id       text not null,
  kind          text not null check (kind in ('target_hit', 'buy_signal')),
  price         numeric(10,2),
  message       text,
  channel       text,
  delivered     boolean not null default false,
  dismissed_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists alert_events_user_idx on alert_events (user_id, created_at desc);

alter table profiles enable row level security;
alter table watches enable row level security;
alter table alerts enable row level security;
alter table push_subscriptions enable row level security;
alter table alert_events enable row level security;

drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own watches" on watches;
create policy "own watches" on watches for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own alerts" on alerts;
create policy "own alerts" on alerts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own push subscriptions" on push_subscriptions;
create policy "own push subscriptions" on push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Users can read their alert history and dismiss items; only the alert job writes new ones.
drop policy if exists "read own alert events" on alert_events;
create policy "read own alert events" on alert_events for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "dismiss own alert events" on alert_events;
create policy "dismiss own alert events" on alert_events for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Users can't flip their own founding-member badge.
create or replace function protect_founding_member() returns trigger
language plpgsql as $$
begin
  if auth.role() = 'authenticated' then
    new.founding_member := old.founding_member;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_protect on profiles;
create trigger profiles_protect before update on profiles
  for each row execute function protect_founding_member();

-- Create a profile for every new account. The first 100 accounts are founding members.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (user_id, display_name, founding_member)
  values (
    new.id,
    left(split_part(new.email, '@', 1), 30),
    (select count(*) from profiles) < 100
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Feedback from the Profile tab. Anyone can send; nobody can read it back
-- through the app. Read it in Supabase -> Table Editor -> feedback.
-- ---------------------------------------------------------------------------

create table if not exists feedback (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete set null,
  email       text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  topic       text not null default 'other' check (topic in ('idea', 'bug', 'price', 'other')),
  message     text not null check (char_length(message) between 1 and 4000),
  page        text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

alter table feedback enable row level security;
drop policy if exists "anyone can send feedback" on feedback;
create policy "anyone can send feedback" on feedback for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
