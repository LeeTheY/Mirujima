create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null check (plan in ('free', 'premium')),
  billing_integration text not null check (billing_integration in ('deferred', 'stripe')),
  activation_source text not null check (activation_source in ('onboarding_deferred', 'stripe_subscription')),
  status text not null check (status in ('active', 'inactive')),
  activated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.membership_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null check (feature_key in ('learning-grass', 'cloud-backup', 'cloud-sync', 'screen-ocr', 'grammar-correction')),
  enabled boolean not null default false,
  source text not null check (source in ('onboarding_deferred', 'stripe_subscription')),
  valid_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, feature_key)
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_generated_device_id text not null,
  device_name text not null,
  extension_version text not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_generated_device_id)
);

create index if not exists memberships_user_id_idx on public.memberships(user_id);
create index if not exists membership_entitlements_user_id_idx on public.membership_entitlements(user_id);
create index if not exists devices_user_id_idx on public.devices(user_id);

alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_entitlements enable row level security;
alter table public.devices enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "memberships_select_own" on public.memberships for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "entitlements_select_own" on public.membership_entitlements for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "devices_select_own" on public.devices for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "devices_insert_own" on public.devices for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "devices_update_own" on public.devices for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "devices_delete_own" on public.devices for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.profiles, public.memberships, public.membership_entitlements, public.devices from anon;
grant select, update on public.profiles to authenticated;
grant select on public.memberships, public.membership_entitlements to authenticated;
grant select, insert, update, delete on public.devices to authenticated;

create or replace function public.activate_deferred_membership(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_user_id is null then
    raise exception 'target user is required';
  end if;

  insert into public.profiles (id)
  values (target_user_id)
  on conflict (id) do nothing;

  insert into public.memberships (
    user_id, plan, billing_integration, activation_source, status, activated_at, updated_at
  ) values (
    target_user_id, 'premium', 'deferred', 'onboarding_deferred', 'active', now(), now()
  )
  on conflict (user_id) do update set
    plan = 'premium',
    billing_integration = 'deferred',
    activation_source = 'onboarding_deferred',
    status = 'active',
    activated_at = coalesce(public.memberships.activated_at, now()),
    updated_at = now();

  insert into public.membership_entitlements (user_id, feature_key, enabled, source, valid_until, updated_at)
  select target_user_id, feature_key, true, 'onboarding_deferred', null, now()
  from unnest(array['learning-grass', 'cloud-backup', 'cloud-sync', 'screen-ocr', 'grammar-correction']) as features(feature_key)
  on conflict (user_id, feature_key) do update set
    enabled = true,
    source = 'onboarding_deferred',
    valid_until = null,
    updated_at = now();
end;
$$;

revoke all on function public.activate_deferred_membership(uuid) from public, anon, authenticated;
grant execute on function public.activate_deferred_membership(uuid) to service_role;
