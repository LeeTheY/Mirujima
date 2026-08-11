-- A topup refund cannot be represented as earned-point cashout: it must reserve
-- the guardian's topup balance, cancel the original Toss payment, then settle
-- the reserved amount to the external payment source.
alter table public.wallet_transactions drop constraint wallet_transactions_kind_check;
alter table public.wallet_transactions add constraint wallet_transactions_kind_check check (kind in (
  'topup_requested', 'topup_confirmed', 'self_deposit_reserved', 'self_deposit_earned',
  'self_deposit_returned', 'guardian_reward_requested', 'guardian_reward_declined',
  'guardian_deposit_reserved', 'guardian_reward_released', 'guardian_deposit_returned',
  'topup_refund_requested', 'topup_refunded', 'topup_refund_rejected',
  'cashout_requested', 'cashout_completed', 'cashout_rejected'
));

alter table public.wallet_transactions drop constraint wallet_transactions_from_bucket_check;
alter table public.wallet_transactions add constraint wallet_transactions_from_bucket_check
  check (from_bucket in ('topup', 'reserved', 'earned', 'cashout_reserved', 'refund_reserved', 'external'));
alter table public.wallet_transactions drop constraint wallet_transactions_to_bucket_check;
alter table public.wallet_transactions add constraint wallet_transactions_to_bucket_check
  check (to_bucket in ('topup', 'reserved', 'earned', 'cashout_reserved', 'refund_reserved', 'external'));

create unique index wallet_transactions_one_topup_refund_settlement_idx
  on public.wallet_transactions(related_transaction_id)
  where kind in ('topup_refunded', 'topup_refund_rejected');

create or replace function public.reserve_latest_topup_refund(p_user_id uuid, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  prior public.wallet_transactions%rowtype;
  confirmation public.wallet_transactions%rowtype;
  request_row public.wallet_transactions%rowtype;
  settlement public.wallet_transactions%rowtype;
  available bigint;
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  if coalesce((select role from public.profiles where id=p_user_id),'') <> 'guardian' then raise exception 'guardian role required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then raise exception 'invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended('topup-refund:'||p_user_id::text,0));

  select * into prior from public.wallet_transactions where idempotency_key=p_idempotency_key;
  if prior.id is not null then
    if prior.kind <> 'topup_refund_requested' or prior.from_user_id <> p_user_id then raise exception 'idempotency key mismatch'; end if;
    select * into settlement from public.wallet_transactions where related_transaction_id=prior.id and kind='topup_refunded';
    if settlement.id is not null then
      return jsonb_build_object('status','refunded','refundRequestId',prior.id,'points',prior.points,'balances',public.get_wallet_balances(p_user_id));
    end if;
    return jsonb_build_object('status','reserved','refundRequestId',prior.id,'paymentKey',prior.provider_payment_key,'points',prior.points);
  end if;

  available := coalesce((public.get_wallet_balances(p_user_id)->>'topupAvailable')::bigint,0);
  select confirmed.* into confirmation
  from public.wallet_transactions confirmed
  where confirmed.kind='topup_confirmed' and confirmed.status='posted' and confirmed.to_user_id=p_user_id
    and confirmed.provider='toss' and confirmed.provider_payment_key is not null
    and confirmed.points <= available
    and not exists (
      select 1 from public.wallet_transactions refund
      where refund.kind='topup_refund_requested' and refund.related_transaction_id=confirmed.id
    )
  order by confirmed.created_at desc
  limit 1 for update;
  if confirmation.id is null then raise exception 'refundable topup not found'; end if;

  insert into public.wallet_transactions(
    kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,krw_amount,
    related_transaction_id,provider,provider_payment_key,idempotency_key,metadata
  ) values (
    'topup_refund_requested','posted',p_user_id,p_user_id,'topup','refund_reserved',confirmation.points,confirmation.krw_amount,
    confirmation.id,'toss',confirmation.provider_payment_key,p_idempotency_key,jsonb_build_object('originalTopupId',confirmation.id)
  ) returning * into request_row;
  return jsonb_build_object('status','reserved','refundRequestId',request_row.id,'paymentKey',request_row.provider_payment_key,'points',request_row.points);
end; $$;

create or replace function public.complete_topup_refund(p_user_id uuid,p_refund_request_id uuid,p_provider_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare request_row public.wallet_transactions%rowtype; settlement public.wallet_transactions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('topup-refund-request:'||coalesce(p_refund_request_id::text,''),0));
  select * into request_row from public.wallet_transactions where id=p_refund_request_id for update;
  if request_row.id is null or request_row.kind<>'topup_refund_requested' or request_row.from_user_id<>p_user_id then raise exception 'refund request not found'; end if;
  select * into settlement from public.wallet_transactions where related_transaction_id=request_row.id and kind in ('topup_refunded','topup_refund_rejected');
  if settlement.id is not null then
    if settlement.kind<>'topup_refunded' then raise exception 'refund already rejected'; end if;
    return jsonb_build_object('status','refunded','refundRequestId',request_row.id,'points',request_row.points,'balances',public.get_wallet_balances(p_user_id));
  end if;
  if p_provider_payload->>'status'<>'CANCELED' or p_provider_payload->>'paymentKey'<>request_row.provider_payment_key then raise exception 'provider refund incomplete'; end if;
  insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,krw_amount,related_transaction_id,provider,provider_payment_key,idempotency_key,metadata)
  values('topup_refunded','posted',p_user_id,null,'refund_reserved','external',request_row.points,request_row.krw_amount,request_row.id,'toss',request_row.provider_payment_key,'topup-refunded:'||request_row.id,p_provider_payload);
  return jsonb_build_object('status','refunded','refundRequestId',request_row.id,'points',request_row.points,'balances',public.get_wallet_balances(p_user_id));
end; $$;

create or replace function public.reject_topup_refund(p_user_id uuid,p_refund_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare request_row public.wallet_transactions%rowtype; settlement public.wallet_transactions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('topup-refund-request:'||coalesce(p_refund_request_id::text,''),0));
  select * into request_row from public.wallet_transactions where id=p_refund_request_id for update;
  if request_row.id is null or request_row.kind<>'topup_refund_requested' or request_row.from_user_id<>p_user_id then raise exception 'refund request not found'; end if;
  select * into settlement from public.wallet_transactions where related_transaction_id=request_row.id and kind in ('topup_refunded','topup_refund_rejected');
  if settlement.id is null then
    insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,krw_amount,related_transaction_id,provider,provider_payment_key,idempotency_key,metadata)
    values('topup_refund_rejected','posted',p_user_id,p_user_id,'refund_reserved','topup',request_row.points,request_row.krw_amount,request_row.id,'toss',request_row.provider_payment_key,'topup-refund-rejected:'||request_row.id,'{}');
  end if;
  return jsonb_build_object('status','rejected','refundRequestId',request_row.id,'points',request_row.points,'balances',public.get_wallet_balances(p_user_id));
end; $$;

revoke all on function public.reserve_latest_topup_refund(uuid,text) from public,anon,authenticated;
revoke all on function public.complete_topup_refund(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.reject_topup_refund(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_latest_topup_refund(uuid,text) to service_role;
grant execute on function public.complete_topup_refund(uuid,uuid,jsonb) to service_role;
grant execute on function public.reject_topup_refund(uuid,uuid) to service_role;
