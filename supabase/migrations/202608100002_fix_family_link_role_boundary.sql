-- Role authorization happens in the JWT-authenticated Edge Functions. These RPCs
-- are service-role-only transaction boundaries and must not perform a second,
-- potentially inconsistent profile lookup for the same authenticated actor.
create or replace function public.issue_family_link_code(p_actor_user_id uuid, p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  link_id uuid;
  expires_at timestamptz := now() + interval '5 minutes';
begin
  if p_actor_user_id is null then raise exception 'authentication required'; end if;
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid code hash'; end if;

  perform pg_advisory_xact_lock(hashtextextended('family-issue:' || p_actor_user_id::text, 0));
  if (select count(*) from public.family_links where issuer_user_id = p_actor_user_id and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'family code issue rate limit exceeded';
  end if;

  update public.family_links
  set status = 'revoked', code_hash = null, code_expires_at = null, updated_at = now()
  where issuer_user_id = p_actor_user_id and status = 'pending';

  insert into public.family_links (
    student_user_id, guardian_user_id, issuer_user_id, issuer_role, status, code_hash, code_expires_at
  ) values (
    null, p_actor_user_id, p_actor_user_id, 'guardian', 'pending', p_code_hash, expires_at
  ) returning id into link_id;

  return jsonb_build_object('id', link_id, 'status', 'pending', 'codeExpiresAt', expires_at,
    'event', jsonb_build_object('kind', 'family_link_code_issued', 'recipientUserId', p_actor_user_id));
end;
$$;

create or replace function public.redeem_family_link_code(p_actor_user_id uuid, p_code_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_link public.family_links%rowtype;
begin
  if p_actor_user_id is null then raise exception 'authentication required'; end if;
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid code hash'; end if;

  perform pg_advisory_xact_lock(hashtextextended('family-redeem:' || p_actor_user_id::text, 0));
  if exists (select 1 from public.profiles where id = p_actor_user_id and family_redeem_locked_until > now()) then
    return jsonb_build_object('status', 'locked', 'lockedUntil',
      (select family_redeem_locked_until from public.profiles where id = p_actor_user_id));
  end if;

  select * into pending_link
  from public.family_links
  where status = 'pending' and issuer_role = 'guardian' and code_hash = p_code_hash
  for update;

  if not found or pending_link.code_expires_at <= now() then
    if found then
      update public.family_links set status = 'expired', code_hash = null, code_expires_at = null, updated_at = now()
      where id = pending_link.id;
    end if;
    return public.consume_family_redeem_failure(p_actor_user_id);
  end if;

  if pending_link.issuer_user_id = p_actor_user_id or pending_link.guardian_user_id is null then
    update public.family_links set failed_attempts = least(5, failed_attempts + 1), updated_at = now()
    where id = pending_link.id;
    return public.consume_family_redeem_failure(p_actor_user_id);
  end if;
  if exists (select 1 from public.family_links where student_user_id = p_actor_user_id and status = 'active') then
    raise exception 'student already has an active guardian';
  end if;

  update public.family_links set student_user_id = p_actor_user_id, status = 'active', code_hash = null,
    code_expires_at = null, linked_at = now(), updated_at = now()
  where id = pending_link.id;

  update public.profiles set family_redeem_window_started_at = null, family_redeem_attempts = 0,
    family_redeem_locked_until = null, updated_at = now()
  where id = p_actor_user_id;

  return jsonb_build_object('id', pending_link.id, 'status', 'active', 'studentUserId', p_actor_user_id,
    'guardianUserId', pending_link.guardian_user_id, 'linkedAt', now(),
    'event', jsonb_build_object('kind', 'family_linked', 'studentUserId', p_actor_user_id,
      'guardianUserId', pending_link.guardian_user_id));
end;
$$;

revoke all on function public.issue_family_link_code(uuid, text) from public, anon, authenticated;
revoke all on function public.redeem_family_link_code(uuid, text) from public, anon, authenticated;
grant execute on function public.issue_family_link_code(uuid, text) to service_role;
grant execute on function public.redeem_family_link_code(uuid, text) to service_role;

comment on function public.issue_family_link_code(uuid, text) is
  'Service-role-only transaction boundary. family-link-issue must authenticate the actor and require guardian role before calling.';
comment on function public.redeem_family_link_code(uuid, text) is
  'Service-role-only transaction boundary. family-link-redeem must authenticate the actor and require student role before calling.';
