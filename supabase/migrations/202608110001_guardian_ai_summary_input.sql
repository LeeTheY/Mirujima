-- Guardian AI receives only student-consented aggregates. Raw browsing and page
-- content are never selected by this boundary.
create or replace function public.get_guardian_ai_summary_input()
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'displayName',coalesce(nullif(trim(profile.display_name),''),'학생'),
    'completionRate',case when coalesce(profile.sharing_preferences->>'shareCompletion','false')='true' then coalesce(day_summary.completion_rate,0) else 0 end,
    'totalFocusMinutes',case when coalesce(profile.sharing_preferences->>'shareTotalFocusMinutes','false')='true' then coalesce(day_summary.total_focus_minutes,0) else 0 end,
    'rewardStatus',case when coalesce(profile.sharing_preferences->>'shareRewardStatus','false')='true' then '공유 허용' else '공유 안 함' end,
    'aiSummary',case when coalesce(profile.sharing_preferences->>'shareAiSummary','false')='true' then report_summary.ai_summary else null end
  ) order by profile.display_name), '[]'::jsonb)
  from public.family_links link
  join public.profiles profile on profile.id=link.student_user_id
  left join lateral (
    select round(avg(day.achievement_rate))::integer completion_rate,
      coalesce(sum(day.actual_focus_minutes),0)::integer total_focus_minutes
    from public.cloud_learning_days day
    where day.user_id=link.student_user_id and day.deleted_at is null and day.date_key>=current_date-6
  ) day_summary on true
  left join lateral (
    select report.payload->>'aiSummary' ai_summary
    from public.cloud_reports report
    where report.user_id=link.student_user_id and report.deleted_at is null and report.payload ? 'aiSummary'
    order by report.updated_at desc limit 1
  ) report_summary on true
  where link.guardian_user_id=(select auth.uid()) and link.status='active'
    and exists(select 1 from public.profiles guardian where guardian.id=(select auth.uid()) and guardian.role='guardian');
$$;

revoke all on function public.get_guardian_ai_summary_input() from public,anon;
grant execute on function public.get_guardian_ai_summary_input() to authenticated;

comment on function public.get_guardian_ai_summary_input() is
  'Returns only sharing-preference-filtered seven-day aggregates for the authenticated guardian AI summary.';
