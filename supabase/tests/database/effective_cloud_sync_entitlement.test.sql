begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values
 ('f4111111-1111-4111-8111-111111111111','sync-direct@example.com'),
 ('f4222222-2222-4222-8222-222222222222','sync-guardian@example.com'),
 ('f4333333-3333-4333-8333-333333333333','sync-family@example.com');
update public.profiles set role='student' where id in ('f4111111-1111-4111-8111-111111111111','f4333333-3333-4333-8333-333333333333');
update public.profiles set role='guardian' where id='f4222222-2222-4222-8222-222222222222';
insert into public.memberships(user_id,plan,billing_integration,activation_source,status,product_code,current_period_started_at,current_period_ends_at,included_student_seats)
 values('f4111111-1111-4111-8111-111111111111','premium','toss','toss_payment','active','student_premium',now(),now()+interval '30 days',0),
 ('f4222222-2222-4222-8222-222222222222','premium','toss','toss_payment','active','guardian_family',now(),now()+interval '30 days',2);
insert into public.membership_entitlements(user_id,feature_key,enabled,source,valid_until) values
 ('f4111111-1111-4111-8111-111111111111','cloud-sync',true,'toss_payment',null),
 ('f4222222-2222-4222-8222-222222222222','cloud-sync',true,'toss_payment',null);
insert into public.family_links(student_user_id,guardian_user_id,issuer_user_id,issuer_role,status,linked_at) values('f4333333-3333-4333-8333-333333333333','f4222222-2222-4222-8222-222222222222','f4222222-2222-4222-8222-222222222222','guardian','active',now());
set local role authenticated;
set local request.jwt.claim.sub='f4333333-3333-4333-8333-333333333333';
select is(public.apply_cloud_mutation(gen_random_uuid(),'settings','family-settings','upsert',0,'{"theme":"dark"}','family-device')->>'status','applied','family student writes through final cloud consumer without own membership');
select throws_ok($$select public.apply_cloud_mutation(gen_random_uuid(),'schedule','forged','upsert',0,'{"ownerUserId":"f4333333-3333-4333-8333-333333333333"}','device')$$,'P0001','canonical data requires lifecycle RPC','inherited entitlement does not bypass canonical protection');
reset role;
update public.membership_entitlements set enabled=false where user_id='f4222222-2222-4222-8222-222222222222';
set local role authenticated;
select throws_ok($$select public.apply_cloud_mutation(gen_random_uuid(),'settings','disabled','upsert',0,'{}','device')$$,'P0001','cloud-sync entitlement required','disabled guardian feature denies final mutation');
reset role;
update public.membership_entitlements set enabled=true where user_id='f4222222-2222-4222-8222-222222222222';
update public.memberships set current_period_started_at=now()-interval '30 days',current_period_ends_at=now() where user_id='f4222222-2222-4222-8222-222222222222';
set local role authenticated;
select throws_ok($$select public.apply_cloud_mutation(gen_random_uuid(),'settings','expired-family','upsert',0,'{}','device')$$,'P0001','cloud-sync entitlement required','guardian period expiry denies final mutation');
reset role;
update public.memberships set current_period_started_at=now()-interval '30 days',current_period_ends_at=now()+interval '1 day' where user_id='f4222222-2222-4222-8222-222222222222';
update public.family_links set status='disconnected',disconnected_at=now() where student_user_id='f4333333-3333-4333-8333-333333333333';
set local role authenticated;
select throws_ok($$select public.apply_cloud_mutation(gen_random_uuid(),'settings','disconnected','upsert',0,'{}','device')$$,'P0001','cloud-sync entitlement required','disconnect denies final mutation');
set local request.jwt.claim.sub='f4111111-1111-4111-8111-111111111111';
select is(public.apply_cloud_mutation(gen_random_uuid(),'settings','direct-settings','upsert',0,'{}','device')->>'status','applied','valid direct membership writes');
reset role;
update public.memberships set current_period_started_at=now()-interval '30 days',current_period_ends_at=now() where user_id='f4111111-1111-4111-8111-111111111111';
set local role authenticated;
select throws_ok($$select public.apply_cloud_mutation(gen_random_uuid(),'settings','expired-direct','upsert',0,'{}','device')$$,'P0001','cloud-sync entitlement required','expired active direct membership cannot use unlimited entitlement');
select * from finish();
rollback;
