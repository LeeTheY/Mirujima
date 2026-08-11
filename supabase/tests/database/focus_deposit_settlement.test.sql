begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(20);

insert into auth.users (id, email) values
  ('a1111111-1111-4111-8111-111111111111', 'focus-points@example.com');
update public.profiles set role='student', onboarding_completed=true where id='a1111111-1111-4111-8111-111111111111';
insert into public.wallet_transactions (
  kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,krw_amount,idempotency_key,metadata
) values (
  'topup_confirmed','posted',null,'a1111111-1111-4111-8111-111111111111','external','topup',10000,10000,
  'focus-topup-fixture-0001','{"sandbox":true,"actualPayment":false}'::jsonb
);

set local role authenticated;
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';

select public.upsert_focus_plan(
  'focus-100',
  '{"title":"100 percent","description":"","dateKey":"2026-08-10","plannedStartAt":null,"targetFocusMinutes":1,"activityMode":"interactive","blockingMode":"off","allowedDomains":[],"blockedDomains":[],"breakMinutes":5,"priority":"high","selfDepositPoints":1000,"guardianRewardRequestPoints":0,"goals":[{"id":"goal-1","name":"모두 완료","detail":"","minutes":1,"priority":"high"}],"status":"ready","createdAt":"2026-08-10T09:00:00.000Z","updatedAt":"2026-08-10T09:00:00.000Z"}'::jsonb,
  'db-test-device'
);
select public.start_focus_session('focus-100','db-test-device');
select is((select sum(case when to_bucket='topup' then points else -points end) from public.wallet_transactions where (to_user_id='a1111111-1111-4111-8111-111111111111' or from_user_id='a1111111-1111-4111-8111-111111111111') and (to_bucket='topup' or from_bucket='topup')),9000::numeric,'start reserves topup points');
select is((select sum(points) from public.wallet_transactions where kind='self_deposit_reserved'),1000::numeric,'reservation appears in wallet');
reset role;
update public.cloud_focus_sessions set payload=jsonb_set(payload,'{endsAt}',to_jsonb(now()-interval '1 second')) where entity_id=(select entity_id from public.cloud_focus_sessions where payload->>'scheduleId'='focus-100');
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
set local role authenticated;
select public.finish_focus_session((select entity_id from public.cloud_focus_sessions where payload->>'scheduleId'='focus-100'),array['goal-1']::text[],'db-test-device');
select is((select sum(points) from public.wallet_transactions where kind='self_deposit_earned'),1000::numeric,'100 percent moves all points to earned');
select is((select sum(case when to_bucket='reserved' then points else -points end) from public.wallet_transactions where to_bucket='reserved' or from_bucket='reserved'),0::numeric,'100 percent clears reservation');

select public.upsert_focus_plan(
  'focus-60',
  '{"title":"60 percent","description":"","dateKey":"2026-08-10","plannedStartAt":null,"targetFocusMinutes":1,"activityMode":"interactive","blockingMode":"off","allowedDomains":[],"blockedDomains":[],"breakMinutes":5,"priority":"high","selfDepositPoints":1000,"guardianRewardRequestPoints":0,"goals":[{"id":"goal-1","name":"첫 목표","detail":"","minutes":1,"priority":"high"},{"id":"goal-2","name":"둘째 목표","detail":"","minutes":1,"priority":"medium"},{"id":"goal-3","name":"셋째 목표","detail":"","minutes":1,"priority":"low"}],"status":"ready","createdAt":"2026-08-10T09:00:00.000Z","updatedAt":"2026-08-10T09:00:00.000Z"}'::jsonb,
  'db-test-device'
);
select public.start_focus_session('focus-60','db-test-device');
reset role;
update public.cloud_focus_sessions set payload=jsonb_set(payload,'{endsAt}',to_jsonb(now()-interval '1 second')) where entity_id=(select entity_id from public.cloud_focus_sessions where payload->>'scheduleId'='focus-60');
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
set local role authenticated;
select public.finish_focus_session((select entity_id from public.cloud_focus_sessions where payload->>'scheduleId'='focus-60'),array['goal-1']::text[],'db-test-device');
select is((select sum(points) from public.wallet_transactions where kind='self_deposit_earned'),1600::numeric,'60 percent earns proportional points');
select is((select sum(case when to_bucket='topup' then points else -points end) from public.wallet_transactions where to_bucket='topup' or from_bucket='topup'),8400::numeric,'60 percent returns the remainder to topup');
select is((select count(*) from public.wallet_transactions where kind='self_deposit_earned'),2::bigint,'earned settlements are append-only');
select is((select count(*) from public.wallet_transactions where kind='self_deposit_returned'),1::bigint,'partial settlement records one return');

