begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(43);
select ok(not has_function_privilege('anon','public.list_wallet_transactions(text,integer,timestamptz,uuid,uuid)','EXECUTE'),'anonymous ledger reads are denied');
select ok(has_function_privilege('authenticated','public.list_wallet_transactions(text,integer,timestamptz,uuid,uuid)','EXECUTE'),'authenticated callers may read their projection');
insert into auth.users(id,email) values
 ('e1111111-1111-4111-8111-111111111111','wallet-history-student@example.com'),
 ('e2222222-2222-4222-8222-222222222222','wallet-history-guardian@example.com'),
 ('e3333333-3333-4333-8333-333333333333','wallet-history-other@example.com');
update public.profiles set role='student' where id='e1111111-1111-4111-8111-111111111111';
update public.profiles set role='guardian' where id='e2222222-2222-4222-8222-222222222222';
insert into public.wallet_transactions(id,kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,krw_amount,schedule_id,session_id,idempotency_key,created_at,metadata,provider_payment_key) values
 ('ea000000-0000-4000-8000-000000000001','topup_confirmed','posted',null,'e1111111-1111-4111-8111-111111111111','external','topup',10000,10000,null,null,'history-topup-a','2026-01-01T00:00:00.123456Z','{"body":"secret-page-content","failureCode":"raw-provider-secret"}','secret-payment-key'),
 ('ea000000-0000-4000-8000-000000000002','self_deposit_reserved','posted','e1111111-1111-4111-8111-111111111111','e1111111-1111-4111-8111-111111111111','topup','reserved',2000,null,'plan-safe','session-safe','history-self-reserve','2026-01-01T00:00:00.123456Z','{}',null),
 ('ea000000-0000-4000-8000-000000000003','self_deposit_earned','posted','e1111111-1111-4111-8111-111111111111','e1111111-1111-4111-8111-111111111111','reserved','earned',2000,null,'plan-safe','session-safe','history-self-earned','2026-01-01T00:00:00.123456Z','{}',null),
 ('ea000000-0000-4000-8000-000000000004','cashout_requested','posted','e1111111-1111-4111-8111-111111111111','e1111111-1111-4111-8111-111111111111','earned','cashout_reserved',500,500,null,null,'history-cashout-request','2026-01-01T00:00:00.123456Z','{}',null),
 ('ea000000-0000-4000-8000-000000000005','cashout_rejected','posted','e1111111-1111-4111-8111-111111111111','e1111111-1111-4111-8111-111111111111','cashout_reserved','earned',500,500,null,null,'history-cashout-rejected','2026-01-01T00:00:00.123456Z','{}',null),
 ('ea000000-0000-4000-8000-000000000006','guardian_reward_requested','posted','e1111111-1111-4111-8111-111111111111','e2222222-2222-4222-8222-222222222222','external','external',200,null,'plan-safe','session-safe','history-reward-request','2026-01-01T00:00:00.123456Z','{}',null),
 ('ea000000-0000-4000-8000-000000000007','guardian_deposit_reserved','posted','e2222222-2222-4222-8222-222222222222','e2222222-2222-4222-8222-222222222222','topup','reserved',200,null,'plan-safe','session-safe','history-guardian-reserve','2026-01-01T00:00:00.123456Z','{"studentUserId":"e1111111-1111-4111-8111-111111111111"}',null),
 ('ea000000-0000-4000-8000-000000000008','guardian_reward_released','posted','e2222222-2222-4222-8222-222222222222','e1111111-1111-4111-8111-111111111111','reserved','earned',200,null,'plan-safe','session-safe','history-guardian-release','2026-01-01T00:00:00.123456Z','{}',null),
 ('ea000000-0000-4000-8000-000000000009','topup_requested','confirming',null,'e1111111-1111-4111-8111-111111111111','external','topup',30000,30000,null,null,'history-pending-topup','2026-01-01T00:00:00.123456Z','{}',null),
 ('ea000000-0000-4000-8000-000000000010','topup_requested','failed',null,'e1111111-1111-4111-8111-111111111111','external','topup',10000,10000,null,null,'history-failed-topup','2026-01-01T00:00:00.123456Z','{"failureCode":"REJECT_CARD_COMPANY"}',null),
 ('ea000000-0000-4000-8000-000000000011','topup_confirmed','posted',null,'e3333333-3333-4333-8333-333333333333','external','topup',999,999,null,null,'history-foreign-topup','2026-01-01T00:00:00.123456Z','{}',null),
 ('ea000000-0000-4000-8000-000000000012','guardian_reward_declined','posted','e2222222-2222-4222-8222-222222222222','e1111111-1111-4111-8111-111111111111','external','external',300,null,'plan-safe','session-safe','history-declined-reward','2026-01-01T00:00:00.123455Z','{"reason":"student-withdrawn","url":"https://private.invalid"}',null);
