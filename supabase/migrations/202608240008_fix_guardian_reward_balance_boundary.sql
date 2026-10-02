create or replace function public.approve_guardian_reward_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid := (select auth.uid()); request_row public.wallet_transactions%rowtype; reservation public.wallet_transactions%rowtype; session_status text; topup_available bigint;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if coalesce((select role from public.profiles where id=current_user_id),'')<>'guardian' then raise exception 'guardian role required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('guardian-reward:'||coalesce(p_request_id::text,''),0));
  select * into request_row from public.wallet_transactions where id=p_request_id and kind='guardian_reward_requested' for update;
  if request_row.id is null or request_row.to_user_id<>current_user_id then raise exception 'reward request not found'; end if;
  if not exists(select 1 from public.family_links link where link.student_user_id=request_row.from_user_id and link.guardian_user_id=current_user_id and link.status='active') then raise exception 'active family link required'; end if;
  select payload->>'status' into session_status from public.cloud_focus_sessions where user_id=request_row.from_user_id and entity_id=request_row.session_id for update;
  if session_status is null or session_status in ('success','failed','cancelled') then raise exception 'reward request is no longer pending'; end if;
  if exists(select 1 from public.wallet_transactions where related_transaction_id=request_row.id and kind='guardian_reward_declined') then raise exception 'reward request already declined'; end if;
  select * into reservation from public.wallet_transactions where related_transaction_id=request_row.id and kind='guardian_deposit_reserved';
  if reservation.id is null then
    perform pg_advisory_xact_lock(hashtextextended('topup-refund:'||current_user_id::text,0));
    perform pg_advisory_xact_lock(hashtextextended('wallet:'||current_user_id::text,0));
    select
      coalesce(sum(case when ledger.to_user_id=current_user_id and ledger.to_bucket='topup' then ledger.points else 0 end),0)
      - coalesce(sum(case when ledger.from_user_id=current_user_id and ledger.from_bucket='topup' then ledger.points else 0 end),0)
    into topup_available from public.wallet_transactions ledger
    where ledger.status='posted' and (ledger.from_user_id=current_user_id or ledger.to_user_id=current_user_id);
    if topup_available<request_row.points then raise exception 'insufficient guardian topup points'; end if;
    insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,schedule_id,session_id,related_transaction_id,idempotency_key,metadata)
    values('guardian_deposit_reserved','posted',current_user_id,current_user_id,'topup','reserved',request_row.points,request_row.schedule_id,request_row.session_id,request_row.id,'guardian-deposit-reserved:'||request_row.id,jsonb_build_object('studentUserId',request_row.from_user_id)) returning * into reservation;
    update public.cloud_focus_sessions set payload=payload||jsonb_build_object('guardianDepositTransactionId',reservation.id),version=version+1,updated_at=now()
    where user_id=request_row.from_user_id and entity_id=request_row.session_id;
  end if;
  return jsonb_build_object('requestId',request_row.id,'status','approved','points',request_row.points,'studentUserId',request_row.from_user_id,'reservationId',reservation.id);
end;
$$;

revoke all on function public.approve_guardian_reward_request(uuid) from public,anon;
grant execute on function public.approve_guardian_reward_request(uuid) to authenticated;
