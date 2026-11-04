-- Usernames and profile photos. Run AFTER app.sql:
-- Supabase -> SQL Editor -> New query -> paste this file -> Run. Safe to run again.

alter table profiles add column if not exists avatar_url text;

alter table profiles drop constraint if exists profiles_display_name_check;
alter table profiles add constraint profiles_display_name_check
  check (display_name is null or char_length(display_name) between 2 and 30);

-- New accounts get the part of their email before the @ as their username.
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

-- Existing accounts that still have the Google full name (or nothing) switch to the email username.
update profiles p
set display_name = left(split_part(u.email, '@', 1), 30)
from auth.users u
where u.id = p.user_id
  and (p.display_name is null or p.display_name = u.raw_user_meta_data->>'full_name');

-- Public bucket for profile photos. Each person can only write inside their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "avatars are public" on storage.objects;
create policy "avatars are public" on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "upload own avatar" on storage.objects;
create policy "upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "replace own avatar" on storage.objects;
create policy "replace own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "delete own avatar" on storage.objects;
create policy "delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
