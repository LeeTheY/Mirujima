create extension if not exists pgcrypto with schema extensions;

alter table public.profiles
  add column if not exists role text,
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists timezone text not null default 'Asia/Seoul',
  add column if not exists locale text not null default 'ko-KR',
  add column if not exists sharing_preferences jsonb not null default '{"shareCompletion":true,"shareTotalFocusMinutes":true,"shareRewardStatus":true,"shareAiSummary":false}'::jsonb,
  add column if not exists family_redeem_window_started_at timestamptz,
  add column if not exists family_redeem_attempts integer not null default 0,
  add column if not exists family_redeem_locked_until timestamptz;

alter table public.profiles
  drop constraint if exists profiles_role_check,
  add constraint profiles_role_check check (role is null or role in ('student', 'guardian')),
  drop constraint if exists profiles_timezone_length_check,
  add constraint profiles_timezone_length_check check (length(timezone) between 1 and 64),
  drop constraint if exists profiles_locale_length_check,
  add constraint profiles_locale_length_check check (length(locale) between 2 and 16),
  drop constraint if exists profiles_sharing_preferences_object_check,
  add constraint profiles_sharing_preferences_object_check check (jsonb_typeof(sharing_preferences) = 'object'),
  drop constraint if exists profiles_family_redeem_attempts_check,
  add constraint profiles_family_redeem_attempts_check check (family_redeem_attempts between 0 and 5);

comment on column public.profiles.family_redeem_attempts is
  'Per-authenticated-user family-code failure counter. Kept on profiles to avoid a separate rate-limit table during Phase 3.';

-- A cloud payload cannot enforce one active guardian per student, opposite-role
-- membership, single-use expiry, or transactional redemption. family_links is
-- therefore the one new Phase 3 table permitted by AGENTS.md.
create table public.family_links (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid references auth.users(id) on delete cascade,
  guardian_user_id uuid references auth.users(id) on delete cascade,
  issuer_user_id uuid not null references auth.users(id) on delete cascade,
  issuer_role text not null check (issuer_role in ('student', 'guardian')),
  status text not null check (status in ('pending', 'active', 'expired', 'revoked', 'disconnected')),
  code_hash text,
  code_expires_at timestamptz,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
  linked_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_links_distinct_users_check check (
    student_user_id is null or guardian_user_id is null or student_user_id <> guardian_user_id
  ),
  constraint family_links_pending_shape_check check (
    status <> 'pending' or (
      code_hash is not null
      and code_hash ~ '^[0-9a-f]{64}$'
      and code_expires_at is not null
      and ((issuer_role = 'student' and student_user_id = issuer_user_id and guardian_user_id is null)
        or (issuer_role = 'guardian' and guardian_user_id = issuer_user_id and student_user_id is null))
    )
  ),
  constraint family_links_active_shape_check check (
    status <> 'active' or (student_user_id is not null and guardian_user_id is not null and linked_at is not null and code_hash is null)
  )
);

create unique index family_links_one_active_guardian_per_student_idx
  on public.family_links(student_user_id)
  where status = 'active';
create unique index family_links_pending_code_hash_idx
  on public.family_links(code_hash)
  where status = 'pending' and code_hash is not null;
create index family_links_guardian_active_idx
  on public.family_links(guardian_user_id, linked_at desc)
  where status = 'active';
create index family_links_issuer_recent_idx
  on public.family_links(issuer_user_id, created_at desc);

alter table public.family_links enable row level security;

create policy "family_links_select_party" on public.family_links
  for select to authenticated
  using (
    (select auth.uid()) = issuer_user_id
    or (select auth.uid()) = student_user_id
    or (select auth.uid()) = guardian_user_id
  );

revoke all on public.family_links from public, anon, authenticated;
grant select (
  id, student_user_id, guardian_user_id, issuer_user_id, issuer_role, status,
  code_expires_at, failed_attempts, linked_at, disconnected_at, created_at, updated_at
) on public.family_links to authenticated;

-- Existing clients may still edit display/profile preferences, but role and
-- security counters are server-owned columns.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, timezone, locale, sharing_preferences) on public.profiles to authenticated;

