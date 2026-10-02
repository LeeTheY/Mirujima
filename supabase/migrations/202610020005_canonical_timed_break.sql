-- Reuse canonical JSONB: manual pause is indefinite; timed breaks automatically resume at the stored deadline.
-- The configured breakMinutes is the total break budget for this session. No additional table.
-- Unify Web and Extension focus lifecycle on the existing canonical session JSONB.
-- No table is added: lifecycle fields belong to the existing immutable session snapshot.

create or replace function public.normalize_focus_session_lifecycle_payload(
  p_payload jsonb,
  p_now timestamptz,
  p_expire_active boolean default true
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  next_payload jsonb := p_payload;
  current_status text := coalesce(p_payload->>'status', '');
  target_seconds integer := greatest(0, coalesce((p_payload->>'targetFocusMinutes')::integer, 0) * 60);
  accumulated_seconds integer := greatest(0, least(target_seconds, coalesce((p_payload->>'accumulatedFocusSeconds')::integer, 0)));
  remaining_seconds integer;
  active_segment_started_at timestamptz;
  ends_at timestamptz;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid focus session payload'; end if;
  if target_seconds < 60 or target_seconds > 720 * 60 then raise exception 'invalid focus duration'; end if;

  if current_status = 'paused' and p_payload->>'pauseKind' = 'break'
    and (p_payload->>'breakEndsAt')::timestamptz <= p_now then
    next_payload := next_payload || jsonb_build_object(
      'status','active', 'activeSegmentStartedAt',(p_payload->>'breakEndsAt')::timestamptz,
      'endsAt',(p_payload->>'breakEndsAt')::timestamptz + make_interval(secs => (p_payload->>'remainingFocusSeconds')::integer),
      'pausedAt',null, 'pauseKind',null, 'breakStartedAt',null, 'breakEndsAt',null,
      'accumulatedBreakSeconds',coalesce((p_payload->>'accumulatedBreakSeconds')::integer,0)
        + greatest(0,floor(extract(epoch from ((p_payload->>'breakEndsAt')::timestamptz-(p_payload->>'breakStartedAt')::timestamptz)))::integer),
      'updatedAt',(p_payload->>'breakEndsAt')::timestamptz
    );
    p_payload := next_payload;
    current_status := 'active';
  end if;

  remaining_seconds := greatest(0, least(target_seconds,
    coalesce((p_payload->>'remainingFocusSeconds')::integer, target_seconds - accumulated_seconds)));

  if current_status in ('active', 'starting') then
    active_segment_started_at := coalesce(
      nullif(p_payload->>'activeSegmentStartedAt', '')::timestamptz,
      (p_payload->>'startedAt')::timestamptz
    );
    ends_at := (p_payload->>'endsAt')::timestamptz;
    if p_expire_active and ends_at <= p_now then
      current_status := 'awaiting-result';
      accumulated_seconds := target_seconds;
      remaining_seconds := 0;
      next_payload := next_payload || jsonb_build_object(
        'status', current_status,
        'activeSegmentStartedAt', null,
        'pausedAt', p_now,
        'accumulatedFocusSeconds', accumulated_seconds,
        'remainingFocusSeconds', remaining_seconds,
        'updatedAt', p_now
      );
    else
      next_payload := next_payload || jsonb_build_object(
        'activeSegmentStartedAt', active_segment_started_at,
        'pausedAt', null,
        'accumulatedFocusSeconds', accumulated_seconds,
        'remainingFocusSeconds', remaining_seconds,
        'result', coalesce(p_payload->'result', 'null'::jsonb),
        'updatedAt', coalesce(nullif(p_payload->>'updatedAt', '')::timestamptz, (p_payload->>'startedAt')::timestamptz)
      );
    end if;
  elsif current_status = 'paused' then
    if remaining_seconds = 0 then current_status := 'awaiting-result'; end if;
    next_payload := next_payload || jsonb_build_object(
      'status', current_status,
      'activeSegmentStartedAt', null,
      'pausedAt', coalesce(nullif(p_payload->>'pausedAt', '')::timestamptz, p_now),
      'accumulatedFocusSeconds', accumulated_seconds,
      'remainingFocusSeconds', remaining_seconds,
      'result', coalesce(p_payload->'result', 'null'::jsonb),
      'updatedAt', coalesce(nullif(p_payload->>'updatedAt', '')::timestamptz, p_now)
    );
  else
    if current_status in ('awaiting-result', 'success', 'failed', 'cancelled') then remaining_seconds := 0; end if;
    next_payload := next_payload || jsonb_build_object(
      'activeSegmentStartedAt', null,
      'pausedAt', case when current_status = 'awaiting-result'
        then coalesce(nullif(p_payload->>'pausedAt', '')::timestamptz, p_now) else null end,
      'accumulatedFocusSeconds', accumulated_seconds,
      'remainingFocusSeconds', remaining_seconds,
      'result', coalesce(p_payload->'result', 'null'::jsonb),
      'updatedAt', coalesce(nullif(p_payload->>'updatedAt', '')::timestamptz, p_now)
    );
  end if;

  return next_payload;
end;
$$;

revoke all on function public.normalize_focus_session_lifecycle_payload(jsonb,timestamptz,boolean)
  from public, anon, authenticated;

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
revoke all on function public.start_focus_break(text,text,uuid) from public,anon;
grant execute on function public.start_focus_break(text,text,uuid) to authenticated;
