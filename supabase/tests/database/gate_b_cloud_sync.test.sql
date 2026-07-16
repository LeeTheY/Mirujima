begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(17);

select has_table('public', 'cloud_schedules', 'cloud schedules table exists');
select has_table('public', 'cloud_settings', 'cloud settings table exists');
select has_table('public', 'cloud_focus_sessions', 'cloud focus sessions table exists');
select has_table('public', 'cloud_reports', 'cloud reports table exists');
select has_table('public', 'cloud_learning_days', 'cloud learning days table exists');
select has_table('public', 'sync_mutations', 'sync mutation table exists');

select is((select relrowsecurity from pg_class where oid = 'public.cloud_schedules'::regclass), true, 'schedule RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.cloud_settings'::regclass), true, 'settings RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.cloud_focus_sessions'::regclass), true, 'session RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.cloud_reports'::regclass), true, 'report RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.cloud_learning_days'::regclass), true, 'learning RLS enabled');
select is((select relrowsecurity from pg_class where oid = 'public.sync_mutations'::regclass), true, 'mutation RLS enabled');
select ok(not has_function_privilege('anon', 'public.apply_cloud_mutation(uuid,text,text,text,bigint,jsonb,text)', 'EXECUTE'), 'anon cannot mutate cloud data');

insert into auth.users (id, email) values
  ('33333333-3333-4333-8333-333333333333', 'sync-owner@example.com'),
  ('44444444-4444-4444-8444-444444444444', 'sync-other@example.com');
do $$ begin perform public.activate_deferred_membership('33333333-3333-4333-8333-333333333333'); end $$;

set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
select is(
  (public.apply_cloud_mutation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'schedule', 'schedule-1', 'upsert', 0, '{"id":"schedule-1"}'::jsonb, 'device-1')->'record'->>'version')::integer,
  1,
  'first mutation creates version one'
);
select is(
  (public.apply_cloud_mutation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'schedule', 'schedule-1', 'upsert', 0, '{"id":"schedule-1"}'::jsonb, 'device-1')->'record'->>'version')::integer,
  1,
  'same mutation id is idempotent'
);
select is(
  public.apply_cloud_mutation('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'schedule', 'schedule-1', 'upsert', 0, '{"id":"schedule-1"}'::jsonb, 'device-2')->>'status',
  'conflict',
  'stale expected version produces a conflict'
);

set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
select is((select count(*) from public.cloud_schedules), 0::bigint, 'another user cannot read cloud schedules');
reset role;

select * from finish();
rollback;
