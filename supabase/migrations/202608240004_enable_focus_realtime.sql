-- Focus lifecycle rows are the canonical invalidation source for the Web UI.
-- The client still re-fetches the validated RPC response and never trusts the
-- replication payload as an authoritative session value.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cloud_focus_sessions'
  ) then
    alter publication supabase_realtime add table public.cloud_focus_sessions;
  end if;
end;
$$;
