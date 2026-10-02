alter table public.wallet_transactions drop constraint wallet_transactions_bucket_check;
alter table public.wallet_transactions add constraint wallet_transactions_bucket_check check (
  (kind in ('guardian_reward_requested','guardian_reward_declined') and from_bucket='external' and to_bucket='external')
  or (kind not in ('guardian_reward_requested','guardian_reward_declined') and from_bucket is not null and to_bucket is not null and from_bucket<>to_bucket)
);

create unique index wallet_transactions_one_guardian_request_per_session
  on public.wallet_transactions(session_id) where kind='guardian_reward_requested';
create unique index wallet_transactions_one_guardian_reservation_per_request
  on public.wallet_transactions(related_transaction_id) where kind='guardian_deposit_reserved';
create unique index wallet_transactions_one_guardian_decline_per_request
  on public.wallet_transactions(related_transaction_id) where kind='guardian_reward_declined';
create unique index wallet_transactions_one_guardian_release_per_reservation
  on public.wallet_transactions(related_transaction_id) where kind='guardian_reward_released';
create unique index wallet_transactions_one_guardian_return_per_reservation
  on public.wallet_transactions(related_transaction_id) where kind='guardian_deposit_returned';

alter function public.start_focus_session(text,text) rename to start_focus_session_pre_guardian_reward_internal;
revoke all on function public.start_focus_session_pre_guardian_reward_internal(text,text) from public,anon,authenticated;

create or replace function public.start_focus_session(p_schedule_id text,p_device_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid := (select auth.uid()); started jsonb; request_points bigint; guardian_user_id uuid; request_id uuid;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  started := public.start_focus_session_pre_guardian_reward_internal(p_schedule_id,p_device_id);
  request_points := coalesce((started->>'guardianRewardRequestPoints')::bigint,0);
  if request_points <= 0 then return started; end if;
  select link.guardian_user_id into guardian_user_id from public.family_links link
  where link.student_user_id=current_user_id and link.status='active' for update;
  if guardian_user_id is null then raise exception 'active guardian link required'; end if;
  insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,schedule_id,session_id,idempotency_key,metadata)
  values('guardian_reward_requested','posted',current_user_id,guardian_user_id,'external','external',request_points,p_schedule_id,started->>'id','guardian-reward-request:'||(started->>'id'),jsonb_build_object('requestStatus','pending'))
  returning id into request_id;
  update public.cloud_focus_sessions set payload=payload||jsonb_build_object('guardianRewardRequestTransactionId',request_id),version=version+1,updated_at=now()
  where user_id=current_user_id and entity_id=started->>'id';
  return started||jsonb_build_object('guardianRewardRequestTransactionId',request_id);
end;
$$;

