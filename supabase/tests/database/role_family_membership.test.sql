begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(20);

select has_column('public','memberships','product_code','membership product code exists');
select has_column('public','memberships','included_student_seats','included family seats exist');
select has_column('public','memberships','extra_student_seats','paid family seats exist');

insert into auth.users(id,email) values
  ('b1111111-1111-4111-8111-111111111111','student-premium@example.com'),
  ('b2222222-2222-4222-8222-222222222222','guardian-family@example.com'),
  ('b3333333-3333-4333-8333-333333333333','linked-one@example.com'),
  ('b4444444-4444-4444-8444-444444444444','linked-two@example.com'),
  ('b5555555-5555-4555-8555-555555555555','linked-three@example.com');
update public.profiles set role='guardian',onboarding_completed=true where id='b2222222-2222-4222-8222-222222222222';
update public.profiles set role='student',onboarding_completed=true where id<>'b2222222-2222-4222-8222-222222222222' and id::text like 'b%';

select is((public.create_membership_payment_order('b1111111-1111-4111-8111-111111111111','role-student-order-1')->>'amount')::bigint,9900::bigint,'student order costs 9,900 KRW');
do $$ declare order_id text; begin
  order_id:=public.create_membership_payment_order('b1111111-1111-4111-8111-111111111111','role-student-order-1')->>'orderId';
  perform public.claim_membership_payment('b1111111-1111-4111-8111-111111111111',order_id,'student_payment_key',9900);
  perform public.confirm_toss_membership_payment('b1111111-1111-4111-8111-111111111111',order_id,'student_payment_key','{"status":"DONE"}'::jsonb);
end $$;
select is((select product_code from public.memberships where user_id='b1111111-1111-4111-8111-111111111111'),'student_premium','student product is stored');
select ok(public.has_effective_membership_entitlement('b1111111-1111-4111-8111-111111111111','ai-focus-coach'),'student AI coach entitlement is active');

insert into public.family_links(student_user_id,guardian_user_id,issuer_user_id,issuer_role,status,linked_at)
values
  ('b3333333-3333-4333-8333-333333333333','b2222222-2222-4222-8222-222222222222','b2222222-2222-4222-8222-222222222222','guardian','active',now()),
  ('b4444444-4444-4444-8444-444444444444','b2222222-2222-4222-8222-222222222222','b2222222-2222-4222-8222-222222222222','guardian','active',now());
select is((public.create_membership_payment_order('b2222222-2222-4222-8222-222222222222','role-guardian-order-1')->>'amount')::bigint,12900::bigint,'guardian order includes two students for 12,900 KRW');
do $$ declare order_id text; begin
  order_id:=public.create_membership_payment_order('b2222222-2222-4222-8222-222222222222','role-guardian-order-1')->>'orderId';
  perform public.claim_membership_payment('b2222222-2222-4222-8222-222222222222',order_id,'guardian_payment_key',12900);
  perform public.confirm_toss_membership_payment('b2222222-2222-4222-8222-222222222222',order_id,'guardian_payment_key','{"status":"DONE"}'::jsonb);
end $$;
select is((select product_code from public.memberships where user_id='b2222222-2222-4222-8222-222222222222'),'guardian_family','guardian family product is stored');
select is((public.get_effective_membership('b2222222-2222-4222-8222-222222222222')->>'seatCapacity')::integer,2,'guardian receives two included seats');
select ok(public.has_effective_membership_entitlement('b3333333-3333-4333-8333-333333333333','ai-focus-coach'),'linked student inherits AI entitlement');
select throws_ok($$select public.issue_family_link_code('b2222222-2222-4222-8222-222222222222',repeat('a',64))$$,'P0001','family seat required','third code requires a paid seat');

select is((public.create_family_seat_payment_order('b2222222-2222-4222-8222-222222222222','role-seat-order-1')->>'amount')::bigint,3900::bigint,'full-period extra seat costs 3,900 KRW');
do $$ declare order_id text; begin
  order_id:=public.create_family_seat_payment_order('b2222222-2222-4222-8222-222222222222','role-seat-order-1')->>'orderId';
  perform public.claim_membership_payment('b2222222-2222-4222-8222-222222222222',order_id,'seat_payment_key',3900);
  perform public.confirm_toss_family_seat_payment('b2222222-2222-4222-8222-222222222222',order_id,'seat_payment_key','{"status":"DONE"}'::jsonb);
end $$;
select is((public.get_effective_membership('b2222222-2222-4222-8222-222222222222')->>'seatCapacity')::integer,3,'paid seat expands capacity to three');
select is(public.issue_family_link_code('b2222222-2222-4222-8222-222222222222',repeat('b',64))->>'status','pending','code is issued after seat approval');
select throws_ok($$select public.redeem_family_link_code('b1111111-1111-4111-8111-111111111111',repeat('b',64))$$,'P0001','student membership conflict','active student membership blocks family enrollment');
select is((select status from public.family_links where code_hash=repeat('b',64)),'pending','conflict does not consume the family code');
select is(public.redeem_family_link_code('b5555555-5555-4555-8555-555555555555',repeat('b',64))->>'status','active','eligible third student can redeem the preserved code');
select is((select count(*)::integer from public.family_links where guardian_user_id='b2222222-2222-4222-8222-222222222222' and status='active'),3,'three students are active after seat purchase');
select has_function('public','get_guardian_ai_summary_input',array[]::text[],'guardian consented aggregate RPC exists');
set local role authenticated;
set local request.jwt.claim.sub='b2222222-2222-4222-8222-222222222222';
select is(jsonb_array_length(public.get_guardian_ai_summary_input()),3,'guardian AI input contains only linked student aggregates');
reset role;

select * from finish();
rollback;
