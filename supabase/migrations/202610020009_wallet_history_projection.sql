-- Reuse the immutable ledger. This read-only projection adds no financial
-- mutation or table and exposes neither provider payloads nor payment keys.
create or replace function public.list_wallet_transactions(
  p_category text default 'all', p_limit integer default 20,
  p_before_at timestamptz default null, p_before_id uuid default null,
  p_transaction_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := (select auth.uid());
  items jsonb; more boolean; last_at timestamptz; last_id uuid;
begin
  if caller is null then raise exception 'authentication required'; end if;
  if p_category is null or p_category not in ('all','topup','focus','reward','cashout') then raise exception 'invalid wallet category'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then raise exception 'invalid wallet page size'; end if;
  if (p_before_at is null) <> (p_before_id is null) then raise exception 'invalid wallet cursor'; end if;
  if p_transaction_id is not null and p_before_at is not null then raise exception 'invalid wallet cursor'; end if;

  with candidates as (
    select t.* from public.wallet_transactions t
    where (t.from_user_id=caller or t.to_user_id=caller)
      and (p_transaction_id is null or t.id=p_transaction_id)
      and (p_before_at is null or (t.created_at,t.id)<(p_before_at,p_before_id))
      and (p_category='all'
        or (p_category='topup' and t.kind like 'topup_%')
        or (p_category='focus' and t.kind like 'self_deposit_%')
        or (p_category='reward' and t.kind like 'guardian_%')
        or (p_category='cashout' and t.kind like 'cashout_%'))
    order by t.created_at desc,t.id desc limit p_limit+1
  ), page as (
    select * from candidates order by created_at desc,id desc limit p_limit
  ), projected as (
    select t.created_at,t.id,jsonb_build_object(
      'id',t.id,'kind',t.kind,'status',t.status,'points',t.points,'krwAmount',t.krw_amount,
      'createdAt',t.created_at,'scheduleId',t.schedule_id,'sessionId',t.session_id,
      'relatedTransactionId',t.related_transaction_id,'orderId',t.provider_order_id,
      'fromBucket',case when t.from_user_id=caller then t.from_bucket else null end,
      'toBucket',case when t.to_user_id=caller then t.to_bucket else null end,
      'provider',case when t.provider in ('toss','sandbox') then t.provider else null end,
      'resolutionKind',resolution.kind,
      'resolutionTransactionId',case when resolution.from_user_id=caller or resolution.to_user_id=caller then resolution.id else null end,
      'reasonCode',case
        when t.metadata->>'reason' in ('student-withdrawn','enforcement-start-cancelled') then t.metadata->>'reason'
        when t.metadata->>'failureCode' in ('REJECT_CARD_COMPANY','PAY_PROCESS_CANCELED','PAY_PROCESS_ABORTED') then t.metadata->>'failureCode'
        when t.status='failed' then 'unconfirmed'
        else null end
    ) as item
    from page t left join lateral (
      select r.id,r.kind,r.from_user_id,r.to_user_id from public.wallet_transactions r
      where r.related_transaction_id=t.id and r.status='posted'
        and r.kind in ('topup_confirmed','topup_refunded','topup_refund_rejected',
          'self_deposit_earned','self_deposit_returned','guardian_reward_declined',
          'guardian_deposit_reserved','guardian_reward_released','guardian_deposit_returned',
          'cashout_completed','cashout_rejected')
      order by r.created_at desc,r.id desc limit 1
    ) resolution on true
  )
  select coalesce((select jsonb_agg(item order by created_at desc,id desc) from projected),'[]'::jsonb),
    (select count(*)>p_limit from candidates),
    (select created_at from page order by created_at asc,id asc limit 1),
    (select id from page order by created_at asc,id asc limit 1)
  into items,more,last_at,last_id;
  return jsonb_build_object('ownerUserId',caller,'items',items,'hasMore',more,
    'nextCursor',case when more then jsonb_build_object('createdAt',last_at,'id',last_id) else null end,
    'checkedAt',clock_timestamp());
end; $$;

revoke all on function public.list_wallet_transactions(text,integer,timestamptz,uuid,uuid) from public,anon;
grant execute on function public.list_wallet_transactions(text,integer,timestamptz,uuid,uuid) to authenticated;
comment on function public.list_wallet_transactions(text,integer,timestamptz,uuid,uuid) is
  'Own-ledger read projection; explicit auth.uid scope, safe reason allowlist, stable timestamp/UUID pagination. Does not expose raw provider metadata or other party IDs.';
