begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(10);

select has_function('public','consume_ai_task_rate_limit',array['text'],'per-task AI rate limiter exists');
select ok(not has_table_privilege('authenticated','public.ai_rate_limits','SELECT'),'AI counters remain private');
select ok(not has_function_privilege('anon','public.consume_ai_task_rate_limit(text)','EXECUTE'),'anonymous users cannot consume AI quota');

insert into auth.users(id,email) values
  ('d1111111-1111-4111-8111-111111111111','ai-student@example.com'),
  ('d2222222-2222-4222-8222-222222222222','ai-guardian@example.com');
update public.profiles set role='student' where id='d1111111-1111-4111-8111-111111111111';
update public.profiles set role='guardian' where id='d2222222-2222-4222-8222-222222222222';
insert into public.memberships(
  user_id,plan,billing_integration,activation_source,status,activated_at,current_period_started_at,current_period_ends_at,
  product_code,included_student_seats,extra_student_seats
) values (
  'd2222222-2222-4222-8222-222222222222','premium','toss','toss_payment','active',now(),now(),now()+interval '30 days',
  'guardian_family',2,0
);
-- Canonical payment activation creates entitlement rows. Inherited access must honor them.
insert into public.membership_entitlements(user_id,feature_key,enabled,source,valid_until) values ('d2222222-2222-4222-8222-222222222222','ai-weekly-report',true,'toss_payment',now()+interval '30 days');
insert into public.family_links(student_user_id,guardian_user_id,issuer_user_id,issuer_role,status,linked_at)
values(
  'd1111111-1111-4111-8111-111111111111','d2222222-2222-4222-8222-222222222222',
  'd2222222-2222-4222-8222-222222222222','guardian','active',now()
);

set local request.jwt.claim.sub='d1111111-1111-4111-8111-111111111111';
set local role authenticated;
select ok(public.has_effective_membership_entitlement('d1111111-1111-4111-8111-111111111111','ai-weekly-report'),'family student inherits weekly report entitlement');
select ok((public.get_effective_membership('d1111111-1111-4111-8111-111111111111')->'entitlements') ? 'ai-weekly-report','effective membership exposes inherited weekly report');
select ok((select bool_and(public.consume_ai_task_rate_limit('study-recommendation')) from generate_series(1,6)),'first six study recommendations are allowed');
select is(public.consume_ai_task_rate_limit('study-recommendation'),false,'seventh study recommendation is rate limited');
select is(public.consume_ai_task_rate_limit('weekly-report'),true,'weekly report has an independent quota');
select throws_ok(
  $$select public.consume_ai_task_rate_limit('raw-browsing-summary')$$,
  'P0001','unsupported AI task','unsupported AI tasks remain blocked'
);
reset role;

select is((select count(*) from public.ai_rate_limits where user_id='d1111111-1111-4111-8111-111111111111'),2::bigint,'only approved task counters were created');

select * from finish();
rollback;
