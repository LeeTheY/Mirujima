-- Extend the existing Toss sandbox order contract without changing posted ledger rows.
create or replace function public.create_topup_payment_order(p_user_id uuid,p_points bigint,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  prior public.wallet_transactions%rowtype;
  row_value public.wallet_transactions%rowtype;
  order_id text;
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  if p_points not in (10000,30000,50000,100000,150000,300000) then raise exception 'unsupported topup amount'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then raise exception 'invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended('topup:'||p_user_id::text,0));
  select * into prior from public.wallet_transactions where idempotency_key=p_idempotency_key;
  if prior.id is not null then
    if prior.kind<>'topup_requested' or prior.to_user_id<>p_user_id or prior.points<>p_points then raise exception 'idempotency key mismatch'; end if;
    return jsonb_build_object('orderId',prior.provider_order_id,'amount',prior.krw_amount,'points',prior.points,'orderName',prior.metadata->>'orderName');
  end if;
  order_id := 'mirujima_topup_'||replace(gen_random_uuid()::text,'-','');
  insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,krw_amount,provider,provider_order_id,idempotency_key,metadata)
  values('topup_requested','pending',null,p_user_id,'external','topup',p_points,p_points,'toss',order_id,p_idempotency_key,
    jsonb_build_object('orderName','Mirujima '||to_char(p_points,'FM999,999,999')||'P 충전','sandbox',true)) returning * into row_value;
  return jsonb_build_object('orderId',order_id,'amount',p_points,'points',p_points,'orderName',row_value.metadata->>'orderName');
end; $$;

revoke all on function public.create_topup_payment_order(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.create_topup_payment_order(uuid,bigint,text) to service_role;

-- A guardian can identify active students by name without receiving raw activity or profile rows.
create or replace function public.get_guardian_linked_students()
returns table(student_user_id uuid, display_name text, linked_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if coalesce((select role from public.profiles where id=current_user_id),'') <> 'guardian' then
    raise exception 'guardian role required';
  end if;
  return query
    select links.student_user_id, coalesce(nullif(trim(profiles.display_name),''),'이름 미설정'), links.linked_at
    from public.family_links links
    join public.profiles profiles on profiles.id=links.student_user_id
    where links.guardian_user_id=current_user_id and links.status='active'
    order by profiles.display_name nulls last, links.student_user_id;
end; $$;

revoke all on function public.get_guardian_linked_students() from public,anon;
grant execute on function public.get_guardian_linked_students() to authenticated;
