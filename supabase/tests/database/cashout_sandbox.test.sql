begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(19);

select has_table('public', 'wallet_transactions', 'wallet ledger exists');
select is((select relrowsecurity from pg_class where oid = 'public.wallet_transactions'::regclass), true, 'wallet ledger uses RLS');
select ok(not has_table_privilege('authenticated', 'public.wallet_transactions', 'INSERT'), 'clients cannot insert ledger rows');
select ok(not has_table_privilege('authenticated', 'public.wallet_transactions', 'UPDATE'), 'clients cannot update ledger rows');
select ok(not has_table_privilege('authenticated', 'public.wallet_transactions', 'DELETE'), 'clients cannot delete ledger rows');
select has_function('public', 'get_wallet_balances', array['uuid'], 'wallet balance RPC exists');
select has_function('public', 'request_test_cashout', array['uuid', 'bigint', 'text'], 'cashout request RPC exists');
select has_function('public', 'complete_test_cashout', array['uuid', 'uuid', 'text'], 'cashout completion RPC exists');
select has_function('public', 'reject_test_cashout', array['uuid', 'uuid', 'text'], 'cashout rejection RPC exists');
select ok(not has_function_privilege('authenticated', 'public.complete_test_cashout(uuid,uuid,text)', 'EXECUTE'), 'clients cannot settle cashouts');

insert into auth.users (id, email) values
  ('91111111-1111-4111-8111-111111111111', 'wallet-owner@example.com'),
  ('92222222-2222-4222-8222-222222222222', 'wallet-other@example.com');

insert into public.wallet_transactions (kind, status, from_user_id, to_user_id, from_bucket, to_bucket, points, krw_amount, idempotency_key)
values
  ('topup_confirmed', 'posted', null, '91111111-1111-4111-8111-111111111111', 'external', 'topup', 10000, 10000, 'fixture-topup-0001'),
  ('self_deposit_reserved', 'posted', '91111111-1111-4111-8111-111111111111', '91111111-1111-4111-8111-111111111111', 'topup', 'reserved', 10000, null, 'fixture-reserve-0001'),
  ('self_deposit_earned', 'posted', '91111111-1111-4111-8111-111111111111', '91111111-1111-4111-8111-111111111111', 'reserved', 'earned', 10000, null, 'fixture-earned-0001');

select is((public.get_wallet_balances('91111111-1111-4111-8111-111111111111')->>'earnedAvailable')::bigint, 10000::bigint, 'earned balance comes from posted ledger rows');
select throws_ok(
  $$ select public.request_test_cashout('91111111-1111-4111-8111-111111111111', 10001, 'cashout-overdraw-0001') $$,
  'P0001', 'insufficient earned points', 'cashout cannot exceed earned balance'
);
select is(
  (public.request_test_cashout('91111111-1111-4111-8111-111111111111', 3000, 'cashout-request-0001')->>'points')::bigint,
  3000::bigint,
  'earned points can be reserved for cashout'
);
select is((public.get_wallet_balances('91111111-1111-4111-8111-111111111111')->>'earnedAvailable')::bigint, 7000::bigint, 'request reduces available earned points');
select is((public.get_wallet_balances('91111111-1111-4111-8111-111111111111')->>'cashoutReserved')::bigint, 3000::bigint, 'request increases cashout reserve');
select is(
  public.complete_test_cashout(
    '91111111-1111-4111-8111-111111111111',
    (select id from public.wallet_transactions where idempotency_key = 'cashout-request-0001'),
    'cashout-complete-0001'
  )->>'status',
  'completed',
  'test cashout can complete once'
);
select is((public.get_wallet_balances('91111111-1111-4111-8111-111111111111')->>'cashoutCompleted')::bigint, 3000::bigint, 'completed cashout is aggregated');
select is(
  public.complete_test_cashout(
    '91111111-1111-4111-8111-111111111111',
    (select id from public.wallet_transactions where idempotency_key = 'cashout-request-0001'),
    'cashout-complete-0001'
  )->>'status',
  'completed',
  'duplicate completion is idempotent'
);

set local role authenticated;
set local request.jwt.claim.sub = '92222222-2222-4222-8222-222222222222';
select is((select count(*) from public.wallet_transactions), 0::bigint, 'another user cannot read wallet rows');
reset role;

select * from finish();
rollback;
