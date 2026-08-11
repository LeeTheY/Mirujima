-- Persist focus goals in existing jsonb payloads and derive settlement grades
-- from server-validated completed goal ids. No new table is required because
-- goals belong to the existing schedule and immutable session snapshots.

alter function public.finish_focus_session(text, integer, text)
  rename to finish_focus_session_legacy_internal;

revoke all on function public.finish_focus_session_legacy_internal(text, integer, text)
  from public, anon, authenticated;

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

create or replace function public.start_focus_session(p_schedule_id text, p_device_id text)
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
  deposit_points bigint;
  wallet_balances jsonb;
  reservation_id uuid;
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
  if jsonb_typeof(plan_payload->'goals') is distinct from 'array'
    or jsonb_array_length(plan_payload->'goals') not between 1 and 100 then raise exception 'focus plan goals missing'; end if;
  if exists (
    select 1 from public.cloud_focus_sessions
    where user_id = current_user_id and deleted_at is null
      and payload->>'status' in ('starting', 'active', 'paused', 'awaiting-result')
  ) then raise exception 'active focus session already exists'; end if;

  deposit_points := (plan_payload->>'selfDepositPoints')::bigint;
  if deposit_points > 0 then
    perform pg_advisory_xact_lock(hashtextextended('topup-refund:' || current_user_id::text, 0));
    perform pg_advisory_xact_lock(hashtextextended('wallet:' || current_user_id::text, 0));
    wallet_balances := public.get_wallet_balances(current_user_id);
    if (wallet_balances->>'topupAvailable')::bigint < deposit_points then raise exception 'insufficient topup points'; end if;
    insert into public.wallet_transactions (
      kind, status, from_user_id, to_user_id, from_bucket, to_bucket, points,
      schedule_id, session_id, idempotency_key, metadata
    ) values (
      'self_deposit_reserved', 'posted', current_user_id, current_user_id, 'topup', 'reserved', deposit_points,
      p_schedule_id, session_id, 'self-deposit-reserved:' || session_id,
      jsonb_build_object('completionPolicy', array[100,80,60,0], 'basis', 'completed-goal-count')
    ) returning id into reservation_id;
  end if;

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
    'goals', plan_payload->'goals',
    'status', 'active',
    'extensionEnforcementState', 'pending',
    'result', null,
    'selfDepositPoints', deposit_points,
    'selfDepositTransactionId', reservation_id,
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

  return session_payload || jsonb_build_object('walletBalances', public.get_wallet_balances(current_user_id));
end;
$$;

