alter table public.membership_entitlements
  drop constraint if exists membership_entitlements_feature_key_check;
alter table public.membership_entitlements
  add constraint membership_entitlements_feature_key_check
  check (feature_key in ('learning-grass', 'cloud-backup', 'cloud-sync', 'screen-ocr', 'grammar-correction', 'content-summary'));

insert into public.membership_entitlements (user_id, feature_key, enabled, source, valid_until, updated_at)
select membership.user_id, 'content-summary', true, membership.activation_source, null, now()
from public.memberships membership
where membership.plan = 'premium' and membership.status = 'active'
on conflict (user_id, feature_key) do update set enabled = true, valid_until = null, updated_at = now();

create or replace function public.activate_deferred_membership(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_user_id is null then raise exception 'target user is required'; end if;
  insert into public.profiles (id) values (target_user_id) on conflict (id) do nothing;
  insert into public.memberships (user_id, plan, billing_integration, activation_source, status, activated_at, updated_at)
  values (target_user_id, 'premium', 'deferred', 'onboarding_deferred', 'active', now(), now())
  on conflict (user_id) do update set
    plan = 'premium', billing_integration = 'deferred', activation_source = 'onboarding_deferred', status = 'active',
    activated_at = coalesce(public.memberships.activated_at, now()), updated_at = now();
  insert into public.membership_entitlements (user_id, feature_key, enabled, source, valid_until, updated_at)
  select target_user_id, feature_key, true, 'onboarding_deferred', null, now()
  from unnest(array['learning-grass', 'cloud-backup', 'cloud-sync', 'screen-ocr', 'grammar-correction', 'content-summary']) as features(feature_key)
  on conflict (user_id, feature_key) do update set enabled = true, source = 'onboarding_deferred', valid_until = null, updated_at = now();
end;
$$;

revoke all on function public.activate_deferred_membership(uuid) from public, anon, authenticated;
grant execute on function public.activate_deferred_membership(uuid) to service_role;

alter table public.ai_rate_limits add column task text not null default 'ocr';
alter table public.ai_rate_limits drop constraint ai_rate_limits_pkey;
alter table public.ai_rate_limits add constraint ai_rate_limits_task_check
  check (task in ('ocr', 'grammar-correction', 'content-summary', 'study-organize'));
alter table public.ai_rate_limits add primary key (user_id, task);

create or replace function public.consume_ai_task_rate_limit(p_task text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  allowed boolean := false;
  current_count integer;
  current_window timestamptz;
  request_limit integer;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_task not in ('ocr', 'grammar-correction', 'content-summary', 'study-organize') then raise exception 'unsupported AI task'; end if;
  request_limit := case when p_task in ('content-summary', 'study-organize') then 6 else 12 end;
  perform pg_advisory_xact_lock(hashtextextended('ai-writing:' || current_user_id::text || ':' || p_task, 0));
  select request_count, window_started_at into current_count, current_window
  from public.ai_rate_limits where user_id = current_user_id and task = p_task;
  if current_window is null or current_window <= now() - interval '1 minute' then
    insert into public.ai_rate_limits (user_id, task, window_started_at, request_count, updated_at)
    values (current_user_id, p_task, now(), 1, now())
    on conflict (user_id, task) do update set window_started_at = excluded.window_started_at, request_count = 1, updated_at = now();
    return true;
  end if;
  if current_count < request_limit then
    update public.ai_rate_limits set request_count = request_count + 1, updated_at = now()
    where user_id = current_user_id and task = p_task;
    allowed := true;
  end if;
  return allowed;
end;
$$;

revoke all on function public.consume_ai_task_rate_limit(text) from public, anon;
grant execute on function public.consume_ai_task_rate_limit(text) to authenticated;

create or replace function public.consume_ai_writing_rate_limit()
returns boolean language sql security definer set search_path = ''
as $$ select public.consume_ai_task_rate_limit('grammar-correction') $$;
revoke all on function public.consume_ai_writing_rate_limit() from public, anon;
grant execute on function public.consume_ai_writing_rate_limit() to authenticated;
