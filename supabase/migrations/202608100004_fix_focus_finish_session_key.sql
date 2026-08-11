-- cloud_focus_sessions uses (user_id, entity_id) as its primary key. Replace
-- the initial settlement function so existence and updates use that key.
create or replace function public.finish_focus_session(
  p_session_id text,
  p_completion_percent integer,
  p_device_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  session_row public.cloud_focus_sessions%rowtype;
  session_payload jsonb;
  reservation_row public.wallet_transactions%rowtype;
  deposit_points bigint;
  earned_points bigint;
  returned_points bigint;
  final_status text;
  schedule_status text;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if p_session_id is null or length(p_session_id) not between 1 and 300 then raise exception 'invalid session id'; end if;
  if p_completion_percent is null or p_completion_percent not in (0, 60, 80, 100) then raise exception 'invalid completion percent'; end if;
  if p_device_id is null or length(p_device_id) not between 1 and 200 then raise exception 'invalid device id'; end if;

  perform pg_advisory_xact_lock(hashtextextended('focus-finish:' || current_user_id::text || ':' || p_session_id, 0));
  select * into session_row from public.cloud_focus_sessions
  where user_id = current_user_id and entity_id = p_session_id and deleted_at is null
  for update;
  if not found then raise exception 'focus session not found'; end if;
  session_payload := session_row.payload;
  if session_payload->>'status' in ('success', 'failed', 'cancelled') then
    return session_payload || jsonb_build_object('walletBalances', public.get_wallet_balances(current_user_id));
  end if;
  if session_payload->>'status' not in ('active', 'paused', 'awaiting-result') then raise exception 'focus session cannot finish'; end if;
  if p_completion_percent > 0 and now() < (session_payload->>'endsAt')::timestamptz then
    raise exception 'focus session has not reached target time';
  end if;

  deposit_points := coalesce((session_payload->>'selfDepositPoints')::bigint, 0);
  earned_points := (deposit_points * p_completion_percent) / 100;
  returned_points := deposit_points - earned_points;

  if deposit_points > 0 then
    perform pg_advisory_xact_lock(hashtextextended('wallet:' || current_user_id::text, 0));
    select * into reservation_row from public.wallet_transactions
    where from_user_id = current_user_id and session_id = p_session_id
      and kind = 'self_deposit_reserved' and status = 'posted'
    for update;
    if reservation_row.id is null or reservation_row.points <> deposit_points then
      raise exception 'focus deposit reservation not found';
    end if;

    if earned_points > 0 then
      insert into public.wallet_transactions (
        kind, status, from_user_id, to_user_id, from_bucket, to_bucket, points,
        schedule_id, session_id, related_transaction_id, idempotency_key, metadata
      ) values (
        'self_deposit_earned', 'posted', current_user_id, current_user_id, 'reserved', 'earned', earned_points,
        session_payload->>'scheduleId', p_session_id, reservation_row.id,
        'self-deposit-earned:' || p_session_id,
        jsonb_build_object('completionPercent', p_completion_percent)
      ) on conflict (idempotency_key) do nothing;
    end if;
    if returned_points > 0 then
      insert into public.wallet_transactions (
        kind, status, from_user_id, to_user_id, from_bucket, to_bucket, points,
        schedule_id, session_id, related_transaction_id, idempotency_key, metadata
      ) values (
        'self_deposit_returned', 'posted', current_user_id, current_user_id, 'reserved', 'topup', returned_points,
        session_payload->>'scheduleId', p_session_id, reservation_row.id,
        'self-deposit-returned:' || p_session_id,
        jsonb_build_object('completionPercent', p_completion_percent)
      ) on conflict (idempotency_key) do nothing;
    end if;
  end if;

  final_status := case when p_completion_percent = 0 then 'failed' else 'success' end;
  schedule_status := case when p_completion_percent = 0 then 'failed' else 'completed' end;
  session_payload := session_payload || jsonb_build_object(
    'status', final_status,
    'result', jsonb_build_object(
      'completionPercent', p_completion_percent,
      'earnedPoints', earned_points,
      'returnedPoints', returned_points,
      'settledAt', now()
    ),
    'updatedAt', now()
  );
  update public.cloud_focus_sessions set
    payload = session_payload,
    version = version + 1,
    device_id = p_device_id,
    updated_at = now()
  where user_id = current_user_id and entity_id = p_session_id;
  update public.cloud_schedules set
    payload = payload || jsonb_build_object('status', schedule_status, 'updatedAt', now()),
    version = version + 1,
    device_id = p_device_id,
    updated_at = now()
  where user_id = current_user_id and entity_id = session_payload->>'scheduleId';

  return session_payload || jsonb_build_object('walletBalances', public.get_wallet_balances(current_user_id));
end;
$$;

revoke all on function public.finish_focus_session(text, integer, text) from public, anon;
grant execute on function public.finish_focus_session(text, integer, text) to authenticated;
