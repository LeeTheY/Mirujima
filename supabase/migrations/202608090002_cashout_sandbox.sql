-- Wallet transactions are required because balances, reservations, and
-- cashout settlement cannot preserve accounting integrity in cloud payloads.
create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'topup_requested', 'topup_confirmed', 'self_deposit_reserved', 'self_deposit_earned',
    'self_deposit_returned', 'guardian_reward_requested', 'guardian_reward_declined',
    'guardian_deposit_reserved', 'guardian_reward_released', 'guardian_deposit_returned',
    'topup_refund_requested', 'topup_refunded', 'cashout_requested', 'cashout_completed', 'cashout_rejected'
  )),
  status text not null check (status = 'posted'),
  from_user_id uuid references auth.users(id) on delete restrict,
  to_user_id uuid references auth.users(id) on delete restrict,
  from_bucket text check (from_bucket in ('topup', 'reserved', 'earned', 'cashout_reserved', 'external')),
  to_bucket text check (to_bucket in ('topup', 'reserved', 'earned', 'cashout_reserved', 'external')),
  points bigint not null check (points > 0),
  krw_amount bigint check (krw_amount is null or krw_amount > 0),
  schedule_id text,
  session_id text,
  related_transaction_id uuid references public.wallet_transactions(id) on delete restrict,
  provider text,
  provider_order_id text,
  provider_payment_key text,
  idempotency_key text not null unique check (length(idempotency_key) between 8 and 200),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_transactions_party_check check (from_user_id is not null or to_user_id is not null),
  constraint wallet_transactions_bucket_check check (from_bucket is not null and to_bucket is not null and from_bucket <> to_bucket),
  constraint wallet_transactions_cashout_krw_check check (
    kind not in ('cashout_requested', 'cashout_completed', 'cashout_rejected') or krw_amount = points
  )
);

create index wallet_transactions_from_user_idx on public.wallet_transactions(from_user_id, created_at desc);
create index wallet_transactions_to_user_idx on public.wallet_transactions(to_user_id, created_at desc);
create index wallet_transactions_related_idx on public.wallet_transactions(related_transaction_id)
  where related_transaction_id is not null;
create unique index wallet_transactions_one_cashout_settlement_idx
  on public.wallet_transactions(related_transaction_id)
  where kind in ('cashout_completed', 'cashout_rejected');

alter table public.wallet_transactions enable row level security;
create policy "wallet_transactions_select_party" on public.wallet_transactions
  for select to authenticated
  using ((select auth.uid()) = from_user_id or (select auth.uid()) = to_user_id);

revoke all on public.wallet_transactions from public, anon, authenticated;
grant select (
  id, kind, status, from_user_id, to_user_id, from_bucket, to_bucket, points, krw_amount,
  schedule_id, session_id, related_transaction_id, provider, provider_order_id,
  idempotency_key, created_at, updated_at
) on public.wallet_transactions to authenticated;

