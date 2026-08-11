-- Role-specific membership products and guardian family seats. Existing tables
-- remain canonical; inherited student access is computed from active family links.
alter table public.memberships
  add column if not exists product_code text,
  add column if not exists included_student_seats integer not null default 0,
  add column if not exists extra_student_seats integer not null default 0;

update public.memberships membership
set product_code = case when profile.role = 'guardian' then 'guardian_family' else 'student_premium' end,
    included_student_seats = case when profile.role = 'guardian' then 2 else 0 end,
    extra_student_seats = greatest(membership.extra_student_seats, 0)
from public.profiles profile
where profile.id = membership.user_id and membership.product_code is null;

update public.memberships set product_code = 'student_premium' where product_code is null;

alter table public.memberships
  alter column product_code set not null,
  drop constraint if exists memberships_product_code_check,
  drop constraint if exists memberships_student_seat_count_check;
alter table public.memberships
  add constraint memberships_product_code_check
    check (product_code in ('student_premium', 'guardian_family')),
  add constraint memberships_student_seat_count_check check (
    included_student_seats between 0 and 2
    and extra_student_seats between 0 and 3
    and included_student_seats + extra_student_seats <= 5
    and ((product_code = 'student_premium' and included_student_seats = 0 and extra_student_seats = 0)
      or (product_code = 'guardian_family' and included_student_seats = 2))
  );

alter table public.membership_entitlements
  drop constraint if exists membership_entitlements_feature_key_check;
alter table public.membership_entitlements
  add constraint membership_entitlements_feature_key_check check (feature_key in (
    'learning-grass', 'cloud-backup', 'cloud-sync', 'screen-ocr', 'grammar-correction', 'content-summary',
    'ai-focus-coach', 'ai-study-recommendation', 'ai-guardian-summary', 'ai-weekly-report'
  ));

alter table public.membership_payment_orders
  drop constraint if exists membership_payment_orders_amount_krw_check;
alter table public.membership_payment_orders
  add column if not exists order_kind text not null default 'membership',
  add column if not exists product_code text not null default 'guardian_family',
  add column if not exists unit_count integer not null default 0,
  add column if not exists target_membership_period_ends_at timestamptz,
  add constraint membership_payment_orders_amount_krw_check check (amount_krw between 500 and 24600),
  add constraint membership_payment_orders_order_kind_check check (order_kind in ('membership', 'family_seat')),
  add constraint membership_payment_orders_product_code_check check (product_code in ('student_premium', 'guardian_family')),
  add constraint membership_payment_orders_unit_count_check check (unit_count between 0 and 3);

update public.membership_payment_orders payment_order
set product_code=case when profile.role='student' then 'student_premium' else 'guardian_family' end
from public.profiles profile
where profile.id=payment_order.user_id;

comment on column public.memberships.product_code is 'student_premium (9,900 KRW) or guardian_family (12,900 KRW).';
comment on column public.memberships.extra_student_seats is 'Paid guardian seats above the two included seats; maximum total capacity is five.';
comment on column public.membership_payment_orders.target_membership_period_ends_at is 'Server snapshot used to prevent stale prorated family-seat approval.';

create or replace function public.membership_is_active(p_user_id uuid, p_product_code text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = p_user_id
      and plan = 'premium'
      and status = 'active'
      and current_period_ends_at > now()
      and (p_product_code is null or product_code = p_product_code)
  );
$$;

