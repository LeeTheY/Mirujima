begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(15);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'memberships', 'memberships table exists');
select has_table('public', 'membership_entitlements', 'entitlements table exists');
select has_table('public', 'devices', 'devices table exists');

select is((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), true, 'profiles RLS is enabled');
select is((select relrowsecurity from pg_class where oid = 'public.memberships'::regclass), true, 'memberships RLS is enabled');
select is((select relrowsecurity from pg_class where oid = 'public.membership_entitlements'::regclass), true, 'entitlements RLS is enabled');
select is((select relrowsecurity from pg_class where oid = 'public.devices'::regclass), true, 'devices RLS is enabled');

select ok(not has_function('public', 'activate_deferred_membership', array['uuid']), 'deferred activation is removed');
select ok(not has_function_privilege('authenticated', 'public.create_membership_payment_order(uuid,text)', 'EXECUTE'), 'clients cannot create privileged payment orders');
select ok(has_function_privilege('service_role', 'public.create_membership_payment_order(uuid,text)', 'EXECUTE'), 'only the server role can create payment orders');
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename in ('profiles', 'memberships', 'membership_entitlements', 'devices')),
  8,
  'all Gate A ownership policies exist'
);

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'other@example.com');
update public.profiles set role='guardian', onboarding_completed=true where id='11111111-1111-4111-8111-111111111111';
do $$
declare order_id text;
begin
  order_id := public.create_membership_payment_order('11111111-1111-4111-8111-111111111111', 'gate-a-payment-0001')->>'orderId';
  perform public.claim_membership_payment('11111111-1111-4111-8111-111111111111', order_id, 'gate_a_payment_key', 12900);
  perform public.confirm_toss_membership_payment('11111111-1111-4111-8111-111111111111', order_id, 'gate_a_payment_key', '{"status":"DONE"}'::jsonb);
end $$;
insert into public.devices (user_id, client_generated_device_id, device_name, extension_version)
values ('11111111-1111-4111-8111-111111111111', 'owner-device', 'test', '0.1.0');

set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select is((select count(*) from public.memberships), 0::bigint, 'another user cannot read membership');
select is((select count(*) from public.membership_entitlements), 0::bigint, 'another user cannot read entitlements');
select is((select count(*) from public.devices), 0::bigint, 'another user cannot read devices');
reset role;

select * from finish();
rollback;
