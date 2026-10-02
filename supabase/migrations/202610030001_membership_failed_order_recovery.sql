-- Unknown failed orders with an already bound payment key may only reconcile
-- a provider-verified DONE receipt. No new provider confirmation is allowed.
-- Known cancellation, expiration and abandonment remain terminal. Existing
-- periods, entitlement checks, family-seat limits and idempotency are preserved.

create or replace function public.claim_membership_payment(p_user_id uuid,p_order_id text,p_payment_key text,p_callback_amount bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare payment_order public.membership_payment_orders%rowtype;
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  if p_order_id is null or p_order_id !~ '^[A-Za-z0-9_-]{6,64}$' then raise exception 'invalid payment order id'; end if;
  if p_payment_key is null or length(p_payment_key) not between 6 and 200 then raise exception 'invalid payment key'; end if;
  if p_callback_amount is null or p_callback_amount <= 0 then raise exception 'invalid callback amount'; end if;
  perform pg_advisory_xact_lock(hashtextextended('membership-confirm:'||p_order_id,0));
  select * into payment_order from public.membership_payment_orders where order_id=p_order_id for update;
  if payment_order.id is null then raise exception 'payment order not found'; end if;
  if payment_order.user_id<>p_user_id then raise exception 'payment order ownership mismatch'; end if;
  if payment_order.amount_krw<>p_callback_amount then raise exception 'payment amount mismatch'; end if;
  if payment_order.payment_key is not null and payment_order.payment_key<>p_payment_key then raise exception 'payment key mismatch'; end if;
  if payment_order.status='confirmed' then return jsonb_build_object('status','confirmed','orderId',payment_order.order_id); end if;
  if payment_order.status='failed' then
    if payment_order.payment_key is null or coalesce(payment_order.failure_code,'') in ('TOSS_PAYMENT_ABORTED','TOSS_PAYMENT_EXPIRED','PAY_PROCESS_CANCELED') then raise exception 'payment order is not confirmable'; end if;
    return jsonb_build_object('status','confirming','orderId',payment_order.order_id,'amount',payment_order.amount_krw,'reconciliationRequired',true,'reconciliationOnly',true);
  end if;
  if payment_order.status not in ('pending','confirming') then raise exception 'payment order is not confirmable'; end if;
  update public.membership_payment_orders set status='confirming',payment_key=p_payment_key,updated_at=clock_timestamp() where id=payment_order.id;
  return jsonb_build_object('status','confirming','orderId',payment_order.order_id,'amount',payment_order.amount_krw,'reconciliationRequired',payment_order.status='confirming','reconciliationOnly',false);
end; $$;

create or replace function public.confirm_toss_membership_payment(
  p_user_id uuid, p_order_id text, p_payment_key text, p_provider_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_order public.membership_payment_orders%rowtype;
  existing_membership public.memberships%rowtype;
  actor_role text;
  active_students integer;
  period_start timestamptz;
  period_end timestamptz;
  feature_keys text[];
begin
  if p_provider_payload is null or jsonb_typeof(p_provider_payload)<>'object' or p_provider_payload->>'status' is distinct from 'DONE' then raise exception 'provider payment is not done'; end if;
  perform pg_advisory_xact_lock(hashtextextended('membership-confirm:'||coalesce(p_order_id,''),0));
  select * into payment_order from public.membership_payment_orders where order_id=p_order_id for update;
  if not found then raise exception 'payment order not found'; end if;
  if payment_order.user_id<>p_user_id then raise exception 'payment order ownership mismatch'; end if;
  if payment_order.payment_key<>p_payment_key then raise exception 'payment key mismatch'; end if;
  select role into actor_role from public.profiles where id=p_user_id;
  if (payment_order.product_code='student_premium' and actor_role<>'student') or (payment_order.product_code='guardian_family' and actor_role<>'guardian') then raise exception 'membership role mismatch'; end if;
  select * into existing_membership from public.memberships where user_id=p_user_id for update;
  if payment_order.status='confirmed' then return public.get_effective_membership(p_user_id); end if;
  if payment_order.status<>'confirming' and not (payment_order.status='failed' and payment_order.payment_key is not null
    and coalesce(payment_order.failure_code,'') not in ('TOSS_PAYMENT_ABORTED','TOSS_PAYMENT_EXPIRED','PAY_PROCESS_CANCELED')) then raise exception 'payment order was not claimed'; end if;
  select count(*)::integer into active_students from public.family_links where guardian_user_id=p_user_id and status='active';

  if payment_order.order_kind='membership' then
    if public.membership_is_active(p_user_id,null) then raise exception 'membership already active'; end if;
    if payment_order.product_code='student_premium' and exists (
      select 1 from public.family_links link join public.memberships membership on membership.user_id=link.guardian_user_id
      where link.student_user_id=p_user_id and link.status='active' and membership.product_code='guardian_family'
        and membership.status='active' and membership.current_period_ends_at>now()
    ) then raise exception 'guardian membership conflict'; end if;
    if payment_order.product_code='guardian_family' and exists (
      select 1 from public.family_links link join public.memberships membership on membership.user_id=link.student_user_id
      where link.guardian_user_id=p_user_id and link.status='active' and membership.product_code='student_premium'
        and membership.status='active' and membership.current_period_ends_at>now()
    ) then raise exception 'student membership conflict'; end if;
    if payment_order.product_code='guardian_family' and payment_order.amount_krw<>12900+greatest(active_students-2,0)*3900 then raise exception 'membership payment amount mismatch'; end if;
    if payment_order.product_code='student_premium' and payment_order.amount_krw<>9900 then raise exception 'membership payment amount mismatch'; end if;
    period_start := now(); period_end := now()+interval '30 days';
    insert into public.memberships (
      user_id,plan,billing_integration,activation_source,status,activated_at,current_period_started_at,current_period_ends_at,
      provider_customer_key,provider_subscription_ref,product_code,included_student_seats,extra_student_seats,updated_at
    ) values (
      p_user_id,'premium','toss','toss_payment','active',now(),period_start,period_end,p_user_id::text,p_order_id,
      payment_order.product_code,case when payment_order.product_code='guardian_family' then 2 else 0 end,
      case when payment_order.product_code='guardian_family' then greatest(active_students-2,0) else 0 end,now()
    ) on conflict(user_id) do update set
      plan='premium',billing_integration='toss',activation_source='toss_payment',status='active',activated_at=now(),
      current_period_started_at=period_start,current_period_ends_at=period_end,provider_customer_key=p_user_id::text,
      provider_subscription_ref=p_order_id,product_code=payment_order.product_code,
      included_student_seats=case when payment_order.product_code='guardian_family' then 2 else 0 end,
      extra_student_seats=case when payment_order.product_code='guardian_family' then greatest(active_students-2,0) else 0 end,updated_at=now();
  else
    if exists (
      select 1 from public.family_links link join public.memberships membership on membership.user_id=link.student_user_id
      where link.guardian_user_id=p_user_id and link.status='active' and membership.product_code='student_premium'
        and membership.status='active' and membership.current_period_ends_at>now()
    ) then raise exception 'student membership conflict'; end if;
    if existing_membership.user_id is not null and existing_membership.product_code='guardian_family' and existing_membership.status='active' and existing_membership.current_period_ends_at>now() then
      if payment_order.target_membership_period_ends_at is distinct from existing_membership.current_period_ends_at then raise exception 'family membership period changed'; end if;
      if existing_membership.included_student_seats+existing_membership.extra_student_seats+payment_order.unit_count>5 then raise exception 'family seat limit reached'; end if;
      update public.memberships set extra_student_seats=extra_student_seats+payment_order.unit_count,
        provider_subscription_ref=p_order_id,updated_at=now() where user_id=p_user_id;
      period_end := existing_membership.current_period_ends_at;
    else
      if active_students<>2 or payment_order.amount_krw<>16800 or payment_order.unit_count<>1 then raise exception 'family seat order is stale'; end if;
      period_start:=now(); period_end:=now()+interval '30 days';
      insert into public.memberships (
        user_id,plan,billing_integration,activation_source,status,activated_at,current_period_started_at,current_period_ends_at,
        provider_customer_key,provider_subscription_ref,product_code,included_student_seats,extra_student_seats,updated_at
      ) values (p_user_id,'premium','toss','toss_payment','active',now(),period_start,period_end,p_user_id::text,p_order_id,'guardian_family',2,1,now())
      on conflict(user_id) do update set plan='premium',billing_integration='toss',activation_source='toss_payment',status='active',
        activated_at=now(),current_period_started_at=period_start,current_period_ends_at=period_end,provider_customer_key=p_user_id::text,
        provider_subscription_ref=p_order_id,product_code='guardian_family',included_student_seats=2,extra_student_seats=1,updated_at=now();
    end if;
  end if;

  feature_keys := case when payment_order.product_code='guardian_family' then array[
    'learning-grass','cloud-backup','cloud-sync','screen-ocr','grammar-correction','content-summary',
    'ai-focus-coach','ai-study-recommendation','ai-guardian-summary','ai-weekly-report'
  ] else array[
    'learning-grass','cloud-backup','cloud-sync','screen-ocr','grammar-correction','content-summary',
    'ai-focus-coach','ai-study-recommendation'
  ] end;
  insert into public.membership_entitlements(user_id,feature_key,enabled,source,valid_until,updated_at)
  select p_user_id,feature_key,true,'toss_payment',period_end,now() from unnest(feature_keys) feature_key
  on conflict(user_id,feature_key) do update set enabled=true,source='toss_payment',valid_until=period_end,updated_at=now();
  update public.membership_payment_orders set status='confirmed',provider_payload=p_provider_payload,failure_code=null,confirmed_at=now(),updated_at=now() where id=payment_order.id;
  return public.get_effective_membership(p_user_id);
end;
$$;

create or replace function public.confirm_toss_family_seat_payment(p_user_id uuid,p_order_id text,p_payment_key text,p_provider_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  payment_order public.membership_payment_orders%rowtype;
  membership public.memberships%rowtype;
  actor_role text;
  active_students integer;
  required_extra integer;
  period_start timestamptz;
  period_end timestamptz;
  features text[]:=array[
    'learning-grass','cloud-backup','cloud-sync','screen-ocr','grammar-correction','content-summary',
    'ai-focus-coach','ai-study-recommendation','ai-guardian-summary','ai-weekly-report'
  ];
begin
  if p_provider_payload is null or jsonb_typeof(p_provider_payload)<>'object' or p_provider_payload->>'status' is distinct from 'DONE' then raise exception 'provider payment is not done'; end if;
  perform pg_advisory_xact_lock(hashtextextended('membership-confirm:'||coalesce(p_order_id,''),0));
  select * into payment_order from public.membership_payment_orders where order_id=p_order_id for update;
  if not found then raise exception 'payment order not found'; end if;
  if payment_order.user_id<>p_user_id or payment_order.order_kind<>'family_seat' then raise exception 'payment order ownership mismatch'; end if;
  if payment_order.payment_key<>p_payment_key then raise exception 'payment key mismatch'; end if;
  if payment_order.status='confirmed' then return public.get_effective_membership(p_user_id); end if;
  if payment_order.status<>'confirming' and not (payment_order.status='failed' and payment_order.payment_key is not null
    and coalesce(payment_order.failure_code,'') not in ('TOSS_PAYMENT_ABORTED','TOSS_PAYMENT_EXPIRED','PAY_PROCESS_CANCELED')) then raise exception 'payment order was not claimed'; end if;
  select role into actor_role from public.profiles where id=p_user_id;
  if actor_role<>'guardian' then raise exception 'guardian role required'; end if;
  if exists(
    select 1 from public.family_links link join public.memberships student_membership on student_membership.user_id=link.student_user_id
    where link.guardian_user_id=p_user_id and link.status='active' and student_membership.product_code='student_premium'
      and student_membership.status='active' and student_membership.current_period_ends_at>now()
  ) then raise exception 'student membership conflict'; end if;
  select count(*)::integer into active_students from public.family_links where guardian_user_id=p_user_id and status='active';
  select * into membership from public.memberships where user_id=p_user_id for update;
  if found and membership.product_code='guardian_family' and membership.status='active' and membership.current_period_ends_at>now() then
    if payment_order.target_membership_period_ends_at is distinct from membership.current_period_ends_at then raise exception 'family membership period changed'; end if;
    if payment_order.unit_count<>1 or membership.included_student_seats+membership.extra_student_seats+1>5 then raise exception 'family seat limit reached'; end if;
    update public.memberships set extra_student_seats=extra_student_seats+1,provider_subscription_ref=p_order_id,updated_at=now() where user_id=p_user_id;
    period_end:=membership.current_period_ends_at;
  else
    required_extra:=greatest(active_students-1,1);
    if required_extra>3 or payment_order.unit_count<>required_extra or payment_order.amount_krw<>12900+required_extra*3900 then raise exception 'family seat order is stale'; end if;
    period_start:=now(); period_end:=now()+interval '30 days';
    insert into public.memberships(
      user_id,plan,billing_integration,activation_source,status,activated_at,current_period_started_at,current_period_ends_at,
      provider_customer_key,provider_subscription_ref,product_code,included_student_seats,extra_student_seats,updated_at
    ) values(p_user_id,'premium','toss','toss_payment','active',now(),period_start,period_end,p_user_id::text,p_order_id,'guardian_family',2,required_extra,now())
    on conflict(user_id) do update set plan='premium',billing_integration='toss',activation_source='toss_payment',status='active',
      activated_at=now(),current_period_started_at=period_start,current_period_ends_at=period_end,provider_customer_key=p_user_id::text,
      provider_subscription_ref=p_order_id,product_code='guardian_family',included_student_seats=2,extra_student_seats=required_extra,updated_at=now();
  end if;
  insert into public.membership_entitlements(user_id,feature_key,enabled,source,valid_until,updated_at)
  select p_user_id,feature_key,true,'toss_payment',period_end,now() from unnest(features) feature_key
  on conflict(user_id,feature_key) do update set enabled=true,source='toss_payment',valid_until=period_end,updated_at=now();
  update public.membership_payment_orders set status='confirmed',provider_payload=p_provider_payload,failure_code=null,confirmed_at=now(),updated_at=now() where id=payment_order.id;
  return public.get_effective_membership(p_user_id);
end;
$$;

revoke all on function public.claim_membership_payment(uuid,text,text,bigint),public.confirm_toss_membership_payment(uuid,text,text,jsonb),public.confirm_toss_family_seat_payment(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.claim_membership_payment(uuid,text,text,bigint),public.confirm_toss_membership_payment(uuid,text,text,jsonb),public.confirm_toss_family_seat_payment(uuid,text,text,jsonb) to service_role;
