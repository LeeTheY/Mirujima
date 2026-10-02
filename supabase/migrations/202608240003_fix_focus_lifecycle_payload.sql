-- Avoid PL/pgSQL ambiguity between the local JSON payload and the
-- cloud_focus_sessions.payload column in lifecycle UPDATE statements.

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
  if p_session_id is null or length(p_session_id) not between 1 and 300 then raise exception 'invalid session id'; end if;
  if p_device_id is null or length(p_device_id) not between 1 and 200 then raise exception 'invalid device id'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-lifecycle:' || current_user_id::text || ':' || p_session_id, 0));
  select * into session_row from public.cloud_focus_sessions
  where user_id = current_user_id and entity_id = p_session_id and deleted_at is null for update;
  if not found then raise exception 'focus session not found'; end if;
  next_payload := public.normalize_focus_session_lifecycle_payload(session_row.payload, now_at, false);
  if next_payload->>'status' = 'active' then return next_payload; end if;
  if next_payload->>'status' <> 'paused' then raise exception 'focus session cannot resume'; end if;
  remaining_seconds := coalesce((next_payload->>'remainingFocusSeconds')::integer, 0);
  if remaining_seconds <= 0 then
    next_payload := next_payload || jsonb_build_object('status','awaiting-result','activeSegmentStartedAt',null,'pausedAt',now_at,'remainingFocusSeconds',0,'updatedAt',now_at);
  else
    next_payload := next_payload || jsonb_build_object(
      'status', 'active',
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
  next_payload jsonb;
  settled jsonb;
  final_payload jsonb;
  target_seconds integer;
  accumulated_seconds integer;
  segment_seconds integer := 0;
  now_at timestamptz := now();
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-lifecycle:' || current_user_id::text || ':' || p_session_id, 0));
  select * into session_row from public.cloud_focus_sessions
  where user_id=current_user_id and entity_id=p_session_id and deleted_at is null for update;
  if not found then raise exception 'focus session not found'; end if;
  next_payload := public.normalize_focus_session_lifecycle_payload(session_row.payload, now_at, true);
  if next_payload->>'status' in ('success','failed','cancelled') then
    if next_payload is distinct from session_row.payload then
      update public.cloud_focus_sessions set payload=next_payload,version=version+1,device_id=p_device_id,updated_at=now_at
      where user_id=current_user_id and entity_id=p_session_id;
    end if;
    return next_payload || jsonb_build_object('walletBalances', public.get_wallet_balances(current_user_id));
  end if;
  if coalesce(array_length(p_completed_goal_ids,1),0) > 0 and next_payload->>'status' = 'paused' then
    raise exception 'focus session has not reached target time';
  end if;
  if next_payload is distinct from session_row.payload then
    update public.cloud_focus_sessions set payload=next_payload,version=version+1,device_id=p_device_id,updated_at=now_at
    where user_id=current_user_id and entity_id=p_session_id;
  end if;

  target_seconds := (next_payload->>'targetFocusMinutes')::integer * 60;
  accumulated_seconds := coalesce((next_payload->>'accumulatedFocusSeconds')::integer, 0);
  if next_payload->>'status' = 'active' and next_payload->>'activeSegmentStartedAt' is not null then
    segment_seconds := greatest(0, floor(extract(epoch from (now_at - (next_payload->>'activeSegmentStartedAt')::timestamptz)))::integer);
  end if;
  accumulated_seconds := least(target_seconds, accumulated_seconds + segment_seconds);

  settled := public.finish_focus_session_goal_internal(p_session_id, p_completed_goal_ids, p_device_id);
  final_payload := (settled - 'walletBalances') || jsonb_build_object(
    'activeSegmentStartedAt', null,
    'pausedAt', null,
    'accumulatedFocusSeconds', case when settled->>'status' = 'success' then target_seconds else accumulated_seconds end,
    'remainingFocusSeconds', 0,
    'updatedAt', now_at
  );
  update public.cloud_focus_sessions set payload=final_payload,version=version+1,device_id=p_device_id,updated_at=now_at
  where user_id=current_user_id and entity_id=p_session_id;
  return final_payload || jsonb_build_object('walletBalances', settled->'walletBalances');
end;
$$;

comment on function public.pause_focus_session(text,text) is
  'Pauses an owned canonical focus session without PL/pgSQL payload ambiguity.';
comment on function public.resume_focus_session(text,text) is
  'Resumes an owned canonical focus session without PL/pgSQL payload ambiguity.';
comment on function public.finish_focus_session(text,text[],text) is
  'Settles an owned canonical focus session without PL/pgSQL payload ambiguity.';
