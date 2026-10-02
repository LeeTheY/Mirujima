-- A durable notification cannot be represented by cloud payloads because it
-- needs recipient-only RLS, unread state, deduplication and transactional event
-- delivery across family, focus, wallet and membership domains.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in (
    'family_link_code_issued', 'family_linked', 'family_disconnected',
    'focus_plan_created', 'focus_plan_updated', 'focus_started', 'focus_completed', 'focus_failed',
    'guardian_reward_requested', 'guardian_reward_approved', 'guardian_reward_declined', 'guardian_reward_released',
    'wallet_topup_completed', 'wallet_refund_completed', 'cashout_requested', 'cashout_completed',
    'membership_activated', 'membership_expiring', 'ai_summary_ready'
  )),
  title text not null check (length(title) between 1 and 120),
  body text not null check (length(body) between 1 and 500),
  data jsonb not null default '{}'::jsonb check (
    jsonb_typeof(data) = 'object' and octet_length(data::text) <= 2048
  ),
  dedupe_key text check (dedupe_key is null or length(dedupe_key) between 1 and 200),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_created_idx
  on public.notifications(recipient_user_id, created_at desc, id desc);
create index notifications_recipient_unread_idx
  on public.notifications(recipient_user_id, created_at desc)
  where read_at is null;
create unique index notifications_recipient_dedupe_idx
  on public.notifications(recipient_user_id, dedupe_key)
  where dedupe_key is not null;

alter table public.notifications enable row level security;
create policy "notifications_select_own" on public.notifications
  for select to authenticated using ((select auth.uid()) = recipient_user_id);

revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;

create or replace function public.create_notification(
  p_recipient_user_id uuid,
  p_actor_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_id uuid;
  data_value jsonb := coalesce(p_data, '{}'::jsonb);
  data_key text;
  route_value text;
begin
  if p_recipient_user_id is null or not exists(select 1 from auth.users where id = p_recipient_user_id) then
    raise exception 'notification recipient required';
  end if;
  if p_kind not in (
    'family_link_code_issued', 'family_linked', 'family_disconnected',
    'focus_plan_created', 'focus_plan_updated', 'focus_started', 'focus_completed', 'focus_failed',
    'guardian_reward_requested', 'guardian_reward_approved', 'guardian_reward_declined', 'guardian_reward_released',
    'wallet_topup_completed', 'wallet_refund_completed', 'cashout_requested', 'cashout_completed',
    'membership_activated', 'membership_expiring', 'ai_summary_ready'
  ) then raise exception 'unsupported notification kind'; end if;
  if p_title is null or length(p_title) not between 1 and 120 then raise exception 'invalid notification title'; end if;
  if p_body is null or length(p_body) not between 1 and 500 then raise exception 'invalid notification body'; end if;
  if jsonb_typeof(data_value) <> 'object' or octet_length(data_value::text) > 2048 then
    raise exception 'invalid notification data';
  end if;
  for data_key in select jsonb_object_keys(data_value) loop
    if data_key not in ('entityId','scheduleId','sessionId','familyLinkId','transactionId','membershipId','studentUserId','status','points','route') then
      raise exception 'unsupported notification data key';
    end if;
  end loop;
  if data_value ? 'route' then
    route_value := data_value->>'route';
    if route_value is null or left(route_value, 1) <> '/' or length(route_value) > 200 then
      raise exception 'invalid notification route';
    end if;
  end if;
  if data_value ? 'points' and (
    jsonb_typeof(data_value->'points') <> 'number' or (data_value->>'points')::numeric < 0
  ) then raise exception 'invalid notification points'; end if;

  insert into public.notifications (
    recipient_user_id, actor_user_id, kind, title, body, data, dedupe_key
  ) values (
    p_recipient_user_id, p_actor_user_id, p_kind, p_title, p_body, data_value, p_dedupe_key
  )
  on conflict (recipient_user_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into notification_id;

  if notification_id is null and p_dedupe_key is not null then
    select id into notification_id from public.notifications
    where recipient_user_id = p_recipient_user_id and dedupe_key = p_dedupe_key;
  end if;
  return notification_id;
end;
$$;

create or replace function public.list_notifications(
  p_limit integer default 20,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  result_items jsonb;
  last_created_at timestamptz;
  last_id uuid;
  unread_count bigint;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'invalid notification limit'; end if;
  if (p_before_created_at is null) <> (p_before_id is null) then raise exception 'invalid notification cursor'; end if;

  with page as (
    select notification.id, notification.kind, notification.title, notification.body,
      notification.data, notification.read_at, notification.created_at,
      row_number() over (order by notification.created_at desc, notification.id desc) as row_number
    from public.notifications notification
    where notification.recipient_user_id = current_user_id
      and (p_before_created_at is null or (notification.created_at, notification.id) < (p_before_created_at, p_before_id))
    order by notification.created_at desc, notification.id desc
    limit p_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id, 'kind', page.kind, 'title', page.title, 'body', page.body,
      'data', page.data, 'readAt', page.read_at, 'createdAt', page.created_at
    ) order by page.row_number), '[]'::jsonb),
    (array_agg(page.created_at order by page.row_number desc))[1],
    (array_agg(page.id order by page.row_number desc))[1]
  into result_items, last_created_at, last_id
  from page;

  select count(*) into unread_count from public.notifications
  where recipient_user_id = current_user_id and read_at is null;

  return jsonb_build_object(
    'items', result_items,
    'unreadCount', unread_count,
    'nextCursor', case when jsonb_array_length(result_items) = p_limit then
      jsonb_build_object('createdAt', last_created_at, 'id', last_id)
      else null end
  );
end;
$$;

create or replace function public.get_notification_unread_count()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := (select auth.uid()); result_count bigint;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  select count(*) into result_count from public.notifications
  where recipient_user_id = current_user_id and read_at is null;
  return result_count;
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := (select auth.uid()); affected integer;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  update public.notifications set read_at = coalesce(read_at, now())
  where id = p_notification_id and recipient_user_id = current_user_id;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := (select auth.uid()); affected integer;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  update public.notifications set read_at = now()
  where recipient_user_id = current_user_id and read_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.create_notification(uuid,uuid,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.create_notification(uuid,uuid,text,text,text,jsonb,text) to service_role;
revoke all on function public.list_notifications(integer,timestamptz,uuid) from public,anon;
revoke all on function public.get_notification_unread_count() from public,anon;
revoke all on function public.mark_notification_read(uuid) from public,anon;
revoke all on function public.mark_all_notifications_read() from public,anon;
grant execute on function public.list_notifications(integer,timestamptz,uuid) to authenticated;
grant execute on function public.get_notification_unread_count() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
  ) then alter publication supabase_realtime add table public.notifications; end if;
end;
$$;
