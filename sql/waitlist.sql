-- Waitlist for the Tixcast landing page.
-- Paste into Supabase: SQL Editor -> New query -> Run.
-- The landing page uses the public anon key, so visitors can ADD an email
-- but can never read, change, or delete the list.

create table if not exists waitlist (
  id          bigint generated always as identity primary key,
  email       text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  team        text,
  source      text,
  created_at  timestamptz not null default now()
);

alter table waitlist enable row level security;

drop policy if exists "anyone can join the waitlist" on waitlist;
create policy "anyone can join the waitlist"
  on waitlist for insert
  to anon
  with check (true);