create or replace function public.get_wallet_balances(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  earned_available bigint;
  cashout_reserved bigint;
  cashout_completed bigint;
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  select
    coalesce(sum(case when to_user_id = p_user_id and to_bucket = 'earned' then points else 0 end), 0)
      - coalesce(sum(case when from_user_id = p_user_id and from_bucket = 'earned' then points else 0 end), 0),
    coalesce(sum(case when to_user_id = p_user_id and to_bucket = 'cashout_reserved' then points else 0 end), 0)
      - coalesce(sum(case when from_user_id = p_user_id and from_bucket = 'cashout_reserved' then points else 0 end), 0),
    coalesce(sum(case when from_user_id = p_user_id and kind = 'cashout_completed' then points else 0 end), 0)
  into earned_available, cashout_reserved, cashout_completed
  from public.wallet_transactions
  where status = 'posted' and (from_user_id = p_user_id or to_user_id = p_user_id);

  return jsonb_build_object(
    'earnedAvailable', earned_available,
    'cashoutReserved', cashout_reserved,
    'cashoutCompleted', cashout_completed
  );
end;
$$;

create or replace function public.request_test_cashout(
  p_user_id uuid,
  p_points bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior public.wallet_transactions%rowtype;
  request_row public.wallet_transactions%rowtype;
  balances jsonb;
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  if p_points is null or p_points <= 0 then raise exception 'cashout points must be positive'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then raise exception 'invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || p_user_id::text, 0));

  select * into prior from public.wallet_transactions where idempotency_key = p_idempotency_key;
  if prior.id is not null then
    if prior.kind <> 'cashout_requested' or prior.from_user_id <> p_user_id or prior.points <> p_points then
      raise exception 'idempotency key mismatch';
    end if;
    return jsonb_build_object('requestId', prior.id, 'status', 'requested', 'points', prior.points, 'balances', public.get_wallet_balances(p_user_id));
  end if;

  balances := public.get_wallet_balances(p_user_id);
  if (balances->>'earnedAvailable')::bigint < p_points then raise exception 'insufficient earned points'; end if;

  insert into public.wallet_transactions (
    kind, status, from_user_id, to_user_id, from_bucket, to_bucket, points, krw_amount,
    idempotency_key, metadata
  ) values (
    'cashout_requested', 'posted', p_user_id, p_user_id, 'earned', 'cashout_reserved', p_points, p_points,
    p_idempotency_key, '{"sandbox":true,"actualTransfer":false}'::jsonb
  ) returning * into request_row;

  return jsonb_build_object('requestId', request_row.id, 'status', 'requested', 'points', request_row.points, 'balances', public.get_wallet_balances(p_user_id));
end;
$$;

create or replace function public.complete_test_cashout(
  p_user_id uuid,
  p_request_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.wallet_transactions%rowtype;
  settlement public.wallet_transactions%rowtype;
begin
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then raise exception 'invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || p_user_id::text, 0));
  select * into request_row from public.wallet_transactions where id = p_request_id for update;
  if request_row.id is null or request_row.kind <> 'cashout_requested' then raise exception 'cashout request not found'; end if;
  if request_row.from_user_id <> p_user_id then raise exception 'cashout ownership mismatch'; end if;
  select * into settlement from public.wallet_transactions
    where related_transaction_id = p_request_id and kind in ('cashout_completed', 'cashout_rejected');
  if settlement.id is not null then
    return jsonb_build_object('requestId', p_request_id, 'status', case when settlement.kind = 'cashout_completed' then 'completed' else 'rejected' end, 'points', request_row.points, 'balances', public.get_wallet_balances(p_user_id));
  end if;

  insert into public.wallet_transactions (
    kind, status, from_user_id, to_user_id, from_bucket, to_bucket, points, krw_amount,
    related_transaction_id, idempotency_key, metadata
  ) values (
    'cashout_completed', 'posted', p_user_id, null, 'cashout_reserved', 'external', request_row.points, request_row.points,
    p_request_id, p_idempotency_key, '{"sandbox":true,"actualTransfer":false}'::jsonb
  );
  return jsonb_build_object('requestId', p_request_id, 'status', 'completed', 'points', request_row.points, 'balances', public.get_wallet_balances(p_user_id));
end;
$$;

create or replace function public.reject_test_cashout(
  p_user_id uuid,
  p_request_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.wallet_transactions%rowtype;
  settlement public.wallet_transactions%rowtype;
begin
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then raise exception 'invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || p_user_id::text, 0));
  select * into request_row from public.wallet_transactions where id = p_request_id for update;
  if request_row.id is null or request_row.kind <> 'cashout_requested' then raise exception 'cashout request not found'; end if;
  if request_row.from_user_id <> p_user_id then raise exception 'cashout ownership mismatch'; end if;
  select * into settlement from public.wallet_transactions
    where related_transaction_id = p_request_id and kind in ('cashout_completed', 'cashout_rejected');
  if settlement.id is not null then
    return jsonb_build_object('requestId', p_request_id, 'status', case when settlement.kind = 'cashout_completed' then 'completed' else 'rejected' end, 'points', request_row.points, 'balances', public.get_wallet_balances(p_user_id));
  end if;

  insert into public.wallet_transactions (
    kind, status, from_user_id, to_user_id, from_bucket, to_bucket, points, krw_amount,
    related_transaction_id, idempotency_key, metadata
  ) values (
    'cashout_rejected', 'posted', p_user_id, p_user_id, 'cashout_reserved', 'earned', request_row.points, request_row.points,
    p_request_id, p_idempotency_key, '{"sandbox":true,"actualTransfer":false}'::jsonb
  );
  return jsonb_build_object('requestId', p_request_id, 'status', 'rejected', 'points', request_row.points, 'balances', public.get_wallet_balances(p_user_id));
end;
$$;

revoke all on function public.get_wallet_balances(uuid) from public, anon, authenticated;
revoke all on function public.request_test_cashout(uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.complete_test_cashout(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reject_test_cashout(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.get_wallet_balances(uuid) to service_role;
grant execute on function public.request_test_cashout(uuid, bigint, text) to service_role;
grant execute on function public.complete_test_cashout(uuid, uuid, text) to service_role;
grant execute on function public.reject_test_cashout(uuid, uuid, text) to service_role;
