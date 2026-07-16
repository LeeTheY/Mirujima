create table public.cloud_schedules (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id text not null,
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 1 check (version > 0),
  device_id text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, entity_id)
);

create table public.cloud_settings (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id text not null, payload jsonb not null default '{}'::jsonb,
  version bigint not null default 1 check (version > 0), device_id text not null,
  deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (user_id, entity_id)
);
create table public.cloud_focus_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id text not null, payload jsonb not null default '{}'::jsonb,
  version bigint not null default 1 check (version > 0), device_id text not null,
  deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (user_id, entity_id)
);
create table public.cloud_reports (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id text not null, payload jsonb not null default '{}'::jsonb,
  version bigint not null default 1 check (version > 0), device_id text not null,
  deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (user_id, entity_id)
);

create table public.cloud_learning_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  date_key date not null,
  actual_focus_minutes integer not null check (actual_focus_minutes >= 0),
  completed_schedule_count integer not null check (completed_schedule_count >= 0),
  achievement_rate integer not null check (achievement_rate between 0 and 100),
  learning_score integer not null check (learning_score >= 0),
  intensity smallint not null check (intensity between 0 and 4),
  payload jsonb not null default '{}'::jsonb,
  version bigint not null default 1 check (version > 0),
  device_id text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date_key)
);

create table public.sync_mutations (
  mutation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('schedule', 'settings', 'focus-session', 'report', 'learning-day')),
  entity_id text not null,
  operation text not null check (operation in ('upsert', 'delete')),
  expected_version bigint not null check (expected_version >= 0),
  result_status text not null check (result_status in ('applied', 'conflict')),
  result_record jsonb not null,
  device_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, mutation_id)
);

create index cloud_schedules_user_id_idx on public.cloud_schedules(user_id);
create index cloud_settings_user_id_idx on public.cloud_settings(user_id);
create index cloud_focus_sessions_user_id_idx on public.cloud_focus_sessions(user_id);
create index cloud_reports_user_id_idx on public.cloud_reports(user_id);
create index cloud_learning_days_user_id_idx on public.cloud_learning_days(user_id);
create index cloud_learning_days_date_idx on public.cloud_learning_days(user_id, date_key desc);
create index sync_mutations_user_id_idx on public.sync_mutations(user_id);

alter table public.cloud_schedules enable row level security;
alter table public.cloud_settings enable row level security;
alter table public.cloud_focus_sessions enable row level security;
alter table public.cloud_reports enable row level security;
alter table public.cloud_learning_days enable row level security;
alter table public.sync_mutations enable row level security;

create policy "cloud_schedules_select_own" on public.cloud_schedules for select to authenticated using ((select auth.uid()) = user_id);
create policy "cloud_settings_select_own" on public.cloud_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "cloud_focus_sessions_select_own" on public.cloud_focus_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "cloud_reports_select_own" on public.cloud_reports for select to authenticated using ((select auth.uid()) = user_id);
create policy "cloud_learning_days_select_own" on public.cloud_learning_days for select to authenticated using ((select auth.uid()) = user_id);
create policy "sync_mutations_select_own" on public.sync_mutations for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.cloud_schedules, public.cloud_settings, public.cloud_focus_sessions, public.cloud_reports, public.cloud_learning_days, public.sync_mutations from anon;
grant select on public.cloud_schedules, public.cloud_settings, public.cloud_focus_sessions, public.cloud_reports, public.cloud_learning_days, public.sync_mutations to authenticated;

