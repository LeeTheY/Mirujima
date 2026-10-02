begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values
 ('a9111111-1111-4111-8111-111111111111','failed-order-student@example.com'),
 ('a9222222-2222-4222-8222-222222222222','failed-order-guardian@example.com'),
 ('a9333333-3333-4333-8333-333333333333','failed-order-linked-a@example.com'),
 ('a9444444-4444-4444-8444-444444444444','failed-order-linked-b@example.com');
update public.profiles set role='student' where id in ('a9111111-1111-4111-8111-111111111111','a9333333-3333-4333-8333-333333333333','a9444444-4444-4444-8444-444444444444');
update public.profiles set role='guardian' where id='a9222222-2222-4222-8222-222222222222';
select ok(not has_function_privilege('authenticated','public.claim_membership_payment(uuid,text,text,bigint)','EXECUTE'),'client cannot claim recovery');
select ok(not has_function_privilege('authenticated','public.confirm_toss_membership_payment(uuid,text,text,jsonb)','EXECUTE'),'client cannot fabricate membership receipt');
select ok(not has_function_privilege('anon','public.confirm_toss_family_seat_payment(uuid,text,text,jsonb)','EXECUTE'),'anonymous cannot fabricate seat receipt');
select public.create_membership_payment_order('a9111111-1111-4111-8111-111111111111','failed-order-student-fixture');
create temp table student_order as select order_id from public.membership_payment_orders where idempotency_key='failed-order-student-fixture';
select public.claim_membership_payment('a9111111-1111-4111-8111-111111111111',(select order_id from student_order),'failed_student_payment',9900);
update public.membership_payment_orders set status='failed',failure_code='ALREADY_PROCESSED_PAYMENT' where order_id=(select order_id from student_order);
select is(public.create_membership_payment_order('a9111111-1111-4111-8111-111111111111','failed-order-student-fixture')->>'status','needs_review','unknown failed bound order remains in recovery UI');
select is(public.claim_membership_payment('a9111111-1111-4111-8111-111111111111',(select order_id from student_order),'failed_student_payment',9900)->>'reconciliationOnly','true','unknown failed claim permits read-only provider lookup');
select is(public.claim_membership_payment('a9111111-1111-4111-8111-111111111111',(select order_id from student_order),'failed_student_payment',9900)->>'reconciliationRequired','true','unknown failure always requires provider lookup');
select is((select status from public.membership_payment_orders where order_id=(select order_id from student_order)),'failed','claim does not turn legacy failure into a fresh approval');
select throws_ok($$select public.claim_membership_payment('a9222222-2222-4222-8222-222222222222',(select order_id from student_order),'failed_student_payment',9900)$$,'P0001','payment order ownership mismatch','recovery cannot change owner');
select throws_ok($$select public.claim_membership_payment('a9111111-1111-4111-8111-111111111111',(select order_id from student_order),'foreign_payment',9900)$$,'P0001','payment key mismatch','recovery cannot rebind payment key');
select throws_ok($$select public.claim_membership_payment('a9111111-1111-4111-8111-111111111111',(select order_id from student_order),'failed_student_payment',12900)$$,'P0001','payment amount mismatch','recovery cannot change amount');
select throws_ok($$select public.confirm_toss_membership_payment('a9111111-1111-4111-8111-111111111111',(select order_id from student_order),'failed_student_payment','{}')$$,'P0001','provider payment is not done','missing DONE cannot recover failed membership');
select public.confirm_toss_membership_payment('a9111111-1111-4111-8111-111111111111',(select order_id from student_order),'failed_student_payment','{"status":"DONE"}');
create temp table recovered_period as select current_period_ends_at from public.memberships where user_id='a9111111-1111-4111-8111-111111111111';
select public.confirm_toss_membership_payment('a9111111-1111-4111-8111-111111111111',(select order_id from student_order),'failed_student_payment','{"status":"DONE"}');
select is((select current_period_ends_at from public.memberships where user_id='a9111111-1111-4111-8111-111111111111'),(select current_period_ends_at from recovered_period),'retry does not extend recovered period');
select is((select status from public.membership_payment_orders where order_id=(select order_id from student_order)),'confirmed','verified DONE settles legacy order once');
select ok(public.has_effective_membership_entitlement('a9111111-1111-4111-8111-111111111111','ai-focus-coach'),'recovered membership grants canonical entitlement');

