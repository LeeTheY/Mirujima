begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(12);

select has_function('public','finish_focus_session',array['text','text[]','text'],'goal completion settlement RPC exists');

insert into auth.users(id,email) values
  ('c1111111-1111-4111-8111-111111111111','focus-goals@example.com');
update public.profiles set role='student',onboarding_completed=true
where id='c1111111-1111-4111-8111-111111111111';

set local request.jwt.claim.sub='c1111111-1111-4111-8111-111111111111';
set local role authenticated;

select throws_ok(
  $$select public.upsert_focus_plan(
    'duplicate-goals',
    '{"title":"중복 목표","description":"","dateKey":"2026-08-11","plannedStartAt":null,"targetFocusMinutes":1,"activityMode":"interactive","blockingMode":"off","allowedDomains":[],"blockedDomains":[],"breakMinutes":5,"priority":"high","selfDepositPoints":0,"guardianRewardRequestPoints":0,"goals":[{"id":"same","name":"목표 1","detail":"","minutes":1,"priority":"high"},{"id":"same","name":"목표 2","detail":"","minutes":1,"priority":"medium"}],"status":"ready","createdAt":"2026-08-11T09:00:00.000Z","updatedAt":"2026-08-11T09:00:00.000Z"}'::jsonb,
    'goal-test-device'
  )$$,
  'P0001','duplicate focus goal id','duplicate goal ids are rejected'
);

select is(
  jsonb_array_length(public.upsert_focus_plan(
    'goal-session',
    '{"title":"세 목표","description":"","dateKey":"2026-08-11","plannedStartAt":null,"targetFocusMinutes":1,"activityMode":"interactive","blockingMode":"off","allowedDomains":[],"blockedDomains":[],"breakMinutes":5,"priority":"high","selfDepositPoints":0,"guardianRewardRequestPoints":0,"goals":[{"id":"goal-1","name":"목표 1","detail":"첫째","minutes":1,"priority":"high"},{"id":"goal-2","name":"목표 2","detail":"둘째","minutes":1,"priority":"medium"},{"id":"goal-3","name":"목표 3","detail":"셋째","minutes":1,"priority":"low"}],"status":"ready","createdAt":"2026-08-11T09:00:00.000Z","updatedAt":"2026-08-11T09:00:00.000Z"}'::jsonb,
    'goal-test-device'
  )->'goals'),
  3,
  'focus plan stores every goal'
);

select is(
  jsonb_array_length(public.start_focus_session('goal-session','goal-test-device')->'goals'),
  3,
  'focus session snapshots every goal'
);

select throws_ok(
  $$select public.finish_focus_session(
    (select entity_id from public.cloud_focus_sessions where payload->>'scheduleId'='goal-session'),
    100,
    'goal-test-device'
  )$$,
  'P0001','legacy completion is not allowed','new sessions reject client-selected percentages'
);

reset role;
update public.cloud_focus_sessions
set payload=jsonb_set(payload,'{endsAt}',to_jsonb(now()-interval '1 second'))
where payload->>'scheduleId'='goal-session';
set local request.jwt.claim.sub='c1111111-1111-4111-8111-111111111111';
set local role authenticated;

select throws_ok(
  $$select public.finish_focus_session(
    (select entity_id from public.cloud_focus_sessions where payload->>'scheduleId'='goal-session'),
    array['unknown-goal']::text[],
    'goal-test-device'
  )$$,
  'P0001','invalid completed goal ids','unknown completed goal ids are rejected'
);

select throws_ok(
  $$select public.finish_focus_session(
    (select entity_id from public.cloud_focus_sessions where payload->>'scheduleId'='goal-session'),
    array['goal-1','goal-1']::text[],
    'goal-test-device'
  )$$,
  'P0001','invalid completed goal ids','duplicate completed goal ids are rejected'
);

select is(
  public.finish_focus_session(
    (select entity_id from public.cloud_focus_sessions where payload->>'scheduleId'='goal-session'),
    array['goal-1']::text[],
    'goal-test-device'
  )->'result'->>'completionPercent',
  '60',
  'one of three completed goals derives a 60 percent grade'
);

select is(
  (select payload->'result'->>'completedGoalCount' from public.cloud_focus_sessions where payload->>'scheduleId'='goal-session'),
  '1',
  'session result stores the completed goal count'
);

select is(
  (select payload->'result'->>'totalGoalCount' from public.cloud_focus_sessions where payload->>'scheduleId'='goal-session'),
  '3',
  'session result stores the total goal count'
);

select is(
  (select jsonb_array_length(payload->'result'->'goalResults') from public.cloud_focus_sessions where payload->>'scheduleId'='goal-session'),
  3,
  'session result stores completion state for every goal'
);

select is(
  public.finish_focus_session(
    (select entity_id from public.cloud_focus_sessions where payload->>'scheduleId'='goal-session'),
    array['goal-1','goal-2','goal-3']::text[],
    'goal-test-device'
  )->'result'->>'completionPercent',
  '60',
  'repeated settlement returns the first immutable result'
);

select * from finish();
rollback;