create or replace function public.finish_focus_session(
  p_session_id text,
  p_completed_goal_ids text[],
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  session_row public.cloud_focus_sessions%rowtype;
  session_payload jsonb;
  session_goals jsonb;
  reservation_row public.wallet_transactions%rowtype;
  total_goal_count integer;
  completed_goal_count integer;
  completion_percent integer;
  deposit_points bigint;
  earned_points bigint;
  returned_points bigint;
  goal_results jsonb;
  final_status text;
  schedule_status text;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_session_id is null or length(p_session_id) not between 1 and 300 then raise exception 'invalid session id'; end if;
  if p_completed_goal_ids is null then raise exception 'invalid completed goal ids'; end if;
  if p_device_id is null or length(p_device_id) not between 1 and 200 then raise exception 'invalid device id'; end if;
  if exists (
    select 1 from unnest(p_completed_goal_ids) goal_id
    where goal_id is null or length(trim(goal_id)) not between 1 and 128
  ) then raise exception 'invalid completed goal ids'; end if;
  if exists (
    select 1 from unnest(p_completed_goal_ids) goal_id
    group by goal_id having count(*) > 1
  ) then raise exception 'invalid completed goal ids'; end if;

  perform pg_advisory_xact_lock(hashtextextended('focus-finish:' || current_user_id::text || ':' || p_session_id, 0));
  select * into session_row from public.cloud_focus_sessions
  where user_id = current_user_id and entity_id = p_session_id and deleted_at is null
  for update;
  if not found then raise exception 'focus session not found'; end if;
  session_payload := session_row.payload;
  if session_payload->>'status' in ('success', 'failed', 'cancelled') then
    return session_payload || jsonb_build_object('walletBalances', public.get_wallet_balances(current_user_id));
  end if;
  if session_payload->>'status' not in ('active', 'paused', 'awaiting-result') then raise exception 'focus session cannot finish'; end if;
  session_goals := session_payload->'goals';
  if jsonb_typeof(session_goals) is distinct from 'array'
    or jsonb_array_length(session_goals) not between 1 and 100 then raise exception 'focus session goals missing'; end if;
  if exists (
    select 1 from unnest(p_completed_goal_ids) completed_id
    where not exists (
      select 1 from jsonb_array_elements(session_goals) goal where goal->>'id' = completed_id
    )
  ) then raise exception 'invalid completed goal ids'; end if;

  total_goal_count := jsonb_array_length(session_goals);
  completed_goal_count := coalesce(array_length(p_completed_goal_ids, 1), 0);
  completion_percent := case
    when completed_goal_count = 0 then 0
    when completed_goal_count = total_goal_count then 100
    when completed_goal_count * 2 >= total_goal_count then 80
    else 60
  end;
  if completion_percent > 0 and now() < (session_payload->>'endsAt')::timestamptz then
    raise exception 'focus session has not reached target time';
  end if;

  deposit_points := coalesce((session_payload->>'selfDepositPoints')::bigint, 0);
  earned_points := (deposit_points * completion_percent) / 100;
  returned_points := deposit_points - earned_points;

  if deposit_points > 0 then
    perform pg_advisory_xact_lock(hashtextextended('wallet:' || current_user_id::text, 0));
    select * into reservation_row from public.wallet_transactions
    where from_user_id = current_user_id and session_id = p_session_id
      and kind = 'self_deposit_reserved' and status = 'posted'
    for update;
    if reservation_row.id is null or reservation_row.points <> deposit_points then raise exception 'focus deposit reservation not found'; end if;

    if earned_points > 0 then
      insert into public.wallet_transactions (
        kind, status, from_user_id, to_user_id, from_bucket, to_bucket, points,
        schedule_id, session_id, related_transaction_id, idempotency_key, metadata
      ) values (
        'self_deposit_earned', 'posted', current_user_id, current_user_id, 'reserved', 'earned', earned_points,
        session_payload->>'scheduleId', p_session_id, reservation_row.id,
        'self-deposit-earned:' || p_session_id,
        jsonb_build_object('completionPercent', completion_percent, 'completedGoalCount', completed_goal_count, 'totalGoalCount', total_goal_count)
      ) on conflict (idempotency_key) do nothing;
    end if;
    if returned_points > 0 then
      insert into public.wallet_transactions (
        kind, status, from_user_id, to_user_id, from_bucket, to_bucket, points,
        schedule_id, session_id, related_transaction_id, idempotency_key, metadata
      ) values (
        'self_deposit_returned', 'posted', current_user_id, current_user_id, 'reserved', 'topup', returned_points,
        session_payload->>'scheduleId', p_session_id, reservation_row.id,
        'self-deposit-returned:' || p_session_id,
        jsonb_build_object('completionPercent', completion_percent, 'completedGoalCount', completed_goal_count, 'totalGoalCount', total_goal_count)
      ) on conflict (idempotency_key) do nothing;
    end if;
  end if;

  select jsonb_agg(
    jsonb_build_object('goalId', goal->>'id', 'completed', (goal->>'id') = any(p_completed_goal_ids))
    order by ordinal
  ) into goal_results
  from jsonb_array_elements(session_goals) with ordinality as item(goal, ordinal);

  final_status := case when completion_percent = 0 then 'failed' else 'success' end;
  schedule_status := case when completion_percent = 0 then 'failed' else 'completed' end;
  session_payload := session_payload || jsonb_build_object(
    'status', final_status,
    'result', jsonb_build_object(
      'completedGoalIds', to_jsonb(p_completed_goal_ids),
      'goalResults', goal_results,
      'completedGoalCount', completed_goal_count,
      'totalGoalCount', total_goal_count,
      'completionPercent', completion_percent,
      'earnedPoints', earned_points,
      'returnedPoints', returned_points,
      'settledAt', now()
    ),
    'updatedAt', now()
  );
  update public.cloud_focus_sessions set
    payload = session_payload,
    version = version + 1,
    device_id = p_device_id,
    updated_at = now()
  where user_id = current_user_id and entity_id = p_session_id;
  update public.cloud_schedules set
    payload = payload || jsonb_build_object('status', schedule_status, 'updatedAt', now()),
    version = version + 1,
    device_id = p_device_id,
    updated_at = now()
  where user_id = current_user_id and entity_id = session_payload->>'scheduleId';

  return session_payload || jsonb_build_object('walletBalances', public.get_wallet_balances(current_user_id));
end;
$$;

create or replace function public.finish_focus_session(
  p_session_id text,
  p_completion_percent integer,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  session_payload jsonb;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  select payload into session_payload from public.cloud_focus_sessions
  where user_id = current_user_id and entity_id = p_session_id and deleted_at is null;
  if session_payload is null then raise exception 'focus session not found'; end if;
  if session_payload ? 'goals' then raise exception 'legacy completion is not allowed'; end if;
  return public.finish_focus_session_legacy_internal(p_session_id, p_completion_percent, p_device_id);
end;
$$;

revoke all on function public.upsert_focus_plan(text, jsonb, text) from public, anon;
revoke all on function public.start_focus_session(text, text) from public, anon;
revoke all on function public.finish_focus_session(text, text[], text) from public, anon;
revoke all on function public.finish_focus_session(text, integer, text) from public, anon;
grant execute on function public.upsert_focus_plan(text, jsonb, text) to authenticated;
grant execute on function public.start_focus_session(text, text) to authenticated;
grant execute on function public.finish_focus_session(text, text[], text) to authenticated;
grant execute on function public.finish_focus_session(text, integer, text) to authenticated;
