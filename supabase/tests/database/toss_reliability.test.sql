begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(22);

select has_function('public','reserve_latest_topup_refund',array['uuid','text','bigint'],'amount-bound refund reservation RPC exists');
select has_function('public','get_topup_refund_limits',array['uuid'],'refund limit summary RPC exists');
select ok(not has_function_privilege('authenticated','public.reserve_latest_topup_refund(uuid,text,bigint)','EXECUTE'),'clients cannot reserve refunds directly');
select ok(not has_function_privilege('anon','public.complete_topup_refund(uuid,uuid,jsonb)','EXECUTE'),'anonymous cannot complete refunds');

insert into auth.users(id,email) values
  ('c1111111-1111-4111-8111-111111111111','toss-guardian@example.com');
update public.profiles set role='guardian' where id='c1111111-1111-4111-8111-111111111111';

insert into public.wallet_transactions(
  kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,krw_amount,
  provider,provider_order_id,provider_payment_key,idempotency_key,metadata
) values (
  'topup_confirmed','posted',null,'c1111111-1111-4111-8111-111111111111','external','topup',10000,10000,
  'toss','reliability-original-order','reliability-original-payment','reliability-original-confirmation','{}'
);

select is((public.get_wallet_balances('c1111111-1111-4111-8111-111111111111')->>'topupAvailable')::bigint,10000::bigint,'confirmed topup starts available');
select is((public.get_topup_refund_limits('c1111111-1111-4111-8111-111111111111')->>'maxRefundableTopup')::bigint,10000::bigint,'refund summary caps selection to one original payment');
select is((public.reserve_latest_topup_refund('c1111111-1111-4111-8111-111111111111','refund-partial-0001',3000)->>'points')::bigint,3000::bigint,'partial refund reserves requested amount only');
select is((public.get_wallet_balances('c1111111-1111-4111-8111-111111111111')->>'topupAvailable')::bigint,7000::bigint,'reservation immediately reduces available topup');
select throws_ok(
  $$select public.reserve_latest_topup_refund('c1111111-1111-4111-8111-111111111111','refund-partial-0001',4000)$$,
  'P0001','idempotency key mismatch','idempotency key cannot change its amount'
);
select throws_ok(
  $$select public.complete_topup_refund(
    'c1111111-1111-4111-8111-111111111111',
    (select id from public.wallet_transactions where idempotency_key='refund-partial-0001'),
    '{"status":"CANCELED","paymentKey":"reliability-original-payment","cancelAmount":4000}'::jsonb
  )$$,
  'P0001','provider refund incomplete','provider amount must match the reserved amount'
);
select is((public.complete_topup_refund(
  'c1111111-1111-4111-8111-111111111111',
  (select id from public.wallet_transactions where idempotency_key='refund-partial-0001'),
  '{"status":"CANCELED","paymentKey":"reliability-original-payment","cancelAmount":3000,"sandbox":true,"actualRefund":false}'::jsonb
)->>'status'),'refunded','matching provider cancellation completes the refund');
select is((public.reserve_latest_topup_refund('c1111111-1111-4111-8111-111111111111','refund-partial-0001',3000)->>'status'),'refunded','duplicate callback reuses terminal refund result');
select is((select count(*) from public.wallet_transactions where kind='topup_refunded' and from_user_id='c1111111-1111-4111-8111-111111111111'),1::bigint,'duplicate completion posts one settlement');
select throws_ok(
  $$select public.reserve_latest_topup_refund('c1111111-1111-4111-8111-111111111111','refund-too-large-0001',8000)$$,
  'P0001','refund exceeds available topup','refund cannot exceed current available balance'
);

select is((public.reserve_latest_topup_refund('c1111111-1111-4111-8111-111111111111','refund-reject-0001',7000)->>'status'),'reserved','remaining original payment can be reserved');
select is((public.reject_topup_refund(
  'c1111111-1111-4111-8111-111111111111',
  (select id from public.wallet_transactions where idempotency_key='refund-reject-0001')
)->>'status'),'rejected','failed provider cancellation releases the reservation');
select is((public.get_wallet_balances('c1111111-1111-4111-8111-111111111111')->>'topupAvailable')::bigint,7000::bigint,'rejected refund restores topup availability');

select is((public.create_topup_payment_order('c1111111-1111-4111-8111-111111111111',10000,'reliability-order-0001')->>'amount')::bigint,10000::bigint,'first provider order uses stored amount');
select is((public.create_topup_payment_order('c1111111-1111-4111-8111-111111111111',30000,'reliability-order-0002')->>'amount')::bigint,30000::bigint,'second provider order uses its stored amount');
select throws_ok(
  $$select public.claim_topup_payment(
    'c1111111-1111-4111-8111-111111111111',
    (select provider_order_id from public.wallet_transactions where idempotency_key='reliability-order-0001'),
    'reliability-shared-payment',30000
  )$$,
  'P0001','topup amount mismatch','callback amount cannot override stored order amount'
);
select is((public.claim_topup_payment(
  'c1111111-1111-4111-8111-111111111111',
  (select provider_order_id from public.wallet_transactions where idempotency_key='reliability-order-0001'),
  'reliability-shared-payment',10000
)->>'status'),'confirming','matching callback claims the first order');
select throws_ok(
  $$select public.claim_topup_payment(
    'c1111111-1111-4111-8111-111111111111',
    (select provider_order_id from public.wallet_transactions where idempotency_key='reliability-order-0002'),
    'reliability-shared-payment',30000
  )$$,
  'P0001','payment key already claimed','one payment key cannot claim two topup orders'
);

select * from finish();
rollback;
