-- Operational read-only projection. Service role only; no financial mutation.
create or replace function public.get_release_operations_snapshot(p_stale_minutes integer default 30)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cutoff timestamptz; result jsonb;
begin
  if p_stale_minutes is null or p_stale_minutes not between 5 and 10080 then raise exception 'invalid operations threshold'; end if;
  cutoff := now()-make_interval(mins=>p_stale_minutes);
  with issues as (
    select 'topup_confirmation' kind,id::text entity_id,updated_at since from public.wallet_transactions
    where kind='topup_requested' and status='pending' and updated_at<cutoff and provider_payment_key is not null
    union all select 'refund_unconfirmed',id::text,updated_at from public.wallet_transactions
    where kind='topup_refund_requested' and status='pending' and updated_at<cutoff
    union all select 'membership_confirmation',id::text,updated_at from public.membership_payment_orders
    where status in ('confirming','pending') and payment_key is not null and updated_at<cutoff
    union all select 'focus_result_required',entity_id,updated_at from public.cloud_focus_sessions
    where deleted_at is null and payload->>'status'='awaiting-result' and updated_at<cutoff
    union all select 'push_delivery',n.id::text,n.created_at from public.notifications n
    where exists(select 1 from jsonb_each(n.push_delivery) d where d.value->>'status'='dispatching'
      and (d.value->>'claimedAt')::timestamptz<cutoff)
    union all select 'unsettled_reservation',r.id::text,r.created_at from public.wallet_transactions r
    where r.kind in ('self_deposit_reserved','guardian_deposit_reserved') and r.status='posted' and r.created_at<cutoff
      and not exists(select 1 from public.wallet_transactions s where s.related_transaction_id=r.id
        and s.status='posted' and s.kind in ('self_deposit_earned','self_deposit_returned','guardian_reward_released','guardian_deposit_returned'))
      and not exists(select 1 from public.cloud_focus_sessions f where f.entity_id=r.session_id and f.deleted_at is null
        and f.payload->>'status' in ('starting','active','paused','awaiting-result'))
  ) select jsonb_build_object('checkedAt',now(),'thresholdMinutes',p_stale_minutes,'issueCount',(select count(*) from issues),
    'items',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'entityId',entity_id,'since',since)) from (select * from issues order by since limit 50) bounded),'[]'::jsonb)) into result;
  return result;
end; $$;
revoke all on function public.get_release_operations_snapshot(integer) from public,anon,authenticated;
grant execute on function public.get_release_operations_snapshot(integer) to service_role;
