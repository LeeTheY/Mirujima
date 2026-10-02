-- Allow provider-live receipts only through the same locked, idempotent refund boundary.
-- The Edge Function additionally requires the server-only live activation switch.
-- Existing sandbox/provider_test reservations retain their original mode.
create or replace function public.prepare_topup_refund(p_user_id uuid,p_refund_request_id uuid,p_mode text,p_provider_snapshot jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.wallet_transactions%rowtype; original public.wallet_transactions%rowtype; dispatched boolean;
begin
  if p_mode is null or p_mode not in ('sandbox','provider_test','provider_live') then raise exception 'invalid refund mode'; end if;
  perform pg_advisory_xact_lock(hashtextextended('topup-refund-request:'||coalesce(p_refund_request_id::text,''),0));
  select * into r from public.wallet_transactions where id=p_refund_request_id for update;
  if p_user_id is null or r.id is null or r.from_user_id<>p_user_id or r.kind<>'topup_refund_requested' then raise exception 'refund request not found'; end if;
  if exists(select 1 from public.wallet_transactions where related_transaction_id=r.id and kind in ('topup_refunded','topup_refund_rejected')) then raise exception 'refund already settled'; end if;
  if r.metadata->>'refundMode' is not null and r.metadata->>'refundMode'<>p_mode then raise exception 'refund mode mismatch'; end if;
  if coalesce((r.metadata->>'refundContractVersion')::int,1)<3 and p_mode in ('provider_test','provider_live') then raise exception 'legacy refund requires review'; end if;
  dispatched:=coalesce((r.metadata->>'providerDispatched')::boolean,false);
  if dispatched then return jsonb_build_object('canDispatch',false,'providerSnapshot',r.metadata->'providerSnapshot'); end if;
  if p_mode in ('provider_test','provider_live') then
    select * into original from public.wallet_transactions where id=r.related_transaction_id;
    if original.id is null or original.kind<>'topup_confirmed' or original.status<>'posted' or original.to_user_id<>p_user_id or original.provider_payment_key<>r.provider_payment_key or r.metadata->>'originalOrderId' is null or original.points<>original.krw_amount then raise exception 'invalid original payment'; end if;
    if p_provider_snapshot is null or jsonb_typeof(p_provider_snapshot->'transactionKeys') is distinct from 'array' or coalesce((p_provider_snapshot->>'balanceAmount')::bigint,-1)<r.points or (p_provider_snapshot->>'balanceAmount')::bigint>original.krw_amount then raise exception 'invalid provider snapshot'; end if;
    update public.wallet_transactions set metadata=metadata||jsonb_build_object('refundMode',p_mode,'providerSnapshot',p_provider_snapshot,'providerDispatched',true,'providerDispatchedAt',clock_timestamp()),updated_at=clock_timestamp() where id=r.id;
  else
    update public.wallet_transactions set metadata=metadata||jsonb_build_object('refundMode',p_mode),updated_at=clock_timestamp() where id=r.id;
  end if;
  return jsonb_build_object('canDispatch',p_mode in ('provider_test','provider_live'),'providerSnapshot',p_provider_snapshot);
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
  if mode in ('provider_test','provider_live') then
    tx:=p_provider_payload->>'transactionKey';
    if r.metadata->>'providerDispatched' is distinct from 'true' or p_provider_payload->>'status' is null or p_provider_payload->>'status' not in ('CANCELED','PARTIALLY_CANCELED') or p_provider_payload->>'actualRefund' is distinct from 'true' or p_provider_payload->>'sandbox' is distinct from 'false' or p_provider_payload->>'providerMode' is distinct from mode or p_provider_payload->>'refundRequestId' is distinct from r.id::text or p_provider_payload->>'cancelReason' is distinct from ('Mirujima refund '||r.id::text) or tx is null or length(tx) not between 1 and 64 or (r.metadata->'providerSnapshot'->'transactionKeys') ? tx then raise exception 'provider refund incomplete'; end if;
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
