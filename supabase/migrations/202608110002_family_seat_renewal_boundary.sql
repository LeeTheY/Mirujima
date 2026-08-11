-- Family-seat checkout must also cover guardians whose prior family period has
-- expired while three or four student links remain active.
create or replace function public.create_family_seat_payment_order(p_user_id uuid,p_idempotency_key text)
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
  amount bigint;
  period_end timestamptz;
  generated_order_id text;
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then raise exception 'invalid idempotency key'; end if;
  select role into actor_role from public.profiles where id=p_user_id;
  if actor_role<>'guardian' then raise exception 'guardian role required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('membership-order:'||p_idempotency_key,0));
  select * into payment_order from public.membership_payment_orders where idempotency_key=p_idempotency_key;
  if found then
    if payment_order.user_id<>p_user_id or payment_order.order_kind<>'family_seat' then raise exception 'payment order ownership mismatch'; end if;
    return jsonb_build_object('orderId',payment_order.order_id,'amount',payment_order.amount_krw,'orderName','Mirujima 가족 추가 좌석',
      'status',payment_order.status,'productCode','guardian_family','orderKind','family_seat','unitCount',payment_order.unit_count,
      'periodEndsAt',payment_order.target_membership_period_ends_at);
  end if;
  select count(*)::integer into active_students from public.family_links where guardian_user_id=p_user_id and status='active';
  if active_students>=5 then raise exception 'family seat limit reached'; end if;
  if exists(
    select 1 from public.family_links link join public.memberships student_membership on student_membership.user_id=link.student_user_id
    where link.guardian_user_id=p_user_id and link.status='active' and student_membership.product_code='student_premium'
      and student_membership.status='active' and student_membership.current_period_ends_at>now()
  ) then raise exception 'student membership conflict'; end if;
  select * into membership from public.memberships where user_id=p_user_id for update;
  if found and membership.product_code='guardian_family' and membership.status='active' and membership.current_period_ends_at>now() then
    if active_students<membership.included_student_seats+membership.extra_student_seats then raise exception 'family seat already available'; end if;
    if membership.included_student_seats+membership.extra_student_seats>=5 then raise exception 'family seat limit reached'; end if;
    required_extra:=1;
    period_end:=membership.current_period_ends_at;
    amount:=greatest(500::numeric,ceil(3900*extract(epoch from(period_end-now()))/2592000))::bigint;
  else
    if active_students<2 then raise exception 'family membership inactive'; end if;
    required_extra:=greatest(active_students-1,1);
    if required_extra>3 then raise exception 'family seat limit reached'; end if;
    period_end:=now()+interval '30 days';
    amount:=12900+required_extra*3900;
  end if;
  generated_order_id:='membership_'||replace(gen_random_uuid()::text,'-','');
  insert into public.membership_payment_orders(
    user_id,order_id,amount_krw,status,idempotency_key,order_kind,product_code,unit_count,target_membership_period_ends_at
  ) values(p_user_id,generated_order_id,amount,'pending',p_idempotency_key,'family_seat','guardian_family',required_extra,period_end)
  returning * into payment_order;
  return jsonb_build_object('orderId',payment_order.order_id,'amount',payment_order.amount_krw,'orderName','Mirujima 가족 추가 좌석',
    'status',payment_order.status,'productCode','guardian_family','orderKind','family_seat','unitCount',payment_order.unit_count,
    'periodEndsAt',payment_order.target_membership_period_ends_at);
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
  if p_provider_payload is null or jsonb_typeof(p_provider_payload)<>'object' or p_provider_payload->>'status'<>'DONE' then raise exception 'provider payment is not done'; end if;
  perform pg_advisory_xact_lock(hashtextextended('membership-confirm:'||coalesce(p_order_id,''),0));
  select * into payment_order from public.membership_payment_orders where order_id=p_order_id for update;
  if not found then raise exception 'payment order not found'; end if;
  if payment_order.user_id<>p_user_id or payment_order.order_kind<>'family_seat' then raise exception 'payment order ownership mismatch'; end if;
  if payment_order.payment_key<>p_payment_key then raise exception 'payment key mismatch'; end if;
  if payment_order.status='confirmed' then return public.get_effective_membership(p_user_id); end if;
  if payment_order.status<>'confirming' then raise exception 'payment order was not claimed'; end if;
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

revoke all on function public.create_family_seat_payment_order(uuid,text) from public,anon,authenticated;
revoke all on function public.confirm_toss_family_seat_payment(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_family_seat_payment_order(uuid,text) to service_role;
grant execute on function public.confirm_toss_family_seat_payment(uuid,text,text,jsonb) to service_role;
