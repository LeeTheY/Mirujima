begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(20);

select has_table('public','notifications','notifications table exists');
select has_function('public','create_notification',array['uuid','uuid','text','text','text','jsonb','text'],'internal notification helper exists');
select has_function('public','list_notifications',array['integer','timestamp with time zone','uuid'],'recipient list RPC exists');
select has_function('public','get_notification_unread_count',array[]::text[],'unread count RPC exists');
select has_function('public','mark_notification_read',array['uuid'],'single read RPC exists');
select has_function('public','mark_all_notifications_read',array[]::text[],'mark-all RPC exists');
select ok(not has_table_privilege('authenticated','public.notifications','INSERT'),'authenticated cannot insert notifications');
select ok(not has_table_privilege('authenticated','public.notifications','UPDATE'),'authenticated cannot update notifications directly');
select ok(not has_table_privilege('authenticated','public.notifications','DELETE'),'authenticated cannot delete notifications');
select ok(not has_function_privilege('anon','public.list_notifications(integer,timestamptz,uuid)','EXECUTE'),'anonymous cannot list notifications');
select ok(has_function_privilege('authenticated','public.list_notifications(integer,timestamptz,uuid)','EXECUTE'),'authenticated can execute recipient list RPC');

insert into auth.users(id,email) values
  ('a1111111-1111-4111-8111-111111111111','notification-a@example.com'),
  ('a2222222-2222-4222-8222-222222222222','notification-b@example.com');

select public.create_notification(
  'a1111111-1111-4111-8111-111111111111',null,'focus_completed','집중 완료','기록이 반영되었습니다.',
  '{"sessionId":"session-1","route":"/history"}'::jsonb,'test:focus:1'
);
select public.create_notification(
  'a1111111-1111-4111-8111-111111111111',null,'focus_completed','집중 완료','기록이 반영되었습니다.',
  '{"sessionId":"session-1","route":"/history"}'::jsonb,'test:focus:1'
);
select is((select count(*) from public.notifications where dedupe_key='test:focus:1'),1::bigint,'dedupe key creates one event');

set local request.jwt.claim.sub='a1111111-1111-4111-8111-111111111111';
set local role authenticated;
select is(jsonb_array_length(public.list_notifications(20,null,null)->'items'),1,'recipient lists own notification');
select is(public.get_notification_unread_count(),1::bigint,'recipient sees unread count');
select ok(public.mark_notification_read((select id from public.notifications where dedupe_key='test:focus:1')),'recipient marks own notification read');
select is(public.get_notification_unread_count(),0::bigint,'read count is updated');

set local request.jwt.claim.sub='a2222222-2222-4222-8222-222222222222';
select is(jsonb_array_length(public.list_notifications(20,null,null)->'items'),0,'another user cannot list notification');
select ok(not public.mark_notification_read((select id from public.notifications where dedupe_key='test:focus:1')),'another user cannot mark notification read');
reset role;

select throws_ok(
  $$select public.create_notification('a1111111-1111-4111-8111-111111111111',null,'focus_completed','제목','본문','{"rawUrl":"https://private.example"}'::jsonb,'bad-data')$$,
  'P0001','unsupported notification data key','raw URL payload keys are rejected'
);

update public.profiles set role='student' where id='a1111111-1111-4111-8111-111111111111';
update public.profiles set role='guardian' where id='a2222222-2222-4222-8222-222222222222';
insert into public.family_links(student_user_id,guardian_user_id,issuer_user_id,issuer_role,status,linked_at)
values('a1111111-1111-4111-8111-111111111111','a2222222-2222-4222-8222-222222222222','a2222222-2222-4222-8222-222222222222','guardian','active',now());
select is((select count(*) from public.notifications where kind='family_linked'),2::bigint,'family transition notifies both parties');

select * from finish();
rollback;
