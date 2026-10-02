-- Coordinated rollout: requires 202610020003 and 202610020006 plus Web approval UI.
-- Reuses the immutable wallet ledger. A planned request allocates the future session ID;
-- no posted transaction is updated to attach it to a later session. No new tables.
create or replace function public.get_focus_session(p_session_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  session_row public.cloud_focus_sessions%rowtype;
  normalized jsonb;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-start:'||current_user_id::text,0));
  if p_session_id is null or length(p_session_id) not between 1 and 300 then raise exception 'invalid session id'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-lifecycle:' || current_user_id::text || ':' || p_session_id, 0));
  select * into session_row from public.cloud_focus_sessions
  where user_id = current_user_id and entity_id = p_session_id and deleted_at is null
  for update;
  if not found then return null; end if;

  if session_row.payload->>'status'='starting' and (session_row.payload->>'enforcementDeadlineAt')::timestamptz <= now() then
    return public.cancel_focus_start(p_session_id,session_row.device_id);
  end if;
  normalized := public.normalize_focus_session_lifecycle_payload(session_row.payload, now(), true);
  if normalized is distinct from session_row.payload then
    update public.cloud_focus_sessions set payload = normalized, version = version + 1, updated_at = now()
    where user_id = current_user_id and entity_id = p_session_id;
  end if;
  return normalized;
end;
$$;

create or replace function public.confirm_focus_enforcement(p_session_id text,p_device_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller_id uuid := (select auth.uid()); session_row public.cloud_focus_sessions%rowtype; next_payload jsonb;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-start:'||caller_id::text,0));
  if p_session_id is null or length(p_session_id) not between 1 and 300 then raise exception 'invalid session id'; end if;
  if p_device_id is null or length(p_device_id) not between 1 and 200 then raise exception 'invalid device id'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-lifecycle:'||caller_id::text||':'||p_session_id,0));
  select * into session_row from public.cloud_focus_sessions where user_id=caller_id and entity_id=p_session_id and deleted_at is null for update;
  if not found then raise exception 'focus session not found'; end if;
  if session_row.payload->>'status'<>'starting' then return public.get_focus_session(p_session_id); end if;
  if (session_row.payload->>'enforcementDeadlineAt')::timestamptz <= now() then return public.cancel_focus_start(p_session_id,p_device_id); end if;
  next_payload := session_row.payload||jsonb_build_object('status','active','extensionEnforcementState','applied',
    'startedAt',now(),'activeSegmentStartedAt',now(),'endsAt',now()+make_interval(mins=>(session_row.payload->>'targetFocusMinutes')::integer),
    'remainingFocusSeconds',(session_row.payload->>'targetFocusMinutes')::integer*60,'accumulatedFocusSeconds',0,'updatedAt',now());
  update public.cloud_focus_sessions set payload=next_payload,version=version+1,device_id=p_device_id,updated_at=now() where user_id=caller_id and entity_id=p_session_id;
  update public.cloud_schedules set payload=payload||jsonb_build_object('status','active','updatedAt',now()),version=version+1,updated_at=now()
    where user_id=caller_id and entity_id=session_row.payload->>'scheduleId';
  return next_payload;
end;
$$;

create or replace function public.pause_focus_session(p_session_id text, p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  session_row public.cloud_focus_sessions%rowtype;
  next_payload jsonb;
  target_seconds integer;
  accumulated_seconds integer;
  segment_seconds integer;
  remaining_seconds integer;
  now_at timestamptz := now();
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-start:'||current_user_id::text,0));
  if p_session_id is null or length(p_session_id) not between 1 and 300 then raise exception 'invalid session id'; end if;
  if p_device_id is null or length(p_device_id) not between 1 and 200 then raise exception 'invalid device id'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-lifecycle:' || current_user_id::text || ':' || p_session_id, 0));
  select * into session_row from public.cloud_focus_sessions
  where user_id = current_user_id and entity_id = p_session_id and deleted_at is null for update;
  if not found then raise exception 'focus session not found'; end if;
  next_payload := public.normalize_focus_session_lifecycle_payload(session_row.payload, now_at, true);
  if next_payload->>'status' in ('paused', 'awaiting-result') then
    if next_payload is distinct from session_row.payload then
      update public.cloud_focus_sessions set payload=next_payload,version=version+1,device_id=p_device_id,updated_at=now_at
      where user_id=current_user_id and entity_id=p_session_id;
    end if;
    return next_payload;
  end if;
  if next_payload->>'status' <> 'active' then raise exception 'focus session cannot pause'; end if;

  target_seconds := (next_payload->>'targetFocusMinutes')::integer * 60;
  accumulated_seconds := coalesce((next_payload->>'accumulatedFocusSeconds')::integer, 0);
  segment_seconds := greatest(0, floor(extract(epoch from (now_at - (next_payload->>'activeSegmentStartedAt')::timestamptz)))::integer);
  accumulated_seconds := least(target_seconds, accumulated_seconds + segment_seconds);
  remaining_seconds := greatest(0, target_seconds - accumulated_seconds);
  next_payload := next_payload || jsonb_build_object(
    'status', case when remaining_seconds = 0 then 'awaiting-result' else 'paused' end,
    'pauseKind','manual', 'breakStartedAt',null, 'breakEndsAt',null,
    'activeSegmentStartedAt', null,
    'pausedAt', now_at,
    'accumulatedFocusSeconds', accumulated_seconds,
    'remainingFocusSeconds', remaining_seconds,
    'updatedAt', now_at
  );
  update public.cloud_focus_sessions set payload=next_payload,version=version+1,device_id=p_device_id,updated_at=now_at
  where user_id=current_user_id and entity_id=p_session_id;
  return next_payload;
end;
$$;

create or replace function public.resume_focus_session(p_session_id text, p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  session_row public.cloud_focus_sessions%rowtype;
  next_payload jsonb;
  remaining_seconds integer;
  now_at timestamptz := now();
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-start:'||current_user_id::text,0));
  if p_session_id is null or length(p_session_id) not between 1 and 300 then raise exception 'invalid session id'; end if;
  if p_device_id is null or length(p_device_id) not between 1 and 200 then raise exception 'invalid device id'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-lifecycle:' || current_user_id::text || ':' || p_session_id, 0));
  select * into session_row from public.cloud_focus_sessions
  where user_id = current_user_id and entity_id = p_session_id and deleted_at is null for update;
  if not found then raise exception 'focus session not found'; end if;
  next_payload := public.normalize_focus_session_lifecycle_payload(session_row.payload, now_at, false);
  if next_payload->>'status' = 'active' then
    if next_payload is distinct from session_row.payload then
      update public.cloud_focus_sessions set payload=next_payload,version=version+1,device_id=p_device_id,updated_at=now_at
        where user_id=current_user_id and entity_id=p_session_id;
    end if;
    return next_payload;
  end if;
  if next_payload->>'status' <> 'paused' then raise exception 'focus session cannot resume'; end if;
  remaining_seconds := coalesce((next_payload->>'remainingFocusSeconds')::integer, 0);
  if remaining_seconds <= 0 then
    next_payload := next_payload || jsonb_build_object('status','awaiting-result','activeSegmentStartedAt',null,'pausedAt',now_at,'remainingFocusSeconds',0,'updatedAt',now_at);
  else
    next_payload := next_payload || jsonb_build_object(
      'status', 'active',
      'accumulatedBreakSeconds',coalesce((next_payload->>'accumulatedBreakSeconds')::integer,0)
        + case when next_payload->>'pauseKind'='break' then greatest(0,floor(extract(epoch from (
            least(now_at,(next_payload->>'breakEndsAt')::timestamptz)-(next_payload->>'breakStartedAt')::timestamptz)))::integer) else 0 end,
      'pauseKind',null, 'breakStartedAt',null, 'breakEndsAt',null,
      'activeSegmentStartedAt', now_at,
      'pausedAt', null,
      'endsAt', now_at + make_interval(secs => remaining_seconds),
      'updatedAt', now_at
    );
  end if;
  update public.cloud_focus_sessions set payload=next_payload,version=version+1,device_id=p_device_id,updated_at=now_at
  where user_id=current_user_id and entity_id=p_session_id;
  return next_payload;
end;
$$;

create or replace function public.start_focus_break(p_session_id text,p_device_id text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  caller uuid := (select auth.uid());
  session_payload jsonb;
  plan_payload jsonb;
  budget integer;
  remaining_break integer;
  now_at timestamptz := now();
begin
  if caller is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-start:'||caller::text,0));
  if p_request_id is null then raise exception 'invalid break request'; end if;
  if p_device_id is null or length(p_device_id) not between 1 and 200 then raise exception 'invalid device id'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-lifecycle:'||caller::text||':'||p_session_id,0));
  select payload into session_payload from public.cloud_focus_sessions
    where user_id=caller and entity_id=p_session_id and deleted_at is null for update;
  if not found then raise exception 'focus session not found'; end if;
  if session_payload->>'lastBreakRequestId'=p_request_id::text then return public.get_focus_session(p_session_id); end if;
  session_payload := public.get_focus_session(p_session_id);
  if session_payload->>'status'<>'active' then raise exception 'active focus required for break'; end if;
  select payload into plan_payload from public.cloud_schedules where user_id=caller and entity_id=session_payload->>'scheduleId' and deleted_at is null;
  budget := (plan_payload->>'breakMinutes')::integer * 60;
  if budget is null or budget not between 60 and 7200 then raise exception 'invalid break budget'; end if;
  remaining_break := greatest(0,budget-coalesce((session_payload->>'accumulatedBreakSeconds')::integer,0));
  if remaining_break=0 then raise exception 'break budget exhausted'; end if;
  session_payload := public.pause_focus_session(p_session_id,p_device_id);
  if session_payload->>'status'<>'paused' then return session_payload; end if;
  session_payload := session_payload || jsonb_build_object(
    'pauseKind','break','breakStartedAt',now_at,'breakEndsAt',now_at+make_interval(secs=>remaining_break),
    'lastBreakRequestId',p_request_id,'updatedAt',now_at);
  update public.cloud_focus_sessions set payload=session_payload,version=version+1,device_id=p_device_id,updated_at=now_at
    where user_id=caller and entity_id=p_session_id;
  return session_payload;
end;
$$;

create or replace function public.finish_focus_session(p_session_id text,p_completed_goal_ids text[],p_device_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid := (select auth.uid()); settled jsonb; request_row public.wallet_transactions%rowtype; reservation public.wallet_transactions%rowtype; guardian_transaction_id uuid; succeeded boolean;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-start:'||current_user_id::text,0));
  settled := public.finish_focus_session_pre_guardian_reward_internal(p_session_id,p_completed_goal_ids,p_device_id);
  select * into request_row from public.wallet_transactions where from_user_id=current_user_id and session_id=p_session_id and kind='guardian_reward_requested';
  if request_row.id is null then return settled; end if;
  perform pg_advisory_xact_lock(hashtextextended('guardian-reward:'||request_row.id::text,0));
  select * into reservation from public.wallet_transactions where related_transaction_id=request_row.id and kind='guardian_deposit_reserved' for update;
  if reservation.id is null then return settled; end if;
  perform pg_advisory_xact_lock(hashtextextended('wallet:'||reservation.from_user_id::text,0));
  succeeded := settled->>'status'='success';
  if succeeded then
    insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,schedule_id,session_id,related_transaction_id,idempotency_key,metadata)
    values('guardian_reward_released','posted',reservation.from_user_id,current_user_id,'reserved','earned',reservation.points,request_row.schedule_id,p_session_id,reservation.id,'guardian-reward-released:'||p_session_id,jsonb_build_object('requestId',request_row.id))
    on conflict(idempotency_key) do nothing returning id into guardian_transaction_id;
    if guardian_transaction_id is null then select id into guardian_transaction_id from public.wallet_transactions where idempotency_key='guardian-reward-released:'||p_session_id; end if;
  else
    insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,schedule_id,session_id,related_transaction_id,idempotency_key,metadata)
    values('guardian_deposit_returned','posted',reservation.from_user_id,reservation.from_user_id,'reserved','topup',reservation.points,request_row.schedule_id,p_session_id,reservation.id,'guardian-deposit-returned:'||p_session_id,jsonb_build_object('requestId',request_row.id))
    on conflict(idempotency_key) do nothing returning id into guardian_transaction_id;
    if guardian_transaction_id is null then select id into guardian_transaction_id from public.wallet_transactions where idempotency_key='guardian-deposit-returned:'||p_session_id; end if;
  end if;
  settled := settled||jsonb_build_object('guardianRewardPoints',case when succeeded then reservation.points else 0 end,'guardianRewardTransactionId',guardian_transaction_id);
  update public.cloud_focus_sessions set payload=payload||jsonb_build_object('guardianRewardPoints',case when succeeded then reservation.points else 0 end,'guardianRewardTransactionId',guardian_transaction_id),version=version+1,updated_at=now()
  where user_id=current_user_id and entity_id=p_session_id;
  return settled;
end;
$$;

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
  reward_request public.wallet_transactions%rowtype;
  guardian_reservation_id uuid;
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

  select request.* into reward_request from public.wallet_transactions request
  join public.wallet_transactions reserved on reserved.related_transaction_id=request.id and reserved.kind='guardian_deposit_reserved' and reserved.status='posted'
  where request.from_user_id=current_user_id and request.schedule_id=p_schedule_id and request.kind='guardian_reward_requested'
    and request.metadata->>'preStart'='true'
    and not exists(select 1 from public.wallet_transactions done where done.related_transaction_id=reserved.id and done.kind in ('guardian_deposit_returned','guardian_reward_released'))
    and not exists(select 1 from public.wallet_transactions declined where declined.related_transaction_id=request.id and declined.kind='guardian_reward_declined')
  order by request.created_at desc limit 1;
  if reward_request.id is not null then
    session_id := reward_request.session_id;
    select id into guardian_reservation_id from public.wallet_transactions where related_transaction_id=reward_request.id and kind='guardian_deposit_reserved';
  end if;
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
    'guardianRewardRequestTransactionId', reward_request.id,
    'guardianDepositTransactionId', guardian_reservation_id,
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

create or replace function public.cancel_focus_start(p_session_id text,p_device_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller_id uuid := (select auth.uid()); session_row public.cloud_focus_sessions%rowtype;
  reservation public.wallet_transactions%rowtype; request_row public.wallet_transactions%rowtype; next_payload jsonb; guardian_reservation public.wallet_transactions%rowtype;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-start:'||caller_id::text,0));
  if p_session_id is null or length(p_session_id) not between 1 and 300 then raise exception 'invalid session id'; end if;
  if p_device_id is null or length(p_device_id) not between 1 and 200 then raise exception 'invalid device id'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-lifecycle:'||caller_id::text||':'||p_session_id,0));
  select * into session_row from public.cloud_focus_sessions where user_id=caller_id and entity_id=p_session_id and deleted_at is null for update;
  if not found then raise exception 'focus session not found'; end if;
  if session_row.payload->>'status'='cancelled' then return session_row.payload; end if;
  -- Active is returned rather than cancelled if the application acknowledgement
  -- committed just before the web timeout. Recovery must preserve that result.
  if session_row.payload->>'status'<>'starting' then return session_row.payload; end if;
  perform pg_advisory_xact_lock(hashtextextended('topup-refund:'||caller_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('wallet:'||caller_id::text,0));
  select * into reservation from public.wallet_transactions where kind='self_deposit_reserved'
    and from_user_id=caller_id and session_id=p_session_id for update;
  if reservation.id is not null then
    insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,schedule_id,session_id,related_transaction_id,idempotency_key,metadata)
    values('self_deposit_returned','posted',caller_id,caller_id,'reserved','topup',reservation.points,session_row.payload->>'scheduleId',p_session_id,reservation.id,'self-deposit-returned:'||p_session_id,'{"reason":"enforcement-start-cancelled"}')
    on conflict(idempotency_key) do nothing;
  end if;
  for request_row in select * from public.wallet_transactions where kind='guardian_reward_requested' and from_user_id=caller_id and session_id=p_session_id loop
    select * into guardian_reservation from public.wallet_transactions where related_transaction_id=request_row.id and kind='guardian_deposit_reserved';
    if guardian_reservation.id is not null then
      perform pg_advisory_xact_lock(hashtextextended('topup-refund:'||guardian_reservation.from_user_id::text,0));
      perform pg_advisory_xact_lock(hashtextextended('wallet:'||guardian_reservation.from_user_id::text,0));
      insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,schedule_id,session_id,related_transaction_id,idempotency_key,metadata)
      values('guardian_deposit_returned','posted',guardian_reservation.from_user_id,guardian_reservation.from_user_id,'reserved','topup',guardian_reservation.points,request_row.schedule_id,p_session_id,guardian_reservation.id,'guardian-deposit-returned:'||p_session_id,'{"reason":"enforcement-start-cancelled"}')
      on conflict(idempotency_key) do nothing;
    end if;
    insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,schedule_id,session_id,related_transaction_id,idempotency_key,metadata)
    values('guardian_reward_declined','posted',request_row.to_user_id,caller_id,'external','external',request_row.points,request_row.schedule_id,p_session_id,request_row.id,'guardian-reward-declined:'||request_row.id,'{"reason":"enforcement-start-cancelled"}')
    on conflict(idempotency_key) do nothing;
  end loop;
  next_payload := session_row.payload||jsonb_build_object('status','cancelled','extensionEnforcementState','failed',
    'activeSegmentStartedAt',null,'remainingFocusSeconds',0,'accumulatedFocusSeconds',0,'updatedAt',now());
  update public.cloud_focus_sessions set payload=next_payload,version=version+1,device_id=p_device_id,updated_at=now() where user_id=caller_id and entity_id=p_session_id;
  update public.cloud_schedules set payload=payload||jsonb_build_object('status','ready','updatedAt',now()),version=version+1,updated_at=now()
    where user_id=caller_id and entity_id=session_row.payload->>'scheduleId';
  return next_payload;
end;
$$;

create or replace function public.approve_guardian_reward_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid := (select auth.uid()); request_row public.wallet_transactions%rowtype; reservation public.wallet_transactions%rowtype; session_status text; topup_available bigint; plan_payload jsonb;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if coalesce((select role from public.profiles where id=current_user_id),'')<>'guardian' then raise exception 'guardian role required'; end if;
  select * into request_row from public.wallet_transactions where id=p_request_id and kind='guardian_reward_requested';
  if request_row.id is null or request_row.to_user_id<>current_user_id then raise exception 'reward request not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-start:'||request_row.from_user_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('guardian-reward:'||coalesce(p_request_id::text,''),0));
  select * into request_row from public.wallet_transactions where id=p_request_id and kind='guardian_reward_requested' for update;
  if request_row.id is null or request_row.to_user_id<>current_user_id then raise exception 'reward request not found'; end if;
  if not exists(select 1 from public.family_links link where link.student_user_id=request_row.from_user_id and link.guardian_user_id=current_user_id and link.status='active') then raise exception 'active family link required'; end if;
  select payload->>'status' into session_status from public.cloud_focus_sessions where user_id=request_row.from_user_id and entity_id=request_row.session_id for update;
  if request_row.metadata->>'preStart'='true' and session_status is null then
    select payload into plan_payload from public.cloud_schedules where user_id=request_row.from_user_id and entity_id=request_row.schedule_id and deleted_at is null for update;
    if plan_payload is null or plan_payload->>'ownerUserId' is distinct from request_row.from_user_id::text
      or plan_payload->>'status' not in ('planned','ready')
      or (plan_payload->>'guardianRewardRequestPoints')::bigint is distinct from request_row.points then
      raise exception 'reward request is no longer pending';
    end if;
  elsif session_status is null or session_status in ('success','failed','cancelled') then raise exception 'reward request is no longer pending'; end if;
  if exists(select 1 from public.wallet_transactions where related_transaction_id=request_row.id and kind='guardian_reward_declined') then raise exception 'reward request already declined'; end if;
  select * into reservation from public.wallet_transactions where related_transaction_id=request_row.id and kind='guardian_deposit_reserved';
  if reservation.id is not null and exists(select 1 from public.wallet_transactions where related_transaction_id=reservation.id and kind in ('guardian_deposit_returned','guardian_reward_released')) then raise exception 'reward request is no longer pending'; end if;
  if reservation.id is null then
    perform pg_advisory_xact_lock(hashtextextended('topup-refund:'||current_user_id::text,0));
    perform pg_advisory_xact_lock(hashtextextended('wallet:'||current_user_id::text,0));
    select
      coalesce(sum(case when ledger.to_user_id=current_user_id and ledger.to_bucket='topup' then ledger.points else 0 end),0)
      - coalesce(sum(case when ledger.from_user_id=current_user_id and ledger.from_bucket='topup' then ledger.points else 0 end),0)
    into topup_available from public.wallet_transactions ledger
    where ledger.status='posted' and (ledger.from_user_id=current_user_id or ledger.to_user_id=current_user_id);
    if topup_available<request_row.points then raise exception 'insufficient guardian topup points'; end if;
    insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,schedule_id,session_id,related_transaction_id,idempotency_key,metadata)
    values('guardian_deposit_reserved','posted',current_user_id,current_user_id,'topup','reserved',request_row.points,request_row.schedule_id,request_row.session_id,request_row.id,'guardian-deposit-reserved:'||request_row.id,jsonb_build_object('studentUserId',request_row.from_user_id)) returning * into reservation;
    update public.cloud_focus_sessions set payload=payload||jsonb_build_object('guardianDepositTransactionId',reservation.id),version=version+1,updated_at=now()
    where user_id=request_row.from_user_id and entity_id=request_row.session_id;
  end if;
  return jsonb_build_object('requestId',request_row.id,'status','approved','points',request_row.points,'studentUserId',request_row.from_user_id,'reservationId',reservation.id);
end;
$$;

create or replace function public.decline_guardian_reward_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid := (select auth.uid()); request_row public.wallet_transactions%rowtype; decline_row public.wallet_transactions%rowtype;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if coalesce((select role from public.profiles where id=current_user_id),'')<>'guardian' then raise exception 'guardian role required'; end if;
  select * into request_row from public.wallet_transactions where id=p_request_id and kind='guardian_reward_requested';
  if request_row.id is null or request_row.to_user_id<>current_user_id then raise exception 'reward request not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-start:'||request_row.from_user_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('guardian-reward:'||coalesce(p_request_id::text,''),0));
  select * into request_row from public.wallet_transactions where id=p_request_id and kind='guardian_reward_requested' for update;
  if request_row.id is null or request_row.to_user_id<>current_user_id then raise exception 'reward request not found'; end if;
  if exists(select 1 from public.wallet_transactions where related_transaction_id=request_row.id and kind='guardian_deposit_reserved') then raise exception 'approved reward cannot be declined'; end if;
  select * into decline_row from public.wallet_transactions where related_transaction_id=request_row.id and kind='guardian_reward_declined';
  if decline_row.id is null then
    insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,schedule_id,session_id,related_transaction_id,idempotency_key,metadata)
    values('guardian_reward_declined','posted',current_user_id,request_row.from_user_id,'external','external',request_row.points,request_row.schedule_id,request_row.session_id,request_row.id,'guardian-reward-declined:'||request_row.id,'{}') returning * into decline_row;
  end if;
  return jsonb_build_object('requestId',request_row.id,'status','declined','points',request_row.points,'studentUserId',request_row.from_user_id);
