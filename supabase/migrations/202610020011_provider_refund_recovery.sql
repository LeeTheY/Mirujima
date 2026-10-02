-- Refund recovery reuses wallet request metadata and existing posted ledger rows.
-- No new table/column. Dispatch state is durable before any provider cancellation.

create or replace function public.reserve_latest_topup_refund(
  p_user_id uuid,
  p_idempotency_key text,
  p_points bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  prior public.wallet_transactions%rowtype;
  confirmation public.wallet_transactions%rowtype;
  request_row public.wallet_transactions%rowtype;
  settlement public.wallet_transactions%rowtype;
  available bigint;
  original_order_id text;
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  if coalesce((select role from public.profiles where id=p_user_id),'') <> 'guardian' then raise exception 'guardian role required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then raise exception 'invalid idempotency key'; end if;
  if p_points is null or p_points <= 0 or p_points > 300000 then raise exception 'invalid refund amount'; end if;

  perform pg_advisory_xact_lock(hashtextextended('topup-refund:'||p_user_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('wallet:'||p_user_id::text,0));

  select * into prior from public.wallet_transactions where idempotency_key=p_idempotency_key;
  if prior.id is not null then
    if prior.kind <> 'topup_refund_requested' or prior.from_user_id <> p_user_id or prior.points <> p_points then
      raise exception 'idempotency key mismatch';
    end if;
    select * into settlement
    from public.wallet_transactions
    where related_transaction_id=prior.id and kind in ('topup_refunded','topup_refund_rejected');
    if settlement.kind='topup_refunded' then
      return jsonb_build_object('status','refunded','refundRequestId',prior.id,'points',prior.points,'sandbox',settlement.metadata->'sandbox','actualRefund',settlement.metadata->'actualRefund','balances',public.get_wallet_balances(p_user_id));
    end if;
    if settlement.kind='topup_refund_rejected' then
      return jsonb_build_object('status','rejected','refundRequestId',prior.id,'points',prior.points,'balances',public.get_wallet_balances(p_user_id));
    end if;
    return jsonb_build_object('status','reserved','refundRequestId',prior.id,'paymentKey',prior.provider_payment_key,'points',prior.points,'originalOrderId',prior.metadata->>'originalOrderId','originalAmount',prior.metadata->'originalTopupPoints','refundMode',prior.metadata->>'refundMode','dispatched',coalesce((prior.metadata->>'providerDispatched')::boolean,false),'providerSnapshot',prior.metadata->'providerSnapshot');
  end if;

  if exists (select 1 from public.wallet_transactions r where r.from_user_id=p_user_id and r.kind='topup_refund_requested' and r.status='posted' and not exists (select 1 from public.wallet_transactions s where s.related_transaction_id=r.id and s.kind in ('topup_refunded','topup_refund_rejected'))) then raise exception 'unresolved refund exists'; end if;

  available := coalesce((public.get_wallet_balances(p_user_id)->>'topupAvailable')::bigint,0);
  if p_points > available then raise exception 'refund exceeds available topup'; end if;

  select confirmed.* into confirmation
  from public.wallet_transactions confirmed
  where confirmed.kind='topup_confirmed'
    and confirmed.status='posted'
    and confirmed.to_user_id=p_user_id
    and confirmed.provider='toss'
    and confirmed.provider_payment_key is not null
    and confirmed.points - coalesce((
      select sum(refund_request.points)
      from public.wallet_transactions refund_request
      where refund_request.kind='topup_refund_requested'
        and refund_request.related_transaction_id=confirmed.id
        and not exists (
          select 1 from public.wallet_transactions rejected
          where rejected.related_transaction_id=refund_request.id
            and rejected.kind='topup_refund_rejected'
        )
    ),0) >= p_points
  order by confirmed.created_at desc
  limit 1
  for update of confirmed;

  if confirmation.id is null then raise exception 'refundable topup not found'; end if;

  original_order_id := coalesce(confirmation.provider_order_id,(select o.provider_order_id from public.wallet_transactions o where o.id=confirmation.related_transaction_id and o.kind='topup_requested' and o.to_user_id=p_user_id and o.provider_payment_key=confirmation.provider_payment_key and o.krw_amount=confirmation.krw_amount));

  insert into public.wallet_transactions(
    kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,krw_amount,
    related_transaction_id,provider,provider_payment_key,idempotency_key,metadata
  ) values (
    'topup_refund_requested','posted',p_user_id,p_user_id,'topup','refund_reserved',p_points,p_points,
    confirmation.id,'toss',confirmation.provider_payment_key,p_idempotency_key,
    jsonb_build_object('originalTopupId',confirmation.id,'originalTopupPoints',confirmation.points,'refundContractVersion',3,'originalOrderId',original_order_id)
  ) returning * into request_row;

  return jsonb_build_object(
    'status','reserved',
    'refundRequestId',request_row.id,
    'paymentKey',request_row.provider_payment_key,
    'points',request_row.points,
    'originalOrderId',original_order_id,'originalAmount',confirmation.krw_amount,'dispatched',false
  );
end; $$;


create or replace function public.prepare_topup_refund(p_user_id uuid,p_refund_request_id uuid,p_mode text,p_provider_snapshot jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.wallet_transactions%rowtype; original public.wallet_transactions%rowtype; dispatched boolean;
begin
  if p_mode is null or p_mode not in ('sandbox','provider_test') then raise exception 'invalid refund mode'; end if;
  perform pg_advisory_xact_lock(hashtextextended('topup-refund-request:'||coalesce(p_refund_request_id::text,''),0));
  select * into r from public.wallet_transactions where id=p_refund_request_id for update;
  if p_user_id is null or r.id is null or r.from_user_id<>p_user_id or r.kind<>'topup_refund_requested' then raise exception 'refund request not found'; end if;
  if exists(select 1 from public.wallet_transactions where related_transaction_id=r.id and kind in ('topup_refunded','topup_refund_rejected')) then raise exception 'refund already settled'; end if;
  if r.metadata->>'refundMode' is not null and r.metadata->>'refundMode'<>p_mode then raise exception 'refund mode mismatch'; end if;
  if coalesce((r.metadata->>'refundContractVersion')::int,1)<3 and p_mode='provider_test' then raise exception 'legacy refund requires review'; end if;
  dispatched:=coalesce((r.metadata->>'providerDispatched')::boolean,false);
  if dispatched then return jsonb_build_object('canDispatch',false,'providerSnapshot',r.metadata->'providerSnapshot'); end if;
  if p_mode='provider_test' then
    select * into original from public.wallet_transactions where id=r.related_transaction_id;
    if original.id is null or original.kind<>'topup_confirmed' or original.status<>'posted' or original.to_user_id<>p_user_id or original.provider_payment_key<>r.provider_payment_key or r.metadata->>'originalOrderId' is null or original.points<>original.krw_amount then raise exception 'invalid original payment'; end if;
    if p_provider_snapshot is null or jsonb_typeof(p_provider_snapshot->'transactionKeys') is distinct from 'array' or coalesce((p_provider_snapshot->>'balanceAmount')::bigint,-1)<r.points or (p_provider_snapshot->>'balanceAmount')::bigint>original.krw_amount then raise exception 'invalid provider snapshot'; end if;
    update public.wallet_transactions set metadata=metadata||jsonb_build_object('refundMode',p_mode,'providerSnapshot',p_provider_snapshot,'providerDispatched',true,'providerDispatchedAt',clock_timestamp()),updated_at=clock_timestamp() where id=r.id;
  else
    update public.wallet_transactions set metadata=metadata||jsonb_build_object('refundMode',p_mode),updated_at=clock_timestamp() where id=r.id;
  end if;
  return jsonb_build_object('canDispatch',p_mode='provider_test','providerSnapshot',p_provider_snapshot);
end; $$;

create or replace function public.complete_topup_refund(p_user_id uuid,p_refund_request_id uuid,p_provider_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.wallet_transactions%rowtype; s public.wallet_transactions%rowtype; mode text; tx text;
begin
  perform pg_advisory_xact_lock(hashtextextended('topup-refund-request:'||coalesce(p_refund_request_id::text,''),0));
  select * into r from public.wallet_transactions where id=p_refund_request_id for update;
  if p_user_id is null or r.id is null or r.kind<>'topup_refund_requested' or r.from_user_id<>p_user_id then raise exception 'refund request not found'; end if;
  select * into s from public.wallet_transactions where related_transaction_id=r.id and kind in ('topup_refunded','topup_refund_rejected');
  if s.id is not null then
    if s.kind<>'topup_refunded' then raise exception 'refund already rejected'; end if;
    return jsonb_build_object('status','refunded','refundRequestId',r.id,'points',r.points,'sandbox',s.metadata->'sandbox','actualRefund',s.metadata->'actualRefund','balances',public.get_wallet_balances(p_user_id));
  end if;
  mode:=r.metadata->>'refundMode';
  if p_provider_payload is null or p_provider_payload->>'paymentKey' is distinct from r.provider_payment_key or coalesce((p_provider_payload->>'cancelAmount')::bigint,-1)<>r.krw_amount then raise exception 'provider refund incomplete'; end if;
  if mode='provider_test' then
    tx:=p_provider_payload->>'transactionKey';
    if r.metadata->>'providerDispatched' is distinct from 'true' or p_provider_payload->>'status' is null or p_provider_payload->>'status' not in ('CANCELED','PARTIALLY_CANCELED') or p_provider_payload->>'actualRefund' is distinct from 'true' or p_provider_payload->>'sandbox' is distinct from 'false' or p_provider_payload->>'providerMode' is distinct from 'provider_test' or p_provider_payload->>'refundRequestId' is distinct from r.id::text or p_provider_payload->>'cancelReason' is distinct from ('Mirujima refund '||r.id::text) or tx is null or length(tx) not between 1 and 64 or (r.metadata->'providerSnapshot'->'transactionKeys') ? tx then raise exception 'provider refund incomplete'; end if;
    perform pg_advisory_xact_lock(hashtextextended('refund-provider-transaction:'||tx,0));
    if exists(select 1 from public.wallet_transactions where kind='topup_refunded' and metadata->>'transactionKey'=tx) then raise exception 'refund transaction already used'; end if;
  elsif mode='sandbox' or (mode is null and coalesce((r.metadata->>'refundContractVersion')::int,1)<3) then
    if p_provider_payload->>'status' is distinct from 'CANCELED' or p_provider_payload->>'sandbox' is distinct from 'true' or p_provider_payload->>'actualRefund' is distinct from 'false' then raise exception 'sandbox refund required'; end if;
  else raise exception 'refund mode required'; end if;
  insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,krw_amount,related_transaction_id,provider,provider_payment_key,idempotency_key,metadata)
  values('topup_refunded','posted',p_user_id,null,'refund_reserved','external',r.points,r.krw_amount,r.id,'toss',r.provider_payment_key,'topup-refunded:'||r.id,p_provider_payload);
  return jsonb_build_object('status','refunded','refundRequestId',r.id,'points',r.points,'sandbox',p_provider_payload->'sandbox','actualRefund',p_provider_payload->'actualRefund','balances',public.get_wallet_balances(p_user_id));
end; $$;

create or replace function public.reject_topup_refund(p_user_id uuid,p_refund_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.wallet_transactions%rowtype; s public.wallet_transactions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('topup-refund-request:'||coalesce(p_refund_request_id::text,''),0));
  select * into r from public.wallet_transactions where id=p_refund_request_id for update;
  if p_user_id is null or r.id is null or r.kind<>'topup_refund_requested' or r.from_user_id<>p_user_id then raise exception 'refund request not found'; end if;
  select * into s from public.wallet_transactions where related_transaction_id=r.id and kind in ('topup_refunded','topup_refund_rejected');
  if s.id is null then
    if r.metadata->>'providerDispatched'='true' then raise exception 'dispatched refund requires reconciliation'; end if;
    insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,krw_amount,related_transaction_id,provider,provider_payment_key,idempotency_key,metadata)
    values('topup_refund_rejected','posted',p_user_id,p_user_id,'refund_reserved','topup',r.points,r.krw_amount,r.id,'toss',r.provider_payment_key,'topup-refund-rejected:'||r.id,'{}');
  end if;
  return jsonb_build_object('status',case when s.kind='topup_refunded' then 'refunded' else 'rejected' end,'refundRequestId',r.id,'points',r.points,'balances',public.get_wallet_balances(p_user_id));
end; $$;

revoke all on function public.prepare_topup_refund(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_topup_refund(uuid,uuid,text,jsonb) to service_role;
-- Existing reserve/complete/reject grants remain service-only through CREATE OR REPLACE.
