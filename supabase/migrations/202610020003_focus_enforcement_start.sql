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

create or replace function public.start_focus_session(p_schedule_id text,p_device_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid := (select auth.uid()); started jsonb; request_points bigint; guardian_user_id uuid; request_id uuid;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_device_id is null or length(p_device_id) not between 1 and 200 then raise exception 'invalid device id'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-start:'||current_user_id::text,0));
  select payload into started from public.cloud_focus_sessions where user_id=current_user_id and deleted_at is null
    and payload->>'scheduleId'=p_schedule_id and payload->>'status' in ('starting','active','paused','awaiting-result')
    order by updated_at desc limit 1;
  if started is not null then return public.get_focus_session(started->>'id'); end if;
  started := public.start_focus_session_pre_guardian_reward_internal(p_schedule_id,p_device_id);
  request_points := coalesce((started->>'guardianRewardRequestPoints')::bigint,0);
  if request_points <= 0 then return started; end if;
  select link.guardian_user_id into guardian_user_id from public.family_links link
  where link.student_user_id=current_user_id and link.status='active' for update;
  if guardian_user_id is null then raise exception 'active guardian link required'; end if;
  insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,schedule_id,session_id,idempotency_key,metadata)
  values('guardian_reward_requested','posted',current_user_id,guardian_user_id,'external','external',request_points,p_schedule_id,started->>'id','guardian-reward-request:'||(started->>'id'),jsonb_build_object('requestStatus','pending'))
  returning id into request_id;
  update public.cloud_focus_sessions set payload=payload||jsonb_build_object('guardianRewardRequestTransactionId',request_id),version=version+1,updated_at=now()
  where user_id=current_user_id and entity_id=started->>'id';
  return started||jsonb_build_object('guardianRewardRequestTransactionId',request_id);
end;
$$;

create or replace function public.notify_focus_session_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare previous_status text := case when tg_op='UPDATE' then old.payload->>'status' else null end;
  next_status text := new.payload->>'status'; session_id text := new.entity_id; schedule_id text := new.payload->>'scheduleId';
begin
  if next_status='active' and coalesce(previous_status,'') not in ('active','paused') then
    perform public.create_notification(new.user_id,null,'focus_started','집중 세션이 시작되었습니다','설정한 집중 시간과 차단 규칙이 적용되었습니다.',jsonb_build_object('sessionId',session_id,'scheduleId',schedule_id,'status',next_status,'route','/focus'),'focus_started:'||session_id);
  elsif next_status in ('success','failed','cancelled') and previous_status is distinct from next_status then
    perform public.create_notification(new.user_id,null,case when next_status='success' then 'focus_completed' else 'focus_failed' end,case when next_status='success' then '집중 세션을 완료했습니다' else '집중 세션이 종료되었습니다' end,case when next_status='success' then '기록과 포인트 정산이 안전하게 반영되었습니다.' else '예약 포인트 반환과 기록 반영을 확인해 주세요.' end,jsonb_build_object('sessionId',session_id,'scheduleId',schedule_id,'status',next_status,'route','/history'),'focus_result:'||session_id);
  end if;
  return new;
end;
$$;


create or replace function public.cancel_focus_start(p_session_id text,p_device_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller_id uuid := (select auth.uid()); session_row public.cloud_focus_sessions%rowtype;
  reservation public.wallet_transactions%rowtype; request_row public.wallet_transactions%rowtype; next_payload jsonb;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
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
    if exists(select 1 from public.wallet_transactions where related_transaction_id=request_row.id and kind='guardian_deposit_reserved') then
      raise exception 'guardian reservation requires settlement';
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

create or replace function public.confirm_focus_enforcement(p_session_id text,p_device_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller_id uuid := (select auth.uid()); session_row public.cloud_focus_sessions%rowtype; next_payload jsonb;
begin
  if caller_id is null then raise exception 'authentication required'; end if;
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

revoke all on function public.cancel_focus_start(text,text) from public,anon;
revoke all on function public.confirm_focus_enforcement(text,text) from public,anon;
grant execute on function public.cancel_focus_start(text,text) to authenticated;
grant execute on function public.confirm_focus_enforcement(text,text) to authenticated;
comment on function public.confirm_focus_enforcement(text,text) is 'Owner-authenticated application acknowledgement after Extension DNR setup; not cryptographic proof against a malicious browser.';
