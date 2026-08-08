begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(30);

select has_column('public', 'profiles', 'role', 'profiles has a role');
select has_column('public', 'profiles', 'onboarding_completed', 'profiles tracks onboarding');
select has_column('public', 'profiles', 'timezone', 'profiles has a timezone');
select has_column('public', 'profiles', 'locale', 'profiles has a locale');
select has_column('public', 'profiles', 'sharing_preferences', 'profiles has sharing preferences');
select has_table('public', 'family_links', 'family links table exists');
select is((select relrowsecurity from pg_class where oid = 'public.family_links'::regclass), true, 'family links RLS is enabled');
select has_function('public', 'set_profile_role', array['text', 'text', 'text'], 'role RPC exists');
select has_function('public', 'issue_family_link_code', array['uuid', 'text'], 'family issue RPC exists');
select has_function('public', 'redeem_family_link_code', array['uuid', 'text'], 'family redeem RPC exists');
select has_function('public', 'cancel_family_link_code', array['uuid'], 'family cancel RPC exists');
select has_function('public', 'upsert_focus_plan', array['text', 'jsonb', 'text'], 'focus plan RPC exists');
select has_function('public', 'start_focus_session', array['text', 'text'], 'focus start RPC exists');
select ok(not has_function_privilege('anon', 'public.set_profile_role(text,text,text)', 'EXECUTE'), 'anon cannot set a role');
select ok(not has_function_privilege('authenticated', 'public.issue_family_link_code(uuid,text)', 'EXECUTE'), 'clients cannot bypass the family code Edge Function');
select ok(not has_column_privilege('authenticated', 'public.family_links', 'code_hash', 'SELECT'), 'authenticated clients cannot read code hashes');

insert into auth.users (id, email) values
  ('71111111-1111-4111-8111-111111111111', 'student-one@example.com'),
  ('72222222-2222-4222-8222-222222222222', 'guardian@example.com'),
  ('73333333-3333-4333-8333-333333333333', 'student-two@example.com'),
  ('74444444-4444-4444-8444-444444444444', 'stranger@example.com');

set local role authenticated;
set local request.jwt.claim.sub = '71111111-1111-4111-8111-111111111111';
select is(public.set_profile_role('student', 'Asia/Seoul', 'ko-KR')->>'role', 'student', 'student role is stored by RPC');
reset role;
select is(public.issue_family_link_code('71111111-1111-4111-8111-111111111111', repeat('a', 64))->>'status', 'pending', 'server issues a pending student code');

set local request.jwt.claim.sub = '72222222-2222-4222-8222-222222222222';
set local role authenticated;
select is(public.set_profile_role('guardian', 'Asia/Seoul', 'ko-KR')->>'role', 'guardian', 'guardian role is stored by RPC');
reset role;
select is(public.redeem_family_link_code('72222222-2222-4222-8222-222222222222', repeat('a', 64))->>'status', 'active', 'server redeems a code for the opposite role once');

set local request.jwt.claim.sub = '73333333-3333-4333-8333-333333333333';
set local role authenticated;
do $$ begin
  perform public.set_profile_role('student', 'Asia/Seoul', 'ko-KR');
end $$;
reset role;
select public.issue_family_link_code('73333333-3333-4333-8333-333333333333', repeat('b', 64));

set local request.jwt.claim.sub = '72222222-2222-4222-8222-222222222222';
select is(public.redeem_family_link_code('72222222-2222-4222-8222-222222222222', repeat('b', 64))->>'status', 'active', 'one guardian can link multiple students');
set local role authenticated;
select is((select count(*) from public.family_links where status = 'active'), 2::bigint, 'guardian sees both active family links');

set local request.jwt.claim.sub = '74444444-4444-4444-8444-444444444444';
do $$ begin perform public.set_profile_role('student', 'Asia/Seoul', 'ko-KR'); end $$;
select is((select count(*) from public.family_links), 0::bigint, 'unrelated user cannot read family links');
reset role;
select is(public.redeem_family_link_code('74444444-4444-4444-8444-444444444444', repeat('c', 64))->>'status', 'invalid', 'first invalid code is rejected');
do $$ begin
  perform public.redeem_family_link_code('74444444-4444-4444-8444-444444444444', repeat('c', 64));
  perform public.redeem_family_link_code('74444444-4444-4444-8444-444444444444', repeat('c', 64));
  perform public.redeem_family_link_code('74444444-4444-4444-8444-444444444444', repeat('c', 64));
end $$;
select is(public.redeem_family_link_code('74444444-4444-4444-8444-444444444444', repeat('c', 64))->>'status', 'locked', 'fifth invalid input locks redemption');

set local request.jwt.claim.sub = '71111111-1111-4111-8111-111111111111';
set local role authenticated;
select is(
  public.upsert_focus_plan(
    'schedule-web-1',
    '{"title":"수학 문제 풀이","description":"오답 정리","dateKey":"2026-08-08","plannedStartAt":null,"targetFocusMinutes":25,"activityMode":"interactive","blockingMode":"blocklist","allowedDomains":[],"blockedDomains":[{"hostname":"youtube.com","includeSubdomains":true}],"breakMinutes":5,"priority":"high","selfDepositPoints":0,"guardianRewardRequestPoints":0,"status":"ready","createdAt":"2026-08-08T12:00:00.000Z","updatedAt":"2026-08-08T12:00:00.000Z"}'::jsonb,
    'web-test-device'
  )->>'status',
  'ready',
  'student stores a validated plan in cloud schedules'
);
select is(public.start_focus_session('schedule-web-1', 'web-test-device')->>'status', 'active', 'student starts a canonical focus session');
select is((select payload->>'ownerUserId' from public.cloud_schedules where entity_id = 'schedule-web-1'), '71111111-1111-4111-8111-111111111111', 'server fixes plan ownership to auth user');

set local request.jwt.claim.sub = '74444444-4444-4444-8444-444444444444';
select is((select count(*) from public.cloud_schedules where entity_id = 'schedule-web-1'), 0::bigint, 'another user cannot read a focus plan');
select is((select count(*) from public.cloud_focus_sessions), 0::bigint, 'another user cannot read canonical sessions');
reset role;

select * from finish();
rollback;