select public.upsert_focus_plan(
  'focus-80',
  '{"title":"80 percent","description":"","dateKey":"2026-08-10","plannedStartAt":null,"targetFocusMinutes":1,"activityMode":"interactive","blockingMode":"off","allowedDomains":[],"blockedDomains":[],"breakMinutes":5,"priority":"high","selfDepositPoints":1000,"guardianRewardRequestPoints":0,"goals":[{"id":"goal-1","name":"첫 목표","detail":"","minutes":1,"priority":"high"},{"id":"goal-2","name":"둘째 목표","detail":"","minutes":1,"priority":"medium"}],"status":"ready","createdAt":"2026-08-10T09:00:00.000Z","updatedAt":"2026-08-10T09:00:00.000Z"}'::jsonb,
  'db-test-device'
);
select public.start_focus_session('focus-80','db-test-device');
reset role;
update public.cloud_focus_sessions set payload=jsonb_set(payload,'{endsAt}',to_jsonb(now()-interval '1 second')) where entity_id=(select entity_id from public.cloud_focus_sessions where payload->>'scheduleId'='focus-80');
set local request.jwt.claim.sub = 'a1111111-1111-4111-8111-111111111111';
set local role authenticated;
select public.finish_focus_session((select entity_id from public.cloud_focus_sessions where payload->>'scheduleId'='focus-80'),array['goal-1']::text[],'db-test-device');
select is((select sum(points) from public.wallet_transactions where kind='self_deposit_earned'),2400::numeric,'80 percent earns proportional points');
select is((select sum(case when to_bucket='topup' then points else -points end) from public.wallet_transactions where to_bucket='topup' or from_bucket='topup'),7600::numeric,'80 percent returns the remainder to topup');
select is((select payload->'result'->>'earnedPoints' from public.cloud_focus_sessions where payload->>'scheduleId'='focus-80'),'800','80 percent result stores earned points');
select is((select payload->>'status' from public.cloud_focus_sessions where payload->>'scheduleId'='focus-80'),'success','80 percent completion stores a successful session');

select public.upsert_focus_plan(
  'focus-failed',
  '{"title":"failed","description":"","dateKey":"2026-08-10","plannedStartAt":null,"targetFocusMinutes":1,"activityMode":"interactive","blockingMode":"off","allowedDomains":[],"blockedDomains":[],"breakMinutes":5,"priority":"high","selfDepositPoints":1000,"guardianRewardRequestPoints":0,"goals":[{"id":"goal-1","name":"미완료 목표","detail":"","minutes":1,"priority":"high"}],"status":"ready","createdAt":"2026-08-10T09:00:00.000Z","updatedAt":"2026-08-10T09:00:00.000Z"}'::jsonb,
  'db-test-device'
);
select public.start_focus_session('focus-failed','db-test-device');
select public.finish_focus_session((select entity_id from public.cloud_focus_sessions where payload->>'scheduleId'='focus-failed'),array[]::text[],'db-test-device');
select is((select sum(case when to_bucket='topup' then points else -points end) from public.wallet_transactions where to_bucket='topup' or from_bucket='topup'),7600::numeric,'failure returns the full deposit');
select is((select payload->>'status' from public.cloud_schedules where entity_id='focus-failed'),'failed','failed plan status is stored');
select is((select payload->'result'->>'completionPercent' from public.cloud_focus_sessions where payload->>'scheduleId'='focus-failed'),'0','failure result stores zero percent');
select is((select count(*) from public.wallet_transactions where kind='self_deposit_reserved'),4::bigint,'each start records exactly one reservation');
select is((select count(*) from public.wallet_transactions where kind='self_deposit_returned'),3::bigint,'failure records a full return');
select is((select sum(points) from public.wallet_transactions where kind='self_deposit_returned'),1600::numeric,'partial and failed returns preserve the exact remainder');
select is((select payload->'result'->>'earnedPoints' from public.cloud_focus_sessions where payload->>'scheduleId'='focus-60'),'600','session result stores earned points');
select is((select payload->>'status' from public.cloud_focus_sessions where payload->>'scheduleId'='focus-60'),'success','partial completion stores a successful session');

select * from finish();
rollback;
