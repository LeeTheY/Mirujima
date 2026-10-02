-- Reuse existing membership orders, periods and entitlement rows. No new table/column.
-- Inherited access honors the canonical guardian entitlement; pending cancellation never revokes an active membership.

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
    'ai-focus-coach','ai-study-recommendation','ai-weekly-report'
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
    join public.membership_entitlements entitlement on entitlement.user_id=membership.user_id and entitlement.feature_key=p_feature_key and entitlement.enabled and (entitlement.valid_until is null or entitlement.valid_until>now())
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
      select coalesce(array_agg(feature_key order by feature_key),array[]::text[]) into feature_keys from public.membership_entitlements where user_id=guardian_id and enabled and (valid_until is null or valid_until>now()) and feature_key=any(array['learning-grass','cloud-backup','cloud-sync','screen-ocr','grammar-correction','content-summary','ai-focus-coach','ai-study-recommendation','ai-weekly-report']);
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

create or replace function public.create_membership_payment_order(p_user_id uuid, p_idempotency_key text, p_order_kind text)
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
    if payment_order.user_id <> p_user_id or payment_order.order_kind<>p_order_kind then raise exception 'payment order ownership mismatch'; end if;
    return jsonb_build_object('orderId',payment_order.order_id,'amount',payment_order.amount_krw,
      'orderName',case when payment_order.order_kind='family_seat' then 'Mirujima 가족 추가 좌석' when payment_order.product_code='student_premium' then 'Mirujima 학생 Premium 30일' else 'Mirujima 가족 Premium 30일' end,
      'status',case when payment_order.status='failed' and payment_order.payment_key is not null and coalesce(payment_order.failure_code,'') not in ('TOSS_PAYMENT_ABORTED','TOSS_PAYMENT_EXPIRED') then 'needs_review' else payment_order.status end,'productCode',payment_order.product_code,'orderKind',payment_order.order_kind,
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
    'status',case when payment_order.status='failed' and payment_order.payment_key is not null and coalesce(payment_order.failure_code,'') not in ('TOSS_PAYMENT_ABORTED','TOSS_PAYMENT_EXPIRED') then 'needs_review' else payment_order.status end,'productCode',payment_order.product_code,'orderKind',payment_order.order_kind,
    'unitCount',payment_order.unit_count,'periodEndsAt',payment_order.target_membership_period_ends_at);
end;
$$;

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
      'status',case when payment_order.status='failed' and payment_order.payment_key is not null and coalesce(payment_order.failure_code,'') not in ('TOSS_PAYMENT_ABORTED','TOSS_PAYMENT_EXPIRED') then 'needs_review' else payment_order.status end,'productCode','guardian_family','orderKind','family_seat','unitCount',payment_order.unit_count,
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
    'status',case when payment_order.status='failed' and payment_order.payment_key is not null and coalesce(payment_order.failure_code,'') not in ('TOSS_PAYMENT_ABORTED','TOSS_PAYMENT_EXPIRED') then 'needs_review' else payment_order.status end,'productCode','guardian_family','orderKind','family_seat','unitCount',payment_order.unit_count,
    'periodEndsAt',payment_order.target_membership_period_ends_at);
end;
$$;

create or replace function public.cancel_pending_membership_order(p_order_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); r public.membership_payment_orders%rowtype;
begin
  if caller is null then raise exception 'authentication required'; end if;
  if p_order_id is null or p_order_id !~ '^[A-Za-z0-9_-]{6,64}$' then raise exception 'invalid membership order id'; end if;
  perform pg_advisory_xact_lock(hashtextextended('membership-confirm:'||p_order_id,0));
  select * into r from public.membership_payment_orders where order_id=p_order_id for update;
  if r.id is null or r.user_id<>caller then raise exception 'membership order not found'; end if;
  if r.status='failed' and r.payment_key is null then return jsonb_build_object('status','cancelled','orderId',r.order_id); end if;
  if r.status<>'pending' or r.payment_key is not null then raise exception 'membership order is not cancellable'; end if;
  update public.membership_payment_orders set status='failed',failure_code='PAY_PROCESS_CANCELED',updated_at=clock_timestamp() where id=r.id;
  return jsonb_build_object('status','cancelled','orderId',r.order_id);
end; $$;
revoke all on function public.cancel_pending_membership_order(text) from public,anon;
grant execute on function public.cancel_pending_membership_order(text) to authenticated;
-- Existing creator grants remain service-only; entitlement query grants remain unchanged.
