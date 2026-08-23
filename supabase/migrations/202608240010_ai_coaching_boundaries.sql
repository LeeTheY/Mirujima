-- AI coaching extends the existing entitlement and per-task rate-limit model.
-- No provider prompt or output is persisted by this migration.

alter table public.ai_rate_limits drop constraint if exists ai_rate_limits_task_check;
alter table public.ai_rate_limits add constraint ai_rate_limits_task_check
  check (task in (
    'ocr','grammar-correction','content-summary','study-organize',
    'focus-plan-review','study-recommendation','guardian-summary','weekly-report'
  ));

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
  if p_task not in (
    'ocr','grammar-correction','content-summary','study-organize',
    'focus-plan-review','study-recommendation','guardian-summary','weekly-report'
  ) then raise exception 'unsupported AI task'; end if;
  request_limit:=case when p_task in (
    'content-summary','study-organize','focus-plan-review','study-recommendation','guardian-summary','weekly-report'
  ) then 6 else 12 end;
  perform pg_advisory_xact_lock(hashtextextended('ai-writing:'||current_user_id::text||':'||p_task,0));
  select request_count,window_started_at into current_count,current_window
  from public.ai_rate_limits where user_id=current_user_id and task=p_task;
  if current_window is null or current_window<=now()-interval '1 minute' then
    insert into public.ai_rate_limits(user_id,task,window_started_at,request_count,updated_at)
    values(current_user_id,p_task,now(),1,now())
    on conflict(user_id,task) do update
      set window_started_at=excluded.window_started_at,request_count=1,updated_at=now();
    return true;
  end if;
  if current_count<request_limit then
    update public.ai_rate_limits set request_count=request_count+1,updated_at=now()
    where user_id=current_user_id and task=p_task;
    allowed:=true;
  end if;
  return allowed;
end;
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
        'ai-focus-coach','ai-study-recommendation','ai-weekly-report'
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

revoke all on function public.consume_ai_task_rate_limit(text) from public,anon;
revoke all on function public.has_effective_membership_entitlement(uuid,text) from public,anon;
revoke all on function public.get_effective_membership(uuid) from public,anon;
grant execute on function public.consume_ai_task_rate_limit(text) to authenticated;
grant execute on function public.has_effective_membership_entitlement(uuid,text) to authenticated,service_role;
grant execute on function public.get_effective_membership(uuid) to authenticated,service_role;