select public.create_membership_payment_order('a9222222-2222-4222-8222-222222222222','failed-order-family-base');
create temp table guardian_order as select order_id from public.membership_payment_orders where idempotency_key='failed-order-family-base';
select public.claim_membership_payment('a9222222-2222-4222-8222-222222222222',(select order_id from guardian_order),'guardian_base_payment',12900);
select public.confirm_toss_membership_payment('a9222222-2222-4222-8222-222222222222',(select order_id from guardian_order),'guardian_base_payment','{"status":"DONE"}');
insert into public.family_links(student_user_id,guardian_user_id,issuer_user_id,issuer_role,status,linked_at) values
 ('a9333333-3333-4333-8333-333333333333','a9222222-2222-4222-8222-222222222222','a9222222-2222-4222-8222-222222222222','guardian','active',now()),
 ('a9444444-4444-4444-8444-444444444444','a9222222-2222-4222-8222-222222222222','a9222222-2222-4222-8222-222222222222','guardian','active',now());
select public.create_family_seat_payment_order('a9222222-2222-4222-8222-222222222222','failed-order-seat-fixture');
create temp table seat_order as select order_id,amount_krw from public.membership_payment_orders where idempotency_key='failed-order-seat-fixture';
select public.claim_membership_payment('a9222222-2222-4222-8222-222222222222',(select order_id from seat_order),'failed_seat_payment',(select amount_krw from seat_order));
update public.membership_payment_orders set status='failed',failure_code='TOSS_NETWORK_ERROR' where order_id=(select order_id from seat_order);
select is(public.claim_membership_payment('a9222222-2222-4222-8222-222222222222',(select order_id from seat_order),'failed_seat_payment',(select amount_krw from seat_order))->>'reconciliationOnly','true','failed family seat uses GET-only recovery');
select public.confirm_toss_family_seat_payment('a9222222-2222-4222-8222-222222222222',(select order_id from seat_order),'failed_seat_payment','{"status":"DONE"}');
select public.confirm_toss_family_seat_payment('a9222222-2222-4222-8222-222222222222',(select order_id from seat_order),'failed_seat_payment','{"status":"DONE"}');
select is((select extra_student_seats from public.memberships where user_id='a9222222-2222-4222-8222-222222222222'),1,'failed seat recovery increments capacity only once');

-- Separate legacy failed orders cover every known terminal code and the absence
-- of a bound key, without creating provider payments or granting access.
insert into public.membership_payment_orders(user_id,order_id,amount_krw,status,idempotency_key,order_kind,product_code,unit_count,payment_key,failure_code)
values('a9111111-1111-4111-8111-111111111111','terminal_order',9900,'failed','failed-order-terminal-fixture','membership','student_premium',0,'terminal_payment','TOSS_PAYMENT_ABORTED');
select throws_ok($$select public.claim_membership_payment('a9111111-1111-4111-8111-111111111111','terminal_order','terminal_payment',9900)$$,'P0001','payment order is not confirmable','aborted order cannot recover');
select throws_ok($$select public.confirm_toss_membership_payment('a9111111-1111-4111-8111-111111111111','terminal_order','terminal_payment','{"status":"DONE"}')$$,'P0001','payment order was not claimed','aborted receipt cannot activate');
update public.membership_payment_orders set failure_code='TOSS_PAYMENT_EXPIRED' where order_id='terminal_order';
select throws_ok($$select public.claim_membership_payment('a9111111-1111-4111-8111-111111111111','terminal_order','terminal_payment',9900)$$,'P0001','payment order is not confirmable','expired order cannot recover');
update public.membership_payment_orders set failure_code='PAY_PROCESS_CANCELED' where order_id='terminal_order';
select throws_ok($$select public.claim_membership_payment('a9111111-1111-4111-8111-111111111111','terminal_order','terminal_payment',9900)$$,'P0001','payment order is not confirmable','cancelled order cannot recover');
update public.membership_payment_orders set failure_code='UNKNOWN',payment_key=null where order_id='terminal_order';
select throws_ok($$select public.claim_membership_payment('a9111111-1111-4111-8111-111111111111','terminal_order','new_payment',9900)$$,'P0001','payment order is not confirmable','unbound failed order cannot receive a new key');
select * from finish();
rollback;