create or replace function public.has_effective_membership_entitlement(p_user_id uuid, p_feature_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  user_role text;
  student_features constant text[] := array[
    'learning-grass','cloud-backup','cloud-sync','screen-ocr','grammar-correction','content-summary',
    'ai-focus-coach','ai-study-recommendation'
  ];
begin
  if p_user_id is null or p_feature_key is null then return false; end if;
  if caller_id is not null and caller_id <> p_user_id then raise exception 'membership ownership mismatch'; end if;
  select role into user_role from public.profiles where id = p_user_id;

  if exists (
    select 1 from public.memberships membership
    join public.membership_entitlements entitlement on entitlement.user_id = membership.user_id
    where membership.user_id = p_user_id and membership.plan = 'premium' and membership.status = 'active'
      and membership.current_period_ends_at > now()
      and entitlement.feature_key = p_feature_key and entitlement.enabled
      and (entitlement.valid_until is null or entitlement.valid_until > now())
  ) then return true; end if;

  if user_role = 'student' and p_feature_key = any(student_features) and exists (
    select 1 from public.family_links link
    join public.memberships membership on membership.user_id = link.guardian_user_id
    where link.student_user_id = p_user_id and link.status = 'active'
      and membership.product_code = 'guardian_family' and membership.plan = 'premium'
      and membership.status = 'active' and membership.current_period_ends_at > now()
  ) then return true; end if;
  return false;
end;
$$;

create or replace function public.get_effective_membership(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  own_membership public.memberships%rowtype;
  guardian_membership public.memberships%rowtype;
  guardian_id uuid;
  user_role text;
  feature_keys text[];
  active_students integer := 0;
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  if caller_id is not null and caller_id <> p_user_id then raise exception 'membership ownership mismatch'; end if;
  select role into user_role from public.profiles where id = p_user_id;
  select * into own_membership from public.memberships
    where user_id = p_user_id and plan = 'premium' and status = 'active' and current_period_ends_at > now();

  if found then
    if own_membership.product_code = 'guardian_family' then
      select count(*)::integer into active_students from public.family_links
      where guardian_user_id = p_user_id and status = 'active';
    end if;
    select coalesce(array_agg(feature_key order by feature_key), array[]::text[]) into feature_keys
    from public.membership_entitlements
    where user_id = p_user_id and enabled and (valid_until is null or valid_until > now());
    return jsonb_build_object(
      'plan','premium','status','active','productCode',own_membership.product_code,'source','direct',
      'membershipOwnerUserId',p_user_id,'currentPeriodStartedAt',own_membership.current_period_started_at,
      'currentPeriodEndsAt',own_membership.current_period_ends_at,'includedStudentSeats',own_membership.included_student_seats,
      'extraStudentSeats',own_membership.extra_student_seats,'activeStudentCount',active_students,
      'seatCapacity',own_membership.included_student_seats + own_membership.extra_student_seats,
      'entitlements',to_jsonb(feature_keys)
    );
  end if;

  if user_role = 'student' then
    select link.guardian_user_id into guardian_id
    from public.family_links link
    join public.memberships membership on membership.user_id = link.guardian_user_id
    where link.student_user_id = p_user_id and link.status = 'active'
      and membership.product_code = 'guardian_family' and membership.plan = 'premium'
      and membership.status = 'active' and membership.current_period_ends_at > now()
    limit 1;
    if found then
      select * into guardian_membership from public.memberships where user_id=guardian_id;
      feature_keys := array[
        'learning-grass','cloud-backup','cloud-sync','screen-ocr','grammar-correction','content-summary',
        'ai-focus-coach','ai-study-recommendation'
      ];
      return jsonb_build_object(
        'plan','premium','status','active','productCode','student_premium','source','guardian_family',
        'membershipOwnerUserId',guardian_id,'currentPeriodStartedAt',guardian_membership.current_period_started_at,
        'currentPeriodEndsAt',guardian_membership.current_period_ends_at,'includedStudentSeats',0,
        'extraStudentSeats',0,'activeStudentCount',0,'seatCapacity',0,'entitlements',to_jsonb(feature_keys)
      );
    end if;
  end if;

  return jsonb_build_object(
    'plan','free','status','inactive','productCode',null,'source',null,'membershipOwnerUserId',null,
    'currentPeriodStartedAt',null,'currentPeriodEndsAt',null,'includedStudentSeats',0,
    'extraStudentSeats',0,'activeStudentCount',0,'seatCapacity',0,'entitlements','[]'::jsonb
  );
end;
$$;

drop function if exists public.create_membership_payment_order(uuid, text);
create function public.create_membership_payment_order(p_user_id uuid, p_idempotency_key text, p_order_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_order public.membership_payment_orders%rowtype;
  current_membership public.memberships%rowtype;
  generated_order_id text;
  actor_role text;
  active_students integer;
  required_extra integer;
  amount bigint;
  product text;
  order_name text;
  period_end timestamptz;
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then raise exception 'invalid idempotency key'; end if;
  if p_order_kind not in ('membership','family_seat') then raise exception 'invalid membership order kind'; end if;
  select role into actor_role from public.profiles where id = p_user_id;
  if actor_role not in ('student','guardian') then raise exception 'membership role mismatch'; end if;

  perform pg_advisory_xact_lock(hashtextextended('membership-order:' || p_idempotency_key, 0));
  select * into payment_order from public.membership_payment_orders where idempotency_key = p_idempotency_key;
  if found then
    if payment_order.user_id <> p_user_id then raise exception 'payment order ownership mismatch'; end if;
    return jsonb_build_object('orderId',payment_order.order_id,'amount',payment_order.amount_krw,
      'orderName',case when payment_order.order_kind='family_seat' then 'Mirujima 가족 추가 좌석' when payment_order.product_code='student_premium' then 'Mirujima 학생 Premium 30일' else 'Mirujima 가족 Premium 30일' end,
      'status',payment_order.status,'productCode',payment_order.product_code,'orderKind',payment_order.order_kind,
      'unitCount',payment_order.unit_count,'periodEndsAt',payment_order.target_membership_period_ends_at);
  end if;

  select count(*)::integer into active_students from public.family_links
  where guardian_user_id = p_user_id and status = 'active';

  if p_order_kind = 'membership' then
    if public.membership_is_active(p_user_id, null) then raise exception 'membership already active'; end if;
    if actor_role = 'student' then
      if exists (
        select 1 from public.family_links link join public.memberships membership on membership.user_id=link.guardian_user_id
        where link.student_user_id=p_user_id and link.status='active' and membership.product_code='guardian_family'
          and membership.status='active' and membership.current_period_ends_at>now()
      ) then raise exception 'guardian membership conflict'; end if;
      product := 'student_premium'; amount := 9900; required_extra := 0;
      order_name := 'Mirujima 학생 Premium 30일';
    else
      if active_students > 5 then raise exception 'family seat limit reached'; end if;
      if exists (
        select 1 from public.family_links link join public.memberships membership on membership.user_id=link.student_user_id
        where link.guardian_user_id=p_user_id and link.status='active' and membership.product_code='student_premium'
          and membership.status='active' and membership.current_period_ends_at>now()
      ) then raise exception 'student membership conflict'; end if;
      product := 'guardian_family'; required_extra := greatest(active_students - 2, 0);
      amount := 12900 + required_extra * 3900; order_name := 'Mirujima 가족 Premium 30일';
    end if;
  else
    if actor_role <> 'guardian' then raise exception 'guardian role required'; end if;
    if active_students >= 5 then raise exception 'family seat limit reached'; end if;
    if exists (
      select 1 from public.family_links link join public.memberships membership on membership.user_id=link.student_user_id
      where link.guardian_user_id=p_user_id and link.status='active' and membership.product_code='student_premium'
        and membership.status='active' and membership.current_period_ends_at>now()
    ) then raise exception 'student membership conflict'; end if;
    product := 'guardian_family'; required_extra := 1; order_name := 'Mirujima 가족 추가 좌석';
    select * into current_membership from public.memberships where user_id=p_user_id for update;
    if found and current_membership.product_code='guardian_family' and current_membership.status='active' and current_membership.current_period_ends_at>now() then
      if active_students < current_membership.included_student_seats + current_membership.extra_student_seats then raise exception 'family seat already available'; end if;
      if current_membership.included_student_seats + current_membership.extra_student_seats >= 5 then raise exception 'family seat limit reached'; end if;
      period_end := current_membership.current_period_ends_at;
      amount := greatest(500::numeric, ceil(3900 * extract(epoch from (period_end-now())) / 2592000))::bigint;
    else
      if active_students < 2 then raise exception 'family membership inactive'; end if;
      period_end := now() + interval '30 days';
      amount := 12900 + 3900;
    end if;
  end if;

  generated_order_id := 'membership_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.membership_payment_orders (
    user_id,order_id,amount_krw,status,idempotency_key,order_kind,product_code,unit_count,target_membership_period_ends_at
  ) values (
    p_user_id,generated_order_id,amount,'pending',p_idempotency_key,p_order_kind,product,required_extra,period_end
  ) returning * into payment_order;
  return jsonb_build_object('orderId',payment_order.order_id,'amount',payment_order.amount_krw,'orderName',order_name,
    'status',payment_order.status,'productCode',payment_order.product_code,'orderKind',payment_order.order_kind,
    'unitCount',payment_order.unit_count,'periodEndsAt',payment_order.target_membership_period_ends_at);
end;
$$;

create function public.create_membership_payment_order(p_user_id uuid, p_idempotency_key text)
returns jsonb language sql security definer set search_path='' as $$
  select public.create_membership_payment_order(p_user_id,p_idempotency_key,'membership');
$$;

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
  if p_provider_payload is null or jsonb_typeof(p_provider_payload)<>'object' or p_provider_payload->>'status'<>'DONE' then raise exception 'provider payment is not done'; end if;
  perform pg_advisory_xact_lock(hashtextextended('membership-confirm:'||coalesce(p_order_id,''),0));
  select * into payment_order from public.membership_payment_orders where order_id=p_order_id for update;
  if not found then raise exception 'payment order not found'; end if;
  if payment_order.user_id<>p_user_id then raise exception 'payment order ownership mismatch'; end if;
  if payment_order.payment_key<>p_payment_key then raise exception 'payment key mismatch'; end if;
  select role into actor_role from public.profiles where id=p_user_id;
  if (payment_order.product_code='student_premium' and actor_role<>'student') or (payment_order.product_code='guardian_family' and actor_role<>'guardian') then raise exception 'membership role mismatch'; end if;
  select * into existing_membership from public.memberships where user_id=p_user_id for update;
  if payment_order.status='confirmed' then return public.get_effective_membership(p_user_id); end if;
  if payment_order.status<>'confirming' then raise exception 'payment order was not claimed'; end if;
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

create or replace function public.issue_family_link_code(p_actor_user_id uuid, p_code_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  link_id uuid;
  expires_at timestamptz:=now()+interval '5 minutes';
  active_students integer;
  seat_capacity integer:=2;
begin
  if p_actor_user_id is null then raise exception 'authentication required'; end if;
  if p_code_hash is null or p_code_hash!~'^[0-9a-f]{64}$' then raise exception 'invalid code hash'; end if;
  perform pg_advisory_xact_lock(hashtextextended('family-issue:'||p_actor_user_id::text,0));
  select count(*)::integer into active_students from public.family_links where guardian_user_id=p_actor_user_id and status='active';
  select included_student_seats+extra_student_seats into seat_capacity from public.memberships
    where user_id=p_actor_user_id and product_code='guardian_family' and status='active' and current_period_ends_at>now();
  seat_capacity:=coalesce(seat_capacity,2);
  if active_students>=5 then raise exception 'family seat limit reached'; end if;
  if active_students>=seat_capacity then raise exception 'family seat required'; end if;
  if (select count(*) from public.family_links where issuer_user_id=p_actor_user_id and created_at>now()-interval '10 minutes')>=5 then raise exception 'family code issue rate limit exceeded'; end if;
  update public.family_links set status='revoked',code_hash=null,code_expires_at=null,updated_at=now() where issuer_user_id=p_actor_user_id and status='pending';
  insert into public.family_links(student_user_id,guardian_user_id,issuer_user_id,issuer_role,status,code_hash,code_expires_at)
  values(null,p_actor_user_id,p_actor_user_id,'guardian','pending',p_code_hash,expires_at) returning id into link_id;
  return jsonb_build_object('id',link_id,'status','pending','codeExpiresAt',expires_at,'seatCapacity',seat_capacity,'activeStudentCount',active_students,
    'event',jsonb_build_object('kind','family_link_code_issued','recipientUserId',p_actor_user_id));
end;
$$;

create or replace function public.redeem_family_link_code(p_actor_user_id uuid, p_code_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  pending_link public.family_links%rowtype;
  active_students integer;
  seat_capacity integer:=2;
  guardian_family_active boolean:=false;
begin
  if p_actor_user_id is null then raise exception 'authentication required'; end if;
  if p_code_hash is null or p_code_hash!~'^[0-9a-f]{64}$' then raise exception 'invalid code hash'; end if;
  perform pg_advisory_xact_lock(hashtextextended('family-redeem:'||p_actor_user_id::text,0));
  if exists(select 1 from public.profiles where id=p_actor_user_id and family_redeem_locked_until>now()) then
    return jsonb_build_object('status','locked','lockedUntil',(select family_redeem_locked_until from public.profiles where id=p_actor_user_id));
  end if;
  select * into pending_link from public.family_links where status='pending' and issuer_role='guardian' and code_hash=p_code_hash for update;
  if not found or pending_link.code_expires_at<=now() then
    if found then update public.family_links set status='expired',code_hash=null,code_expires_at=null,updated_at=now() where id=pending_link.id; end if;
    return public.consume_family_redeem_failure(p_actor_user_id);
  end if;
  if pending_link.issuer_user_id=p_actor_user_id or pending_link.guardian_user_id is null then return public.consume_family_redeem_failure(p_actor_user_id); end if;
  if exists(select 1 from public.family_links where student_user_id=p_actor_user_id and status='active') then raise exception 'student already has an active guardian'; end if;
  select count(*)::integer into active_students from public.family_links where guardian_user_id=pending_link.guardian_user_id and status='active';
  select included_student_seats+extra_student_seats,true into seat_capacity,guardian_family_active from public.memberships
    where user_id=pending_link.guardian_user_id and product_code='guardian_family' and status='active' and current_period_ends_at>now();
  seat_capacity:=coalesce(seat_capacity,2); guardian_family_active:=coalesce(guardian_family_active,false);
  if active_students>=5 then raise exception 'family seat limit reached'; end if;
  if active_students>=seat_capacity then raise exception 'family seat required'; end if;
  if guardian_family_active and public.membership_is_active(p_actor_user_id,'student_premium') then raise exception 'student membership conflict'; end if;
  update public.family_links set student_user_id=p_actor_user_id,status='active',code_hash=null,code_expires_at=null,linked_at=now(),updated_at=now() where id=pending_link.id;
  update public.profiles set family_redeem_window_started_at=null,family_redeem_attempts=0,family_redeem_locked_until=null,updated_at=now() where id=p_actor_user_id;
  return jsonb_build_object('id',pending_link.id,'status','active','studentUserId',p_actor_user_id,'guardianUserId',pending_link.guardian_user_id,'linkedAt',now(),
    'membershipSource',case when guardian_family_active then 'guardian_family' else null end,
    'event',jsonb_build_object('kind','family_linked','studentUserId',p_actor_user_id,'guardianUserId',pending_link.guardian_user_id));
end;
$$;

revoke all on function public.membership_is_active(uuid,text) from public,anon,authenticated;
revoke all on function public.has_effective_membership_entitlement(uuid,text) from public,anon;
revoke all on function public.get_effective_membership(uuid) from public,anon;
revoke all on function public.create_membership_payment_order(uuid,text,text) from public,anon,authenticated;
revoke all on function public.create_membership_payment_order(uuid,text) from public,anon,authenticated;
grant execute on function public.membership_is_active(uuid,text) to service_role;
grant execute on function public.has_effective_membership_entitlement(uuid,text) to authenticated,service_role;
grant execute on function public.get_effective_membership(uuid) to authenticated,service_role;
grant execute on function public.create_membership_payment_order(uuid,text,text) to service_role;
grant execute on function public.create_membership_payment_order(uuid,text) to service_role;

grant select (product_code,included_student_seats,extra_student_seats) on public.memberships to authenticated;
grant select (order_kind,product_code,unit_count,target_membership_period_ends_at) on public.membership_payment_orders to authenticated;

alter table public.ai_rate_limits drop constraint if exists ai_rate_limits_task_check;
alter table public.ai_rate_limits add constraint ai_rate_limits_task_check
  check (task in ('ocr','grammar-correction','content-summary','study-organize','focus-plan-review','guardian-summary'));

create or replace function public.consume_ai_task_rate_limit(p_task text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  allowed boolean:=false;
  current_count integer;
  current_window timestamptz;
  request_limit integer;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_task not in ('ocr','grammar-correction','content-summary','study-organize','focus-plan-review','guardian-summary') then raise exception 'unsupported AI task'; end if;
  request_limit:=case when p_task in ('content-summary','study-organize','focus-plan-review','guardian-summary') then 6 else 12 end;
  perform pg_advisory_xact_lock(hashtextextended('ai-writing:'||current_user_id::text||':'||p_task,0));
  select request_count,window_started_at into current_count,current_window from public.ai_rate_limits where user_id=current_user_id and task=p_task;
  if current_window is null or current_window<=now()-interval '1 minute' then
    insert into public.ai_rate_limits(user_id,task,window_started_at,request_count,updated_at)
    values(current_user_id,p_task,now(),1,now())
    on conflict(user_id,task) do update set window_started_at=excluded.window_started_at,request_count=1,updated_at=now();
    return true;
  end if;
  if current_count<request_limit then
    update public.ai_rate_limits set request_count=request_count+1,updated_at=now() where user_id=current_user_id and task=p_task;
    allowed:=true;
  end if;
  return allowed;
end;
$$;
