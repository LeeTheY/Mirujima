alter table public.memberships
  add column if not exists current_period_started_at timestamptz,
  add column if not exists current_period_ends_at timestamptz,
  add column if not exists provider_customer_key text,
  add column if not exists provider_subscription_ref text;

alter table public.memberships
  drop constraint if exists memberships_billing_integration_check,
  drop constraint if exists memberships_activation_source_check;
alter table public.memberships
  add constraint memberships_billing_integration_check
    check (billing_integration in ('deferred', 'stripe', 'toss')),
  add constraint memberships_activation_source_check
    check (activation_source in ('onboarding_deferred', 'stripe_subscription', 'toss_payment')),
  add constraint memberships_period_check
    check (current_period_ends_at is null or (
      current_period_started_at is not null and current_period_ends_at > current_period_started_at
    ));

alter table public.membership_entitlements
  drop constraint if exists membership_entitlements_source_check;
alter table public.membership_entitlements
  add constraint membership_entitlements_source_check
    check (source in ('onboarding_deferred', 'stripe_subscription', 'toss_payment'));

comment on column public.memberships.provider_subscription_ref is
  'Latest provider order reference. Mirujima Premium currently uses non-recurring Toss payments, not a billing subscription.';

update public.memberships
set status = 'inactive', current_period_started_at = null, current_period_ends_at = null, updated_at = now()
where billing_integration = 'deferred';

update public.membership_entitlements
set enabled = false, valid_until = now(), updated_at = now()
where source = 'onboarding_deferred';

revoke all on function public.activate_deferred_membership(uuid) from public, anon, authenticated, service_role;
drop function public.activate_deferred_membership(uuid);

-- A membership payment order cannot be represented by wallet_transactions:
-- it has a KRW amount but must never create a 0P or fake point movement. This
-- append-only server-owned table preserves provider idempotency and audit data.
create table public.membership_payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id text not null unique,
  payment_key text unique,
  amount_krw bigint not null default 12900 check (amount_krw = 12900),
  status text not null check (status in ('pending', 'confirming', 'confirmed', 'failed', 'expired')),
  idempotency_key text not null unique,
  provider text not null default 'toss' check (provider = 'toss'),
  provider_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_payload) = 'object'),
  failure_code text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint membership_payment_orders_order_id_check check (order_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  constraint membership_payment_orders_idempotency_key_check check (length(idempotency_key) between 8 and 200),
  constraint membership_payment_orders_payment_key_check check (payment_key is null or length(payment_key) between 6 and 200),
  constraint membership_payment_orders_failure_code_check check (failure_code is null or length(failure_code) <= 100)
);

create index membership_payment_orders_user_created_idx
  on public.membership_payment_orders(user_id, created_at desc);

alter table public.membership_payment_orders enable row level security;
create policy "membership_payment_orders_select_own" on public.membership_payment_orders
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.membership_payment_orders from public, anon, authenticated;
grant select (id, user_id, order_id, amount_krw, status, failure_code, created_at, confirmed_at, updated_at)
  on public.membership_payment_orders to authenticated;

