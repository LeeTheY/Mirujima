create or replace function public.set_profile_role(
  p_role text,
  p_timezone text,
  p_locale text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  previous_role text;
  persisted_role text;
  default_sharing jsonb := '{"shareCompletion":true,"shareTotalFocusMinutes":true,"shareRewardStatus":true,"shareAiSummary":false}'::jsonb;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_role is null or p_role not in ('student', 'guardian') then raise exception 'unsupported role'; end if;
  if p_timezone is null or length(p_timezone) not between 1 and 64 then raise exception 'invalid timezone'; end if;
  if p_locale is null or length(p_locale) not between 2 and 16 then raise exception 'invalid locale'; end if;

  perform pg_advisory_xact_lock(hashtextextended('profile-role:' || current_user_id::text, 0));

  insert into public.profiles (id)
  values (current_user_id)
  on conflict (id) do nothing;

  select profile.role
  into previous_role
  from public.profiles profile
  where profile.id = current_user_id;

  update public.profiles as profile set
    role = coalesce(profile.role, p_role),
    onboarding_completed = true,
    timezone = p_timezone,
    locale = p_locale,
    sharing_preferences = coalesce(profile.sharing_preferences, default_sharing),
    updated_at = now()
  where profile.id = current_user_id
  returning profile.role into persisted_role;

  if persisted_role is null then
    raise exception 'role persistence failed';
  end if;

  return jsonb_build_object(
    'role', persisted_role,
    'onboardingCompleted', true,
    'rolePreserved', previous_role is not null and previous_role <> p_role
  );
end;
$$;

revoke all on function public.set_profile_role(text, text, text) from public, anon;
grant execute on function public.set_profile_role(text, text, text) to authenticated;

notify pgrst, 'reload schema';