create or replace function public.get_guardian_reward_requests(p_status text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid := (select auth.uid()); result_items jsonb;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if coalesce((select role from public.profiles where id=current_user_id),'')<>'guardian' then raise exception 'guardian role required'; end if;
  if p_status is not null and p_status not in ('pending','approved','completed','returned','declined','expired') then raise exception 'unsupported reward status'; end if;
  with reward_rows as (
    select request.id,request.from_user_id as student_user_id,coalesce(nullif(trim(profile.display_name),''),'이름 미설정') as student_display_name,
      request.points,request.schedule_id,request.session_id,request.created_at,
      case when released.id is not null then 'completed' when returned.id is not null then 'returned'
        when declined.id is not null then 'declined' when reserved.id is not null then 'approved'
        when session.payload->>'status' in ('success','failed','cancelled') then 'expired' else 'pending' end as reward_status
    from public.wallet_transactions request
    join public.profiles profile on profile.id=request.from_user_id
    left join public.wallet_transactions reserved on reserved.related_transaction_id=request.id and reserved.kind='guardian_deposit_reserved'
    left join public.wallet_transactions declined on declined.related_transaction_id=request.id and declined.kind='guardian_reward_declined'
    left join public.wallet_transactions released on released.related_transaction_id=reserved.id and released.kind='guardian_reward_released'
    left join public.wallet_transactions returned on returned.related_transaction_id=reserved.id and returned.kind='guardian_deposit_returned'
    left join public.cloud_focus_sessions session on session.user_id=request.from_user_id and session.entity_id=request.session_id
    where request.kind='guardian_reward_requested' and request.to_user_id=current_user_id
      and exists(select 1 from public.family_links link where link.student_user_id=request.from_user_id and link.guardian_user_id=current_user_id and link.status='active')
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',row.id,'studentUserId',row.student_user_id,'studentDisplayName',row.student_display_name,'points',row.points,'scheduleId',row.schedule_id,'sessionId',row.session_id,'status',row.reward_status,'createdAt',row.created_at) order by row.created_at desc),'[]'::jsonb)
  into result_items from reward_rows row where p_status is null or row.reward_status=p_status;
  return jsonb_build_object('items',result_items);
end;
$$;

create or replace function public.approve_guardian_reward_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid := (select auth.uid()); request_row public.wallet_transactions%rowtype; reservation public.wallet_transactions%rowtype; session_status text; balances jsonb;
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
    balances := public.get_wallet_balances(current_user_id);
    if (balances->>'topupAvailable')::bigint<request_row.points then raise exception 'insufficient guardian topup points'; end if;
    insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,schedule_id,session_id,related_transaction_id,idempotency_key,metadata)
    values('guardian_deposit_reserved','posted',current_user_id,current_user_id,'topup','reserved',request_row.points,request_row.schedule_id,request_row.session_id,request_row.id,'guardian-deposit-reserved:'||request_row.id,jsonb_build_object('studentUserId',request_row.from_user_id)) returning * into reservation;
    update public.cloud_focus_sessions set payload=payload||jsonb_build_object('guardianDepositTransactionId',reservation.id),version=version+1,updated_at=now()
    where user_id=request_row.from_user_id and entity_id=request_row.session_id;
  end if;
  return jsonb_build_object('requestId',request_row.id,'status','approved','points',request_row.points,'studentUserId',request_row.from_user_id,'reservationId',reservation.id);
end;
$$;

create or replace function public.decline_guardian_reward_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid := (select auth.uid()); request_row public.wallet_transactions%rowtype; decline_row public.wallet_transactions%rowtype;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  if coalesce((select role from public.profiles where id=current_user_id),'')<>'guardian' then raise exception 'guardian role required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('guardian-reward:'||coalesce(p_request_id::text,''),0));
  select * into request_row from public.wallet_transactions where id=p_request_id and kind='guardian_reward_requested' for update;
  if request_row.id is null or request_row.to_user_id<>current_user_id then raise exception 'reward request not found'; end if;
  if exists(select 1 from public.wallet_transactions where related_transaction_id=request_row.id and kind='guardian_deposit_reserved') then raise exception 'approved reward cannot be declined'; end if;
  select * into decline_row from public.wallet_transactions where related_transaction_id=request_row.id and kind='guardian_reward_declined';
  if decline_row.id is null then
    insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,schedule_id,session_id,related_transaction_id,idempotency_key,metadata)
    values('guardian_reward_declined','posted',current_user_id,request_row.from_user_id,'external','external',request_row.points,request_row.schedule_id,request_row.session_id,request_row.id,'guardian-reward-declined:'||request_row.id,'{}') returning * into decline_row;
  end if;
  return jsonb_build_object('requestId',request_row.id,'status','declined','points',request_row.points,'studentUserId',request_row.from_user_id);
end;
$$;

alter function public.finish_focus_session(text,text[],text) rename to finish_focus_session_pre_guardian_reward_internal;
revoke all on function public.finish_focus_session_pre_guardian_reward_internal(text,text[],text) from public,anon,authenticated;

create or replace function public.finish_focus_session(p_session_id text,p_completed_goal_ids text[],p_device_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_user_id uuid := (select auth.uid()); settled jsonb; request_row public.wallet_transactions%rowtype; reservation public.wallet_transactions%rowtype; guardian_transaction_id uuid; succeeded boolean;
begin
  if current_user_id is null then raise exception 'authentication required'; end if;
  settled := public.finish_focus_session_pre_guardian_reward_internal(p_session_id,p_completed_goal_ids,p_device_id);
  select * into request_row from public.wallet_transactions where from_user_id=current_user_id and session_id=p_session_id and kind='guardian_reward_requested';
  if request_row.id is null then return settled; end if;
  perform pg_advisory_xact_lock(hashtextextended('guardian-reward:'||request_row.id::text,0));
  select * into reservation from public.wallet_transactions where related_transaction_id=request_row.id and kind='guardian_deposit_reserved' for update;
  if reservation.id is null then return settled; end if;
  perform pg_advisory_xact_lock(hashtextextended('wallet:'||reservation.from_user_id::text,0));
  succeeded := settled->>'status'='success';
  if succeeded then
    insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,schedule_id,session_id,related_transaction_id,idempotency_key,metadata)
    values('guardian_reward_released','posted',reservation.from_user_id,current_user_id,'reserved','earned',reservation.points,request_row.schedule_id,p_session_id,reservation.id,'guardian-reward-released:'||p_session_id,jsonb_build_object('requestId',request_row.id))
    on conflict(idempotency_key) do nothing returning id into guardian_transaction_id;
    if guardian_transaction_id is null then select id into guardian_transaction_id from public.wallet_transactions where idempotency_key='guardian-reward-released:'||p_session_id; end if;
  else
    insert into public.wallet_transactions(kind,status,from_user_id,to_user_id,from_bucket,to_bucket,points,schedule_id,session_id,related_transaction_id,idempotency_key,metadata)
    values('guardian_deposit_returned','posted',reservation.from_user_id,reservation.from_user_id,'reserved','topup',reservation.points,request_row.schedule_id,p_session_id,reservation.id,'guardian-deposit-returned:'||p_session_id,jsonb_build_object('requestId',request_row.id))
    on conflict(idempotency_key) do nothing returning id into guardian_transaction_id;
    if guardian_transaction_id is null then select id into guardian_transaction_id from public.wallet_transactions where idempotency_key='guardian-deposit-returned:'||p_session_id; end if;
  end if;
  settled := settled||jsonb_build_object('guardianRewardPoints',case when succeeded then reservation.points else 0 end,'guardianRewardTransactionId',guardian_transaction_id);
  update public.cloud_focus_sessions set payload=payload||jsonb_build_object('guardianRewardPoints',case when succeeded then reservation.points else 0 end,'guardianRewardTransactionId',guardian_transaction_id),version=version+1,updated_at=now()
  where user_id=current_user_id and entity_id=p_session_id;
  return settled;
