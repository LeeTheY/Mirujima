begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(17);

select has_function('public','get_current_focus_session',array[]::text[],'current focus recovery RPC exists');
select has_function('public','get_focus_session',array['text'],'own focus lookup RPC exists');
select has_function('public','pause_focus_session',array['text','text'],'pause RPC exists');
select has_function('public','resume_focus_session',array['text','text'],'resume RPC exists');

insert into auth.users(id,email) values
  ('d1111111-1111-4111-8111-111111111111','lifecycle-a@example.com'),
  ('d2222222-2222-4222-8222-222222222222','lifecycle-b@example.com');
update public.profiles set role='student',onboarding_completed=true
where id in ('d1111111-1111-4111-8111-111111111111','d2222222-2222-4222-8222-222222222222');

set local request.jwt.claim.sub='d1111111-1111-4111-8111-111111111111';
set local role authenticated;

select public.upsert_focus_plan(
  'lifecycle-plan',
  '{"title":"수명주기","description":"","dateKey":"2026-08-24","plannedStartAt":null,"targetFocusMinutes":10,"activityMode":"interactive","blockingMode":"off","allowedDomains":[],"blockedDomains":[],"breakMinutes":5,"priority":"high","selfDepositPoints":0,"guardianRewardRequestPoints":0,"goals":[{"id":"goal-1","name":"목표","detail":"","minutes":10,"priority":"high"}],"status":"ready","createdAt":"2026-08-24T09:00:00.000Z","updatedAt":"2026-08-24T09:00:00.000Z"}'::jsonb,
  'lifecycle-device'
);

select public.start_focus_session('lifecycle-plan','lifecycle-device');
create temporary table lifecycle_test_ids(session_id text primary key);
insert into lifecycle_test_ids(session_id)
select entity_id from public.cloud_focus_sessions where payload->>'scheduleId'='lifecycle-plan';

select ok(
  (select payload->>'activeSegmentStartedAt' is not null from public.cloud_focus_sessions where payload->>'scheduleId'='lifecycle-plan'),
  'start stores the active segment timestamp'
);
select is(
  (select payload->>'remainingFocusSeconds' from public.cloud_focus_sessions where payload->>'scheduleId'='lifecycle-plan'),
  '600',
  'start stores target remaining seconds'
);

select is(
  public.pause_focus_session(
    (select entity_id from public.cloud_focus_sessions where payload->>'scheduleId'='lifecycle-plan'),
    'lifecycle-device'
  )->>'status',
  'paused',
  'active session pauses on the server'
);
select is(
  public.pause_focus_session(
    (select entity_id from public.cloud_focus_sessions where payload->>'scheduleId'='lifecycle-plan'),
    'lifecycle-device'
  )->>'status',
  'paused',
  'pause is idempotent'
);
select is(
  public.resume_focus_session(
    (select entity_id from public.cloud_focus_sessions where payload->>'scheduleId'='lifecycle-plan'),
    'lifecycle-device'
  )->>'status',
  'active',
  'paused session resumes on the server'
);
select ok(
  (public.get_current_focus_session()->>'endsAt')::timestamptz > now(),
  'resume calculates a new future end time'
);

reset role;
update public.cloud_focus_sessions
set payload=jsonb_set(payload,'{endsAt}',to_jsonb(now()-interval '1 second'))
where payload->>'scheduleId'='lifecycle-plan';
set local request.jwt.claim.sub='d1111111-1111-4111-8111-111111111111';
set local role authenticated;

select is(public.get_current_focus_session()->>'status','awaiting-result','expired active session normalizes to awaiting result');
select is(
  public.finish_focus_session(
    (select entity_id from public.cloud_focus_sessions where payload->>'scheduleId'='lifecycle-plan'),
    array['goal-1']::text[],
    'lifecycle-device'
  )->>'status',
  'success',
  'awaiting session settles successfully'
);
select is(
  (select payload->'result'->>'completionPercent' from public.cloud_focus_sessions where payload->>'scheduleId'='lifecycle-plan'),
  '100',
  'terminal result stores the derived grade'
);
select is(
  public.finish_focus_session(
    (select entity_id from public.cloud_focus_sessions where payload->>'scheduleId'='lifecycle-plan'),
    array[]::text[],
    'lifecycle-device'
  )->'result'->>'completionPercent',
  '100',
  'repeated settlement preserves the first result'
);
select is(
  public.get_focus_session(
    (select entity_id from public.cloud_focus_sessions where payload->>'scheduleId'='lifecycle-plan')
  )->>'status',
  'success',
  'known session lookup returns terminal state'
);

set local request.jwt.claim.sub='d2222222-2222-4222-8222-222222222222';
select is(
  public.get_focus_session(
    (select session_id from lifecycle_test_ids)
  ),
  null::jsonb,
  'another user cannot read the session'
);

set local request.jwt.claim.sub='d1111111-1111-4111-8111-111111111111';
select public.upsert_focus_plan(
  'legacy-lifecycle-plan',
  '{"title":"레거시","description":"","dateKey":"2026-08-24","plannedStartAt":null,"targetFocusMinutes":5,"activityMode":"interactive","blockingMode":"off","allowedDomains":[],"blockedDomains":[],"breakMinutes":5,"priority":"medium","selfDepositPoints":0,"guardianRewardRequestPoints":0,"goals":[{"id":"legacy-goal","name":"목표","detail":"","minutes":5,"priority":"medium"}],"status":"ready","createdAt":"2026-08-24T09:00:00.000Z","updatedAt":"2026-08-24T09:00:00.000Z"}'::jsonb,
  'lifecycle-device'
);
select public.start_focus_session('legacy-lifecycle-plan','lifecycle-device');
reset role;
update public.cloud_focus_sessions set payload = payload
  - 'activeSegmentStartedAt' - 'pausedAt' - 'accumulatedFocusSeconds' - 'remainingFocusSeconds' - 'updatedAt'
where payload->>'scheduleId'='legacy-lifecycle-plan';
set local request.jwt.claim.sub='d1111111-1111-4111-8111-111111111111';
set local role authenticated;
select ok(
  public.get_current_focus_session() ? 'remainingFocusSeconds',
  'legacy active payload receives lifecycle defaults'
);

select * from finish();
rollback;