create or replace function public.apply_cloud_mutation(
  p_mutation_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_operation text,
  p_expected_version bigint,
  p_payload jsonb,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_version bigint := 0;
  current_payload jsonb := null;
  current_device_id text := '';
  current_updated_at timestamptz := now();
  current_deleted_at timestamptz := null;
  next_version bigint;
  result_record jsonb;
  prior_result jsonb;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_entity_type not in ('schedule', 'settings', 'focus-session', 'report', 'learning-day') then raise exception 'unsupported entity type'; end if;
  if p_operation not in ('upsert', 'delete') then raise exception 'unsupported operation'; end if;
  if length(p_entity_id) > 300 or length(p_device_id) > 200 then raise exception 'identifier too long'; end if;
  if not exists (
    select 1 from public.memberships membership
    join public.membership_entitlements entitlement on entitlement.user_id = membership.user_id
    where membership.user_id = current_user_id and membership.plan = 'premium' and membership.status = 'active'
      and entitlement.feature_key = 'cloud-sync' and entitlement.enabled = true
      and (entitlement.valid_until is null or entitlement.valid_until > now())
  ) then raise exception 'cloud-sync entitlement required'; end if;

  -- Serialize writes to one logical record so two devices starting from the
  -- same expected version cannot both win an insert/update race.
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text || ':' || p_entity_type || ':' || p_entity_id, 0));

  select mutation.result_record into prior_result
  from public.sync_mutations mutation
  where mutation.user_id = current_user_id and mutation.mutation_id = p_mutation_id;
  if prior_result is not null then return prior_result; end if;

  if p_entity_type = 'schedule' then
    select version, payload, device_id, updated_at, deleted_at into current_version, current_payload, current_device_id, current_updated_at, current_deleted_at from public.cloud_schedules where user_id = current_user_id and entity_id = p_entity_id;
  elsif p_entity_type = 'settings' then
    select version, payload, device_id, updated_at, deleted_at into current_version, current_payload, current_device_id, current_updated_at, current_deleted_at from public.cloud_settings where user_id = current_user_id and entity_id = p_entity_id;
  elsif p_entity_type = 'focus-session' then
    select version, payload, device_id, updated_at, deleted_at into current_version, current_payload, current_device_id, current_updated_at, current_deleted_at from public.cloud_focus_sessions where user_id = current_user_id and entity_id = p_entity_id;
  elsif p_entity_type = 'report' then
    select version, payload, device_id, updated_at, deleted_at into current_version, current_payload, current_device_id, current_updated_at, current_deleted_at from public.cloud_reports where user_id = current_user_id and entity_id = p_entity_id;
  else
    select version, payload, device_id, updated_at, deleted_at into current_version, current_payload, current_device_id, current_updated_at, current_deleted_at from public.cloud_learning_days where user_id = current_user_id and date_key = p_entity_id::date;
  end if;
  current_version := coalesce(current_version, 0);

  if current_version <> p_expected_version then
    result_record := jsonb_build_object(
      'mutationId', p_mutation_id, 'status', 'conflict',
      'record', jsonb_build_object('entityType', p_entity_type, 'entityId', p_entity_id, 'payload', current_payload, 'version', current_version, 'deviceId', current_device_id, 'updatedAt', current_updated_at, 'deletedAt', current_deleted_at)
    );
    insert into public.sync_mutations values (p_mutation_id, current_user_id, p_entity_type, p_entity_id, p_operation, p_expected_version, 'conflict', result_record, p_device_id, now());
    return result_record;
  end if;

  next_version := current_version + 1;
  current_deleted_at := case when p_operation = 'delete' then now() else null end;
  if p_entity_type = 'schedule' then
    insert into public.cloud_schedules (user_id, entity_id, payload, version, device_id, deleted_at) values (current_user_id, p_entity_id, coalesce(p_payload, '{}'::jsonb), next_version, p_device_id, current_deleted_at)
    on conflict (user_id, entity_id) do update set payload = excluded.payload, version = excluded.version, device_id = excluded.device_id, deleted_at = excluded.deleted_at, updated_at = now();
  elsif p_entity_type = 'settings' then
    insert into public.cloud_settings (user_id, entity_id, payload, version, device_id, deleted_at) values (current_user_id, p_entity_id, coalesce(p_payload, '{}'::jsonb), next_version, p_device_id, current_deleted_at)
    on conflict (user_id, entity_id) do update set payload = excluded.payload, version = excluded.version, device_id = excluded.device_id, deleted_at = excluded.deleted_at, updated_at = now();
  elsif p_entity_type = 'focus-session' then
    insert into public.cloud_focus_sessions (user_id, entity_id, payload, version, device_id, deleted_at) values (current_user_id, p_entity_id, coalesce(p_payload, '{}'::jsonb), next_version, p_device_id, current_deleted_at)
    on conflict (user_id, entity_id) do update set payload = excluded.payload, version = excluded.version, device_id = excluded.device_id, deleted_at = excluded.deleted_at, updated_at = now();
  elsif p_entity_type = 'report' then
    insert into public.cloud_reports (user_id, entity_id, payload, version, device_id, deleted_at) values (current_user_id, p_entity_id, coalesce(p_payload, '{}'::jsonb), next_version, p_device_id, current_deleted_at)
    on conflict (user_id, entity_id) do update set payload = excluded.payload, version = excluded.version, device_id = excluded.device_id, deleted_at = excluded.deleted_at, updated_at = now();
  else
    insert into public.cloud_learning_days (user_id, date_key, actual_focus_minutes, completed_schedule_count, achievement_rate, learning_score, intensity, payload, version, device_id, deleted_at)
    values (current_user_id, p_entity_id::date, coalesce((p_payload->>'actualFocusMinutes')::integer, 0), coalesce((p_payload->>'completedScheduleCount')::integer, 0), coalesce((p_payload->>'achievementRate')::integer, 0), coalesce((p_payload->>'learningScore')::integer, 0), coalesce((p_payload->>'intensity')::smallint, 0), coalesce(p_payload, '{}'::jsonb), next_version, p_device_id, current_deleted_at)
    on conflict (user_id, date_key) do update set actual_focus_minutes = excluded.actual_focus_minutes, completed_schedule_count = excluded.completed_schedule_count, achievement_rate = excluded.achievement_rate, learning_score = excluded.learning_score, intensity = excluded.intensity, payload = excluded.payload, version = excluded.version, device_id = excluded.device_id, deleted_at = excluded.deleted_at, updated_at = now();
  end if;

  result_record := jsonb_build_object(
    'mutationId', p_mutation_id, 'status', 'applied',
    'record', jsonb_build_object('entityType', p_entity_type, 'entityId', p_entity_id, 'payload', p_payload, 'version', next_version, 'deviceId', p_device_id, 'updatedAt', now(), 'deletedAt', current_deleted_at)
  );
  insert into public.sync_mutations values (p_mutation_id, current_user_id, p_entity_type, p_entity_id, p_operation, p_expected_version, 'applied', result_record, p_device_id, now());
  return result_record;
end;
$$;

revoke all on function public.apply_cloud_mutation(uuid, text, text, text, bigint, jsonb, text) from public, anon;
grant execute on function public.apply_cloud_mutation(uuid, text, text, text, bigint, jsonb, text) to authenticated;

create or replace function public.prune_cloud_history()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.cloud_focus_sessions where updated_at < now() - interval '365 days';
  delete from public.cloud_reports where updated_at < now() - interval '365 days';
  delete from public.cloud_learning_days where date_key < current_date - 365;
  delete from public.sync_mutations where created_at < now() - interval '365 days';
  delete from public.cloud_schedules where deleted_at < now() - interval '365 days';
end;
$$;

revoke all on function public.prune_cloud_history() from public, anon, authenticated;
grant execute on function public.prune_cloud_history() to service_role;
