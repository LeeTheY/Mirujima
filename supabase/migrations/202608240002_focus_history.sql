-- Read terminal focus sessions through privacy-specific RPCs and keep
-- Extension-owned aggregate metrics monotonic in the canonical payload.

create index if not exists cloud_focus_sessions_user_updated_history_idx
  on public.cloud_focus_sessions(user_id, updated_at desc)
  where deleted_at is null;

create or replace function public.focus_history_bounds(p_period text, p_anchor_date date)
returns table(start_date date, end_date date)
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_anchor_date is null then raise exception 'invalid history anchor date'; end if;
  if p_period = 'daily' then
    start_date := p_anchor_date;
    end_date := p_anchor_date;
  elsif p_period = 'weekly' then
    start_date := p_anchor_date - (extract(isodow from p_anchor_date)::integer - 1);
    end_date := start_date + 6;
  elsif p_period = 'monthly' then
    start_date := date_trunc('month', p_anchor_date::timestamp)::date;
    end_date := (start_date + interval '1 month - 1 day')::date;
  else
    raise exception 'unsupported history period';
  end if;
  return next;
end;
$$;

revoke all on function public.focus_history_bounds(text,date) from public,anon,authenticated;

create or replace function public.sync_focus_session_metrics(
  p_session_id text,
  p_device_id text,
  p_metrics jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  session_row public.cloud_focus_sessions%rowtype;
  metric_key text;
  metric_value jsonb;
  metric_number bigint;
  next_payload jsonb;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_session_id is null or length(p_session_id) not between 1 and 300 then raise exception 'invalid session id'; end if;
  if p_device_id is null or length(p_device_id) not between 1 and 200 then raise exception 'invalid device id'; end if;
  if jsonb_typeof(p_metrics) is distinct from 'object' then raise exception 'invalid focus metrics'; end if;
  if (p_metrics - array['blockedAttemptCount','idleSeconds','distractionSeconds','checkInCount']::text[]) <> '{}'::jsonb then
    raise exception 'unsupported focus metric';
  end if;

  for metric_key, metric_value in select key, value from jsonb_each(p_metrics)
  loop
    if jsonb_typeof(metric_value) <> 'number' or metric_value::text !~ '^\d+$' then
      raise exception 'invalid focus metric value';
    end if;
    metric_number := metric_value::text::bigint;
    if metric_key in ('blockedAttemptCount','checkInCount') and metric_number > 1000000 then
      raise exception 'focus metric exceeds limit';
    end if;
    if metric_key in ('idleSeconds','distractionSeconds') and metric_number > 31536000 then
      raise exception 'focus metric exceeds limit';
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended('focus-metrics:' || current_user_id::text || ':' || p_session_id,0));
  select * into session_row from public.cloud_focus_sessions
  where user_id=current_user_id and entity_id=p_session_id and deleted_at is null
  for update;
  if not found then raise exception 'focus session not found'; end if;

  next_payload := session_row.payload || jsonb_build_object(
    'blockedAttemptCount', greatest(
      case when coalesce(session_row.payload->>'blockedAttemptCount','') ~ '^\d+$' then (session_row.payload->>'blockedAttemptCount')::bigint else 0 end,
      coalesce((p_metrics->>'blockedAttemptCount')::bigint,0)
    ),
    'idleSeconds', greatest(
      case when coalesce(session_row.payload->>'idleSeconds','') ~ '^\d+$' then (session_row.payload->>'idleSeconds')::bigint else 0 end,
      coalesce((p_metrics->>'idleSeconds')::bigint,0)
    ),
    'distractionSeconds', greatest(
      case when coalesce(session_row.payload->>'distractionSeconds','') ~ '^\d+$' then (session_row.payload->>'distractionSeconds')::bigint else 0 end,
      coalesce((p_metrics->>'distractionSeconds')::bigint,0)
    ),
    'checkInCount', greatest(
      case when coalesce(session_row.payload->>'checkInCount','') ~ '^\d+$' then (session_row.payload->>'checkInCount')::bigint else 0 end,
      coalesce((p_metrics->>'checkInCount')::bigint,0)
    ),
    'metricsUpdatedAt', now()
  );

  update public.cloud_focus_sessions set
    payload=next_payload,
    version=version+1,
    device_id=p_device_id,
    updated_at=now()
  where user_id=current_user_id and entity_id=p_session_id;

  return jsonb_build_object(
    'sessionId',p_session_id,
    'blockedAttemptCount',next_payload->'blockedAttemptCount',
    'idleSeconds',next_payload->'idleSeconds',
    'distractionSeconds',next_payload->'distractionSeconds',
    'checkInCount',next_payload->'checkInCount'
  );
