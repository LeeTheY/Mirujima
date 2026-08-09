alter table public.wallet_transactions drop constraint wallet_transactions_status_check;
alter table public.wallet_transactions add constraint wallet_transactions_status_check
  check (status in ('pending', 'confirming', 'posted', 'failed'));

create unique index if not exists wallet_transactions_provider_order_unique
  on public.wallet_transactions(provider_order_id) where provider_order_id is not null;
create unique index if not exists wallet_transactions_one_topup_confirmation
  on public.wallet_transactions(related_transaction_id) where kind = 'topup_confirmed';

create or replace function public.get_wallet_balances(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare topup_available bigint; earned_available bigint; cashout_reserved bigint; cashout_completed bigint;
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  select
    coalesce(sum(case when to_user_id=p_user_id and to_bucket='topup' then points else 0 end),0)-coalesce(sum(case when from_user_id=p_user_id and from_bucket='topup' then points else 0 end),0),
    coalesce(sum(case when to_user_id=p_user_id and to_bucket='earned' then points else 0 end),0)-coalesce(sum(case when from_user_id=p_user_id and from_bucket='earned' then points else 0 end),0),
    coalesce(sum(case when to_user_id=p_user_id and to_bucket='cashout_reserved' then points else 0 end),0)-coalesce(sum(case when from_user_id=p_user_id and from_bucket='cashout_reserved' then points else 0 end),0),
    coalesce(sum(case when from_user_id=p_user_id and kind='cashout_completed' then points else 0 end),0)
  into topup_available, earned_available, cashout_reserved, cashout_completed
  from public.wallet_transactions where status='posted' and (from_user_id=p_user_id or to_user_id=p_user_id);
  return jsonb_build_object('topupAvailable',topup_available,'earnedAvailable',earned_available,'cashoutReserved',cashout_reserved,'cashoutCompleted',cashout_completed);
end; $$;

create or replace function public.create_topup_payment_order(p_user_id uuid,p_points bigint,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.wallet_transactions%rowtype; row_value public.wallet_transactions%rowtype; order_id text;
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  if p_points not in (10000,30000,50000,100000,150000) then raise exception 'unsupported topup amount'; end if;
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

create or replace function public.claim_topup_payment(p_user_id uuid,p_order_id text,p_payment_key text,p_callback_amount bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare request_row public.wallet_transactions%rowtype; confirmation_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('topup-order:'||coalesce(p_order_id,''),0));
  select * into request_row from public.wallet_transactions where provider_order_id=p_order_id and kind='topup_requested' for update;
  if request_row.id is null or request_row.to_user_id<>p_user_id then raise exception 'topup order not found'; end if;
  if request_row.krw_amount<>p_callback_amount then raise exception 'topup amount mismatch'; end if;
  if request_row.provider_payment_key is not null and request_row.provider_payment_key<>p_payment_key then raise exception 'payment key mismatch'; end if;
  select id into confirmation_id from public.wallet_transactions where related_transaction_id=request_row.id and kind='topup_confirmed';
  if confirmation_id is not null then return jsonb_build_object('status','confirmed','requestId',request_row.id,'points',request_row.points); end if;
  if request_row.status='failed' then raise exception 'topup order failed'; end if;
  update public.wallet_transactions set status='confirming',provider_payment_key=p_payment_key,updated_at=now() where id=request_row.id;
  return jsonb_build_object('status','confirming','requestId',request_row.id,'points',request_row.points);
end; $$;

create or replace function public.confirm_toss_topup_payment(p_user_id uuid,p_order_id text,p_payment_key text,p_provider_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare request_row public.wallet_transactions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('topup-order:'||coalesce(p_order_id,''),0));
  select * into request_row from public.wallet_transactions where provider_order_id=p_order_id and kind='topup_requested' for update;
  if request_row.id is null or request_row.to_user_id<>p_user_id or request_row.provider_payment_key<>p_payment_key then raise exception 'topup confirmation mismatch'; end if;
  if p_provider_payload->>'status'<>'DONE' then raise exception 'provider payment incomplete'; end if;
  insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,krw_amount,related_transaction_id,provider,provider_order_id,provider_payment_key,idempotency_key,metadata)
  values('topup_confirmed','posted',null,p_user_id,'external','topup',request_row.points,request_row.krw_amount,request_row.id,'toss',null,p_payment_key,'topup-confirmed:'||p_order_id,p_provider_payload)
  on conflict (idempotency_key) do nothing;
  return jsonb_build_object('status','confirmed','points',request_row.points,'balances',public.get_wallet_balances(p_user_id));
end; $$;

create or replace function public.fail_topup_payment(p_user_id uuid,p_order_id text,p_failure_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  update public.wallet_transactions set status='failed',metadata=metadata||jsonb_build_object('failureCode',left(coalesce(p_failure_code,'unknown'),80)),updated_at=now()
  where provider_order_id=p_order_id and kind='topup_requested' and to_user_id=p_user_id and status in ('pending','confirming');
  return jsonb_build_object('status','failed');
end; $$;

revoke all on function public.create_topup_payment_order(uuid,bigint,text) from public,anon,authenticated;
revoke all on function public.claim_topup_payment(uuid,text,text,bigint) from public,anon,authenticated;
revoke all on function public.confirm_toss_topup_payment(uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.fail_topup_payment(uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_topup_payment_order(uuid,bigint,text) to service_role;
grant execute on function public.claim_topup_payment(uuid,text,text,bigint) to service_role;
grant execute on function public.confirm_toss_topup_payment(uuid,text,text,jsonb) to service_role;
grant execute on function public.fail_topup_payment(uuid,text,text) to service_role;
