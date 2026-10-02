-- Requires the coordinated enforcement-start rollout (202610020003) and new Web/Extension policy UI.
-- New sessions snapshot v3 all-or-none; sessions lacking a snapshot retain legacy tiered behavior.
-- Existing posted ledger transactions and past session payloads are never rewritten.
-- Preserve existing lifecycle/ledger wrappers; enforced starts require application acknowledgement.
create or replace function public.start_focus_session_pre_lifecycle_internal(p_schedule_id text, p_device_id text)
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
    'status', case when plan_payload->>'blockingMode'='off' then 'active' else 'starting' end,
    'extensionEnforcementState', case when plan_payload->>'blockingMode'='off' then 'not-required' else 'pending' end,
    'enforcementDeadlineAt', case when plan_payload->>'blockingMode'='off' then null else started_at + interval '60 seconds' end,
    'result', null,
    'depositPolicy',jsonb_build_object('version',2,'mode','all-or-none'),
    'selfDepositPoints', deposit_points,
    'selfDepositTransactionId', reservation_id,
    'guardianRewardRequestPoints', (plan_payload->>'guardianRewardRequestPoints')::bigint
  );

  insert into public.cloud_focus_sessions (user_id, entity_id, payload, version, device_id, deleted_at)
  values (current_user_id, session_id, session_payload, 1, p_device_id, null);
  update public.cloud_schedules set
    payload = payload || jsonb_build_object('status', case when plan_payload->>'blockingMode'='off' then 'active' else 'ready' end, 'updatedAt', now()),
    version = version + 1,
    device_id = p_device_id,
    updated_at = now()
  where user_id = current_user_id and entity_id = p_schedule_id;

  return session_payload || jsonb_build_object('walletBalances', public.get_wallet_balances(current_user_id));
end;
$$;

create or replace function public.finish_focus_session_goal_internal(
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
  if session_payload ? 'depositPolicy' and session_payload->'depositPolicy' <> '{"version":2,"mode":"all-or-none"}'::jsonb
    and session_payload->'depositPolicy' <> '{"version":1,"mode":"tiered"}'::jsonb then
    raise exception 'unsupported deposit policy';
  end if;
  earned_points := case when session_payload->'depositPolicy'->>'mode' = 'all-or-none'
    then case when completion_percent=100 then deposit_points else 0 end
    else (deposit_points * completion_percent) / 100 end;
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
        jsonb_build_object('depositPolicy',coalesce(session_payload->'depositPolicy','{"version":1,"mode":"tiered"}'::jsonb),'completionPercent', completion_percent, 'completedGoalCount', completed_goal_count, 'totalGoalCount', total_goal_count)
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
        jsonb_build_object('depositPolicy',coalesce(session_payload->'depositPolicy','{"version":1,"mode":"tiered"}'::jsonb),'completionPercent', completion_percent, 'completedGoalCount', completed_goal_count, 'totalGoalCount', total_goal_count)
      ) on conflict (idempotency_key) do nothing;
    end if;
  end if;

  select jsonb_agg(
    jsonb_build_object('goalId', goal->>'id', 'completed', (goal->>'id') = any(p_completed_goal_ids))
    order by ordinal
  ) into goal_results
  from jsonb_array_elements(session_goals) with ordinality as item(goal, ordinal);

  final_status := case when completion_percent=100 or (completion_percent>0 and coalesce(session_payload->'depositPolicy'->>'mode','tiered')='tiered') then 'success' else 'failed' end;
  schedule_status := case when final_status='success' then 'completed' else 'failed' end;
  session_payload := session_payload || jsonb_build_object(
    'status', final_status,
    'accumulatedBreakSeconds',coalesce((session_payload->>'accumulatedBreakSeconds')::integer,0)
      + case when session_payload->>'pauseKind'='break' then greatest(0,floor(extract(epoch from (
        least(now(),(session_payload->>'breakEndsAt')::timestamptz)-(session_payload->>'breakStartedAt')::timestamptz)))::integer) else 0 end,
    'pauseKind',null,'breakStartedAt',null,'breakEndsAt',null,
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


revoke all on function public.finish_focus_session_goal_internal(text,text[],text) from public,anon,authenticated;