end;
$$;

create or replace function public.disconnect_family_link(p_student_user_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid := (select auth.uid()); caller_profile_role text; student_id uuid; link_row public.family_links%rowtype;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  select role into caller_profile_role from public.profiles where id=current_user_id;
  if caller_profile_role='student' then
    if p_student_user_id is not null and p_student_user_id<>current_user_id then raise exception 'family link access denied'; end if;
    student_id := current_user_id;
  elsif caller_profile_role='guardian' and p_student_user_id is not null then
    student_id := p_student_user_id;
  else raise exception 'family link access denied'; end if;

  perform pg_advisory_xact_lock(hashtextextended('focus-start:'||student_id::text,0));
  -- Start/redeem also lock this relationship. A new funded session cannot
  -- create a request after this transaction has removed the active link.
  select * into link_row from public.family_links
  where student_user_id=student_id and status='active'
    and (student_user_id=current_user_id or guardian_user_id=current_user_id)
  for update;
  if not found then
    if exists(select 1 from public.family_links where student_user_id=student_id and status='disconnected'
      and (student_user_id=current_user_id or guardian_user_id=current_user_id)) then
      return jsonb_build_object('studentUserId',student_id,'status','disconnected');
    end if;
    raise exception 'active family link required';
  end if;

  -- Do not silently settle or discard money while disconnecting. The existing
  -- finish/decline workflow must resolve all obligations before this succeeds.
  if exists(select 1 from public.cloud_focus_sessions session
    where session.user_id=student_id and session.deleted_at is null
      and session.payload->>'status' in ('starting','active','paused','awaiting-result')
      and (coalesce((session.payload->>'guardianRewardRequestPoints')::bigint,0)>0
        or exists(select 1 from public.wallet_transactions request where request.kind='guardian_reward_requested'
          and request.from_user_id=student_id and request.to_user_id=link_row.guardian_user_id
          and request.session_id=session.entity_id))) then
    raise exception 'guardian funded focus must finish';
  end if;
  if exists(select 1 from public.wallet_transactions reservation
    join public.wallet_transactions request on request.id=reservation.related_transaction_id
    where reservation.kind='guardian_deposit_reserved' and request.kind='guardian_reward_requested'
      and request.from_user_id=student_id and request.to_user_id=link_row.guardian_user_id
      and not exists(select 1 from public.wallet_transactions settlement
        where settlement.related_transaction_id=reservation.id
          and settlement.kind in ('guardian_reward_released','guardian_deposit_returned'))) then
    raise exception 'reserved guardian points must be settled';
  end if;
  if exists(select 1 from public.wallet_transactions request
    where request.kind='guardian_reward_requested' and request.from_user_id=student_id
      and request.to_user_id=link_row.guardian_user_id
      and not exists(select 1 from public.wallet_transactions resolution
        where resolution.related_transaction_id=request.id
          and resolution.kind in ('guardian_reward_declined','guardian_deposit_reserved'))) then
    raise exception 'pending guardian rewards must be resolved';
  end if;
  update public.family_links set status='disconnected',disconnected_at=now(),updated_at=now()
  where id=link_row.id;
  -- Existing status trigger creates deduplicated notifications for both users.
  return jsonb_build_object('studentUserId',student_id,'status','disconnected');
end;
$$;

-- Owner-only state projection. Raw browsing data is never returned.
create or replace function public.get_planned_guardian_reward(p_schedule_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid := (select auth.uid()); req public.wallet_transactions%rowtype; reservation public.wallet_transactions%rowtype; state text;
begin
  if caller is null then raise exception 'authentication required'; end if;
  if not exists(select 1 from public.cloud_schedules where user_id=caller and entity_id=p_schedule_id and deleted_at is null) then raise exception 'focus plan not found'; end if;
  select * into req from public.wallet_transactions where from_user_id=caller and schedule_id=p_schedule_id and kind='guardian_reward_requested' and metadata->>'preStart'='true' order by created_at desc,id desc limit 1;
  if req.id is null then return null; end if;
  select * into reservation from public.wallet_transactions where related_transaction_id=req.id and kind='guardian_deposit_reserved';
  state := case
    when exists(select 1 from public.wallet_transactions where related_transaction_id=reservation.id and kind='guardian_reward_released') then 'completed'
    when exists(select 1 from public.wallet_transactions where related_transaction_id=reservation.id and kind='guardian_deposit_returned') then 'returned'
    when exists(select 1 from public.wallet_transactions where related_transaction_id=req.id and kind='guardian_reward_declined') then 'declined'
    when exists(select 1 from public.cloud_focus_sessions where user_id=caller and entity_id=req.session_id and deleted_at is null) then 'started'
    when reservation.id is not null then 'approved' else 'pending' end;
  return jsonb_build_object('requestId',req.id,'studentUserId',caller,'scheduleId',req.schedule_id,'sessionId',req.session_id,'points',req.points,'status',state);
end;
$$;

create or replace function public.request_planned_guardian_reward(p_schedule_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid := (select auth.uid()); plan jsonb; guardian uuid; state jsonb; future_id text := gen_random_uuid()::text; points bigint;
begin
  if caller is null then raise exception 'authentication required'; end if;
  if coalesce((select role from public.profiles where id=caller),'')<>'student' then raise exception 'student role required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-start:'||caller::text,0));
  select payload into plan from public.cloud_schedules where user_id=caller and entity_id=p_schedule_id and deleted_at is null for update;
  if plan is null or plan->>'ownerUserId' is distinct from caller::text then raise exception 'focus plan not found'; end if;
  if coalesce(plan->>'status','') not in ('planned','ready') then raise exception 'focus plan is not ready'; end if;
  if exists(select 1 from public.cloud_focus_sessions where user_id=caller and deleted_at is null and payload->>'scheduleId'=p_schedule_id and payload->>'status' in ('starting','active','paused','awaiting-result')) then raise exception 'unfinished session exists'; end if;
  points := (plan->>'guardianRewardRequestPoints')::bigint;
  if points is null or points not between 1 and 1000000000 then raise exception 'invalid guardian reward points'; end if;
  select guardian_user_id into guardian from public.family_links where student_user_id=caller and status='active' for update;
  if guardian is null then raise exception 'active guardian link required'; end if;
  state := public.get_planned_guardian_reward(p_schedule_id);
  if state->>'status' in ('pending','approved') then return state; end if;
  if (select count(*) from public.wallet_transactions where from_user_id=caller and kind='guardian_reward_requested' and created_at>now()-interval '5 minutes')>=5 then raise exception 'reward request rate limit'; end if;
  insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,schedule_id,session_id,idempotency_key,metadata,created_at)
  values('guardian_reward_requested','posted',caller,guardian,'external','external',points,p_schedule_id,future_id,'guardian-reward-request:'||future_id,'{"preStart":true,"requestStatus":"pending"}',clock_timestamp());
  return public.get_planned_guardian_reward(p_schedule_id);
