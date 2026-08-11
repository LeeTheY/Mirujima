-- Focus deposits reuse the append-only wallet ledger. Starting reserves topup
-- points atomically; finishing splits the reservation into earned and returned
-- amounts according to the server-validated completion percentage.
create or replace function public.get_wallet_balances(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  topup_available bigint;
  earned_available bigint;
  reserved_available bigint;
  cashout_reserved bigint;
  cashout_completed bigint;
  guardian_reward_completed bigint;
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  select
    coalesce(sum(case when to_user_id=p_user_id and to_bucket='topup' then points else 0 end),0)
      - coalesce(sum(case when from_user_id=p_user_id and from_bucket='topup' then points else 0 end),0),
    coalesce(sum(case when to_user_id=p_user_id and to_bucket='earned' then points else 0 end),0)
      - coalesce(sum(case when from_user_id=p_user_id and from_bucket='earned' then points else 0 end),0),
    coalesce(sum(case when to_user_id=p_user_id and to_bucket='reserved' then points else 0 end),0)
      - coalesce(sum(case when from_user_id=p_user_id and from_bucket='reserved' then points else 0 end),0),
    coalesce(sum(case when to_user_id=p_user_id and to_bucket='cashout_reserved' then points else 0 end),0)
      - coalesce(sum(case when from_user_id=p_user_id and from_bucket='cashout_reserved' then points else 0 end),0),
    coalesce(sum(case when from_user_id=p_user_id and kind='cashout_completed' then points else 0 end),0),
    coalesce(sum(case when from_user_id=p_user_id and kind='guardian_reward_released' then points else 0 end),0)
  into topup_available, earned_available, reserved_available, cashout_reserved, cashout_completed, guardian_reward_completed
  from public.wallet_transactions
  where status='posted' and (from_user_id=p_user_id or to_user_id=p_user_id);

  return jsonb_build_object(
    'topupAvailable', topup_available,
    'earnedAvailable', earned_available,
    'reservedAvailable', reserved_available,
    'cashoutReserved', cashout_reserved,
    'cashoutCompleted', cashout_completed,
    'guardianRewardCompleted', guardian_reward_completed
  );
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
    if (wallet_balances->>'topupAvailable')::bigint < deposit_points then
      raise exception 'insufficient topup points';
    end if;
    insert into public.wallet_transactions (
      kind, status, from_user_id, to_user_id, from_bucket, to_bucket, points,
      schedule_id, session_id, idempotency_key, metadata
    ) values (
      'self_deposit_reserved', 'posted', current_user_id, current_user_id, 'topup', 'reserved', deposit_points,
      p_schedule_id, session_id, 'self-deposit-reserved:' || session_id,
      jsonb_build_object('completionPolicy', array[100,80,60,0])
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
  session_row public.cloud_focus_sessions%rowtype;
  session_payload jsonb;
  reservation_row public.wallet_transactions%rowtype;
  deposit_points bigint;
  earned_points bigint;
  returned_points bigint;
  final_status text;
  schedule_status text;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_session_id is null or length(p_session_id) not between 1 and 300 then raise exception 'invalid session id'; end if;
  if p_completion_percent is null or p_completion_percent not in (0, 60, 80, 100) then raise exception 'invalid completion percent'; end if;
  if p_device_id is null or length(p_device_id) not between 1 and 200 then raise exception 'invalid device id'; end if;

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
  if p_completion_percent > 0 and now() < (session_payload->>'endsAt')::timestamptz then
    raise exception 'focus session has not reached target time';
  end if;

  deposit_points := coalesce((session_payload->>'selfDepositPoints')::bigint, 0);
  earned_points := (deposit_points * p_completion_percent) / 100;
  returned_points := deposit_points - earned_points;

  if deposit_points > 0 then
    perform pg_advisory_xact_lock(hashtextextended('wallet:' || current_user_id::text, 0));
    select * into reservation_row from public.wallet_transactions
    where from_user_id = current_user_id and session_id = p_session_id
      and kind = 'self_deposit_reserved' and status = 'posted'
    for update;
    if reservation_row.id is null or reservation_row.points <> deposit_points then
      raise exception 'focus deposit reservation not found';
    end if;

    if earned_points > 0 then
      insert into public.wallet_transactions (
        kind, status, from_user_id, to_user_id, from_bucket, to_bucket, points,
        schedule_id, session_id, related_transaction_id, idempotency_key, metadata
      ) values (
        'self_deposit_earned', 'posted', current_user_id, current_user_id, 'reserved', 'earned', earned_points,
        session_payload->>'scheduleId', p_session_id, reservation_row.id,
        'self-deposit-earned:' || p_session_id,
        jsonb_build_object('completionPercent', p_completion_percent)
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
        jsonb_build_object('completionPercent', p_completion_percent)
      ) on conflict (idempotency_key) do nothing;
    end if;
  end if;

  final_status := case when p_completion_percent = 0 then 'failed' else 'success' end;
  schedule_status := case when p_completion_percent = 0 then 'failed' else 'completed' end;
  session_payload := session_payload || jsonb_build_object(
    'status', final_status,
    'result', jsonb_build_object(
      'completionPercent', p_completion_percent,
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

revoke all on function public.finish_focus_session(text, integer, text) from public, anon;
grant execute on function public.finish_focus_session(text, integer, text) to authenticated;
