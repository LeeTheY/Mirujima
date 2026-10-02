-- Additive recovery flags on existing claims. No new table or posted ledger
-- mutation; provider DONE must still be validated by the test-only Edge path.
create or replace function public.claim_topup_payment(p_user_id uuid,p_order_id text,p_payment_key text,p_callback_amount bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare request_row public.wallet_transactions%rowtype; confirmation_id uuid;
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  if p_order_id is null or p_order_id !~ '^[A-Za-z0-9_-]{6,64}$' then raise exception 'invalid topup order id'; end if;
  if p_payment_key is null or length(p_payment_key) not between 6 and 200 then raise exception 'invalid payment key'; end if;
  if p_callback_amount is null or p_callback_amount <= 0 then raise exception 'invalid callback amount'; end if;
  perform pg_advisory_xact_lock(hashtextextended('topup-order:'||p_order_id,0));
  select * into request_row from public.wallet_transactions where provider_order_id=p_order_id and kind='topup_requested' for update;
  if request_row.id is null or request_row.to_user_id<>p_user_id then raise exception 'topup order not found'; end if;
  if request_row.krw_amount<>p_callback_amount then raise exception 'topup amount mismatch'; end if;
  if request_row.provider_payment_key is not null and request_row.provider_payment_key<>p_payment_key then raise exception 'payment key mismatch'; end if;
  if exists(select 1 from public.wallet_transactions where kind='topup_requested' and provider_payment_key=p_payment_key and id<>request_row.id) then raise exception 'payment key already claimed'; end if;
  select id into confirmation_id from public.wallet_transactions where related_transaction_id=request_row.id and kind='topup_confirmed' and status='posted';
  if confirmation_id is not null then return jsonb_build_object('status','confirmed','requestId',request_row.id,'points',request_row.points); end if;
  if request_row.status='failed' then
    if request_row.provider_payment_key is null then raise exception 'topup order failed'; end if;
    return jsonb_build_object('status','confirming','requestId',request_row.id,'points',request_row.points,'reconciliationRequired',true,'reconciliationOnly',true);
  end if;
  if request_row.status not in ('pending','confirming') then raise exception 'topup order is not confirmable'; end if;
  update public.wallet_transactions set status='confirming',provider_payment_key=p_payment_key,updated_at=clock_timestamp() where id=request_row.id;
  return jsonb_build_object('status','confirming','requestId',request_row.id,'points',request_row.points,'reconciliationRequired',request_row.status='confirming','reconciliationOnly',false);
end; $$;

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
  if payment_order.status not in ('pending','confirming') then raise exception 'payment order is not confirmable'; end if;
  update public.membership_payment_orders set status='confirming',payment_key=p_payment_key,updated_at=clock_timestamp() where id=payment_order.id;
  return jsonb_build_object('status','confirming','orderId',payment_order.order_id,'amount',payment_order.amount_krw,'reconciliationRequired',payment_order.status='confirming','reconciliationOnly',false);
end; $$;

create or replace function public.fail_topup_payment(p_user_id uuid,p_order_id text,p_failure_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('topup-order:'||coalesce(p_order_id,''),0));
  update public.wallet_transactions t set status='failed',metadata=metadata||jsonb_build_object('failureCode',left(coalesce(p_failure_code,'unknown'),80)),updated_at=clock_timestamp()
  where t.provider_order_id=p_order_id and t.kind='topup_requested' and t.to_user_id=p_user_id and t.status in ('pending','confirming')
    and not exists(select 1 from public.wallet_transactions posted where posted.related_transaction_id=t.id and posted.kind='topup_confirmed' and posted.status='posted');
  return jsonb_build_object('status','failed');
end; $$;

revoke all on function public.claim_topup_payment(uuid,text,text,bigint) from public,anon,authenticated;
revoke all on function public.claim_membership_payment(uuid,text,text,bigint) from public,anon,authenticated;
revoke all on function public.fail_topup_payment(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_topup_payment(uuid,text,text,bigint) to service_role;
grant execute on function public.claim_membership_payment(uuid,text,text,bigint) to service_role;
grant execute on function public.fail_topup_payment(uuid,text,text) to service_role;

-- Existing pending order rows hold canonical state; never persist a payment
-- key in the browser merely to resume a lost response.
create or replace function public.create_topup_payment_order(p_user_id uuid,p_points bigint,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.wallet_transactions%rowtype; order_id text; order_status text;
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  if p_points is null or p_points not in (10000,30000,50000,100000,150000,300000) then raise exception 'unsupported topup amount'; end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9._:-]{8,200}$' then raise exception 'invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended('topup:'||p_user_id::text,0));
  select * into prior from public.wallet_transactions where idempotency_key=p_idempotency_key;
  if prior.id is not null then
    if prior.kind<>'topup_requested' or prior.to_user_id<>p_user_id or prior.points<>p_points then raise exception 'idempotency key mismatch'; end if;
    order_status:=case
      when exists(select 1 from public.wallet_transactions where related_transaction_id=prior.id and kind='topup_confirmed' and status='posted') then 'confirmed'
      when prior.status='failed' and (prior.provider_payment_key is null or prior.metadata->>'failureCode' in ('TOSS_PAYMENT_ABORTED','TOSS_PAYMENT_EXPIRED')) then 'failed'
      when prior.status='failed' then 'needs_review'
      else prior.status end;
    return jsonb_build_object('orderId',prior.provider_order_id,'amount',prior.krw_amount,'points',prior.points,'orderName',prior.metadata->>'orderName','status',order_status);
  end if;
  order_id:='mirujima_topup_'||replace(gen_random_uuid()::text,'-','');
  insert into public.wallet_transactions(kind,status,to_user_id,from_bucket,to_bucket,points,krw_amount,provider,provider_order_id,idempotency_key,metadata)
  values('topup_requested','pending',p_user_id,'external','topup',p_points,p_points,'toss',order_id,p_idempotency_key,jsonb_build_object('orderName','Mirujima '||to_char(p_points,'FM999,999,999')||'P 충전','sandbox',true)) returning * into prior;
  return jsonb_build_object('orderId',order_id,'amount',p_points,'points',p_points,'orderName',prior.metadata->>'orderName','status','pending');
end; $$;
revoke all on function public.create_topup_payment_order(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.create_topup_payment_order(uuid,bigint,text) to service_role;

create or replace function public.cancel_pending_topup_order(p_order_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); request_row public.wallet_transactions%rowtype;
begin
  if caller is null then raise exception 'authentication required'; end if;
  if p_order_id is null or p_order_id !~ '^[A-Za-z0-9_-]{6,64}$' then raise exception 'invalid topup order id'; end if;
  perform pg_advisory_xact_lock(hashtextextended('topup-order:'||coalesce(p_order_id,''),0));
  select * into request_row from public.wallet_transactions where provider_order_id=p_order_id and kind='topup_requested' and to_user_id=caller for update;
  if request_row.id is null then raise exception 'topup order not found'; end if;
  if request_row.status='failed' and request_row.provider_payment_key is null then return jsonb_build_object('status','cancelled','orderId',p_order_id); end if;
  if request_row.status<>'pending' or request_row.provider_payment_key is not null then raise exception 'topup order requires reconciliation'; end if;
  if exists(select 1 from public.wallet_transactions where related_transaction_id=request_row.id and kind='topup_confirmed' and status='posted') then raise exception 'topup order requires reconciliation'; end if;
  update public.wallet_transactions set status='failed',metadata=metadata||jsonb_build_object('failureCode','PAY_PROCESS_CANCELED'),updated_at=clock_timestamp() where id=request_row.id;
  return jsonb_build_object('status','cancelled','orderId',p_order_id);
end; $$;
revoke all on function public.cancel_pending_topup_order(text) from public,anon;
grant execute on function public.cancel_pending_topup_order(text) to authenticated;