end;
$$;

create or replace function public.withdraw_planned_guardian_reward(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid := (select auth.uid()); req public.wallet_transactions%rowtype; reservation public.wallet_transactions%rowtype;
begin
  if caller is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-start:'||caller::text,0));
  perform pg_advisory_xact_lock(hashtextextended('guardian-reward:'||coalesce(p_request_id::text,''),0));
  select * into req from public.wallet_transactions where id=p_request_id and from_user_id=caller and kind='guardian_reward_requested' and metadata->>'preStart'='true' for update;
  if req.id is null then raise exception 'reward request not found'; end if;
  if exists(select 1 from public.cloud_focus_sessions where user_id=caller and entity_id=req.session_id) then raise exception 'reward session already started'; end if;
  select * into reservation from public.wallet_transactions where related_transaction_id=req.id and kind='guardian_deposit_reserved';
  if reservation.id is not null then
    perform pg_advisory_xact_lock(hashtextextended('topup-refund:'||reservation.from_user_id::text,0));
    perform pg_advisory_xact_lock(hashtextextended('wallet:'||reservation.from_user_id::text,0));
    insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,schedule_id,session_id,related_transaction_id,idempotency_key,metadata)
    values('guardian_deposit_returned','posted',reservation.from_user_id,reservation.from_user_id,'reserved','topup',reservation.points,req.schedule_id,req.session_id,reservation.id,'guardian-deposit-returned:'||req.session_id,'{"reason":"student-withdrawn"}') on conflict(idempotency_key) do nothing;
  end if;
  insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,schedule_id,session_id,related_transaction_id,idempotency_key,metadata)
  values('guardian_reward_declined','posted',req.to_user_id,caller,'external','external',req.points,req.schedule_id,req.session_id,req.id,'guardian-reward-declined:'||req.id,'{"reason":"student-withdrawn"}') on conflict(idempotency_key) do nothing;
  -- Return this request, not a newer request for the same schedule.
  return jsonb_build_object('requestId',req.id,'studentUserId',caller,'scheduleId',req.schedule_id,'sessionId',req.session_id,'points',req.points,'status',case when reservation.id is null then 'declined' else 'returned' end);
