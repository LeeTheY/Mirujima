create or replace function public.notify_family_link_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    perform public.create_notification(new.student_user_id,new.guardian_user_id,'family_linked','보호자 연결이 완료되었습니다','보호자와 안전하게 연결되었습니다.',jsonb_build_object('familyLinkId',new.id,'route','/my'),'family_linked:'||new.id||':student');
    perform public.create_notification(new.guardian_user_id,new.student_user_id,'family_linked','학생 연결이 완료되었습니다','학생의 동의된 집중 요약을 확인할 수 있습니다.',jsonb_build_object('familyLinkId',new.id,'studentUserId',new.student_user_id,'route','/guardian/students'),'family_linked:'||new.id||':guardian');
  elsif new.status = 'disconnected' and old.status is distinct from 'disconnected' then
    perform public.create_notification(new.student_user_id,new.guardian_user_id,'family_disconnected','보호자 연결이 해제되었습니다','이제 집중 요약과 보상 상태가 공유되지 않습니다.',jsonb_build_object('familyLinkId',new.id,'route','/my'),'family_disconnected:'||new.id||':student');
    perform public.create_notification(new.guardian_user_id,new.student_user_id,'family_disconnected','학생 연결이 해제되었습니다','해당 학생의 집중 요약을 더 이상 볼 수 없습니다.',jsonb_build_object('familyLinkId',new.id,'route','/guardian/students'),'family_disconnected:'||new.id||':guardian');
  end if;
  return new;
end;
$$;

create trigger family_links_notify_after_write after insert or update of status on public.family_links
for each row execute function public.notify_family_link_event();

create or replace function public.notify_focus_session_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare previous_status text := case when tg_op='UPDATE' then old.payload->>'status' else null end;
  next_status text := new.payload->>'status'; session_id text := new.entity_id; schedule_id text := new.payload->>'scheduleId';
begin
  if next_status in ('starting','active') and previous_status is distinct from next_status
    and previous_status not in ('starting','active') then
    perform public.create_notification(new.user_id,null,'focus_started','집중 세션이 시작되었습니다','설정한 집중 시간과 차단 규칙이 적용되었습니다.',jsonb_build_object('sessionId',session_id,'scheduleId',schedule_id,'status',next_status,'route','/focus'),'focus_started:'||session_id);
  elsif next_status in ('success','failed','cancelled') and previous_status is distinct from next_status then
    perform public.create_notification(new.user_id,null,case when next_status='success' then 'focus_completed' else 'focus_failed' end,case when next_status='success' then '집중 세션을 완료했습니다' else '집중 세션이 종료되었습니다' end,case when next_status='success' then '기록과 포인트 정산이 안전하게 반영되었습니다.' else '예약 포인트 반환과 기록 반영을 확인해 주세요.' end,jsonb_build_object('sessionId',session_id,'scheduleId',schedule_id,'status',next_status,'route','/history'),'focus_result:'||session_id);
  end if;
  return new;
end;
$$;

create trigger cloud_focus_sessions_notify_after_write after insert or update of payload on public.cloud_focus_sessions
for each row execute function public.notify_focus_session_event();

create or replace function public.notify_wallet_transaction_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient uuid; event_kind text; event_title text; event_body text; event_route text;
begin
  if new.status <> 'posted' then return new; end if;
  if new.kind='topup_confirmed' then recipient:=new.to_user_id; event_kind:='wallet_topup_completed'; event_title:='포인트 충전이 완료되었습니다'; event_body:=new.points||'P가 충전 포인트에 반영되었습니다.'; event_route:='/wallet/charge';
  elsif new.kind='topup_refunded' then recipient:=new.from_user_id; event_kind:='wallet_refund_completed'; event_title:='포인트 환불이 완료되었습니다'; event_body:=new.points||'P 환불 처리가 반영되었습니다.'; event_route:='/wallet/refund';
  elsif new.kind='cashout_requested' then recipient:=new.from_user_id; event_kind:='cashout_requested'; event_title:='테스트 현금화 요청을 접수했습니다'; event_body:=new.points||'P가 테스트 정산 대기 상태입니다.'; event_route:='/wallet/cashout';
  elsif new.kind='cashout_completed' then recipient:=new.from_user_id; event_kind:='cashout_completed'; event_title:='테스트 현금화가 완료되었습니다'; event_body:='테스트 정산 결과가 포인트 원장에 반영되었습니다.'; event_route:='/wallet/cashout';
  elsif new.kind='guardian_reward_requested' then recipient:=new.to_user_id; event_kind:='guardian_reward_requested'; event_title:='새 보상 요청이 도착했습니다'; event_body:=new.points||'P 보상 요청을 확인해 주세요.'; event_route:='/guardian/rewards';
  elsif new.kind='guardian_deposit_reserved' then recipient:=new.to_user_id; event_kind:='guardian_reward_approved'; event_title:='보호자 보상이 승인되었습니다'; event_body:=new.points||'P가 집중 성공 보상으로 예약되었습니다.'; event_route:='/focus';
  elsif new.kind='guardian_reward_declined' then recipient:=new.from_user_id; event_kind:='guardian_reward_declined'; event_title:='보상 요청이 거절되었습니다'; event_body:='보호자가 보상 요청을 거절했습니다.'; event_route:='/history';
  elsif new.kind='guardian_reward_released' then recipient:=new.to_user_id; event_kind:='guardian_reward_released'; event_title:='보호자 보상을 획득했습니다'; event_body:=new.points||'P가 획득 포인트에 반영되었습니다.'; event_route:='/history';
  else return new; end if;
  if recipient is not null then
    perform public.create_notification(recipient,case when new.from_user_id=recipient then new.to_user_id else new.from_user_id end,event_kind,event_title,event_body,jsonb_build_object('transactionId',new.id,'sessionId',new.session_id,'scheduleId',new.schedule_id,'points',new.points,'route',event_route),'wallet:'||new.id);
  end if;
  return new;
end;
$$;

create trigger wallet_transactions_notify_after_insert after insert on public.wallet_transactions
for each row execute function public.notify_wallet_transaction_event();

create or replace function public.notify_membership_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status='active' and (tg_op='INSERT' or old.status is distinct from 'active') then
    perform public.create_notification(new.user_id,null,'membership_activated','멤버십이 활성화되었습니다','멤버십 전용 AI와 동기화 기능을 사용할 수 있습니다.',jsonb_build_object('membershipId',new.user_id,'route','/my'),'membership_activated:'||new.user_id||':'||coalesce(new.current_period_ends_at::text,new.updated_at::text));
  end if;
  return new;
end;
$$;

create trigger memberships_notify_after_write after insert or update of status on public.memberships
for each row execute function public.notify_membership_event();

revoke all on function public.notify_family_link_event() from public,anon,authenticated;
revoke all on function public.notify_focus_session_event() from public,anon,authenticated;
revoke all on function public.notify_wallet_transaction_event() from public,anon,authenticated;
revoke all on function public.notify_membership_event() from public,anon,authenticated;