create or replace function public.set_profile_role(
  p_role text,
  p_timezone text,
  p_locale text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_role text;
  default_sharing jsonb := '{"shareCompletion":true,"shareTotalFocusMinutes":true,"shareRewardStatus":true,"shareAiSummary":false}'::jsonb;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_role not in ('student', 'guardian') then raise exception 'unsupported role'; end if;
  if p_timezone is null or length(p_timezone) not between 1 and 64 then raise exception 'invalid timezone'; end if;
  if p_locale is null or length(p_locale) not between 2 and 16 then raise exception 'invalid locale'; end if;

  perform pg_advisory_xact_lock(hashtextextended('profile-role:' || current_user_id::text, 0));
  select profile.role into current_role from public.profiles profile where profile.id = current_user_id;
  if current_role is not null and current_role <> p_role then
    raise exception 'role is already set';
  end if;

  insert into public.profiles (id, role, onboarding_completed, timezone, locale, sharing_preferences, updated_at)
  values (current_user_id, p_role, true, p_timezone, p_locale, default_sharing, now())
  on conflict (id) do update set
    role = coalesce(public.profiles.role, excluded.role),
    onboarding_completed = true,
    timezone = excluded.timezone,
    locale = excluded.locale,
    sharing_preferences = coalesce(public.profiles.sharing_preferences, default_sharing),
    updated_at = now();

  return jsonb_build_object('role', p_role, 'onboardingCompleted', true);
end;
$$;

create or replace function public.consume_family_redeem_failure(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window timestamptz;
  current_attempts integer;
  current_lock timestamptz;
  next_attempts integer;
  next_lock timestamptz;
begin
  select family_redeem_window_started_at, family_redeem_attempts, family_redeem_locked_until
  into current_window, current_attempts, current_lock
  from public.profiles where id = p_user_id for update;

  if current_lock is not null and current_lock > now() then
    return jsonb_build_object('status', 'locked', 'lockedUntil', current_lock);
  end if;

  if current_window is null or current_window <= now() - interval '10 minutes' then
    current_window := now();
    next_attempts := 1;
  else
    next_attempts := least(5, coalesce(current_attempts, 0) + 1);
  end if;
  next_lock := case when next_attempts >= 5 then now() + interval '10 minutes' else null end;

  update public.profiles set
    family_redeem_window_started_at = current_window,
    family_redeem_attempts = next_attempts,
    family_redeem_locked_until = next_lock,
    updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'status', case when next_lock is null then 'invalid' else 'locked' end,
    'attemptsRemaining', greatest(0, 5 - next_attempts),
    'lockedUntil', next_lock
  );
end;
$$;

create or replace function public.issue_family_link_code(p_actor_user_id uuid, p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := p_actor_user_id;
  current_role text;
  link_id uuid;
  expires_at timestamptz := now() + interval '5 minutes';
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid code hash'; end if;
  select role into current_role from public.profiles where id = current_user_id;
  if current_role is null or current_role not in ('student', 'guardian') then raise exception 'profile role required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('family-issue:' || current_user_id::text, 0));
  if current_role = 'student' and exists (
    select 1 from public.family_links where student_user_id = current_user_id and status = 'active'
  ) then raise exception 'student already has an active guardian'; end if;
  if (select count(*) from public.family_links where issuer_user_id = current_user_id and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'family code issue rate limit exceeded';
  end if;

  update public.family_links set status = 'revoked', code_hash = null, code_expires_at = null, updated_at = now()
  where issuer_user_id = current_user_id and status = 'pending';

  insert into public.family_links (
    student_user_id, guardian_user_id, issuer_user_id, issuer_role, status, code_hash, code_expires_at
  ) values (
    case when current_role = 'student' then current_user_id else null end,
    case when current_role = 'guardian' then current_user_id else null end,
    current_user_id, current_role, 'pending', p_code_hash, expires_at
  ) returning id into link_id;

  return jsonb_build_object(
    'id', link_id,
    'status', 'pending',
    'codeExpiresAt', expires_at,
    'event', jsonb_build_object('kind', 'family_link_code_issued', 'recipientUserId', current_user_id)
  );
end;
$$;

create or replace function public.cancel_family_link_code(p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := p_actor_user_id;
  cancelled_count integer;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  update public.family_links set status = 'revoked', code_hash = null, code_expires_at = null, updated_at = now()
  where issuer_user_id = current_user_id and status = 'pending';
  get diagnostics cancelled_count = row_count;
  return jsonb_build_object('status', 'revoked', 'cancelledCount', cancelled_count);
end;
$$;

create or replace function public.redeem_family_link_code(p_actor_user_id uuid, p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := p_actor_user_id;
  current_role text;
  pending_link public.family_links%rowtype;
  student_id uuid;
  guardian_id uuid;
  failure jsonb;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid code hash'; end if;
  select role into current_role from public.profiles where id = current_user_id;
  if current_role is null or current_role not in ('student', 'guardian') then raise exception 'profile role required'; end if;

  perform pg_advisory_xact_lock(hashtextextended('family-redeem:' || current_user_id::text, 0));
  if exists (select 1 from public.profiles where id = current_user_id and family_redeem_locked_until > now()) then
    return jsonb_build_object(
      'status', 'locked',
      'lockedUntil', (select family_redeem_locked_until from public.profiles where id = current_user_id)
    );
  end if;

  select * into pending_link
  from public.family_links
  where status = 'pending' and code_hash = p_code_hash
  for update;

  if not found or pending_link.code_expires_at <= now() then
    if found then
      update public.family_links set status = 'expired', code_hash = null, code_expires_at = null, updated_at = now()
      where id = pending_link.id;
    end if;
    failure := public.consume_family_redeem_failure(current_user_id);
    return failure;
  end if;

  if pending_link.issuer_user_id = current_user_id or pending_link.issuer_role = current_role then
    update public.family_links set
      failed_attempts = least(5, failed_attempts + 1),
      status = case when failed_attempts + 1 >= 5 then 'revoked' else status end,
      code_hash = case when failed_attempts + 1 >= 5 then null else code_hash end,
      code_expires_at = case when failed_attempts + 1 >= 5 then null else code_expires_at end,
      updated_at = now()
    where id = pending_link.id;
    failure := public.consume_family_redeem_failure(current_user_id);
    return failure;
  end if;

  student_id := case when pending_link.issuer_role = 'student' then pending_link.issuer_user_id else current_user_id end;
  guardian_id := case when pending_link.issuer_role = 'guardian' then pending_link.issuer_user_id else current_user_id end;
  if student_id = guardian_id then raise exception 'self link is not allowed'; end if;
  if exists (
    select 1 from public.family_links
    where student_user_id = student_id and guardian_user_id = guardian_id and status = 'active'
  ) then raise exception 'family link already exists'; end if;
  if exists (
    select 1 from public.family_links where student_user_id = student_id and status = 'active'
  ) then raise exception 'student already has an active guardian'; end if;

  update public.family_links set
    student_user_id = student_id,
    guardian_user_id = guardian_id,
    status = 'active',
    code_hash = null,
    code_expires_at = null,
    linked_at = now(),
    updated_at = now()
  where id = pending_link.id;

  update public.profiles set
    family_redeem_window_started_at = null,
    family_redeem_attempts = 0,
    family_redeem_locked_until = null,
    updated_at = now()
  where id = current_user_id;

  return jsonb_build_object(
    'id', pending_link.id,
    'status', 'active',
    'studentUserId', student_id,
    'guardianUserId', guardian_id,
    'linkedAt', now(),
    'event', jsonb_build_object('kind', 'family_linked', 'studentUserId', student_id, 'guardianUserId', guardian_id)
  );
end;
$$;

create unique index if not exists cloud_focus_sessions_one_active_per_user_idx
  on public.cloud_focus_sessions(user_id)
  where deleted_at is null and payload->>'status' in ('starting', 'active', 'paused', 'awaiting-result');

create or replace function public.upsert_focus_plan(
  p_schedule_id text,
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
  next_payload jsonb;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if coalesce((select role from public.profiles where id = current_user_id), '') <> 'student' then raise exception 'student role required'; end if;
  if p_schedule_id is null or length(p_schedule_id) not between 1 and 300 then raise exception 'invalid schedule id'; end if;
  if p_device_id is null or length(p_device_id) not between 1 and 200 then raise exception 'invalid device id'; end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid focus plan'; end if;
  if length(trim(coalesce(p_payload->>'title', ''))) not between 1 and 120 then raise exception 'invalid title'; end if;
  if length(coalesce(p_payload->>'description', '')) > 2000 then raise exception 'invalid description'; end if;
  if coalesce(p_payload->>'dateKey', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid date key'; end if;
  if jsonb_typeof(p_payload->'targetFocusMinutes') is distinct from 'number'
    or (p_payload->>'targetFocusMinutes') !~ '^[0-9]+$'
    or (p_payload->>'targetFocusMinutes')::integer not between 1 and 720 then raise exception 'invalid focus duration'; end if;
  if jsonb_typeof(p_payload->'breakMinutes') is distinct from 'number'
    or (p_payload->>'breakMinutes') !~ '^[0-9]+$'
    or (p_payload->>'breakMinutes')::integer not between 1 and 120 then raise exception 'invalid break duration'; end if;
  if coalesce(p_payload->>'activityMode', '') not in ('interactive', 'reading', 'watching', 'offline') then raise exception 'invalid activity mode'; end if;
  if coalesce(p_payload->>'blockingMode', '') not in ('allowlist', 'blocklist', 'off') then raise exception 'invalid blocking mode'; end if;
  if coalesce(p_payload->>'priority', '') not in ('low', 'medium', 'high') then raise exception 'invalid priority'; end if;
  if coalesce(p_payload->>'status', '') not in ('draft', 'planned', 'ready') then raise exception 'invalid plan status'; end if;
  if jsonb_typeof(p_payload->'allowedDomains') is distinct from 'array' or jsonb_array_length(p_payload->'allowedDomains') > 200 then raise exception 'invalid allowed domains'; end if;
  if jsonb_typeof(p_payload->'blockedDomains') is distinct from 'array' or jsonb_array_length(p_payload->'blockedDomains') > 200 then raise exception 'invalid blocked domains'; end if;
  if exists (
    select 1 from jsonb_array_elements((p_payload->'allowedDomains') || (p_payload->'blockedDomains')) domain
    where jsonb_typeof(domain) is distinct from 'object'
      or coalesce(domain->>'hostname', '') !~ '^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$'
      or jsonb_typeof(domain->'includeSubdomains') is distinct from 'boolean'
  ) then raise exception 'invalid domain rule'; end if;
  if jsonb_typeof(p_payload->'selfDepositPoints') is distinct from 'number'
    or (p_payload->>'selfDepositPoints') !~ '^[0-9]+$'
    or (p_payload->>'selfDepositPoints')::bigint > 1000000000 then raise exception 'invalid self deposit points'; end if;
  if jsonb_typeof(p_payload->'guardianRewardRequestPoints') is distinct from 'number'
    or (p_payload->>'guardianRewardRequestPoints') !~ '^[0-9]+$'
    or (p_payload->>'guardianRewardRequestPoints')::bigint > 1000000000 then raise exception 'invalid guardian reward points'; end if;
  if p_payload->>'createdAt' is null or p_payload->>'updatedAt' is null then raise exception 'invalid plan timestamps'; end if;
  perform (p_payload->>'createdAt')::timestamptz;
  perform (p_payload->>'updatedAt')::timestamptz;
  perform (p_payload->>'dateKey')::date;
  if p_payload->>'plannedStartAt' is not null then perform (p_payload->>'plannedStartAt')::timestamptz; end if;

  perform pg_advisory_xact_lock(hashtextextended('focus-plan:' || current_user_id::text || ':' || p_schedule_id, 0));
  select version into current_version from public.cloud_schedules
  where user_id = current_user_id and entity_id = p_schedule_id for update;
  current_version := coalesce(current_version, 0);
  next_payload := p_payload || jsonb_build_object(
    'id', p_schedule_id,
    'ownerUserId', current_user_id,
    'updatedAt', now()
  );

  insert into public.cloud_schedules (user_id, entity_id, payload, version, device_id, deleted_at)
  values (current_user_id, p_schedule_id, next_payload, current_version + 1, p_device_id, null)
  on conflict (user_id, entity_id) do update set
    payload = excluded.payload,
    version = excluded.version,
    device_id = excluded.device_id,
    deleted_at = null,
    updated_at = now();

  return next_payload;
end;
$$;

create or replace function public.start_focus_session(
  p_schedule_id text,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  plan_payload jsonb;
  session_id text := gen_random_uuid()::text;
  started_at timestamptz := now();
  ends_at timestamptz;
  session_payload jsonb;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if coalesce((select role from public.profiles where id = current_user_id), '') <> 'student' then raise exception 'student role required'; end if;
  if p_schedule_id is null or length(p_schedule_id) not between 1 and 300 then raise exception 'invalid schedule id'; end if;
  if p_device_id is null or length(p_device_id) not between 1 and 200 then raise exception 'invalid device id'; end if;

  perform pg_advisory_xact_lock(hashtextextended('focus-start:' || current_user_id::text, 0));
  select payload into plan_payload from public.cloud_schedules
  where user_id = current_user_id and entity_id = p_schedule_id and deleted_at is null
  for update;
  if plan_payload is null then raise exception 'focus plan not found'; end if;
  if plan_payload->>'ownerUserId' is distinct from current_user_id::text then raise exception 'focus plan ownership mismatch'; end if;
  if coalesce(plan_payload->>'status', '') not in ('planned', 'ready') then raise exception 'focus plan is not ready'; end if;
  if exists (
    select 1 from public.cloud_focus_sessions
    where user_id = current_user_id and deleted_at is null
      and payload->>'status' in ('starting', 'active', 'paused', 'awaiting-result')
  ) then raise exception 'active focus session already exists'; end if;

  ends_at := started_at + make_interval(mins => (plan_payload->>'targetFocusMinutes')::integer);
  session_payload := jsonb_build_object(
    'id', session_id,
    'scheduleId', p_schedule_id,
    'ownerUserId', current_user_id,
    'dateKey', plan_payload->>'dateKey',
    'startedAt', started_at,
    'endsAt', ends_at,
    'targetFocusMinutes', (plan_payload->>'targetFocusMinutes')::integer,
    'blockingMode', plan_payload->>'blockingMode',
    'status', 'active',
    'extensionEnforcementState', 'pending',
    'result', null,
    'selfDepositPoints', (plan_payload->>'selfDepositPoints')::bigint,
    'guardianRewardRequestPoints', (plan_payload->>'guardianRewardRequestPoints')::bigint
  );

  insert into public.cloud_focus_sessions (user_id, entity_id, payload, version, device_id, deleted_at)
  values (current_user_id, session_id, session_payload, 1, p_device_id, null);
  update public.cloud_schedules set
    payload = payload || jsonb_build_object('status', 'active', 'updatedAt', now()),
    version = version + 1,
    device_id = p_device_id,
    updated_at = now()
  where user_id = current_user_id and entity_id = p_schedule_id;

  return session_payload;
end;
$$;

revoke all on function public.set_profile_role(text, text, text) from public, anon;
revoke all on function public.consume_family_redeem_failure(uuid) from public, anon, authenticated;
revoke all on function public.issue_family_link_code(uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_family_link_code(uuid) from public, anon, authenticated;
revoke all on function public.redeem_family_link_code(uuid, text) from public, anon, authenticated;
revoke all on function public.upsert_focus_plan(text, jsonb, text) from public, anon;
revoke all on function public.start_focus_session(text, text) from public, anon;
grant execute on function public.set_profile_role(text, text, text) to authenticated;
grant execute on function public.issue_family_link_code(uuid, text) to service_role;
grant execute on function public.cancel_family_link_code(uuid) to service_role;
grant execute on function public.redeem_family_link_code(uuid, text) to service_role;
grant execute on function public.upsert_focus_plan(text, jsonb, text) to authenticated;
grant execute on function public.start_focus_session(text, text) to authenticated;
