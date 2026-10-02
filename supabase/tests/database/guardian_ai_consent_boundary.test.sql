begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
set local timezone='Asia/Seoul';
select no_plan();
insert into auth.users(id,email) values
  ('e1111111-1111-4111-8111-111111111111','history-student@example.com'),
  ('e2222222-2222-4222-8222-222222222222','history-other@example.com'),
  ('e3333333-3333-4333-8333-333333333333','history-guardian@example.com'),
  ('e4444444-4444-4444-8444-444444444444','history-unlinked@example.com');

update public.profiles set role='student',onboarding_completed=true,timezone='Asia/Seoul',
  sharing_preferences='{"shareCompletion":true,"shareTotalFocusMinutes":true,"shareRewardStatus":true,"shareAiSummary":false}'::jsonb
where id in ('e1111111-1111-4111-8111-111111111111','e2222222-2222-4222-8222-222222222222');
update public.profiles set role='guardian',onboarding_completed=true,timezone='Asia/Seoul'
where id in ('e3333333-3333-4333-8333-333333333333','e4444444-4444-4444-8444-444444444444');
update public.profiles set display_name='기록 학생' where id='e1111111-1111-4111-8111-111111111111';

insert into public.family_links(student_user_id,guardian_user_id,issuer_user_id,issuer_role,status,linked_at)
values('e1111111-1111-4111-8111-111111111111','e3333333-3333-4333-8333-333333333333','e1111111-1111-4111-8111-111111111111','student','active',now());

insert into public.cloud_focus_sessions(user_id,entity_id,payload,version,device_id) values
('e1111111-1111-4111-8111-111111111111','history-success',jsonb_build_object(
  'id','history-success','scheduleId','history-plan-success','ownerUserId','e1111111-1111-4111-8111-111111111111',
  'startedAt',(current_date::text||'T01:00:00.000Z'),'endsAt',(current_date::text||'T01:25:00.000Z'),
  'targetFocusMinutes',25,'blockingMode','blocklist','status','success','accumulatedFocusSeconds',1500,
  'goals',jsonb_build_array(jsonb_build_object('id','goal-1','name','수학','detail','','minutes',25,'priority','high')),
  'result',jsonb_build_object('completedGoalIds',jsonb_build_array('goal-1'),'goalResults',jsonb_build_array(jsonb_build_object('goalId','goal-1','completed',true)),
    'completedGoalCount',1,'totalGoalCount',1,'completionPercent',100,'earnedPoints',1000,'returnedPoints',0,'settledAt',(current_date::text||'T01:25:00.000Z')),
  'updatedAt',(current_date::text||'T01:25:00.000Z')
),1,'history-device'),
('e1111111-1111-4111-8111-111111111111','history-failed',jsonb_build_object(
  'id','history-failed','scheduleId','history-plan-failed','ownerUserId','e1111111-1111-4111-8111-111111111111',
  'startedAt',(current_date::text||'T02:00:00.000Z'),'endsAt',(current_date::text||'T02:25:00.000Z'),
  'targetFocusMinutes',25,'blockingMode','off','status','failed','accumulatedFocusSeconds',900,
  'goals',jsonb_build_array(jsonb_build_object('id','goal-2','name','영어','detail','','minutes',25,'priority','medium')),
  'result',jsonb_build_object('completedGoalIds','[]'::jsonb,'goalResults',jsonb_build_array(jsonb_build_object('goalId','goal-2','completed',false)),
    'completedGoalCount',0,'totalGoalCount',1,'completionPercent',0,'earnedPoints',0,'returnedPoints',500,'settledAt',(current_date::text||'T02:15:00.000Z')),
  'updatedAt',(current_date::text||'T02:15:00.000Z')
),1,'history-device'),
('e1111111-1111-4111-8111-111111111111','history-active',jsonb_build_object(
  'id','history-active','scheduleId','history-plan-active','ownerUserId','e1111111-1111-4111-8111-111111111111',
  'startedAt',(current_date::text||'T03:00:00.000Z'),'endsAt',(current_date::text||'T03:25:00.000Z'),
  'targetFocusMinutes',25,'blockingMode','off','status','active','accumulatedFocusSeconds',0,
  'goals',jsonb_build_array(jsonb_build_object('id','goal-3','name','진행 중','detail','','minutes',25,'priority','low')),
  'updatedAt',(current_date::text||'T03:00:00.000Z')
),1,'history-device');


set local request.jwt.claim.sub='e3333333-3333-4333-8333-333333333333';
set local role authenticated;
select is(public.get_guardian_ai_summary_input(),'[]'::jsonb,'AI opt-out excludes every aggregate from processing');
reset role;
update public.profiles set sharing_preferences='{"shareCompletion":false,"shareTotalFocusMinutes":false,"shareRewardStatus":false,"shareAiSummary":true}'::jsonb where id='e1111111-1111-4111-8111-111111111111';
set local role authenticated;
select is(jsonb_array_length(public.get_guardian_ai_summary_input()),1,'explicit AI sharing includes one linked student');
select is(jsonb_typeof(public.get_guardian_ai_summary_input()#>'{0,completionRate}'),'null','unshared achievement remains null');
select is(jsonb_typeof(public.get_guardian_ai_summary_input()#>'{0,totalFocusMinutes}'),'null','unshared time remains null');
select ok(not (public.get_guardian_ai_summary_input()::text like '%history-plan%'),'no raw session identifiers');
reset role;
update public.profiles set sharing_preferences='{"shareCompletion":true,"shareTotalFocusMinutes":true,"shareRewardStatus":true,"shareAiSummary":true}'::jsonb where id='e1111111-1111-4111-8111-111111111111';
set local role authenticated;
select is(public.get_guardian_ai_summary_input()#>>'{0,totalFocusMinutes}','40','AI uses canonical focus seconds instead of mutable cloud-day data');
reset role;
update public.family_links set status='disconnected' where student_user_id='e1111111-1111-4111-8111-111111111111';
set local role authenticated;
select is(public.get_guardian_ai_summary_input(),'[]'::jsonb,'disconnection immediately revokes AI input');
set local request.jwt.claim.sub='e1111111-1111-4111-8111-111111111111';
select is(public.get_guardian_ai_summary_input(),'[]'::jsonb,'student cannot call guardian projection for another user');
select * from finish(); rollback;
