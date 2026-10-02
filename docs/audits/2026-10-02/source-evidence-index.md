# 근거 색인

기준 커밋 `c75f606`. 경로는 저장소 상대 경로다. 행 번호는 기준 커밋의 대표 위치이며 후속 수정 후 달라질 수 있다. 코드를 읽은 사실과 운영 환경 재현 여부를 구분한다.

| ID | 근거 | 관찰·신뢰도 |
|---|---|---|
| E01 | `supabase/migrations/202607160002_gate_b_cloud_sync.sql:91,167,189`; `supabase/functions/cloud-sync/index.ts` | 범용 apply_cloud_mutation은 entitlement와 소유자를 검사하지만 session payload 전체 upsert 가능. 이후 migration에서 재정의 미발견. 정적 높음; 실제 악용·배포 상태 미검증 |
| E02 | `apps/web/features/extension/bridge.ts:23`; `src/features/web-bridge/external-handler.ts`; `supabase/migrations/202608110003_focus_goal_completion.sql:168`; `202608240001_canonical_focus_lifecycle.sql`; `202608240007_guardian_reward_workflow.sql` | requestFocusSync는 resolved `{ok:false}`를 검사하지 않음. 서버 start가 active/pending을 생성하는 기반을 wrapper가 사용. 정적 높음 |
| E03 | `apps/web/app/my/page.tsx:23,270,302`; `apps/web/features/family/linked-students-list.tsx`; `supabase/migrations/202608080001_v3_roles_family_focus.sql` | 공유 저장·연결 해제는 UI 닫기만. UI 공유 key와 DB key도 다름. 정적 높음 |
| E04 | `apps/web/app/home/page.tsx:71`; `apps/web/app/guardian/page.tsx:46`; `apps/web/features/profile/guardian-my-page.tsx`; `apps/web/app/my/page.tsx` | 달성률·성과·관계/요청 표시의 고정값 확인. 모든 화면 데이터가 mock이라는 뜻은 아님 |
| E05 | `apps/web/features/focus/focus-planner.tsx:147,373,374,383,590` | 날짜 UI 값과 저장 날짜 불일치. 보상 금액 2000 고정. 계획 저장과 시작이 한 흐름. 정적 높음 |
| E06 | `apps/web/features/wallet/wallet-data.ts:29` | API 오류/형식 오류를 EMPTY_WALLET_SUMMARY로 반환. 정적 높음 |
| E07 | `supabase/functions/wallet-refund-topup/index.ts:2,12,26,34`; `supabase/functions/wallet-confirm-topup/index.ts`; `apps/web/features/membership/payment.ts` | 환불 sandbox payload, actualRefund false. 충전에는 Toss 테스트 API 승인 존재. SDK payment UI 사용, Widget과 구분 |
| E08 | `apps/web/app/globals.css:2326`; `apps/web/app/how/page.tsx:11`; `apps/web/app/privacy/page.tsx:5`; harness 48 PNG | step-grid 모바일 3열과 public-detail CSS 미정의. 코드+시각 높음 |
| E09 | `apps/web/components/payment-overlay.tsx`; `apps/web/app/my/page.tsx`; `apps/web/components/notification-center.tsx`; `apps/web/features/family/linked-students-list.tsx` | PaymentOverlay와 다른 모달의 focus/키보드 처리 편차. 실제 보조기기 검증은 별도 |
| E10 | `apps/web/app/login/page.tsx:70`; `apps/web/app/privacy/page.tsx:5`; `src/background/writing-capture.ts`; `supabase/functions/ai-writing/index.ts` | 광범위한 ‘미수집’ 안내와 사용자가 실행하는 screenshot OCR 전송 기능 구분 필요. 무단 수집을 관찰한 것은 아님 |
| E11 | `apps/web/app/auth/callback/route.ts`; `apps/web/app/login/page.tsx` | callback의 error query를 login UI에서 설명하지 않음. 목적지 복귀 경로 점검 필요 |
| E12 | `apps/web/e2e/helpers/auth-state.ts:4`; `apps/web/e2e/authenticated-flow.spec.ts:5`; `docs/release-checklist.md:124`; `package.json` | 코드 STORAGE_STATE와 문서 AUTH_STATE 불일치. 인증 skip이어도 일반 e2e 성공 가능 |
| E13 | `apps/web/public/sw.js`; `apps/web/components/pwa-register.tsx`; `apps/web/features/notifications`; `src/background/notifications.ts` | SW cache 기반 존재. push/notificationclick/구독 경로 검색에서 구현 미발견 |
| E14 | `apps/web/features/focus/focus-form.ts`; `supabase/migrations/202608110003_focus_goal_completion.sql`; `202608240007_guardian_reward_workflow.sql` | 단계별 deposit 전환율, 세션 생성 이후 guardian request/승인 흐름과 v3 정책 차이 |
| E15 | `supabase/migrations/202608240008_fix_guardian_reward_balance_boundary.sql:7`; `202608240007_guardian_reward_workflow.sql:128`; 기존 finish 내부 함수 | 승인과 종료의 session/reward lock 순서 역전 가능성. 추론 중간; 2 connection 테스트로 확인해야 함 |
| E16 | `src/background/bootstrap.ts`; `src/features/web-bridge/canonical-focus.ts`; `src/features/web-bridge/canonical-focus.test.ts` | 로컬 복구/resync/결과 재전송 기반 존재. 브라우저 종료/실제 DNR 통합 미검증 |
| E17 | `apps/web/features/history`; `supabase/tests/database/focus_history.test.sql`; `supabase/tests/database/ai_coaching.test.sql`; `supabase/migrations/202608240010_ai_coaching_boundaries.sql` | privacy aggregate/AI 권한 경계 구현 기반. SQL 현재 실행 결과 없음 |
| E18 | `public/manifest.json`; `src/features/web-bridge/external-handler.ts` | exact 외부 origin, schema/auth/owner canonical 재조회. all_urls host permission은 external connect 허용과 다른 목적 |
| E19 | `apps/web/features/wallet/topup-panel.tsx`; `apps/web/features/membership/payment.ts` | 금액 변경·취소 후 request key 재사용 시나리오는 추가 재현 후보. 확정 결함으로 집계하지 않음 |

E02의 SQL 파일명은 실제 저장소 경로를 우선한다. RPC wrapper/rename 이력을 함께 확인해야 하며 한 migration만 보고 최종 상태를 판정하지 않는다.

## 검증에 참고한 공식 문서

- [Chrome Extension Service Worker 수명주기](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle): 영구 실행을 가정하지 않고 지속 저장과 재시작 복구를 검증한다.
- [Next.js PWA 가이드](https://nextjs.org/docs/app/guides/progressive-web-apps): manifest만으로 설치·push·offline 검증을 대체하지 않는다.
- [Toss Payments API](https://docs.tosspayments.com/reference): 승인·취소 결과와 로컬 원장을 대조하는 기준이다.
- [WAI-ARIA modal dialog 패턴](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): 초기 focus, Tab 이동 제한, Escape, 종료 후 focus 복귀를 확인한다.
