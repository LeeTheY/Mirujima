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
  current_role text;
  default_sharing jsonb := '{"shareCompletion":true,"shareTotalFocusMinutes":true,"shareRewardStatus":true,"shareAiSummary":false}'::jsonb;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_role not in ('student', 'guardian') then raise exception 'unsupported role'; end if;
  if p_timezone is null or length(p_timezone) not between 1 and 64 then raise exception 'invalid timezone'; end if;
  if p_locale is null or length(p_locale) not between 2 and 16 then raise exception 'invalid locale'; end if;

  perform pg_advisory_xact_lock(hashtextextended('profile-role:' || current_user_id::text, 0));
  select profile.role into current_role from public.profiles profile where profile.id = current_user_id;

  if current_role is not null then
    update public.profiles set
      onboarding_completed = true,
      timezone = p_timezone,
      locale = p_locale,
      sharing_preferences = coalesce(public.profiles.sharing_preferences, default_sharing),
      updated_at = now()
    where id = current_user_id;

    return jsonb_build_object(
      'role', current_role,
      'onboardingCompleted', true,
      'rolePreserved', current_role <> p_role
    );
  end if;

  insert into public.profiles (id, role, onboarding_completed, timezone, locale, sharing_preferences, updated_at)
  values (current_user_id, p_role, true, p_timezone, p_locale, default_sharing, now())
  on conflict (id) do update set
    role = coalesce(public.profiles.role, excluded.role),
    onboarding_completed = true,
    timezone = excluded.timezone,
    locale = excluded.locale,
    sharing_preferences = coalesce(public.profiles.sharing_preferences, default_sharing),
    updated_at = now();

  select profile.role into current_role from public.profiles profile where profile.id = current_user_id;
  return jsonb_build_object('role', current_role, 'onboardingCompleted', true, 'rolePreserved', false);
end;
$$;

revoke all on function public.set_profile_role(text, text, text) from public, anon;
grant execute on function public.set_profile_role(text, text, text) to authenticated;

notify pgrst, 'reload schema';