insert into public.wallet_transactions(kind,status,to_user_id,from_bucket,to_bucket,points,krw_amount,idempotency_key,created_at)
values('topup_confirmed','posted','e2222222-2222-4222-8222-222222222222','external','topup',10000,10000,'history-guardian-topup','2025-12-31T00:00:00Z');
update public.wallet_transactions set related_transaction_id=case
 when id='ea000000-0000-4000-8000-000000000003' then 'ea000000-0000-4000-8000-000000000002'::uuid
 when id='ea000000-0000-4000-8000-000000000005' then 'ea000000-0000-4000-8000-000000000004'::uuid
 when id='ea000000-0000-4000-8000-000000000007' then 'ea000000-0000-4000-8000-000000000006'::uuid
 when id='ea000000-0000-4000-8000-000000000008' then 'ea000000-0000-4000-8000-000000000007'::uuid
 else related_transaction_id end;
create temp table history_baseline as select public.get_wallet_balances('e1111111-1111-4111-8111-111111111111') as balances;
set local request.jwt.claim.sub='e1111111-1111-4111-8111-111111111111';
set local role authenticated;
select is(public.list_wallet_transactions()->>'ownerUserId','e1111111-1111-4111-8111-111111111111','owner comes from auth.uid');
select is(jsonb_array_length(public.list_wallet_transactions()->'items'),10,'all ten own rows including pending and failed remain visible');
select is(jsonb_array_length(public.list_wallet_transactions('topup')->'items'),3,'topup filter includes pending and failed orders');
select is(jsonb_array_length(public.list_wallet_transactions('focus')->'items'),2,'focus filter includes reserve and settlement');
select is(jsonb_array_length(public.list_wallet_transactions('reward')->'items'),3,'reward filter contains own request, payment, cancellation');
select is(jsonb_array_length(public.list_wallet_transactions('cashout')->'items'),2,'cashout request and rejection remain separate ledger rows');
select is(public.list_wallet_transactions()->'items'->0->>'id','ea000000-0000-4000-8000-000000000010','equal timestamps use descending UUID tie breaker');
select is(public.list_wallet_transactions('all',2)->>'hasMore','true','page has more rows');
select is(public.list_wallet_transactions('all',2)->'nextCursor'->>'id','ea000000-0000-4000-8000-000000000009','cursor refers to final visible row');
select is(public.list_wallet_transactions('all',2,'2026-01-01T00:00:00.123456Z','ea000000-0000-4000-8000-000000000009')->'items'->0->>'id','ea000000-0000-4000-8000-000000000008','next page has no repeated boundary row');
select is(public.list_wallet_transactions('all',20,'2026-01-01T00:00:00.123456Z','ea000000-0000-4000-8000-000000000001')->'items'->0->>'id','ea000000-0000-4000-8000-000000000012','microsecond precision retains older row with larger UUID');
select is(jsonb_array_length(public.list_wallet_transactions('all',20,null,null,'ea000000-0000-4000-8000-000000000011')->'items'),0,'another account transaction cannot be targeted');
select is(jsonb_array_length(public.list_wallet_transactions('all',20,null,null,'ea000000-0000-4000-8000-000000000007')->'items'),0,'student cannot inspect guardian reservation raw row');
select is(public.list_wallet_transactions('all',20,null,null,'ea000000-0000-4000-8000-000000000002')->'items'->0->>'resolutionKind','self_deposit_earned','original reservation links its posted result');
select is(public.list_wallet_transactions('all',20,null,null,'ea000000-0000-4000-8000-000000000006')->'items'->0->>'resolutionKind','guardian_deposit_reserved','own reward request exposes approval aggregate');
select is(public.list_wallet_transactions('all',20,null,null,'ea000000-0000-4000-8000-000000000006')->'items'->0->>'resolutionTransactionId',null::text,'private guardian reservation reference is hidden');
select is(public.list_wallet_transactions('all',20,null,null,'ea000000-0000-4000-8000-000000000008')->'items'->0->>'fromBucket',null::text,'other party bucket is hidden');
select is(public.list_wallet_transactions('all',20,null,null,'ea000000-0000-4000-8000-000000000008')->'items'->0->>'toBucket','earned','own incoming bucket is shown');
select is(public.list_wallet_transactions('all',20,null,null,'ea000000-0000-4000-8000-000000000010')->'items'->0->>'reasonCode','REJECT_CARD_COMPANY','safe provider reason is projected');
select is(public.list_wallet_transactions('all',20,null,null,'ea000000-0000-4000-8000-000000000012')->'items'->0->>'reasonCode','student-withdrawn','safe cancellation reason is projected');
select ok(public.list_wallet_transactions()::text !~ 'secret|private.invalid|fromUserId|toUserId|paymentKey|metadata','raw payloads, keys and party IDs are not projected');
select is(public.list_wallet_transactions('all',50)->>'hasMore','false','last page reports no more rows');
select is(public.list_wallet_transactions('all',50)->>'nextCursor',null::text,'last page has no cursor');
select throws_ok($$select public.list_wallet_transactions('invalid')$$,'P0001','invalid wallet category','reject invalid category');
select throws_ok($$select public.list_wallet_transactions('all',51)$$,'P0001','invalid wallet page size','bound page size');
select throws_ok($$select public.list_wallet_transactions('all',20,now(),null)$$,'P0001','invalid wallet cursor','cursor fields must be paired');
select throws_ok($$select public.list_wallet_transactions('all',20,now(),'ea000000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001')$$,'P0001','invalid wallet cursor','target lookup cannot paginate');
reset role;
select is(public.get_wallet_balances('e1111111-1111-4111-8111-111111111111'),(select balances from history_baseline),'projection does not mutate wallet balances');
select is((public.get_wallet_balances('e1111111-1111-4111-8111-111111111111')->>'topupAvailable')::bigint,8000::bigint,'pending order never becomes available balance');
select is((public.get_wallet_balances('e1111111-1111-4111-8111-111111111111')->>'earnedAvailable')::bigint,2200::bigint,'posted focus and guardian settlement account for earned balance');
select is((public.get_wallet_balances('e1111111-1111-4111-8111-111111111111')->>'reservedAvailable')::bigint,0::bigint,'settled focus reservation is no longer available');
select is((public.get_wallet_balances('e1111111-1111-4111-8111-111111111111')->>'cashoutReserved')::bigint,0::bigint,'rejected cashout returns its reserved balance');
select is((public.get_wallet_balances('e1111111-1111-4111-8111-111111111111')->>'cashoutCompleted')::bigint,0::bigint,'rejected cashout is not completed payout');
select is((public.get_wallet_balances('e1111111-1111-4111-8111-111111111111')->>'guardianRewardCompleted')::bigint,0::bigint,'student incoming reward is not guardian outgoing total');
select is((public.get_wallet_balances('e2222222-2222-4222-8222-222222222222')->>'topupAvailable')::bigint,9800::bigint,'guardian available topup reflects reserved reward');
select is((public.get_wallet_balances('e2222222-2222-4222-8222-222222222222')->>'reservedAvailable')::bigint,0::bigint,'released guardian reward leaves no reservation');
select is((public.get_wallet_balances('e2222222-2222-4222-8222-222222222222')->>'guardianRewardCompleted')::bigint,200::bigint,'guardian reward total agrees with posted payment');
set local request.jwt.claim.sub='e3333333-3333-4333-8333-333333333333';
set local role authenticated;
select is(jsonb_array_length(public.list_wallet_transactions()->'items'),1,'unrelated account sees only its own row');
reset role;
set local request.jwt.claim.sub='e2222222-2222-4222-8222-222222222222';
set local role authenticated;
select is(jsonb_array_length(public.list_wallet_transactions('all',50)->'items'),5,'guardian sees only own topup and financial participation');
select is(jsonb_array_length(public.list_wallet_transactions('all',20,null,null,'ea000000-0000-4000-8000-000000000002')->'items'),0,'guardian cannot inspect student self deposit');
reset role;
set local request.jwt.claim.sub='';
set local role authenticated;
select throws_ok($$select public.list_wallet_transactions()$$,'P0001','authentication required','missing JWT identity denied inside function');
reset role;
select * from finish();
rollback;
