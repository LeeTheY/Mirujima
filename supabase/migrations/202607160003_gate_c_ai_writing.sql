create table public.ai_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.ai_rate_limits enable row level security;
revoke all on public.ai_rate_limits from public, anon, authenticated;

create or replace function public.consume_ai_writing_rate_limit()
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
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ai-writing:' || current_user_id::text, 0));
  select request_count, window_started_at into current_count, current_window
  from public.ai_rate_limits where user_id = current_user_id;

  if current_window is null or current_window <= now() - interval '1 minute' then
    insert into public.ai_rate_limits (user_id, window_started_at, request_count, updated_at)
    values (current_user_id, now(), 1, now())
    on conflict (user_id) do update set window_started_at = excluded.window_started_at, request_count = 1, updated_at = now();
    return true;
  end if;

  if current_count < 12 then
    update public.ai_rate_limits set request_count = request_count + 1, updated_at = now() where user_id = current_user_id;
    allowed := true;
  end if;
  return allowed;
end;
$$;

revoke all on function public.consume_ai_writing_rate_limit() from public, anon;
grant execute on function public.consume_ai_writing_rate_limit() to authenticated;
