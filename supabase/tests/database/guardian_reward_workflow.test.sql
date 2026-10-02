begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
-- Emulate sessions already started under the old post-start request policy.
-- Test-only definer helper disappears on rollback; the production helper stays revoked.
create function pg_temp.start_legacy_reward_session(p_plan text,p_device text)
returns jsonb language sql security definer set search_path='' as
' select public.start_focus_session_post_start_reward_internal(p_plan,p_device) ';
grant execute on function pg_temp.start_legacy_reward_session(text,text) to authenticated;

select plan(22);

select has_function('public','get_guardian_reward_requests',array['text'],'guardian reward list RPC exists');
select has_function('public','approve_guardian_reward_request',array['uuid'],'guardian approval RPC exists');
select has_function('public','decline_guardian_reward_request',array['uuid'],'guardian decline RPC exists');
select has_function('public','start_focus_session',array['text','text'],'focus start wrapper remains public');
select has_function('public','finish_focus_session',array['text','text[]','text'],'focus finish wrapper remains public');
select ok(not has_function_privilege('anon','public.approve_guardian_reward_request(uuid)','EXECUTE'),'anonymous cannot approve guardian rewards');

insert into auth.users(id,email) values
 ('b1111111-1111-4111-8111-111111111111','reward-student@example.com'),
 ('b2222222-2222-4222-8222-222222222222','reward-guardian@example.com');
update public.profiles set role='student',display_name='보상 학생' where id='b1111111-1111-4111-8111-111111111111';
update public.profiles set role='guardian',display_name='보상 보호자' where id='b2222222-2222-4222-8222-222222222222';
insert into public.family_links(student_user_id,guardian_user_id,issuer_user_id,issuer_role,status,linked_at)
values('b1111111-1111-4111-8111-111111111111','b2222222-2222-4222-8222-222222222222','b2222222-2222-4222-8222-222222222222','guardian','active',now());
insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,krw_amount,provider,provider_order_id,provider_payment_key,idempotency_key,metadata)
values('topup_confirmed','posted',null,'b2222222-2222-4222-8222-222222222222','external','topup',10000,10000,'toss','reward-topup-order','test-payment','reward-topup-confirmed','{}');

set local request.jwt.claim.sub='b1111111-1111-4111-8111-111111111111';
set local role authenticated;
select public.upsert_focus_plan('reward-plan-1','{"title":"보상 집중","description":"","dateKey":"2026-08-24","plannedStartAt":null,"targetFocusMinutes":5,"activityMode":"interactive","blockingMode":"off","allowedDomains":[],"blockedDomains":[],"breakMinutes":5,"priority":"high","selfDepositPoints":0,"guardianRewardRequestPoints":2000,"goals":[{"id":"goal-1","name":"목표","detail":"","minutes":5,"priority":"high"}],"status":"ready","createdAt":"2026-08-24T09:00:00.000Z","updatedAt":"2026-08-24T09:00:00.000Z"}'::jsonb,'reward-device');
select pg_temp.start_legacy_reward_session('reward-plan-1','reward-device');
create temporary table reward_ids as select entity_id session_id from public.cloud_focus_sessions where payload->>'scheduleId'='reward-plan-1';
select is((select count(*) from public.wallet_transactions where kind='guardian_reward_requested' and session_id=(select session_id from reward_ids)),1::bigint,'focus start creates one guardian request');

select throws_ok('select public.get_guardian_reward_requests(null)','P0001','guardian role required','student cannot list guardian requests');
reset role;
set local request.jwt.claim.sub='b2222222-2222-4222-8222-222222222222';
set local role authenticated;
select is((public.get_guardian_reward_requests('pending')->'items'->0->>'status'),'pending','guardian lists pending request');
select is((public.approve_guardian_reward_request((select id from public.wallet_transactions where kind='guardian_reward_requested' and session_id=(select session_id from reward_ids)))->>'status'),'approved','guardian approves pending request');
select is((select count(*) from public.wallet_transactions where kind='guardian_deposit_reserved'),1::bigint,'approval creates one reservation');
select public.approve_guardian_reward_request((select id from public.wallet_transactions where kind='guardian_reward_requested' and session_id=(select session_id from reward_ids)));
select is((select count(*) from public.wallet_transactions where kind='guardian_deposit_reserved'),1::bigint,'repeated approval is idempotent');
reset role;
select is((public.get_wallet_balances('b2222222-2222-4222-8222-222222222222')->>'topupAvailable')::bigint,8000::bigint,'approval subtracts guardian topup');
select is((public.get_wallet_balances('b2222222-2222-4222-8222-222222222222')->>'reservedAvailable')::bigint,2000::bigint,'approval reserves guardian points');

