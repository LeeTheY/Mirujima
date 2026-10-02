-- Reuse sessions and immutable ledger; no new tables. Goals contain planned time only.
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
      coalesce((select sum(w.points) from public.wallet_transactions w where w.status='posted'
        and w.to_user_id=p_user_id and w.to_bucket='earned' and w.session_id=base.session_id
        and w.kind in ('self_deposit_earned','guardian_reward_released')),0) earned_points,
      coalesce((select sum(w.points) from public.wallet_transactions w where w.status='posted'
        and w.to_user_id=p_user_id and w.to_bucket='topup' and w.session_id=base.session_id
        and w.kind='self_deposit_returned'),0) returned_points,
      greatest(0,case when coalesce(base.payload->>'blockedAttemptCount','') ~ '^\d+$'
        then (base.payload->>'blockedAttemptCount')::integer else 0 end) blocked_attempt_count
    from terminal_base base
    where base.settled_at is not null and base.started_at is not null
  ), period_sessions as (
    select * from normalized where date_key between range_start and range_end
  ), daily as (
    select date_key,
      sum(focus_seconds)::integer focus_seconds, round(sum(focus_seconds)::numeric/60)::integer focus_minutes,
      count(*) filter(where status='success')::integer successful_count,
      count(*) filter(where status in ('failed','cancelled'))::integer failed_count,
      round(avg(completion_percent))::integer completion_rate
    from period_sessions group by date_key
  ), trend as (
    select jsonb_agg(jsonb_build_object(
      'dateKey',day_value::date,
      'focusMinutes',coalesce(daily.focus_minutes,0), 'focusSeconds',coalesce(daily.focus_seconds,0),
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
  ), ledger as (
    select coalesce(sum(points) filter(where to_bucket='earned' and kind in ('self_deposit_earned','guardian_reward_released')),0) earned_points,
      coalesce(sum(points) filter(where kind='self_deposit_earned' and to_bucket='earned'),0) self_earned,
      coalesce(sum(points) filter(where kind='self_deposit_returned' and to_bucket='topup'),0) returned_points
    from public.wallet_transactions where to_user_id=p_user_id and status='posted'
      and (created_at at time zone user_timezone)::date between range_start and range_end
  ), goal_totals as (
    select coalesce(nullif(trim(goal->>'name'),''),'이름 없는 목표') name,
      sum(greatest(1,least(720,case when coalesce(goal->>'minutes','') ~ '^\d+$' then (goal->>'minutes')::integer else 1 end))) planned_minutes,
      count(*) goal_count
    from period_sessions, jsonb_array_elements(coalesce(payload->'goals','[]'::jsonb)) goal
    group by 1
  ), goal_chart as (
    select coalesce(jsonb_agg(jsonb_build_object('name',name,'plannedMinutes',planned_minutes,
      'actualFocusMinutes',null,'goalCount',goal_count) order by planned_minutes desc,name),'[]'::jsonb) value from goal_totals
  ), hourly as (
    select jsonb_agg(jsonb_build_object('hour',hour,'sessionCount',
      (select count(*) from period_sessions where extract(hour from started_at at time zone user_timezone)=hour)) order by hour) value
    from generate_series(0,23) hour
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
    'period',p_period, 'timezone',user_timezone,
    'range',jsonb_build_object('startDate',range_start,'endDate',range_end),
    'summary',jsonb_build_object(
      'completionRate',summary.completion_rate,
      'totalFocusMinutes',summary.total_focus_minutes, 'totalFocusSeconds',coalesce((select sum(focus_seconds) from period_sessions),0),
      'successfulSessionCount',summary.successful_count,
      'failedSessionCount',summary.failed_count,
      'completedGoalCount',summary.completed_goal_count,
      'totalGoalCount',summary.total_goal_count,
      'focusStreakDays',streak.value,
      'earnedPoints',ledger.earned_points,
      'returnedPoints',ledger.returned_points,
      'selfDepositConversionRate',case when ledger.self_earned+ledger.returned_points=0 then null else round(100.0*ledger.self_earned/(ledger.self_earned+ledger.returned_points)) end,
      'blockedAttemptCount',summary.blocked_attempt_count
    ),
    'trend',trend.value, 'goals',goal_chart.value, 'hourlyStarts',hourly.value,
    'sessionCount',summary.session_count,
    'sessionsTruncated',summary.session_count>200,
    'sessions',details.value
  ) into result_payload
  from summary,trend,streak,details,ledger,goal_chart,hourly;

  return result_payload;
end;
$$;

revoke all on function public.build_student_focus_history(uuid,text,date) from public,anon,authenticated;


create or replace function public.get_focus_history_context(p_student_user_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid(); tz text; r text;
begin
  if owner_id is null then raise exception 'authentication required'; end if;
  select role into r from public.profiles where id=owner_id;
  if p_student_user_id is not null then
    if r is distinct from 'guardian' or not exists(select 1 from public.family_links where guardian_user_id=owner_id and student_user_id=p_student_user_id and status='active') then
      raise exception 'active family link required';
    end if;
    owner_id := p_student_user_id;
  elsif r is distinct from 'student' then raise exception 'student role required'; end if;
  select timezone into tz from public.profiles where id=owner_id;
  if tz is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=tz) then tz := 'Asia/Seoul'; end if;
  return jsonb_build_object('timezone',tz,'today',(now() at time zone tz)::date);
end; $$;
revoke all on function public.get_focus_history_context(uuid) from public,anon;
grant execute on function public.get_focus_history_context(uuid) to authenticated;
