-- Reuse profiles/family_links. No new table or financial mutation is required.
create or replace function public.set_guardian_sharing_preferences(p_preferences jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid := (select auth.uid()); preference_key text;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if coalesce((select role from public.profiles where id=current_user_id),'') <> 'student' then
    raise exception 'student role required';
  end if;
  if jsonb_typeof(p_preferences) is distinct from 'object'
    or p_preferences - array['shareCompletion','shareTotalFocusMinutes','shareRewardStatus','shareAiSummary'] <> '{}'::jsonb then
    raise exception 'invalid sharing preferences';
  end if;
  foreach preference_key in array array['shareCompletion','shareTotalFocusMinutes','shareRewardStatus','shareAiSummary'] loop
    if jsonb_typeof(p_preferences->preference_key) is distinct from 'boolean' then
      raise exception 'invalid sharing preferences';
    end if;
  end loop;
  update public.profiles set sharing_preferences=p_preferences,updated_at=now() where id=current_user_id;
  return p_preferences;
end;
$$;

create or replace function public.disconnect_family_link(p_student_user_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid := (select auth.uid()); caller_profile_role text; student_id uuid; link_row public.family_links%rowtype;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  select role into caller_profile_role from public.profiles where id=current_user_id;
  if caller_profile_role='student' then
    if p_student_user_id is not null and p_student_user_id<>current_user_id then raise exception 'family link access denied'; end if;
    student_id := current_user_id;
  elsif caller_profile_role='guardian' and p_student_user_id is not null then
    student_id := p_student_user_id;
  else raise exception 'family link access denied'; end if;

  -- Start/redeem also lock this relationship. A new funded session cannot
  -- create a request after this transaction has removed the active link.
  select * into link_row from public.family_links
  where student_user_id=student_id and status='active'
    and (student_user_id=current_user_id or guardian_user_id=current_user_id)
  for update;
  if not found then
    if exists(select 1 from public.family_links where student_user_id=student_id and status='disconnected'
      and (student_user_id=current_user_id or guardian_user_id=current_user_id)) then
      return jsonb_build_object('studentUserId',student_id,'status','disconnected');
    end if;
    raise exception 'active family link required';
  end if;

  -- Do not silently settle or discard money while disconnecting. The existing
  -- finish/decline workflow must resolve all obligations before this succeeds.
  if exists(select 1 from public.cloud_focus_sessions session
    where session.user_id=student_id and session.deleted_at is null
      and session.payload->>'status' in ('starting','active','paused','awaiting-result')
      and (coalesce((session.payload->>'guardianRewardRequestPoints')::bigint,0)>0
        or exists(select 1 from public.wallet_transactions request where request.kind='guardian_reward_requested'
          and request.from_user_id=student_id and request.to_user_id=link_row.guardian_user_id
          and request.session_id=session.entity_id))) then
    raise exception 'guardian funded focus must finish';
  end if;
  if exists(select 1 from public.wallet_transactions reservation
    join public.wallet_transactions request on request.id=reservation.related_transaction_id
    where reservation.kind='guardian_deposit_reserved' and request.kind='guardian_reward_requested'
      and request.from_user_id=student_id and request.to_user_id=link_row.guardian_user_id
      and not exists(select 1 from public.wallet_transactions settlement
        where settlement.related_transaction_id=reservation.id
          and settlement.kind in ('guardian_reward_released','guardian_deposit_returned'))) then
    raise exception 'reserved guardian points must be settled';
  end if;
  if exists(select 1 from public.wallet_transactions request
    where request.kind='guardian_reward_requested' and request.from_user_id=student_id
      and request.to_user_id=link_row.guardian_user_id
      and not exists(select 1 from public.wallet_transactions resolution
        where resolution.related_transaction_id=request.id
          and resolution.kind in ('guardian_reward_declined','guardian_deposit_reserved'))) then
    raise exception 'pending guardian rewards must be resolved';
  end if;
  update public.family_links set status='disconnected',disconnected_at=now(),updated_at=now()
  where id=link_row.id;
  -- Existing status trigger creates deduplicated notifications for both users.
  return jsonb_build_object('studentUserId',student_id,'status','disconnected');
end;
$$;
revoke all on function public.set_guardian_sharing_preferences(jsonb) from public,anon;
revoke all on function public.disconnect_family_link(uuid) from public,anon;
grant execute on function public.set_guardian_sharing_preferences(jsonb) to authenticated;
grant execute on function public.disconnect_family_link(uuid) to authenticated;
