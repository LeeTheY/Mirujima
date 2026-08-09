begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

select has_function('public','create_topup_payment_order',array['uuid','bigint','text'],'topup order RPC exists');
insert into auth.users(id,email) values('81111111-1111-4111-8111-111111111111','guardian-ui@example.com');
select is(
  (public.create_topup_payment_order('81111111-1111-4111-8111-111111111111',300000,'topup-order:300k')->>'amount')::bigint,
  300000::bigint,
  '300,000P is an approved sandbox topup'
);
select throws_ok(
  $$select public.create_topup_payment_order('81111111-1111-4111-8111-111111111111',200000,'topup-order:200k')$$,
  'P0001','unsupported topup amount','unapproved topup amounts remain rejected'
);

select has_function('public','get_guardian_linked_students',array[]::text[],'guardian linked-student RPC exists');
select ok(not has_function_privilege('anon','public.get_guardian_linked_students()','EXECUTE'),'anonymous users cannot list linked students');

insert into auth.users(id,email) values('82222222-2222-4222-8222-222222222222','student-ui@example.com');
update public.profiles set role='guardian',display_name='보호자 A' where id='81111111-1111-4111-8111-111111111111';
update public.profiles set role='student',display_name='학생 A' where id='82222222-2222-4222-8222-222222222222';
insert into public.family_links(student_user_id,guardian_user_id,issuer_user_id,issuer_role,status,linked_at)
values('82222222-2222-4222-8222-222222222222','81111111-1111-4111-8111-111111111111','81111111-1111-4111-8111-111111111111','guardian','active',now());
insert into public.family_links(guardian_user_id,issuer_user_id,issuer_role,status,code_hash,code_expires_at)
values('81111111-1111-4111-8111-111111111111','81111111-1111-4111-8111-111111111111','guardian','pending',repeat('d',64),now()+interval '5 minutes');

set local request.jwt.claim.sub='82222222-2222-4222-8222-222222222222';
set local role authenticated;
select throws_ok('select * from public.get_guardian_linked_students()','P0001','guardian role required','students cannot list guardian-linked students');
reset role;

set local request.jwt.claim.sub='81111111-1111-4111-8111-111111111111';
set local role authenticated;
select is((select count(*) from public.get_guardian_linked_students()),1::bigint,'guardian sees only active linked students');
select is((select display_name from public.get_guardian_linked_students()),'학생 A','guardian identifies a linked student by display name');
reset role;

select * from finish();
rollback;
