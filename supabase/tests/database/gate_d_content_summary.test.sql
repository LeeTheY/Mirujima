begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

select col_is_pk('public', 'ai_rate_limits', array['user_id', 'task'], 'AI task quota has a composite primary key');
select has_function('public', 'consume_ai_task_rate_limit', array['text'], 'task-specific AI limiter exists');
select ok(not has_function_privilege('anon', 'public.consume_ai_task_rate_limit(text)', 'EXECUTE'), 'anon cannot consume task quota');
select is((select count(*) from public.memberships membership left join public.membership_entitlements entitlement
  on entitlement.user_id = membership.user_id and entitlement.feature_key = 'content-summary' and entitlement.enabled = true
  where membership.plan = 'premium' and membership.status = 'active' and entitlement.user_id is null), 0::bigint, 'existing active Premium users are backfilled');

insert into auth.users (id, email) values ('66666666-6666-4666-8666-666666666666', 'gate-d@example.com');
do $$
declare order_id text;
begin
  order_id := public.create_membership_payment_order('66666666-6666-4666-8666-666666666666', 'gate-d-payment-0001')->>'orderId';
  perform public.claim_membership_payment('66666666-6666-4666-8666-666666666666', order_id, 'gate_d_payment_key', 12900);
  perform public.confirm_toss_membership_payment('66666666-6666-4666-8666-666666666666', order_id, 'gate_d_payment_key', '{"status":"DONE"}'::jsonb);
end $$;
select is((select count(*) from public.membership_entitlements where user_id = '66666666-6666-4666-8666-666666666666'), 6::bigint, 'activation grants all six entitlements');
select ok((select enabled from public.membership_entitlements where user_id = '66666666-6666-4666-8666-666666666666' and feature_key = 'content-summary'), 'content summary entitlement is enabled');

set local role authenticated;
set local request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
select ok(public.consume_ai_task_rate_limit('content-summary'), 'first summary request is allowed');
do $$ begin for i in 1..5 loop perform public.consume_ai_task_rate_limit('content-summary'); end loop; end $$;
select ok(not public.consume_ai_task_rate_limit('content-summary'), 'seventh summary request in one minute is rejected');
select ok(public.consume_ai_task_rate_limit('study-organize'), 'study organize has a separate task quota');
reset role;

select * from finish();
rollback;
