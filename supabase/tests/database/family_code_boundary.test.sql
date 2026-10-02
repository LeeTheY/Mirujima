begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(27);
insert into auth.users(id,email) values
('d1111111-1111-4111-8111-111111111111','code-guardian@example.com'),
('d2222222-2222-4222-8222-222222222222','code-student@example.com'),
('d3333333-3333-4333-8333-333333333333','code-other@example.com'),
('d4444444-4444-4444-8444-444444444444','code-other-guardian@example.com');
update public.profiles set role='guardian' where id in ('d1111111-1111-4111-8111-111111111111','d4444444-4444-4444-8444-444444444444');
update public.profiles set role='student' where id in ('d2222222-2222-4222-8222-222222222222','d3333333-3333-4333-8333-333333333333');
select ok(not has_function_privilege('anon','public.issue_family_link_code(uuid,text)','EXECUTE'),'anonymous cannot issue');
select ok(not has_function_privilege('authenticated','public.redeem_family_link_code(uuid,text)','EXECUTE'),'client cannot bypass Edge role authentication');
select ok(not has_function_privilege('authenticated','public.cancel_family_link_code(uuid)','EXECUTE'),'client cannot cancel another issuer');
select is(public.issue_family_link_code('d1111111-1111-4111-8111-111111111111',repeat('a',64))->>'status','pending','guardian code issued');
select is((select extract(epoch from code_expires_at-created_at)::integer from family_links where code_hash=repeat('a',64)),300,'exact five-minute lifetime at issuance');
select ok((select code_hash ~ '^[0-9a-f]{64}$' from family_links where code_hash=repeat('a',64)),'only hash stored');
select public.issue_family_link_code('d1111111-1111-4111-8111-111111111111',repeat('b',64));
select is((select count(*) from family_links where issuer_user_id='d1111111-1111-4111-8111-111111111111' and status='pending'),1::bigint,'reissue leaves one pending code');
select ok(exists(select 1 from family_links where issuer_user_id='d1111111-1111-4111-8111-111111111111' and status='revoked' and code_hash is null),'reissue removes old hash');
select is(public.redeem_family_link_code('d2222222-2222-4222-8222-222222222222',repeat('a',64))->>'status','invalid','old code cannot redeem');
select is((public.cancel_family_link_code('d1111111-1111-4111-8111-111111111111')->>'cancelledCount')::integer,1,'cancel revokes pending code');
select is((public.cancel_family_link_code('d1111111-1111-4111-8111-111111111111')->>'cancelledCount')::integer,0,'cancel is idempotent');
select public.issue_family_link_code('d1111111-1111-4111-8111-111111111111',repeat('c',64));
select is(public.redeem_family_link_code('d2222222-2222-4222-8222-222222222222',repeat('c',64))->>'status','active','eligible student redeems once');
select is((select family_redeem_attempts from profiles where id='d2222222-2222-4222-8222-222222222222'),0,'successful redemption clears failed inputs');
select is(public.redeem_family_link_code('d3333333-3333-4333-8333-333333333333',repeat('c',64))->>'status','invalid','used code cannot link another student');
select is((select count(*) from family_links where status='active'),1::bigint,'single use creates one active link');
select public.issue_family_link_code('d1111111-1111-4111-8111-111111111111',repeat('d',64));
-- now() stays at transaction start. Actual wall time must determine expiry.
update family_links set code_expires_at=clock_timestamp()+interval '20 milliseconds' where code_hash=repeat('d',64);
select pg_sleep(0.03);
select is(public.redeem_family_link_code('d3333333-3333-4333-8333-333333333333',repeat('d',64))->>'status','invalid','expiry uses wall time even inside long transaction');
select ok(exists(select 1 from family_links where status='expired' and code_hash is null),'expired code hash removed');
select public.redeem_family_link_code('d3333333-3333-4333-8333-333333333333',repeat('f',64));
select public.redeem_family_link_code('d3333333-3333-4333-8333-333333333333',repeat('f',64));
select is(public.redeem_family_link_code('d3333333-3333-4333-8333-333333333333',repeat('f',64))->>'status','locked','fifth failed input locks student');
select is((select family_redeem_attempts from profiles where id='d3333333-3333-4333-8333-333333333333'),5,'failure counter capped at five');
select public.issue_family_link_code('d1111111-1111-4111-8111-111111111111',repeat('e',64));
select is(public.redeem_family_link_code('d3333333-3333-4333-8333-333333333333',repeat('e',64))->>'status','locked','valid code does not bypass input lock');
select is((select status from family_links where code_hash=repeat('e',64)),'pending','locked input does not consume valid code');
select throws_ok($$select public.issue_family_link_code('d1111111-1111-4111-8111-111111111111',repeat('f',64))$$,'P0001','family code issue rate limit exceeded','sixth issuance in ten minutes is rejected');
update profiles set family_redeem_locked_until=clock_timestamp()-interval '1 second',family_redeem_window_started_at=clock_timestamp()-interval '11 minutes' where id='d3333333-3333-4333-8333-333333333333';
select is(public.redeem_family_link_code('d3333333-3333-4333-8333-333333333333',repeat('e',64))->>'status','active','redemption resumes after lock expires');
select is((select family_redeem_locked_until from profiles where id='d3333333-3333-4333-8333-333333333333'),null::timestamptz,'success clears lock deadline');
select public.issue_family_link_code('d4444444-4444-4444-8444-444444444444',repeat('f',64));
select throws_ok($$select public.redeem_family_link_code('d3333333-3333-4333-8333-333333333333',repeat('f',64))$$,'P0001','student already has an active guardian','student cannot activate second guardian');
select is((select status from family_links where code_hash=repeat('f',64)),'pending','conflicting link does not consume code');
select is((select count(*) from family_links where student_user_id='d3333333-3333-4333-8333-333333333333' and status='active'),1::bigint,'active guardian constraint remains');
select * from finish();
rollback;
