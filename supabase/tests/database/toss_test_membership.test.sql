begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(23);

select has_table('public', 'membership_payment_orders', 'membership payment orders exist');
select is((select relrowsecurity from pg_class where oid = 'public.membership_payment_orders'::regclass), true, 'membership orders use RLS');
select has_column('public', 'memberships', 'current_period_started_at', 'membership stores period start');
select has_column('public', 'memberships', 'current_period_ends_at', 'membership stores period end');
select has_function('public', 'create_membership_payment_order', array['uuid', 'text'], 'server order RPC exists');
select has_function('public', 'claim_membership_payment', array['uuid', 'text', 'text', 'bigint'], 'server claim RPC exists');
select has_function('public', 'confirm_toss_membership_payment', array['uuid', 'text', 'text', 'jsonb'], 'server confirmation RPC exists');
select has_function('public', 'fail_membership_payment', array['uuid', 'text', 'text'], 'server failure RPC exists');
select ok(not has_function('public', 'activate_deferred_membership', array['uuid']), 'deferred activation RPC is removed');
select ok(not has_table_privilege('authenticated', 'public.membership_payment_orders', 'INSERT'), 'clients cannot create payment orders');
select ok(not has_table_privilege('authenticated', 'public.membership_payment_orders', 'UPDATE'), 'clients cannot update payment orders');
select ok(not has_function_privilege('authenticated', 'public.confirm_toss_membership_payment(uuid,text,text,jsonb)', 'EXECUTE'), 'clients cannot confirm payments');

insert into auth.users (id, email) values
  ('81111111-1111-4111-8111-111111111111', 'payer@example.com'),
  ('82222222-2222-4222-8222-222222222222', 'other@example.com');

select is(
  public.create_membership_payment_order('81111111-1111-4111-8111-111111111111', 'membership-idem-0001')->>'amount',
  '12900',
  'server fixes the Premium amount'
);
select is(
  public.create_membership_payment_order('81111111-1111-4111-8111-111111111111', 'membership-idem-0001')->>'orderId',
  (select order_id from public.membership_payment_orders where idempotency_key = 'membership-idem-0001'),
  'order creation is idempotent'
);

select lives_ok(
  $$ select public.claim_membership_payment('81111111-1111-4111-8111-111111111111',
    (select order_id from public.membership_payment_orders where idempotency_key = 'membership-idem-0001'),
    'test_payment_key_0001', 12900) $$,
  'matching callback amount can claim the order'
);
select throws_ok(
  $$ select public.claim_membership_payment('81111111-1111-4111-8111-111111111111',
    (select order_id from public.membership_payment_orders where idempotency_key = 'membership-idem-0001'),
    'test_payment_key_0001', 1) $$,
  'P0001', 'payment amount mismatch', 'tampered callback amount is rejected'
);

select is(
  public.confirm_toss_membership_payment(
    '81111111-1111-4111-8111-111111111111',
    (select order_id from public.membership_payment_orders where idempotency_key = 'membership-idem-0001'),
    'test_payment_key_0001',
    '{"status":"DONE","method":"카드","approvedAt":"2026-08-09T00:00:00+09:00","transactionKey":"tx-1"}'::jsonb
  )->>'status',
  'active',
  'confirmed payment activates Premium'
);
select is((select billing_integration from public.memberships where user_id = '81111111-1111-4111-8111-111111111111'), 'toss', 'membership uses Toss');
select is((select activation_source from public.memberships where user_id = '81111111-1111-4111-8111-111111111111'), 'toss_payment', 'membership records Toss activation');
select is((select count(*) from public.membership_entitlements where user_id = '81111111-1111-4111-8111-111111111111' and enabled), 6::bigint, 'all Premium entitlements are enabled');
select is(
  (select count(distinct valid_until) from public.membership_entitlements where user_id = '81111111-1111-4111-8111-111111111111'),
  1::bigint,
  'all entitlements share one expiry'
);
select is(
  public.confirm_toss_membership_payment(
    '81111111-1111-4111-8111-111111111111',
    (select order_id from public.membership_payment_orders where idempotency_key = 'membership-idem-0001'),
    'test_payment_key_0001',
    '{"status":"DONE","method":"카드","approvedAt":"2026-08-09T00:00:00+09:00","transactionKey":"tx-1"}'::jsonb
  )->>'currentPeriodEndsAt',
  (select current_period_ends_at::text from public.memberships where user_id = '81111111-1111-4111-8111-111111111111'),
  'duplicate confirmation does not extend twice'
);

set local role authenticated;
set local request.jwt.claim.sub = '82222222-2222-4222-8222-222222222222';
select is((select count(*) from public.membership_payment_orders), 0::bigint, 'another user cannot read payment orders');
reset role;

select * from finish();
rollback;
