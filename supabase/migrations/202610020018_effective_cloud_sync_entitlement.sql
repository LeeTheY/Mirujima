-- Use the same period-aware direct/family entitlement policy as membership and AI.
-- Additive replacement after 0012; no new table or existing record rewrite.
create or replace function public.apply_cloud_mutation(
  p_mutation_id uuid,
  p_entity_type text,
  p_entity_id text,
  p_operation text,
  p_expected_version bigint,
  p_payload jsonb,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_version bigint := 0;
  current_payload jsonb := null;
  current_device_id text := '';
  current_updated_at timestamptz := now();
  current_deleted_at timestamptz := null;
  next_version bigint;
  result_record jsonb;
  prior_result jsonb;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_entity_type not in ('schedule', 'settings', 'focus-session', 'report', 'learning-day') then raise exception 'unsupported entity type'; end if;
  if p_operation not in ('upsert', 'delete') then raise exception 'unsupported operation'; end if;
  if length(p_entity_id) > 300 or length(p_device_id) > 200 then raise exception 'identifier too long'; end if;
  if not public.has_effective_membership_entitlement(current_user_id, 'cloud-sync') then
    raise exception 'cloud-sync entitlement required';
  end if;

  -- Serialize writes to one logical record so two devices starting from the
  -- same expected version cannot both win an insert/update race.
  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text || ':' || p_entity_type || ':' || p_entity_id, 0));


  -- Never accept server-owned focus state through the legacy local sync API.
  -- Check the stored row as well as the request: dropping canonical keys from
  -- the incoming payload must not downgrade or delete a canonical record.
  if p_entity_type in ('schedule', 'focus-session') then
    if p_entity_type = 'schedule' then
      select payload into current_payload from public.cloud_schedules
      where user_id=current_user_id and entity_id=p_entity_id for update;
    else
      select payload into current_payload from public.cloud_focus_sessions
      where user_id=current_user_id and entity_id=p_entity_id for update;
    end if;
    if coalesce(current_payload ?| array['ownerUserId','canonical','canonicalStatus','canonicalUpdatedAt','endsAt','activeSegmentStartedAt','remainingFocusSeconds','extensionEnforcementState','selfDepositPoints','guardianRewardRequestPoints','selfDepositTransactionId','guardianDepositTransactionId','guardianRewardTransactionId','guardianRewardPoints','result','webStatus','plannedStartAt'], false)
      or coalesce(p_payload ?| array['ownerUserId','canonical','canonicalStatus','canonicalUpdatedAt','endsAt','activeSegmentStartedAt','remainingFocusSeconds','extensionEnforcementState','selfDepositPoints','guardianRewardRequestPoints','selfDepositTransactionId','guardianDepositTransactionId','guardianRewardTransactionId','guardianRewardPoints','result','webStatus','plannedStartAt'], false) then
      raise exception 'canonical data requires lifecycle RPC';
    end if;
    if p_operation = 'upsert' then
      if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'invalid legacy sync payload'; end if;
      if (p_entity_type='schedule' and p_payload - array['id','title','description','dateKey','startAt','endAt','targetFocusMinutes','activityMode','blockingMode','allowedDomains','blockedDomains','breakMinutes','status','snoozeCount','snoozedUntil','createdAt','updatedAt','priority','goals'] <> '{}'::jsonb)
        or (p_entity_type='focus-session' and p_payload - array['id','scheduleId','dateKey','startedAt','endedAt','pausedAt','accumulatedFocusSeconds','distractionSeconds','idleSeconds','blockedAttemptCount','checkInCount','status','breakEndsAt','breakStartedAt','accumulatedBreakSeconds'] <> '{}'::jsonb) then
        raise exception 'canonical data requires lifecycle RPC';
      end if;
      if p_entity_type='focus-session' then
        if nullif(p_payload->>'scheduleId','') is null then raise exception 'invalid legacy sync payload'; end if;
        perform 1 from public.cloud_schedules where user_id=current_user_id
          and entity_id=p_payload->>'scheduleId' for update;
        if exists(select 1 from public.cloud_schedules where user_id=current_user_id
          and entity_id=p_payload->>'scheduleId' and payload ?| array['ownerUserId','canonical','canonicalStatus','canonicalUpdatedAt','endsAt','activeSegmentStartedAt','remainingFocusSeconds','extensionEnforcementState','selfDepositPoints','guardianRewardRequestPoints','selfDepositTransactionId','guardianDepositTransactionId','guardianRewardTransactionId','guardianRewardPoints','result','webStatus','plannedStartAt']) then
          raise exception 'canonical data requires lifecycle RPC';
        end if;
      end if;
    end if;
  end if;

  select mutation.result_record into prior_result
  from public.sync_mutations mutation
  where mutation.user_id = current_user_id and mutation.mutation_id = p_mutation_id;
  if prior_result is not null then return prior_result; end if;

  if p_entity_type = 'schedule' then
    select version, payload, device_id, updated_at, deleted_at into current_version, current_payload, current_device_id, current_updated_at, current_deleted_at from public.cloud_schedules where user_id = current_user_id and entity_id = p_entity_id;
  elsif p_entity_type = 'settings' then
    select version, payload, device_id, updated_at, deleted_at into current_version, current_payload, current_device_id, current_updated_at, current_deleted_at from public.cloud_settings where user_id = current_user_id and entity_id = p_entity_id;
  elsif p_entity_type = 'focus-session' then
    select version, payload, device_id, updated_at, deleted_at into current_version, current_payload, current_device_id, current_updated_at, current_deleted_at from public.cloud_focus_sessions where user_id = current_user_id and entity_id = p_entity_id;
  elsif p_entity_type = 'report' then
    select version, payload, device_id, updated_at, deleted_at into current_version, current_payload, current_device_id, current_updated_at, current_deleted_at from public.cloud_reports where user_id = current_user_id and entity_id = p_entity_id;
  else
    select version, payload, device_id, updated_at, deleted_at into current_version, current_payload, current_device_id, current_updated_at, current_deleted_at from public.cloud_learning_days where user_id = current_user_id and date_key = p_entity_id::date;
  end if;
  current_version := coalesce(current_version, 0);

  if current_version <> p_expected_version then
    result_record := jsonb_build_object(
      'mutationId', p_mutation_id, 'status', 'conflict',
      'record', jsonb_build_object('entityType', p_entity_type, 'entityId', p_entity_id, 'payload', current_payload, 'version', current_version, 'deviceId', current_device_id, 'updatedAt', current_updated_at, 'deletedAt', current_deleted_at)
    );
    insert into public.sync_mutations values (p_mutation_id, current_user_id, p_entity_type, p_entity_id, p_operation, p_expected_version, 'conflict', result_record, p_device_id, now());
    return result_record;
  end if;

  next_version := current_version + 1;
  current_deleted_at := case when p_operation = 'delete' then now() else null end;
  if p_entity_type = 'schedule' then
    insert into public.cloud_schedules (user_id, entity_id, payload, version, device_id, deleted_at) values (current_user_id, p_entity_id, coalesce(p_payload, '{}'::jsonb), next_version, p_device_id, current_deleted_at)
    on conflict (user_id, entity_id) do update set payload = excluded.payload, version = excluded.version, device_id = excluded.device_id, deleted_at = excluded.deleted_at, updated_at = now() where not (public.cloud_schedules.payload ?| array['ownerUserId','canonical','canonicalStatus','canonicalUpdatedAt','endsAt','activeSegmentStartedAt','remainingFocusSeconds','extensionEnforcementState','selfDepositPoints','guardianRewardRequestPoints','selfDepositTransactionId','guardianDepositTransactionId','guardianRewardTransactionId','guardianRewardPoints','result','webStatus','plannedStartAt']);
    if not found then raise exception 'canonical data requires lifecycle RPC'; end if;
  elsif p_entity_type = 'settings' then
    insert into public.cloud_settings (user_id, entity_id, payload, version, device_id, deleted_at) values (current_user_id, p_entity_id, coalesce(p_payload, '{}'::jsonb), next_version, p_device_id, current_deleted_at)
    on conflict (user_id, entity_id) do update set payload = excluded.payload, version = excluded.version, device_id = excluded.device_id, deleted_at = excluded.deleted_at, updated_at = now();
  elsif p_entity_type = 'focus-session' then
    insert into public.cloud_focus_sessions (user_id, entity_id, payload, version, device_id, deleted_at) values (current_user_id, p_entity_id, coalesce(p_payload, '{}'::jsonb), next_version, p_device_id, current_deleted_at)
    on conflict (user_id, entity_id) do update set payload = excluded.payload, version = excluded.version, device_id = excluded.device_id, deleted_at = excluded.deleted_at, updated_at = now() where not (public.cloud_focus_sessions.payload ?| array['ownerUserId','canonical','canonicalStatus','canonicalUpdatedAt','endsAt','activeSegmentStartedAt','remainingFocusSeconds','extensionEnforcementState','selfDepositPoints','guardianRewardRequestPoints','selfDepositTransactionId','guardianDepositTransactionId','guardianRewardTransactionId','guardianRewardPoints','result','webStatus','plannedStartAt']);
    if not found then raise exception 'canonical data requires lifecycle RPC'; end if;
  elsif p_entity_type = 'report' then
    insert into public.cloud_reports (user_id, entity_id, payload, version, device_id, deleted_at) values (current_user_id, p_entity_id, coalesce(p_payload, '{}'::jsonb), next_version, p_device_id, current_deleted_at)
    on conflict (user_id, entity_id) do update set payload = excluded.payload, version = excluded.version, device_id = excluded.device_id, deleted_at = excluded.deleted_at, updated_at = now();
  else
    insert into public.cloud_learning_days (user_id, date_key, actual_focus_minutes, completed_schedule_count, achievement_rate, learning_score, intensity, payload, version, device_id, deleted_at)
    values (current_user_id, p_entity_id::date, coalesce((p_payload->>'actualFocusMinutes')::integer, 0), coalesce((p_payload->>'completedScheduleCount')::integer, 0), coalesce((p_payload->>'achievementRate')::integer, 0), coalesce((p_payload->>'learningScore')::integer, 0), coalesce((p_payload->>'intensity')::smallint, 0), coalesce(p_payload, '{}'::jsonb), next_version, p_device_id, current_deleted_at)
    on conflict (user_id, date_key) do update set actual_focus_minutes = excluded.actual_focus_minutes, completed_schedule_count = excluded.completed_schedule_count, achievement_rate = excluded.achievement_rate, learning_score = excluded.learning_score, intensity = excluded.intensity, payload = excluded.payload, version = excluded.version, device_id = excluded.device_id, deleted_at = excluded.deleted_at, updated_at = now();
  end if;

  result_record := jsonb_build_object(
    'mutationId', p_mutation_id, 'status', 'applied',
    'record', jsonb_build_object('entityType', p_entity_type, 'entityId', p_entity_id, 'payload', p_payload, 'version', next_version, 'deviceId', p_device_id, 'updatedAt', now(), 'deletedAt', current_deleted_at)
  );
  insert into public.sync_mutations values (p_mutation_id, current_user_id, p_entity_type, p_entity_id, p_operation, p_expected_version, 'applied', result_record, p_device_id, now());
  return result_record;
end;
$$;

revoke all on function public.apply_cloud_mutation(uuid, text, text, text, bigint, jsonb, text) from public, anon;
grant execute on function public.apply_cloud_mutation(uuid, text, text, text, bigint, jsonb, text) to authenticated;
