-- Reuse cloud_schedules payloads; preserve IDs and createdAt, reject stale or in-use plan edits.
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
  existing_payload jsonb;
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
  if jsonb_typeof(p_payload->'goals') is distinct from 'array'
    or jsonb_array_length(p_payload->'goals') not between 1 and 100 then raise exception 'invalid focus goals'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload->'goals') goal
    where jsonb_typeof(goal) is distinct from 'object'
      or length(trim(coalesce(goal->>'id', ''))) not between 1 and 128
      or length(trim(coalesce(goal->>'name', ''))) not between 1 and 120
      or length(coalesce(goal->>'detail', '')) > 1000
      or jsonb_typeof(goal->'minutes') is distinct from 'number'
      or coalesce(goal->>'minutes', '') !~ '^[0-9]+$'
      or (goal->>'minutes')::integer not between 1 and 720
      or coalesce(goal->>'priority', '') not in ('low', 'medium', 'high')
  ) then raise exception 'invalid focus goal'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload->'goals') goal
    group by goal->>'id' having count(*) > 1
  ) then raise exception 'duplicate focus goal id'; end if;
  if p_payload->>'createdAt' is null or p_payload->>'updatedAt' is null then raise exception 'invalid plan timestamps'; end if;
  perform (p_payload->>'createdAt')::timestamptz;
  perform (p_payload->>'updatedAt')::timestamptz;
  perform (p_payload->>'dateKey')::date;
  if p_payload->>'plannedStartAt' is not null then perform (p_payload->>'plannedStartAt')::timestamptz; end if;

  perform pg_advisory_xact_lock(hashtextextended('focus-start:' || current_user_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('focus-plan:' || current_user_id::text || ':' || p_schedule_id, 0));
  select version, payload into current_version, existing_payload from public.cloud_schedules
  where user_id = current_user_id and entity_id = p_schedule_id for update;
  if existing_payload is not null then
    if coalesce(existing_payload->>'status', '') not in ('draft', 'planned', 'ready') then
      raise exception 'focus plan cannot be edited';
    end if;
    if (p_payload->>'updatedAt')::timestamptz is distinct from (existing_payload->>'updatedAt')::timestamptz then
      raise exception 'focus plan changed; reload required';
    end if;
  end if;
  if exists (select 1 from public.cloud_focus_sessions
    where user_id = current_user_id and deleted_at is null
      and payload->>'scheduleId' = p_schedule_id
      and payload->>'status' in ('starting','active','paused','awaiting-result')) then
    raise exception 'focus plan has an unfinished session';
  end if;
  if exists (select 1 from public.wallet_transactions request
    where request.schedule_id = p_schedule_id and request.from_user_id = current_user_id
      and request.kind = 'guardian_reward_requested'
      and not exists (select 1 from public.wallet_transactions resolution
        where resolution.related_transaction_id = request.id and resolution.kind = 'guardian_reward_declined')
      and not exists (select 1 from public.wallet_transactions reservation
        join public.wallet_transactions settlement on settlement.related_transaction_id = reservation.id
        where reservation.related_transaction_id = request.id and reservation.kind = 'guardian_deposit_reserved'
          and settlement.kind in ('guardian_reward_released','guardian_deposit_returned'))) then
    raise exception 'focus plan has a pending guardian request';
  end if;
  current_version := coalesce(current_version, 0);
  next_payload := p_payload || jsonb_build_object(
    'id', p_schedule_id,
    'ownerUserId', current_user_id,
    'createdAt', coalesce(existing_payload->'createdAt', p_payload->'createdAt'),
    'updatedAt', clock_timestamp()
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


revoke all on function public.upsert_focus_plan(text,jsonb,text) from public, anon;
grant execute on function public.upsert_focus_plan(text,jsonb,text) to authenticated;

create or replace function public.cancel_focus_plan(p_schedule_id text, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  existing_payload jsonb;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if coalesce((select role from public.profiles where id=current_user_id),'') <> 'student' then raise exception 'student role required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-start:' || current_user_id::text, 0));
  select payload into existing_payload from public.cloud_schedules
    where user_id=current_user_id and entity_id=p_schedule_id and deleted_at is null for update;
  if existing_payload is null then raise exception 'focus plan not found'; end if;
  if existing_payload->>'status' = 'cancelled' then return existing_payload; end if;
  if coalesce(existing_payload->>'status','') not in ('draft','planned','ready') then raise exception 'focus plan cannot be edited'; end if;
  if p_expected_updated_at is distinct from (existing_payload->>'updatedAt')::timestamptz then raise exception 'focus plan changed; reload required'; end if;
  if exists (select 1 from public.cloud_focus_sessions
    where user_id = current_user_id and deleted_at is null
      and payload->>'scheduleId' = p_schedule_id
      and payload->>'status' in ('starting','active','paused','awaiting-result')) then
    raise exception 'focus plan has an unfinished session';
  end if;
  if exists (select 1 from public.wallet_transactions request
    where request.schedule_id = p_schedule_id and request.from_user_id = current_user_id
      and request.kind = 'guardian_reward_requested'
      and not exists (select 1 from public.wallet_transactions resolution
        where resolution.related_transaction_id = request.id and resolution.kind = 'guardian_reward_declined')
      and not exists (select 1 from public.wallet_transactions reservation
        join public.wallet_transactions settlement on settlement.related_transaction_id = reservation.id
        where reservation.related_transaction_id = request.id and reservation.kind = 'guardian_deposit_reserved'
          and settlement.kind in ('guardian_reward_released','guardian_deposit_returned'))) then
    raise exception 'focus plan has a pending guardian request';
  end if;

  update public.cloud_schedules set payload=payload||jsonb_build_object('status','cancelled','updatedAt',clock_timestamp()),
    version=version+1, updated_at=now()
    where user_id=current_user_id and entity_id=p_schedule_id returning payload into existing_payload;
  return existing_payload;
end;
$$;
revoke all on function public.cancel_focus_plan(text,timestamptz) from public,anon;
grant execute on function public.cancel_focus_plan(text,timestamptz) to authenticated;