update public.cloud_focus_sessions set payload=jsonb_set(payload,'{endsAt}',to_jsonb(now()-interval '1 second')) where entity_id=(select session_id from reward_ids);
set local request.jwt.claim.sub='b1111111-1111-4111-8111-111111111111';
set local role authenticated;
select is((public.finish_focus_session((select session_id from reward_ids),array['goal-1']::text[],'reward-device')->>'status'),'success','student success settles focus');
select is((select count(*) from public.wallet_transactions where kind='guardian_reward_released'),1::bigint,'success releases guardian reward once');
reset role;
select is((public.get_wallet_balances('b1111111-1111-4111-8111-111111111111')->>'earnedAvailable')::bigint,2000::bigint,'released reward reaches student earned balance');
select is((public.get_wallet_balances('b2222222-2222-4222-8222-222222222222')->>'reservedAvailable')::bigint,0::bigint,'released reward clears guardian reservation');

set local request.jwt.claim.sub='b1111111-1111-4111-8111-111111111111';
set local role authenticated;
select public.upsert_focus_plan('reward-plan-2','{"title":"거절 집중","description":"","dateKey":"2026-08-24","plannedStartAt":null,"targetFocusMinutes":5,"activityMode":"interactive","blockingMode":"off","allowedDomains":[],"blockedDomains":[],"breakMinutes":5,"priority":"medium","selfDepositPoints":0,"guardianRewardRequestPoints":3000,"goals":[{"id":"goal-2","name":"목표","detail":"","minutes":5,"priority":"medium"}],"status":"ready","createdAt":"2026-08-24T09:00:00.000Z","updatedAt":"2026-08-24T09:00:00.000Z"}'::jsonb,'reward-device');
select pg_temp.start_legacy_reward_session('reward-plan-2','reward-device');
create temporary table reward_ids_2 as select entity_id session_id from public.cloud_focus_sessions where payload->>'scheduleId'='reward-plan-2';
reset role;
set local request.jwt.claim.sub='b2222222-2222-4222-8222-222222222222';
set local role authenticated;
select is((public.decline_guardian_reward_request((select id from public.wallet_transactions where kind='guardian_reward_requested' and session_id=(select session_id from reward_ids_2)))->>'status'),'declined','guardian declines pending request');
select public.decline_guardian_reward_request((select id from public.wallet_transactions where kind='guardian_reward_requested' and session_id=(select session_id from reward_ids_2)));
select is((select count(*) from public.wallet_transactions where kind='guardian_reward_declined'),1::bigint,'repeated decline is idempotent');
select is((public.get_guardian_reward_requests('declined')->'items'->0->>'status'),'declined','declined request has terminal status');

reset role;
set local request.jwt.claim.sub='b1111111-1111-4111-8111-111111111111';
set local role authenticated;
select public.upsert_focus_plan('reward-plan-3','{"title":"잔액 부족","description":"","dateKey":"2026-08-24","plannedStartAt":null,"targetFocusMinutes":5,"activityMode":"interactive","blockingMode":"off","allowedDomains":[],"blockedDomains":[],"breakMinutes":5,"priority":"medium","selfDepositPoints":0,"guardianRewardRequestPoints":20000,"goals":[{"id":"goal-3","name":"목표","detail":"","minutes":5,"priority":"medium"}],"status":"ready","createdAt":"2026-08-24T09:00:00.000Z","updatedAt":"2026-08-24T09:00:00.000Z"}'::jsonb,'reward-device');
select throws_ok($$select pg_temp.start_legacy_reward_session('reward-plan-3','reward-device')$$,'P0001','active focus session already exists','another active focus still blocks a third request');

select * from finish();
rollback;
