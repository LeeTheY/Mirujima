-- Reuse active family links, profile consent and canonical terminal sessions.
-- AI sharing is an opt-in for ALL AI processing; absent fields stay null, never zero.
create or replace function public.get_guardian_ai_summary_input()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'displayName',coalesce(nullif(trim(p.display_name),''),'학생'),
    'completionRate',case when p.sharing_preferences->>'shareCompletion'='true' then totals.completion_rate else null end,
    'totalFocusMinutes',case when p.sharing_preferences->>'shareTotalFocusMinutes'='true' then totals.focus_minutes else null end,
    'rewardStatus',case when p.sharing_preferences->>'shareRewardStatus'='true' then '공유 허용' else '공유 안 함' end,
    'aiSummary',null
  ) order by p.id), '[]'::jsonb)
  from public.family_links l join public.profiles p on p.id=l.student_user_id
  cross join lateral (
    select case when exists(select 1 from pg_catalog.pg_timezone_names where name=p.timezone) then p.timezone else 'Asia/Seoul' end tz
  ) tz
  cross join lateral (
    select coalesce(round(sum((x.h#>>'{summary,completionRate}')::numeric*(x.h->>'sessionCount')::numeric)
      /nullif(sum((x.h->>'sessionCount')::numeric),0)),0) completion_rate,
      round(coalesce(sum((x.h#>>'{summary,totalFocusSeconds}')::numeric),0)/60) focus_minutes
    from (select public.build_student_focus_history(p.id,'daily',(now() at time zone tz.tz)::date-n) h from generate_series(0,6) n) x
  ) totals
  where l.guardian_user_id=auth.uid() and l.status='active'
    and p.sharing_preferences->>'shareAiSummary'='true'
    and exists(select 1 from public.profiles g where g.id=auth.uid() and g.role='guardian');
$$;
