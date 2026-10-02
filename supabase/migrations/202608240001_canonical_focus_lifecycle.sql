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

alter function public.start_focus_session(text, text)
  rename to start_focus_session_pre_lifecycle_internal;

revoke all on function public.start_focus_session_pre_lifecycle_internal(text, text)
  from public, anon, authenticated;

create or replace function public.start_focus_session(p_schedule_id text, p_device_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  started jsonb;
  session_payload jsonb;
  target_seconds integer;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  started := public.start_focus_session_pre_lifecycle_internal(p_schedule_id, p_device_id);
  target_seconds := (started->>'targetFocusMinutes')::integer * 60;
  session_payload := (started - 'walletBalances') || jsonb_build_object(
    'activeSegmentStartedAt', started->'startedAt',
    'pausedAt', null,
    'accumulatedFocusSeconds', 0,
    'remainingFocusSeconds', target_seconds,
    'result', coalesce(started->'result', 'null'::jsonb),
    'updatedAt', started->'startedAt'
  );

  update public.cloud_focus_sessions set
    payload = session_payload,
    version = version + 1,
    updated_at = now()
  where user_id = current_user_id and entity_id = session_payload->>'id';

  return session_payload || jsonb_build_object('walletBalances', started->'walletBalances');
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

  normalized := public.normalize_focus_session_lifecycle_payload(session_row.payload, now(), true);
  if normalized is distinct from session_row.payload then
    update public.cloud_focus_sessions set payload = normalized, version = version + 1, updated_at = now()
    where user_id = current_user_id and entity_id = p_session_id;
  end if;
  return normalized;
end;
$$;

create or replace function public.get_current_focus_session()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  session_id text;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  select entity_id into session_id from public.cloud_focus_sessions
  where user_id = current_user_id and deleted_at is null
    and payload->>'status' in ('starting', 'active', 'paused', 'awaiting-result')
  order by updated_at desc limit 1;
  if session_id is null then return null; end if;
  return public.get_focus_session(session_id);
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
  payload jsonb;
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
  payload := public.normalize_focus_session_lifecycle_payload(session_row.payload, now_at, true);
  if payload->>'status' in ('paused', 'awaiting-result') then
    if payload is distinct from session_row.payload then
      update public.cloud_focus_sessions set payload=payload,version=version+1,device_id=p_device_id,updated_at=now_at
      where user_id=current_user_id and entity_id=p_session_id;
    end if;
    return payload;
  end if;
  if payload->>'status' <> 'active' then raise exception 'focus session cannot pause'; end if;

  target_seconds := (payload->>'targetFocusMinutes')::integer * 60;
  accumulated_seconds := coalesce((payload->>'accumulatedFocusSeconds')::integer, 0);
  segment_seconds := greatest(0, floor(extract(epoch from (now_at - (payload->>'activeSegmentStartedAt')::timestamptz)))::integer);
  accumulated_seconds := least(target_seconds, accumulated_seconds + segment_seconds);
  remaining_seconds := greatest(0, target_seconds - accumulated_seconds);
  payload := payload || jsonb_build_object(
    'status', case when remaining_seconds = 0 then 'awaiting-result' else 'paused' end,
    'activeSegmentStartedAt', null,
    'pausedAt', now_at,
    'accumulatedFocusSeconds', accumulated_seconds,
    'remainingFocusSeconds', remaining_seconds,
    'updatedAt', now_at
  );
  update public.cloud_focus_sessions set payload=payload,version=version+1,device_id=p_device_id,updated_at=now_at
  where user_id=current_user_id and entity_id=p_session_id;
  return payload;
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
  payload jsonb;
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
  payload := public.normalize_focus_session_lifecycle_payload(session_row.payload, now_at, false);
  if payload->>'status' = 'active' then return payload; end if;
  if payload->>'status' <> 'paused' then raise exception 'focus session cannot resume'; end if;
  remaining_seconds := coalesce((payload->>'remainingFocusSeconds')::integer, 0);
  if remaining_seconds <= 0 then
    payload := payload || jsonb_build_object('status','awaiting-result','activeSegmentStartedAt',null,'pausedAt',now_at,'remainingFocusSeconds',0,'updatedAt',now_at);
  else
    payload := payload || jsonb_build_object(
      'status', 'active',
      'activeSegmentStartedAt', now_at,
      'pausedAt', null,
      'endsAt', now_at + make_interval(secs => remaining_seconds),
      'updatedAt', now_at
    );
  end if;
  update public.cloud_focus_sessions set payload=payload,version=version+1,device_id=p_device_id,updated_at=now_at
  where user_id=current_user_id and entity_id=p_session_id;
  return payload;
end;
$$;

alter function public.finish_focus_session(text, text[], text)
  rename to finish_focus_session_goal_internal;

revoke all on function public.finish_focus_session_goal_internal(text, text[], text)
  from public, anon, authenticated;

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
  payload jsonb;
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
  payload := public.normalize_focus_session_lifecycle_payload(session_row.payload, now_at, true);
  if payload->>'status' in ('success','failed','cancelled') then
    if payload is distinct from session_row.payload then
      update public.cloud_focus_sessions set payload=payload,version=version+1,device_id=p_device_id,updated_at=now_at
      where user_id=current_user_id and entity_id=p_session_id;
    end if;
    return payload || jsonb_build_object('walletBalances', public.get_wallet_balances(current_user_id));
  end if;
  if coalesce(array_length(p_completed_goal_ids,1),0) > 0 and payload->>'status' = 'paused' then
    raise exception 'focus session has not reached target time';
  end if;
  if payload is distinct from session_row.payload then
    update public.cloud_focus_sessions set payload=payload,version=version+1,device_id=p_device_id,updated_at=now_at
    where user_id=current_user_id and entity_id=p_session_id;
  end if;

  target_seconds := (payload->>'targetFocusMinutes')::integer * 60;
  accumulated_seconds := coalesce((payload->>'accumulatedFocusSeconds')::integer, 0);
  if payload->>'status' = 'active' and payload->>'activeSegmentStartedAt' is not null then
    segment_seconds := greatest(0, floor(extract(epoch from (now_at - (payload->>'activeSegmentStartedAt')::timestamptz)))::integer);
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

revoke all on function public.start_focus_session(text,text) from public,anon;
revoke all on function public.get_current_focus_session() from public,anon;
revoke all on function public.get_focus_session(text) from public,anon;
revoke all on function public.pause_focus_session(text,text) from public,anon;
revoke all on function public.resume_focus_session(text,text) from public,anon;
revoke all on function public.finish_focus_session(text,text[],text) from public,anon;

grant execute on function public.start_focus_session(text,text) to authenticated;
grant execute on function public.get_current_focus_session() to authenticated;
grant execute on function public.get_focus_session(text) to authenticated;
grant execute on function public.pause_focus_session(text,text) to authenticated;
grant execute on function public.resume_focus_session(text,text) to authenticated;
grant execute on function public.finish_focus_session(text,text[],text) to authenticated;

comment on function public.get_current_focus_session() is
  'Returns and normalizes the authenticated user current non-terminal canonical focus session.';
comment on function public.get_focus_session(text) is
  'Returns an authenticated user canonical focus session by id, including immutable terminal results.';
