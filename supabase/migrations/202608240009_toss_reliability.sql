-- Toss test-mode reliability boundaries. Topup refunds remain tied to one
-- original provider payment so a future live cancellation can use the same
-- immutable ledger allocation without trusting a client-computed amount.

create unique index if not exists wallet_transactions_topup_payment_key_unique
  on public.wallet_transactions(provider_payment_key)
  where kind = 'topup_requested' and provider_payment_key is not null;

create or replace function public.claim_topup_payment(
  p_user_id uuid,
  p_order_id text,
  p_payment_key text,
  p_callback_amount bigint
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare request_row public.wallet_transactions%rowtype; confirmation_id uuid;
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  if p_order_id is null or p_order_id !~ '^[A-Za-z0-9_-]{6,64}$' then raise exception 'invalid topup order id'; end if;
  if p_payment_key is null or length(p_payment_key) not between 6 and 200 then raise exception 'invalid payment key'; end if;
  if p_callback_amount <= 0 then raise exception 'invalid callback amount'; end if;

  perform pg_advisory_xact_lock(hashtextextended('topup-order:'||p_order_id,0));
  select * into request_row
  from public.wallet_transactions
  where provider_order_id=p_order_id and kind='topup_requested'
  for update;

  if request_row.id is null or request_row.to_user_id<>p_user_id then raise exception 'topup order not found'; end if;
  if request_row.krw_amount<>p_callback_amount then raise exception 'topup amount mismatch'; end if;
  if request_row.provider_payment_key is not null and request_row.provider_payment_key<>p_payment_key then raise exception 'payment key mismatch'; end if;
  if exists (
    select 1 from public.wallet_transactions other
    where other.kind='topup_requested'
      and other.provider_payment_key=p_payment_key
      and other.id<>request_row.id
  ) then raise exception 'payment key already claimed'; end if;

  select id into confirmation_id
  from public.wallet_transactions
  where related_transaction_id=request_row.id and kind='topup_confirmed';
  if confirmation_id is not null then
    return jsonb_build_object('status','confirmed','requestId',request_row.id,'points',request_row.points);
  end if;
  if request_row.status='failed' then raise exception 'topup order failed'; end if;

  update public.wallet_transactions
  set status='confirming',provider_payment_key=p_payment_key,updated_at=now()
  where id=request_row.id;
  return jsonb_build_object('status','confirming','requestId',request_row.id,'points',request_row.points);
end; $$;

drop function if exists public.reserve_latest_topup_refund(uuid,text);

create function public.reserve_latest_topup_refund(
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
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  if coalesce((select role from public.profiles where id=p_user_id),'') <> 'guardian' then raise exception 'guardian role required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then raise exception 'invalid idempotency key'; end if;
  if p_points is null or p_points <= 0 or p_points > 300000 then raise exception 'invalid refund amount'; end if;

  perform pg_advisory_xact_lock(hashtextextended('topup-refund:'||p_user_id::text,0));

  select * into prior from public.wallet_transactions where idempotency_key=p_idempotency_key;
  if prior.id is not null then
    if prior.kind <> 'topup_refund_requested' or prior.from_user_id <> p_user_id or prior.points <> p_points then
      raise exception 'idempotency key mismatch';
    end if;
    select * into settlement
    from public.wallet_transactions
    where related_transaction_id=prior.id and kind in ('topup_refunded','topup_refund_rejected');
    if settlement.kind='topup_refunded' then
      return jsonb_build_object('status','refunded','refundRequestId',prior.id,'points',prior.points,'balances',public.get_wallet_balances(p_user_id));
    end if;
    if settlement.kind='topup_refund_rejected' then
      return jsonb_build_object('status','rejected','refundRequestId',prior.id,'points',prior.points,'balances',public.get_wallet_balances(p_user_id));
    end if;
    return jsonb_build_object('status','reserved','refundRequestId',prior.id,'paymentKey',prior.provider_payment_key,'points',prior.points);
  end if;

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

  insert into public.wallet_transactions(
    kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,krw_amount,
    related_transaction_id,provider,provider_payment_key,idempotency_key,metadata
  ) values (
    'topup_refund_requested','posted',p_user_id,p_user_id,'topup','refund_reserved',p_points,p_points,
    confirmation.id,'toss',confirmation.provider_payment_key,p_idempotency_key,
    jsonb_build_object('originalTopupId',confirmation.id,'originalTopupPoints',confirmation.points,'refundContractVersion',2)
  ) returning * into request_row;

  return jsonb_build_object(
    'status','reserved',
    'refundRequestId',request_row.id,
    'paymentKey',request_row.provider_payment_key,
    'points',request_row.points
  );
end; $$;

create or replace function public.complete_topup_refund(
  p_user_id uuid,
  p_refund_request_id uuid,
  p_provider_payload jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare request_row public.wallet_transactions%rowtype; settlement public.wallet_transactions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('topup-refund-request:'||coalesce(p_refund_request_id::text,''),0));
  select * into request_row from public.wallet_transactions where id=p_refund_request_id for update;
  if request_row.id is null or request_row.kind<>'topup_refund_requested' or request_row.from_user_id<>p_user_id then raise exception 'refund request not found'; end if;

  select * into settlement
  from public.wallet_transactions
  where related_transaction_id=request_row.id and kind in ('topup_refunded','topup_refund_rejected');
  if settlement.id is not null then
    if settlement.kind<>'topup_refunded' then raise exception 'refund already rejected'; end if;
    return jsonb_build_object('status','refunded','refundRequestId',request_row.id,'points',request_row.points,'balances',public.get_wallet_balances(p_user_id));
  end if;

  if p_provider_payload->>'status'<>'CANCELED'
    or p_provider_payload->>'paymentKey'<>request_row.provider_payment_key
    or (
      coalesce((request_row.metadata->>'refundContractVersion')::integer,1) >= 2
      and coalesce((p_provider_payload->>'cancelAmount')::bigint,-1)<>request_row.krw_amount
    ) then raise exception 'provider refund incomplete'; end if;

  insert into public.wallet_transactions(
    kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,krw_amount,
    related_transaction_id,provider,provider_payment_key,idempotency_key,metadata
  ) values (
    'topup_refunded','posted',p_user_id,null,'refund_reserved','external',request_row.points,request_row.krw_amount,
    request_row.id,'toss',request_row.provider_payment_key,'topup-refunded:'||request_row.id,p_provider_payload
  );
  return jsonb_build_object('status','refunded','refundRequestId',request_row.id,'points',request_row.points,'balances',public.get_wallet_balances(p_user_id));
end; $$;

create function public.get_topup_refund_limits(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare available bigint; max_original_remaining bigint;
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  if coalesce((select role from public.profiles where id=p_user_id),'') <> 'guardian' then raise exception 'guardian role required'; end if;

  available := greatest(coalesce((public.get_wallet_balances(p_user_id)->>'topupAvailable')::bigint,0),0);
  select coalesce(max(
    confirmed.points - coalesce((
      select sum(refund_request.points)
      from public.wallet_transactions refund_request
      where refund_request.kind='topup_refund_requested'
        and refund_request.related_transaction_id=confirmed.id
        and not exists (
          select 1 from public.wallet_transactions rejected
          where rejected.related_transaction_id=refund_request.id
            and rejected.kind='topup_refund_rejected'
        )
    ),0)
  ),0) into max_original_remaining
  from public.wallet_transactions confirmed
  where confirmed.kind='topup_confirmed'
    and confirmed.status='posted'
    and confirmed.to_user_id=p_user_id
    and confirmed.provider='toss'
    and confirmed.provider_payment_key is not null;

  return jsonb_build_object(
    'topupAvailable',available,
    'maxRefundableTopup',least(available,greatest(max_original_remaining,0))
  );
end; $$;

revoke all on function public.claim_topup_payment(uuid,text,text,bigint) from public,anon,authenticated;
revoke all on function public.reserve_latest_topup_refund(uuid,text,bigint) from public,anon,authenticated;
revoke all on function public.complete_topup_refund(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.get_topup_refund_limits(uuid) from public,anon,authenticated;
grant execute on function public.claim_topup_payment(uuid,text,text,bigint) to service_role;
grant execute on function public.reserve_latest_topup_refund(uuid,text,bigint) to service_role;
grant execute on function public.complete_topup_refund(uuid,uuid,jsonb) to service_role;
grant execute on function public.get_topup_refund_limits(uuid) to service_role;