create or replace function public.create_membership_payment_order(
  p_user_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_order public.membership_payment_orders%rowtype;
  generated_order_id text;
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid idempotency key';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then raise exception 'target user not found'; end if;

  perform pg_advisory_xact_lock(hashtextextended('membership-order:' || p_idempotency_key, 0));
  select * into payment_order
  from public.membership_payment_orders
  where idempotency_key = p_idempotency_key;

  if payment_order.id is null then
    generated_order_id := 'membership_' || replace(gen_random_uuid()::text, '-', '');
    insert into public.membership_payment_orders (user_id, order_id, status, idempotency_key)
    values (p_user_id, generated_order_id, 'pending', p_idempotency_key)
    returning * into payment_order;
  elsif payment_order.user_id <> p_user_id then
    raise exception 'payment order ownership mismatch';
  end if;

  return jsonb_build_object(
    'orderId', payment_order.order_id,
    'amount', payment_order.amount_krw,
    'orderName', 'Mirujima Premium 1개월',
    'status', payment_order.status
  );
end;
$$;

create or replace function public.claim_membership_payment(
  p_user_id uuid,
  p_order_id text,
  p_payment_key text,
  p_callback_amount bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_order public.membership_payment_orders%rowtype;
begin
  if p_user_id is null then raise exception 'target user is required'; end if;
  if p_payment_key is null or length(p_payment_key) not between 6 and 200 then raise exception 'invalid payment key'; end if;
  perform pg_advisory_xact_lock(hashtextextended('membership-confirm:' || coalesce(p_order_id, ''), 0));

  select * into payment_order
  from public.membership_payment_orders
  where order_id = p_order_id
  for update;

  if payment_order.id is null then raise exception 'payment order not found'; end if;
  if payment_order.user_id <> p_user_id then raise exception 'payment order ownership mismatch'; end if;
  if payment_order.amount_krw <> p_callback_amount then raise exception 'payment amount mismatch'; end if;
  if payment_order.status = 'confirmed' then
    return jsonb_build_object('status', 'confirmed', 'orderId', payment_order.order_id);
  end if;
  if payment_order.status not in ('pending', 'confirming') then raise exception 'payment order is not confirmable'; end if;
  if payment_order.payment_key is not null and payment_order.payment_key <> p_payment_key then
    raise exception 'payment key mismatch';
  end if;

  update public.membership_payment_orders
  set status = 'confirming', payment_key = p_payment_key, updated_at = now()
  where id = payment_order.id;

  return jsonb_build_object('status', 'confirming', 'orderId', payment_order.order_id, 'amount', payment_order.amount_krw);
end;
$$;

create or replace function public.confirm_toss_membership_payment(
  p_user_id uuid,
  p_order_id text,
  p_payment_key text,
  p_provider_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_order public.membership_payment_orders%rowtype;
  existing_membership public.memberships%rowtype;
  period_start timestamptz;
  period_end timestamptz;
begin
  if p_provider_payload is null or jsonb_typeof(p_provider_payload) <> 'object' then raise exception 'invalid provider payload'; end if;
  if p_provider_payload->>'status' <> 'DONE' then raise exception 'provider payment is not done'; end if;
  perform pg_advisory_xact_lock(hashtextextended('membership-confirm:' || coalesce(p_order_id, ''), 0));

  select * into payment_order
  from public.membership_payment_orders
  where order_id = p_order_id
  for update;
  if payment_order.id is null then raise exception 'payment order not found'; end if;
  if payment_order.user_id <> p_user_id then raise exception 'payment order ownership mismatch'; end if;
  if payment_order.payment_key <> p_payment_key then raise exception 'payment key mismatch'; end if;

  select * into existing_membership from public.memberships where user_id = p_user_id for update;
  if payment_order.status = 'confirmed' then
    return jsonb_build_object(
      'plan', 'premium', 'status', 'active',
      'currentPeriodStartedAt', existing_membership.current_period_started_at,
      'currentPeriodEndsAt', existing_membership.current_period_ends_at
    );
  end if;
  if payment_order.status <> 'confirming' then raise exception 'payment order was not claimed'; end if;

  period_start := greatest(now(), coalesce(existing_membership.current_period_ends_at, now()));
  period_end := period_start + interval '1 month';

  insert into public.profiles (id) values (p_user_id) on conflict (id) do nothing;
  insert into public.memberships (
    user_id, plan, billing_integration, activation_source, status, activated_at,
    current_period_started_at, current_period_ends_at, provider_customer_key,
    provider_subscription_ref, updated_at
  ) values (
    p_user_id, 'premium', 'toss', 'toss_payment', 'active', now(),
    period_start, period_end, p_user_id::text, p_order_id, now()
  )
  on conflict (user_id) do update set
    plan = 'premium', billing_integration = 'toss', activation_source = 'toss_payment', status = 'active',
    activated_at = coalesce(public.memberships.activated_at, now()),
    current_period_started_at = period_start, current_period_ends_at = period_end,
    provider_customer_key = p_user_id::text, provider_subscription_ref = p_order_id, updated_at = now();

  insert into public.membership_entitlements (user_id, feature_key, enabled, source, valid_until, updated_at)
  select p_user_id, feature_key, true, 'toss_payment', period_end, now()
  from unnest(array[
    'learning-grass', 'cloud-backup', 'cloud-sync', 'screen-ocr', 'grammar-correction', 'content-summary'
  ]) as features(feature_key)
  on conflict (user_id, feature_key) do update set
    enabled = true, source = 'toss_payment', valid_until = period_end, updated_at = now();

  update public.membership_payment_orders
  set status = 'confirmed', provider_payload = p_provider_payload, failure_code = null,
      confirmed_at = now(), updated_at = now()
  where id = payment_order.id;

  return jsonb_build_object(
    'plan', 'premium', 'status', 'active',
    'currentPeriodStartedAt', period_start, 'currentPeriodEndsAt', period_end
  );
end;
$$;

create or replace function public.fail_membership_payment(
  p_user_id uuid,
  p_order_id text,
  p_failure_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_order public.membership_payment_orders%rowtype;
begin
  if p_failure_code is null or length(p_failure_code) > 100 then raise exception 'invalid failure code'; end if;
  perform pg_advisory_xact_lock(hashtextextended('membership-confirm:' || coalesce(p_order_id, ''), 0));
  select * into payment_order from public.membership_payment_orders where order_id = p_order_id for update;
  if payment_order.id is null then raise exception 'payment order not found'; end if;
  if payment_order.user_id <> p_user_id then raise exception 'payment order ownership mismatch'; end if;
  if payment_order.status = 'confirmed' then raise exception 'confirmed payment cannot fail'; end if;

  update public.membership_payment_orders
  set status = 'failed', failure_code = p_failure_code, updated_at = now()
  where id = payment_order.id;
  return jsonb_build_object('status', 'failed', 'orderId', p_order_id);
end;
$$;

revoke all on function public.create_membership_payment_order(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_membership_payment(uuid, text, text, bigint) from public, anon, authenticated;
revoke all on function public.confirm_toss_membership_payment(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_membership_payment(uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_membership_payment_order(uuid, text) to service_role;
grant execute on function public.claim_membership_payment(uuid, text, text, bigint) to service_role;
grant execute on function public.confirm_toss_membership_payment(uuid, text, text, jsonb) to service_role;
grant execute on function public.fail_membership_payment(uuid, text, text) to service_role;
