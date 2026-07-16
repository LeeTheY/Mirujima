begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(6);

select has_table('public', 'ai_rate_limits', 'AI rate limit table exists');
select is((select relrowsecurity from pg_class where oid = 'public.ai_rate_limits'::regclass), true, 'AI rate limit RLS enabled');
select ok(not has_table_privilege('authenticated', 'public.ai_rate_limits', 'SELECT'), 'authenticated cannot read AI rate counters');
select ok(not has_function_privilege('anon', 'public.consume_ai_writing_rate_limit()', 'EXECUTE'), 'anon cannot consume AI quota');

insert into auth.users (id, email) values ('55555555-5555-4555-8555-555555555555', 'ai-user@example.com');
set local role authenticated;
set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
select ok(public.consume_ai_writing_rate_limit(), 'first authenticated AI request is allowed');
do $$ begin for i in 1..11 loop perform public.consume_ai_writing_rate_limit(); end loop; end $$;
select ok(not public.consume_ai_writing_rate_limit(), 'thirteenth request in one minute is rejected');
reset role;

select * from finish();
rollback;