end;
$$;

-- Keep the old public body private for backwards-compatible fixtures only.
alter function public.start_focus_session(text,text) rename to start_focus_session_post_start_reward_internal;
revoke all on function public.start_focus_session_post_start_reward_internal(text,text) from public,anon,authenticated;
create or replace function public.start_focus_session(p_schedule_id text,p_device_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid := (select auth.uid()); plan jsonb; current_session jsonb; req public.wallet_transactions%rowtype; reservation public.wallet_transactions%rowtype; started jsonb;
begin
  if caller is null then raise exception 'authentication required'; end if;
  if coalesce((select role from public.profiles where id=caller),'')<>'student' then raise exception 'student role required'; end if;
  if p_device_id is null or length(p_device_id) not between 1 and 200 then raise exception 'invalid device id'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-start:'||caller::text,0));
  select payload into current_session from public.cloud_focus_sessions where user_id=caller and deleted_at is null and payload->>'scheduleId'=p_schedule_id and payload->>'status' in ('starting','active','paused','awaiting-result') order by updated_at desc limit 1;
  if current_session is not null then return public.get_focus_session(current_session->>'id'); end if;
  select payload into plan from public.cloud_schedules where user_id=caller and entity_id=p_schedule_id and deleted_at is null for update;
  if plan is null or plan->>'ownerUserId' is distinct from caller::text then raise exception 'focus plan not found'; end if;
  if coalesce((plan->>'guardianRewardRequestPoints')::bigint,0)>0 then
    select request.* into req from public.wallet_transactions request where request.from_user_id=caller and request.schedule_id=p_schedule_id and request.kind='guardian_reward_requested' and request.metadata->>'preStart'='true'
      and not exists(select 1 from public.wallet_transactions where related_transaction_id=request.id and kind='guardian_reward_declined') order by request.created_at desc,request.id desc limit 1;
    select * into reservation from public.wallet_transactions where related_transaction_id=req.id and kind='guardian_deposit_reserved' and status='posted';
    if req.id is null or reservation.id is null or req.points is distinct from (plan->>'guardianRewardRequestPoints')::bigint
      or reservation.points is distinct from req.points or reservation.from_user_id is distinct from req.to_user_id
      or exists(select 1 from public.wallet_transactions where related_transaction_id=reservation.id and kind in ('guardian_deposit_returned','guardian_reward_released')) then raise exception 'guardian approval required'; end if;
    if not exists(select 1 from public.family_links where student_user_id=caller and guardian_user_id=req.to_user_id and status='active') then raise exception 'active guardian link required'; end if;
  end if;
  started := public.start_focus_session_pre_guardian_reward_internal(p_schedule_id,p_device_id);
  return started;
end;
$$;

revoke all on function public.get_planned_guardian_reward(text),public.request_planned_guardian_reward(text),public.withdraw_planned_guardian_reward(uuid),public.start_focus_session(text,text) from public,anon;
grant execute on function public.get_planned_guardian_reward(text),public.request_planned_guardian_reward(text),public.withdraw_planned_guardian_reward(uuid),public.start_focus_session(text,text) to authenticated;

create or replace function public.notify_wallet_transaction_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid; actor uuid; event_kind text; event_title text; event_body text; event_route text;
begin
  if new.status<>'posted' then return new; end if;
  if new.kind='topup_confirmed' then recipient:=new.to_user_id; event_kind:='wallet_topup_completed'; event_title:='포인트 충전이 완료되었습니다'; event_body:=new.points||'P가 충전 포인트에 반영되었습니다.'; event_route:='/wallet/charge';
  elsif new.kind='topup_refunded' then recipient:=new.from_user_id; event_kind:='wallet_refund_completed'; event_title:='포인트 환불이 완료되었습니다'; event_body:=new.points||'P 환불 처리가 반영되었습니다.'; event_route:='/wallet/refund';
  elsif new.kind='cashout_requested' then recipient:=new.from_user_id; event_kind:='cashout_requested'; event_title:='테스트 현금화 요청을 접수했습니다'; event_body:=new.points||'P가 테스트 정산 대기 상태입니다.'; event_route:='/wallet/cashout';
  elsif new.kind='cashout_completed' then recipient:=new.from_user_id; event_kind:='cashout_completed'; event_title:='테스트 현금화가 완료되었습니다'; event_body:='테스트 정산 결과가 포인트 원장에 반영되었습니다.'; event_route:='/wallet/cashout';
  elsif new.kind='guardian_reward_requested' then recipient:=new.to_user_id; actor:=new.from_user_id; event_kind:='guardian_reward_requested'; event_title:='새 보상 요청이 도착했습니다'; event_body:=new.points||'P 보상 요청을 확인해 주세요.'; event_route:='/guardian/rewards';
  elsif new.kind='guardian_deposit_reserved' then recipient:=(new.metadata->>'studentUserId')::uuid; actor:=new.from_user_id; event_kind:='guardian_reward_approved'; event_title:='보호자 보상이 승인되었습니다'; event_body:=new.points||'P가 집중 성공 보상으로 예약되었습니다.'; event_route:='/focus';
  elsif new.kind='guardian_reward_declined' and new.metadata->>'reason' in ('student-withdrawn','enforcement-start-cancelled') then recipient:=new.to_user_id; actor:=(select auth.uid()); event_kind:='guardian_reward_declined'; event_title:='보상 요청이 취소되었습니다'; event_body:='집중 시작 전 보상 요청이 취소되었습니다. 예약된 포인트가 있다면 충전 포인트로 반환되었습니다.'; event_route:='/focus';
    perform public.create_notification(new.from_user_id,actor,event_kind,event_title,event_body,jsonb_build_object('transactionId',new.id,'scheduleId',new.schedule_id,'route','/guardian/rewards'),'wallet:'||new.id);
  elsif new.kind='guardian_reward_declined' then recipient:=new.to_user_id; actor:=new.from_user_id; event_kind:='guardian_reward_declined'; event_title:='보상 요청이 거절되었습니다'; event_body:='보호자가 보상 요청을 거절했습니다.'; event_route:='/history';
  elsif new.kind='guardian_reward_released' then recipient:=new.to_user_id; actor:=new.from_user_id; event_kind:='guardian_reward_released'; event_title:='보호자 보상을 획득했습니다'; event_body:=new.points||'P가 획득 포인트에 반영되었습니다.'; event_route:='/history'; else return new; end if;
  if recipient is not null then perform public.create_notification(recipient,actor,event_kind,event_title,event_body,jsonb_strip_nulls(jsonb_build_object('transactionId',new.id,'sessionId',new.session_id,'scheduleId',new.schedule_id,'points',new.points,'route',event_route)),'wallet:'||new.id); end if;
  return new;
end;
$$;

create or replace function public.get_guardian_reward_requests(p_status text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid := (select auth.uid()); result_items jsonb;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if coalesce((select role from public.profiles where id=current_user_id),'')<>'guardian' then raise exception 'guardian role required'; end if;
  if p_status is not null and p_status not in ('pending','approved','completed','returned','declined','expired','cancelled') then raise exception 'unsupported reward status'; end if;
  with reward_rows as (
    select request.id,request.from_user_id as student_user_id,coalesce(nullif(trim(profile.display_name),''),'이름 미설정') as student_display_name,
      request.points,request.schedule_id,request.session_id,request.created_at,
      case when released.id is not null then 'completed' when returned.id is not null then 'returned'
        when declined.id is not null and declined.metadata->>'reason' in ('student-withdrawn','enforcement-start-cancelled') then 'cancelled' when declined.id is not null then 'declined' when reserved.id is not null then 'approved'
        when session.payload->>'status' in ('success','failed','cancelled') then 'expired' else 'pending' end as reward_status
    from public.wallet_transactions request
    join public.profiles profile on profile.id=request.from_user_id
    left join public.wallet_transactions reserved on reserved.related_transaction_id=request.id and reserved.kind='guardian_deposit_reserved'
    left join public.wallet_transactions declined on declined.related_transaction_id=request.id and declined.kind='guardian_reward_declined'
    left join public.wallet_transactions released on released.related_transaction_id=reserved.id and released.kind='guardian_reward_released'
    left join public.wallet_transactions returned on returned.related_transaction_id=reserved.id and returned.kind='guardian_deposit_returned'
    left join public.cloud_focus_sessions session on session.user_id=request.from_user_id and session.entity_id=request.session_id
    where request.kind='guardian_reward_requested' and request.to_user_id=current_user_id
      and exists(select 1 from public.family_links link where link.student_user_id=request.from_user_id and link.guardian_user_id=current_user_id and link.status='active')
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',row.id,'studentUserId',row.student_user_id,'studentDisplayName',row.student_display_name,'points',row.points,'scheduleId',row.schedule_id,'sessionId',row.session_id,'status',row.reward_status,'createdAt',row.created_at) order by row.created_at desc),'[]'::jsonb)
  into result_items from reward_rows row where p_status is null or row.reward_status=p_status;
  return jsonb_build_object('items',result_items);
end;
$$;
