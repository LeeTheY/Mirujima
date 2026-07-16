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

select ok(not has_function_privilege('anon', 'public.activate_deferred_membership(uuid)', 'EXECUTE'), 'anon cannot activate membership');
select ok(not has_function_privilege('authenticated', 'public.activate_deferred_membership(uuid)', 'EXECUTE'), 'authenticated clients cannot call the privileged activation RPC directly');
select ok(has_function_privilege('service_role', 'public.activate_deferred_membership(uuid)', 'EXECUTE'), 'only the server role can call activation RPC');
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename in ('profiles', 'memberships', 'membership_entitlements', 'devices')),
  8,
  'all Gate A ownership policies exist'
);

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'other@example.com');
do $$ begin perform public.activate_deferred_membership('11111111-1111-4111-8111-111111111111'); end $$;
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