end;
$$;

create or replace function public.notify_wallet_transaction_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid; actor uuid; event_kind text; event_title text; event_body text; event_route text;
begin
  if new.status<>'posted' then return new; end if;
  if new.kind='topup_confirmed' then recipient:=new.to_user_id; event_kind:='wallet_topup_completed'; event_title:='포인트 충전이 완료되었습니다'; event_body:=new.points||'P가 충전 포인트에 반영되었습니다.'; event_route:='/wallet/charge';
  elsif new.kind='topup_refunded' then recipient:=new.from_user_id; event_kind:='wallet_refund_completed'; event_title:='포인트 환불이 완료되었습니다'; event_body:=new.points||'P 환불 처리가 반영되었습니다.'; event_route:='/wallet/refund';
  elsif new.kind='cashout_requested' then recipient:=new.from_user_id; event_kind:='cashout_requested'; event_title:='테스트 현금화 요청을 접수했습니다'; event_body:=new.points||'P가 테스트 정산 대기 상태입니다.'; event_route:='/wallet/cashout';
  elsif new.kind='cashout_completed' then recipient:=new.from_user_id; event_kind:='cashout_completed'; event_title:='테스트 현금화가 완료되었습니다'; event_body:='테스트 정산 결과가 포인트 원장에 반영되었습니다.'; event_route:='/wallet/cashout';
  elsif new.kind='guardian_reward_requested' then recipient:=new.to_user_id; actor:=new.from_user_id; event_kind:='guardian_reward_requested'; event_title:='새 보상 요청이 도착했습니다'; event_body:=new.points||'P 보상 요청을 확인해 주세요.'; event_route:='/guardian/rewards';
  elsif new.kind='guardian_deposit_reserved' then recipient:=(new.metadata->>'studentUserId')::uuid; actor:=new.from_user_id; event_kind:='guardian_reward_approved'; event_title:='보호자 보상이 승인되었습니다'; event_body:=new.points||'P가 집중 성공 보상으로 예약되었습니다.'; event_route:='/focus';
  elsif new.kind='guardian_reward_declined' then recipient:=new.to_user_id; actor:=new.from_user_id; event_kind:='guardian_reward_declined'; event_title:='보상 요청이 거절되었습니다'; event_body:='보호자가 보상 요청을 거절했습니다.'; event_route:='/history';
  elsif new.kind='guardian_reward_released' then recipient:=new.to_user_id; actor:=new.from_user_id; event_kind:='guardian_reward_released'; event_title:='보호자 보상을 획득했습니다'; event_body:=new.points||'P가 획득 포인트에 반영되었습니다.'; event_route:='/history'; else return new; end if;
  if recipient is not null then perform public.create_notification(recipient,actor,event_kind,event_title,event_body,jsonb_strip_nulls(jsonb_build_object('transactionId',new.id,'sessionId',new.session_id,'scheduleId',new.schedule_id,'points',new.points,'route',event_route)),'wallet:'||new.id); end if;
  return new;
end;
$$;

revoke all on function public.start_focus_session(text,text) from public,anon;
revoke all on function public.get_guardian_reward_requests(text) from public,anon;
revoke all on function public.approve_guardian_reward_request(uuid) from public,anon;
revoke all on function public.decline_guardian_reward_request(uuid) from public,anon;
revoke all on function public.finish_focus_session(text,text[],text) from public,anon;
grant execute on function public.start_focus_session(text,text) to authenticated;
grant execute on function public.get_guardian_reward_requests(text) to authenticated;
grant execute on function public.approve_guardian_reward_request(uuid) to authenticated;
grant execute on function public.decline_guardian_reward_request(uuid) to authenticated;
grant execute on function public.finish_focus_session(text,text[],text) to authenticated;
