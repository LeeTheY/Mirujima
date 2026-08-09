create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    nullif(left(trim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')), 120), ''),
    nullif(left(trim(coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', '')), 2048), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row execute function public.handle_new_auth_user_profile();

insert into public.profiles (id, display_name, avatar_url)
select
  auth_user.id,
  nullif(left(trim(coalesce(auth_user.raw_user_meta_data->>'full_name', auth_user.raw_user_meta_data->>'name', '')), 120), ''),
  nullif(left(trim(coalesce(auth_user.raw_user_meta_data->>'avatar_url', auth_user.raw_user_meta_data->>'picture', '')), 2048), '')
from auth.users auth_user
on conflict (id) do nothing;

comment on function public.handle_new_auth_user_profile() is
  'Creates the canonical public profile immediately after Supabase Auth creates a user. Client insert privileges remain disabled.';