end;
$$;

create or replace function public.build_student_focus_history(
  p_user_id uuid,
  p_period text,
  p_anchor_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_timezone text;
  today_at_user date;
  range_start date;
  range_end date;
  result_payload jsonb;
begin
  select case when exists(
    select 1 from pg_catalog.pg_timezone_names where name=coalesce(profile.timezone,'Asia/Seoul')
  ) then coalesce(profile.timezone,'Asia/Seoul') else 'Asia/Seoul' end
  into user_timezone
  from public.profiles profile where profile.id=p_user_id;
  user_timezone := coalesce(user_timezone,'Asia/Seoul');
  today_at_user := (now() at time zone user_timezone)::date;
  if p_anchor_date > today_at_user or p_anchor_date < today_at_user-364 then
    raise exception 'history anchor date out of range';
  end if;
  select bounds.start_date,bounds.end_date into range_start,range_end
  from public.focus_history_bounds(p_period,p_anchor_date) bounds;
  range_end := least(range_end,today_at_user);

  with terminal_base as (
    select
      session.entity_id session_id,
      session.payload,
      session.payload->>'scheduleId' schedule_id,
      session.payload->>'status' status,
      coalesce(nullif(session.payload#>>'{result,settledAt}','')::timestamptz,
        nullif(session.payload->>'updatedAt','')::timestamptz,session.updated_at) settled_at,
      nullif(session.payload->>'startedAt','')::timestamptz started_at
    from public.cloud_focus_sessions session
    where session.user_id=p_user_id and session.deleted_at is null
      and session.payload->>'status' in ('success','failed','cancelled')
  ), normalized as (
    select base.*,
      (base.settled_at at time zone user_timezone)::date date_key,
      greatest(0,least(43200,case when coalesce(base.payload->>'accumulatedFocusSeconds','') ~ '^\d+$'
        then (base.payload->>'accumulatedFocusSeconds')::integer else 0 end)) focus_seconds,
      greatest(1,least(720,case when coalesce(base.payload->>'targetFocusMinutes','') ~ '^\d+$'
        then (base.payload->>'targetFocusMinutes')::integer else 1 end)) target_minutes,
      case when base.payload#>>'{result,completionPercent}' in ('0','60','80','100')
        then (base.payload#>>'{result,completionPercent}')::integer
        when base.status='success' then 100 else 0 end completion_percent,
      least(100,greatest(0,case when coalesce(base.payload#>>'{result,completedGoalCount}','') ~ '^\d+$'
        then (base.payload#>>'{result,completedGoalCount}')::integer else 0 end)) completed_goal_count,
      least(100,greatest(0,case when coalesce(base.payload#>>'{result,totalGoalCount}','') ~ '^\d+$'
        then (base.payload#>>'{result,totalGoalCount}')::integer
        when jsonb_typeof(base.payload->'goals')='array' then jsonb_array_length(base.payload->'goals') else 0 end)) total_goal_count,
      greatest(0,case when coalesce(base.payload#>>'{result,earnedPoints}','') ~ '^\d+$'
        then (base.payload#>>'{result,earnedPoints}')::bigint else 0 end) earned_points,
      greatest(0,case when coalesce(base.payload#>>'{result,returnedPoints}','') ~ '^\d+$'
        then (base.payload#>>'{result,returnedPoints}')::bigint else 0 end) returned_points,
      greatest(0,case when coalesce(base.payload->>'blockedAttemptCount','') ~ '^\d+$'
        then (base.payload->>'blockedAttemptCount')::integer else 0 end) blocked_attempt_count
    from terminal_base base
    where base.settled_at is not null and base.started_at is not null
  ), period_sessions as (
    select * from normalized where date_key between range_start and range_end
  ), daily as (
    select date_key,
      round(sum(focus_seconds)::numeric/60)::integer focus_minutes,
      count(*) filter(where status='success')::integer successful_count,
      count(*) filter(where status in ('failed','cancelled'))::integer failed_count,
      round(avg(completion_percent))::integer completion_rate
    from period_sessions group by date_key
  ), trend as (
    select jsonb_agg(jsonb_build_object(
      'dateKey',day_value::date,
      'focusMinutes',coalesce(daily.focus_minutes,0),
      'successfulSessionCount',coalesce(daily.successful_count,0),
      'failedSessionCount',coalesce(daily.failed_count,0),
      'completionRate',coalesce(daily.completion_rate,0)
    ) order by day_value) value
    from generate_series(range_start::timestamp,range_end::timestamp,interval '1 day') as days(day_value)
    left join daily on daily.date_key=day_value::date
  ), summary as (
    select
      coalesce(round(avg(completion_percent)),0)::integer completion_rate,
      coalesce(round(sum(focus_seconds)::numeric/60),0)::integer total_focus_minutes,
      count(*) filter(where status='success')::integer successful_count,
      count(*) filter(where status in ('failed','cancelled'))::integer failed_count,
      coalesce(sum(completed_goal_count),0)::integer completed_goal_count,
      coalesce(sum(total_goal_count),0)::integer total_goal_count,
      coalesce(sum(earned_points),0)::bigint earned_points,
      coalesce(sum(returned_points),0)::bigint returned_points,
      coalesce(sum(blocked_attempt_count),0)::bigint blocked_attempt_count,
      count(*)::integer session_count
    from period_sessions
  ), success_dates as (
    select distinct date_key from normalized
    where status='success' and date_key between p_anchor_date-364 and p_anchor_date
  ), streak as (
    select coalesce(min(offset_value) filter(where success_dates.date_key is null),365)::integer value
    from generate_series(0,364) as offsets(offset_value)
    left join success_dates on success_dates.date_key=p_anchor_date-offset_value
  ), details as (
    select coalesce(jsonb_agg(detail.value order by detail.settled_at desc),'[]'::jsonb) value
    from (
      select session.settled_at,jsonb_build_object(
        'sessionId',session.session_id,
        'scheduleId',session.schedule_id,
        'dateKey',session.date_key,
        'startedAt',session.started_at,
        'settledAt',session.settled_at,
        'status',session.status,
        'focusMinutes',round(session.focus_seconds::numeric/60)::integer,
        'targetFocusMinutes',session.target_minutes,
        'completionPercent',session.completion_percent,
        'completedGoalCount',session.completed_goal_count,
        'totalGoalCount',session.total_goal_count,
        'earnedPoints',session.earned_points,
        'returnedPoints',session.returned_points,
        'blockedAttemptCount',session.blocked_attempt_count,
        'goals',coalesce((
          select jsonb_agg(jsonb_build_object(
            'goalId',goal->>'id',
            'name',coalesce(nullif(trim(goal->>'name'),''),'이름 없는 목표'),
            'minutes',greatest(1,least(720,case when coalesce(goal->>'minutes','') ~ '^\d+$' then (goal->>'minutes')::integer else 1 end)),
            'priority',case when goal->>'priority' in ('low','medium','high') then goal->>'priority' else 'medium' end,
            'completed',exists(
              select 1 from jsonb_array_elements(coalesce(session.payload#>'{result,goalResults}','[]'::jsonb)) goal_result
              where goal_result->>'goalId'=goal->>'id' and goal_result->>'completed'='true'
            )
          ) order by ordinal)
          from jsonb_array_elements(coalesce(session.payload->'goals','[]'::jsonb)) with ordinality goal_item(goal,ordinal)
          where ordinal <= 100 and nullif(trim(goal->>'id'),'') is not null
        ),'[]'::jsonb)
      ) value
      from period_sessions session order by session.settled_at desc limit 200
    ) detail
  )
  select jsonb_build_object(
    'period',p_period,
    'range',jsonb_build_object('startDate',range_start,'endDate',range_end),
    'summary',jsonb_build_object(
      'completionRate',summary.completion_rate,
      'totalFocusMinutes',summary.total_focus_minutes,
      'successfulSessionCount',summary.successful_count,
      'failedSessionCount',summary.failed_count,
      'completedGoalCount',summary.completed_goal_count,
      'totalGoalCount',summary.total_goal_count,
      'focusStreakDays',streak.value,
      'earnedPoints',summary.earned_points,
      'returnedPoints',summary.returned_points,
      'blockedAttemptCount',summary.blocked_attempt_count
    ),
    'trend',trend.value,
    'sessionCount',summary.session_count,
    'sessionsTruncated',summary.session_count>200,
    'sessions',details.value
  ) into result_payload
  from summary,trend,streak,details;

  return result_payload;
end;
$$;

revoke all on function public.build_student_focus_history(uuid,text,date) from public,anon,authenticated;

create or replace function public.get_student_focus_history(p_period text,p_anchor_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if coalesce((select role from public.profiles where id=current_user_id),'') <> 'student' then
    raise exception 'student role required';
  end if;
  return public.build_student_focus_history(current_user_id,p_period,p_anchor_date);
end;
$$;

create or replace function public.get_guardian_focus_history(
  p_student_user_id uuid,
  p_period text,
  p_anchor_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  student_profile public.profiles%rowtype;
  base_history jsonb;
  share_completion boolean;
  share_focus boolean;
  share_reward boolean;
  reward_count integer := 0;
  safe_trend jsonb;
  range_start date;
  range_end date;
  student_timezone text;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if coalesce((select role from public.profiles where id=current_user_id),'') <> 'guardian' then
    raise exception 'guardian role required';
  end if;
  if not exists(select 1 from public.family_links link where link.guardian_user_id=current_user_id
    and link.student_user_id=p_student_user_id and link.status='active') then
    raise exception 'active family link required';
  end if;
  select * into student_profile from public.profiles where id=p_student_user_id and role='student';
  if not found then raise exception 'student profile not found'; end if;

  share_completion := coalesce(student_profile.sharing_preferences->>'shareCompletion','false')='true';
  share_focus := coalesce(student_profile.sharing_preferences->>'shareTotalFocusMinutes','false')='true';
  share_reward := coalesce(student_profile.sharing_preferences->>'shareRewardStatus','false')='true';
  base_history := public.build_student_focus_history(p_student_user_id,p_period,p_anchor_date);
  range_start := (base_history#>>'{range,startDate}')::date;
  range_end := (base_history#>>'{range,endDate}')::date;
  student_timezone := case when exists(select 1 from pg_catalog.pg_timezone_names where name=student_profile.timezone)
    then student_profile.timezone else 'Asia/Seoul' end;

  if share_reward then
    select count(distinct coalesce(wallet.session_id,wallet.schedule_id,wallet.id::text))::integer
    into reward_count
    from public.wallet_transactions wallet
    where (wallet.from_user_id=p_student_user_id or wallet.to_user_id=p_student_user_id)
      and wallet.kind in ('guardian_reward_requested','guardian_reward_declined','guardian_deposit_reserved','guardian_reward_released','guardian_deposit_returned')
      and (wallet.created_at at time zone student_timezone)::date between range_start and range_end;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'dateKey',item->>'dateKey',
    'completionRate',case when share_completion then item->'completionRate' else 'null'::jsonb end,
    'focusMinutes',case when share_focus then item->'focusMinutes' else 'null'::jsonb end
  ) order by item->>'dateKey'),'[]'::jsonb)
  into safe_trend from jsonb_array_elements(base_history->'trend') item;

  return jsonb_build_object(
    'student',jsonb_build_object(
      'userId',p_student_user_id,
      'displayName',coalesce(nullif(trim(student_profile.display_name),''),'이름 미설정')
    ),
    'period',p_period,
    'range',base_history->'range',
    'sharing',jsonb_build_object(
      'completion',share_completion,
      'totalFocusMinutes',share_focus,
      'rewardStatus',share_reward
    ),
    'summary',jsonb_build_object(
      'completionRate',case when share_completion then base_history#>'{summary,completionRate}' else 'null'::jsonb end,
      'totalFocusMinutes',case when share_focus then base_history#>'{summary,totalFocusMinutes}' else 'null'::jsonb end,
      'completedGoalCount',case when share_completion then base_history#>'{summary,completedGoalCount}' else 'null'::jsonb end,
      'rewardCount',case when share_reward then to_jsonb(reward_count) else 'null'::jsonb end
    ),
    'trend',safe_trend
  );
end;
$$;

revoke all on function public.sync_focus_session_metrics(text,text,jsonb) from public,anon;
revoke all on function public.get_student_focus_history(text,date) from public,anon;
revoke all on function public.get_guardian_focus_history(uuid,text,date) from public,anon;
grant execute on function public.sync_focus_session_metrics(text,text,jsonb) to authenticated;
grant execute on function public.get_student_focus_history(text,date) to authenticated;
grant execute on function public.get_guardian_focus_history(uuid,text,date) to authenticated;

comment on function public.sync_focus_session_metrics(text,text,jsonb) is
  'Monotonically merges aggregate Extension focus metrics without accepting browsing details.';
comment on function public.get_student_focus_history(text,date) is
  'Returns the authenticated student terminal focus history for one validated period.';
comment on function public.get_guardian_focus_history(uuid,text,date) is
  'Returns only sharing-preference-filtered focus aggregates for one actively linked student.';
