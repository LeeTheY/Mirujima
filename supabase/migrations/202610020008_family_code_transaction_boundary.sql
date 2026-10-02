-- Independent family-code boundary hardening. Reuses profiles and family_links;
-- financial approval policy 0007 is not required for code expiry/cancel behavior.
-- Lock order: focus-start(student) -> family-redeem(student) -> family-issue(guardian) -> row.
-- Edge Functions continue to authenticate and authorize roles before service-only RPCs.
create or replace function public.issue_family_link_code(p_actor_user_id uuid, p_code_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  link_id uuid;
  expires_at timestamptz;
  issued_at timestamptz;
  active_students integer;
  seat_capacity integer:=2;
begin
  if p_actor_user_id is null then raise exception 'authentication required'; end if;
  if p_code_hash is null or p_code_hash!~'^[0-9a-f]{64}$' then raise exception 'invalid code hash'; end if;
  perform pg_advisory_xact_lock(hashtextextended('family-issue:'||p_actor_user_id::text,0));
  issued_at:=clock_timestamp();
  select count(*)::integer into active_students from public.family_links where guardian_user_id=p_actor_user_id and status='active';
  select included_student_seats+extra_student_seats into seat_capacity from public.memberships
    where user_id=p_actor_user_id and product_code='guardian_family' and status='active' and current_period_ends_at>clock_timestamp();
  seat_capacity:=coalesce(seat_capacity,2);
  if active_students>=5 then raise exception 'family seat limit reached'; end if;
  if active_students>=seat_capacity then raise exception 'family seat required'; end if;
  if (select count(*) from public.family_links where issuer_user_id=p_actor_user_id and created_at>issued_at-interval '10 minutes')>=5 then raise exception 'family code issue rate limit exceeded'; end if;
  update public.family_links set status='revoked',code_hash=null,code_expires_at=null,updated_at=now() where issuer_user_id=p_actor_user_id and status='pending';
  issued_at:=clock_timestamp();
  expires_at:=issued_at+interval '5 minutes';
  insert into public.family_links(student_user_id,guardian_user_id,issuer_user_id,issuer_role,status,code_hash,code_expires_at,created_at,updated_at)
  values(null,p_actor_user_id,p_actor_user_id,'guardian','pending',p_code_hash,expires_at,issued_at,issued_at) returning id into link_id;
  return jsonb_build_object('id',link_id,'status','pending','codeExpiresAt',expires_at,'serverNow',clock_timestamp(),'seatCapacity',seat_capacity,'activeStudentCount',active_students,
    'event',jsonb_build_object('kind','family_link_code_issued','recipientUserId',p_actor_user_id));
end;
$$;

create or replace function public.redeem_family_link_code(p_actor_user_id uuid, p_code_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  pending_link public.family_links%rowtype;
  guardian_id uuid;
  checked_at timestamptz;
  active_students integer;
  seat_capacity integer:=2;
  guardian_family_active boolean:=false;
begin
  if p_actor_user_id is null then raise exception 'authentication required'; end if;
  if p_code_hash is null or p_code_hash!~'^[0-9a-f]{64}$' then raise exception 'invalid code hash'; end if;
  perform pg_advisory_xact_lock(hashtextextended('focus-start:'||p_actor_user_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('family-redeem:'||p_actor_user_id::text,0));
  if exists(select 1 from public.profiles where id=p_actor_user_id and family_redeem_locked_until>clock_timestamp()) then
    return jsonb_build_object('status','locked','lockedUntil',(select family_redeem_locked_until from public.profiles where id=p_actor_user_id),'serverNow',clock_timestamp());
  end if;
  -- Identify issuer without holding the pending row before the guardian mutex.
  select guardian_user_id into guardian_id from public.family_links where status='pending' and issuer_role='guardian' and code_hash=p_code_hash;
  if guardian_id is null then return public.consume_family_redeem_failure(p_actor_user_id); end if;
  perform pg_advisory_xact_lock(hashtextextended('family-issue:'||guardian_id::text,0));
  select * into pending_link from public.family_links where status='pending' and issuer_role='guardian' and code_hash=p_code_hash for update;
  checked_at:=clock_timestamp();
  if not found or pending_link.code_expires_at<=checked_at then
    if found then update public.family_links set status='expired',code_hash=null,code_expires_at=null,updated_at=now() where id=pending_link.id; end if;
    return public.consume_family_redeem_failure(p_actor_user_id);
  end if;
  if pending_link.issuer_user_id=p_actor_user_id or pending_link.guardian_user_id is null then return public.consume_family_redeem_failure(p_actor_user_id); end if;
  if exists(select 1 from public.family_links where student_user_id=p_actor_user_id and status='active') then raise exception 'student already has an active guardian'; end if;
  select count(*)::integer into active_students from public.family_links where guardian_user_id=pending_link.guardian_user_id and status='active';
  select included_student_seats+extra_student_seats,true into seat_capacity,guardian_family_active from public.memberships
    where user_id=pending_link.guardian_user_id and product_code='guardian_family' and status='active' and current_period_ends_at>checked_at;
  seat_capacity:=coalesce(seat_capacity,2); guardian_family_active:=coalesce(guardian_family_active,false);
  if active_students>=5 then raise exception 'family seat limit reached'; end if;
  if active_students>=seat_capacity then raise exception 'family seat required'; end if;
  if guardian_family_active and exists(select 1 from public.memberships where user_id=p_actor_user_id and plan='premium' and product_code='student_premium' and status='active' and current_period_ends_at>checked_at) then raise exception 'student membership conflict'; end if;
  update public.family_links set student_user_id=p_actor_user_id,status='active',code_hash=null,code_expires_at=null,linked_at=checked_at,updated_at=now() where id=pending_link.id;
  update public.profiles set family_redeem_window_started_at=null,family_redeem_attempts=0,family_redeem_locked_until=null,updated_at=now() where id=p_actor_user_id;
  return jsonb_build_object('id',pending_link.id,'status','active','studentUserId',p_actor_user_id,'guardianUserId',pending_link.guardian_user_id,'linkedAt',checked_at,
    'membershipSource',case when guardian_family_active then 'guardian_family' else null end,
    'event',jsonb_build_object('kind','family_linked','studentUserId',p_actor_user_id,'guardianUserId',pending_link.guardian_user_id));
end;
$$;

create or replace function public.consume_family_redeem_failure(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window timestamptz;
  current_attempts integer;
  current_lock timestamptz;
  next_attempts integer;
  next_lock timestamptz;
  checked_at timestamptz;
begin
  select family_redeem_window_started_at, family_redeem_attempts, family_redeem_locked_until
  into current_window, current_attempts, current_lock
  from public.profiles where id = p_user_id for update;

  checked_at:=clock_timestamp();
  if current_lock is not null and current_lock > checked_at then
    return jsonb_build_object('status', 'locked', 'lockedUntil', current_lock,'serverNow',checked_at);
  end if;

  if current_window is null or current_window <= checked_at - interval '10 minutes' then
    current_window := checked_at;
    next_attempts := 1;
  else
    next_attempts := least(5, coalesce(current_attempts, 0) + 1);
  end if;
  next_lock := case when next_attempts >= 5 then checked_at + interval '10 minutes' else null end;

  update public.profiles set
    family_redeem_window_started_at = current_window,
    family_redeem_attempts = next_attempts,
    family_redeem_locked_until = next_lock,
    updated_at = checked_at
  where id = p_user_id;

  return jsonb_build_object(
    'status', case when next_lock is null then 'invalid' else 'locked' end,
    'attemptsRemaining', greatest(0, 5 - next_attempts),
    'lockedUntil', next_lock,
    'serverNow', checked_at
  );
end;
$$;

create or replace function public.cancel_family_link_code(p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := p_actor_user_id;
  cancelled_count integer;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('family-issue:'||current_user_id::text,0));
  update public.family_links set status = 'revoked', code_hash = null, code_expires_at = null, updated_at = clock_timestamp()
  where issuer_user_id = current_user_id and status = 'pending';
  get diagnostics cancelled_count = row_count;
  return jsonb_build_object('status', 'revoked', 'cancelledCount', cancelled_count);
end;
$$;



revoke all on function public.issue_family_link_code(uuid,text),public.redeem_family_link_code(uuid,text),public.cancel_family_link_code(uuid),public.consume_family_redeem_failure(uuid) from public,anon,authenticated;
grant execute on function public.issue_family_link_code(uuid,text),public.redeem_family_link_code(uuid,text),public.cancel_family_link_code(uuid) to service_role;
