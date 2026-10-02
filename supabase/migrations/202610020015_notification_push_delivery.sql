-- Reuse devices for subscriptions and notifications.push_delivery for bounded delivery bookkeeping.
-- No new table. Endpoints and key material never enter notification payloads/logs.
alter table public.notifications add column if not exists push_delivery jsonb not null default '{}'::jsonb;
alter table public.devices add column if not exists device_kind text not null default 'extension';
alter table public.devices add column if not exists push_subscription jsonb;
alter table public.devices add column if not exists push_enabled_at timestamptz;

create or replace function public.valid_push_subscription(p jsonb)
returns boolean language sql immutable set search_path='' as $$
  select p is null or (jsonb_typeof(p)='object'
    and p->>'endpoint' ~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|updates-push[.]services[.]mozaws[.]net|web[.]push[.]apple[.]com)/[^[:space:]?#@]+$'
    and length(p->>'endpoint') between 30 and 2048
    and p#>>'{keys,p256dh}' ~ '^[A-Za-z0-9_-]{87}$'
    and p#>>'{keys,auth}' ~ '^[A-Za-z0-9_-]{22}$');
$$;
alter table public.devices add constraint devices_push_valid check (coalesce(public.valid_push_subscription(push_subscription),false));
alter table public.devices add constraint devices_kind_valid check (device_kind in ('extension','web','pwa'));
create unique index devices_push_endpoint_unique on public.devices((push_subscription->>'endpoint')) where push_subscription is not null;

create or replace function public.set_push_subscription(p_device_id text,p_subscription jsonb,p_kind text default 'web')
returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'authentication required'; end if;
  if p_device_id !~ '^web-push:[0-9a-f-]{36}$' or p_device_id is null or p_kind not in ('web','pwa') then raise exception 'invalid push device'; end if;
  if not coalesce(public.valid_push_subscription(p_subscription),false) then raise exception 'invalid push subscription'; end if;
  perform pg_advisory_xact_lock(hashtextextended('push-device:'||uid::text,0));
  if p_subscription is null then
    update public.devices set push_subscription=null,push_enabled_at=null,updated_at=now() where user_id=uid and client_generated_device_id=p_device_id;
    return true;
  end if;
  if (select count(*) from public.devices where user_id=uid and push_subscription is not null and client_generated_device_id<>p_device_id)>=10 then raise exception 'push device limit'; end if;
  insert into public.devices(user_id,client_generated_device_id,device_name,extension_version,device_kind,push_subscription,push_enabled_at)
  values(uid,p_device_id,'Web Push','web',p_kind,p_subscription,now())
  on conflict(user_id,client_generated_device_id) do update set
    push_subscription=excluded.push_subscription,device_kind=excluded.device_kind,
    push_enabled_at=case when devices.push_subscription=excluded.push_subscription then devices.push_enabled_at else now() end,
    updated_at=now(),last_seen_at=now();
  return true;
end; $$;
revoke all on function public.set_push_subscription(text,jsonb,text) from public,anon;
grant execute on function public.set_push_subscription(text,jsonb,text) to authenticated;

create or replace function public.claim_notification_push_batch()
returns jsonb language plpgsql security definer set search_path='' as $$
declare n record; d record; deliveries jsonb; state jsonb; token uuid; items jsonb := '[]'::jsonb;
begin
  -- Serialise scanners; delivery state is persisted BEFORE any provider call.
  perform pg_advisory_xact_lock(hashtextextended('notification-push-batch',0));
  for n in select * from public.notifications where read_at is null and created_at>now()-interval '1 day'
    and exists(select 1 from public.devices candidate where candidate.user_id=notifications.recipient_user_id and candidate.push_subscription is not null
      and candidate.push_enabled_at<=notifications.created_at
      and coalesce(notifications.push_delivery#>>array[candidate.id::text,'status'],'') not in ('sent','expired')
      and coalesce((notifications.push_delivery#>>array[candidate.id::text,'attempts'])::integer,0)<3
      and coalesce((notifications.push_delivery#>>array[candidate.id::text,'claimedAt'])::timestamptz,'epoch')<now()-interval '5 minutes')
    order by created_at limit 100 for update loop
    deliveries := coalesce(n.push_delivery,'{}'::jsonb);
    for d in select * from public.devices where user_id=n.recipient_user_id and push_subscription is not null
      and push_enabled_at<=n.created_at and public.valid_push_subscription(push_subscription) loop
      state := deliveries->d.id::text;
      if state->>'status' in ('sent','expired') or coalesce((state->>'attempts')::integer,0)>=3 then continue; end if;
      if state->>'claimedAt' is not null and (state->>'claimedAt')::timestamptz>now()-interval '5 minutes' then continue; end if;
      token := gen_random_uuid();
      deliveries := jsonb_set(deliveries,array[d.id::text],jsonb_build_object('status','dispatching','token',token,'claimedAt',now(),'attempts',coalesce((state->>'attempts')::integer,0)+1));
      items := items || jsonb_build_array(jsonb_build_object('notificationId',n.id,'deviceId',d.id,'token',token,'subscription',d.push_subscription));
      if jsonb_array_length(items)>=50 then exit; end if;
    end loop;
    update public.notifications set push_delivery=deliveries where id=n.id;
    if jsonb_array_length(items)>=50 then exit; end if;
  end loop;
  return items;
end; $$;

create or replace function public.finish_notification_push(p_notification_id uuid,p_device_id uuid,p_token uuid,p_status text)
returns boolean language plpgsql security definer set search_path='' as $$
declare n public.notifications%rowtype;
begin
  if p_status not in ('sent','expired','retry') or p_status is null then raise exception 'invalid push status'; end if;
  if p_notification_id is null or p_device_id is null or p_token is null then return false; end if;
  select * into n from public.notifications where id=p_notification_id for update;
  if not found then return false; end if;
  if n.push_delivery#>>array[p_device_id::text,'token'] is distinct from p_token::text then return false; end if;
  update public.notifications set push_delivery=jsonb_set(push_delivery,array[p_device_id::text,'status'],to_jsonb(p_status)) where id=p_notification_id;
  if p_status='expired' then update public.devices set push_subscription=null,push_enabled_at=null where id=p_device_id and user_id=n.recipient_user_id; end if;
  return true;
end; $$;
revoke all on function public.claim_notification_push_batch() from public,anon,authenticated;
revoke all on function public.finish_notification_push(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_notification_push_batch() to service_role;
grant execute on function public.finish_notification_push(uuid,uuid,uuid,text) to service_role;

create or replace function public.revoke_all_push_subscriptions()
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  update public.devices set push_subscription=null,push_enabled_at=null where user_id=auth.uid() and push_subscription is not null;
  return true;
end; $$;
revoke all on function public.revoke_all_push_subscriptions() from public,anon;
grant execute on function public.revoke_all_push_subscriptions() to authenticated;
