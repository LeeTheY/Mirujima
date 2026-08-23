begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
set local timezone='Asia/Seoul';
select plan(26);

select has_function('public','sync_focus_session_metrics',array['text','text','jsonb'],'metric sync RPC exists');
select has_function('public','get_student_focus_history',array['text','date'],'student history RPC exists');
select has_function('public','get_guardian_focus_history',array['uuid','text','date'],'guardian history RPC exists');
select has_index('public','cloud_focus_sessions','cloud_focus_sessions_user_updated_history_idx','history lookup index exists');

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

set local request.jwt.claim.sub='e1111111-1111-4111-8111-111111111111';
set local role authenticated;

select is(public.sync_focus_session_metrics('history-success','history-device','{"blockedAttemptCount":3,"idleSeconds":30,"distractionSeconds":10,"checkInCount":2}'::jsonb)->>'blockedAttemptCount','3','metrics are stored');
select is(public.sync_focus_session_metrics('history-success','history-device','{"blockedAttemptCount":1,"idleSeconds":5,"distractionSeconds":1,"checkInCount":1}'::jsonb)->>'blockedAttemptCount','3','metrics never decrease');
select throws_ok($$select public.sync_focus_session_metrics('history-success','history-device','{"rawUrl":"https://example.com"}'::jsonb)$$,'P0001','unsupported focus metric','raw metric keys are rejected');

select is((public.get_student_focus_history('daily',current_date)->>'sessionCount')::integer,2,'terminal sessions are returned and active sessions are excluded');
select is((public.get_student_focus_history('daily',current_date)#>>'{summary,successfulSessionCount}')::integer,1,'success count is aggregated');
select is((public.get_student_focus_history('daily',current_date)#>>'{summary,failedSessionCount}')::integer,1,'failed count includes failed sessions');
select is((public.get_student_focus_history('daily',current_date)#>>'{summary,totalFocusMinutes}')::integer,40,'focus seconds are aggregated before rounding');
select is((public.get_student_focus_history('daily',current_date)#>>'{summary,completedGoalCount}')::integer,1,'completed goals are aggregated');
select is((public.get_student_focus_history('daily',current_date)#>>'{summary,blockedAttemptCount}')::integer,3,'extension metrics appear in history');
select is(jsonb_array_length(public.get_student_focus_history('daily',current_date)->'trend'),1,'daily trend contains one date');
select is(public.get_student_focus_history('monthly',current_date)#>>'{range,endDate}',current_date::text,'current periods do not expose future trend dates');

set local request.jwt.claim.sub='e2222222-2222-4222-8222-222222222222';
select is((public.get_student_focus_history('daily',current_date)->>'sessionCount')::integer,0,'another student sees only their own empty history');
select throws_ok($$select public.sync_focus_session_metrics('history-success','history-device','{"blockedAttemptCount":9}'::jsonb)$$,'P0001','focus session not found','another student cannot update metrics');

set local request.jwt.claim.sub='e3333333-3333-4333-8333-333333333333';
select is((public.get_guardian_focus_history('e1111111-1111-4111-8111-111111111111','daily',current_date)#>>'{summary,completionRate}')::integer,50,'linked guardian sees consented completion aggregate');
select is((public.get_guardian_focus_history('e1111111-1111-4111-8111-111111111111','daily',current_date)#>>'{summary,totalFocusMinutes}')::integer,40,'linked guardian sees consented focus aggregate');
select ok(not (public.get_guardian_focus_history('e1111111-1111-4111-8111-111111111111','daily',current_date) ? 'sessions'),'guardian response omits raw session details');

reset role;
update public.profiles set sharing_preferences='{"shareCompletion":false,"shareTotalFocusMinutes":false,"shareRewardStatus":false,"shareAiSummary":false}'::jsonb
where id='e1111111-1111-4111-8111-111111111111';
set local request.jwt.claim.sub='e3333333-3333-4333-8333-333333333333';
set local role authenticated;
select is(jsonb_typeof(public.get_guardian_focus_history('e1111111-1111-4111-8111-111111111111','daily',current_date)#>'{summary,completionRate}'),'null','private completion is returned as null');
select is(jsonb_typeof(public.get_guardian_focus_history('e1111111-1111-4111-8111-111111111111','daily',current_date)#>'{summary,totalFocusMinutes}'),'null','private focus time is returned as null');
select is(jsonb_typeof(public.get_guardian_focus_history('e1111111-1111-4111-8111-111111111111','daily',current_date)#>'{summary,rewardCount}'),'null','private reward status is returned as null');

set local request.jwt.claim.sub='e4444444-4444-4444-8444-444444444444';
select throws_ok($$select public.get_guardian_focus_history('e1111111-1111-4111-8111-111111111111','daily',current_date)$$,'P0001','active family link required','unlinked guardian cannot read history');
set local request.jwt.claim.sub='e1111111-1111-4111-8111-111111111111';
select throws_ok($$select public.get_guardian_focus_history('e2222222-2222-4222-8222-222222222222','daily',current_date)$$,'P0001','guardian role required','student cannot call guardian history');
select throws_ok($$select public.get_student_focus_history('yearly',current_date)$$,'P0001','unsupported history period','unsupported periods are rejected');

select * from finish();
rollback;
