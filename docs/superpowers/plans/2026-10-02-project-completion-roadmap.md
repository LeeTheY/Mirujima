# Mirujima 전체 프로젝트 개발 계획

> 실행 담당자: 아래 작업을 개별 검토·검증 단위로 진행한다. 이 문서는 전체 개발 로드맵이며 자동 구현·위임·커밋·push·배포 지시가 아니다. 정책을 바꾸는 작업은 연결된 설계와 결정표를 먼저 확인한다.

**Goal:** 학생 집중, Extension 차단, 서버 정산, 보호자 공유를 실제로 이어지는 제품으로 완성한다.

**Architecture:** 기존 Next Web/PWA, root Vite MV3 Extension, Supabase canonical backend를 유지한다. 서버 권한과 상태 전이를 먼저 닫고, 기존 화면에 실제 데이터·실패 복구를 연결한다. DB는 기존 테이블·payload·RPC를 우선 확장한다.

**Tech Stack:** 현재 lockfile의 Next 16.3.0, React 19.2.7, TypeScript 6.0.3, Vite 8.1.4, Supabase, Zod, Vitest, Playwright. 이 버전 표는 업그레이드 권고가 아니다.

**Spec:** [프로젝트 완성 설계](../specs/2026-10-02-project-completion-design.md), 최상위 `AGENTS.md` v3.

**W11–W15 진행:** [연속 구현·검증·원격 반영](2026-10-02-project-completion-w11-w15.md). UI 접근성, 원장 기반 기록, AI 동의 재검사, PWA/푸시 경계와 운영·CI를 구현했다. 실계정·provider·기기·staging gate는 별도 미완료다.

**이번 진행:** [4차 휴식·정산 정책](2026-10-02-project-completion-phase-4.md). W06 휴식 자동 복귀·정산 정책 snapshot을 구현하고 실제 Extension 오프라인 복구와 React UI fixture를 검증했다. 0005는 원격 반영했으며 0003·0006 동시 배포와 실계정 검증은 남아 있다.

**3차 진행:** [계획 CRUD·서버 반영](2026-10-02-project-completion-phase-3.md).

**이전 진행:** [2차 개발·원격 반영](2026-10-02-project-completion-phase-2.md), [Web·Extension 개발 안내](../../development-web-extension.md). W04/W05 코드와 W07 실제 브라우저 smoke 일부를 반영했다.

**진행 기록:** [1차 구현·검증 결과](2026-10-02-project-completion-progress.md). 아래 체크는 해당 코드·로컬 검증 단계이며 작업 패키지 전체 출시 완료를 뜻하지 않는다.

**기준:** 2026-10-02, `c75f606`, `feat/complete-v3-release-flow`. 현재 상태는 [기능 행렬](../../audits/2026-10-02/inventory.md), 근거 E01~E19는 [근거 색인](../../audits/2026-10-02/source-evidence-index.md)을 따른다.

## 공통 제약

- 새 기능보다 현재 버튼·저장·권한·정산이 약속한 동작을 수행하는 것을 우선한다.
- 기존 `Schedule`, `FocusSession` 등 타입과 Extension local 기능은 삭제하지 않는다. storage 변경 시 migration을 제공한다.
- 공개 client에 service role/provider secret/static 인증 secret을 넣지 않는다. exact origin, authenticated owner, canonical re-fetch, RLS를 유지한다.
- 원장은 불변이며 posted 합산이 잔액의 기준이다. UI에서 성공을 추정해 포인트를 증가시키지 않는다.
- 보호자는 동의된 aggregate만 본다. AI 요약은 명시 동의 기본 OFF다.
- 신규 table은 마지막 수단이다. 기존 테이블로 무결성·보안을 유지할 수 없는 이유를 migration에 남긴다.
- 테스트 결제·sandbox 환불·자동 현금화 제한을 임의로 live 전환하지 않는다.
- 검증을 위해 운영 사용자 관계·거래·세션을 변경하지 않는다. 별도 테스트 DB·계정·provider test mode를 사용한다.
- 브랜치/구조 이동/프레임워크 교체/대규모 리팩터링을 묶지 않는다. 커밋·push·PR·배포는 각각 명시 요청 범위에서만 수행한다.

## 1. 핵심 진단

프로젝트에는 상당한 기능 기반이 있다. 하지만 **화면의 약속, 실제 서버 상태, 검증 범위가 일치하지 않는 부분**이 출시를 막는다.

| 우선순위 | 지금 해결해야 하는 문제 | 근거 | 결과물 |
|---|---|---|---|
| P0 | 범용 sync가 canonical session payload를 갱신할 수 있음 | E01: 정적 확인, 운영 악용 미검증 | 서버 소유 필드·행 보호, 회귀 SQL |
| P0 | Extension 차단 확인 전 active, 부정 응답 무시 | E02 | starting/apply/active/실패 복구 계약 |
| P0 | 공유 설정 저장·연결 해제가 실제 반영되지 않음 | E03 | 서버 mutation과 재조회, 실패 시 상태 유지 |
| P0·live gate | 환불은 실제 provider 취소가 아닌 sandbox | E07 | 테스트 취소 API·대조 및 live 차단 유지 |
| P1 | 홈/성과/일부 관계 표시 고정값, 조회 실패가 0P | E04,E06 | 실제 집계와 loading/error/empty 구분 |
| P1 | 날짜 선택 무시, 계획 저장·편집 흐름 부족, 보상금액 고정 | E05 | 완결된 계획→준비→시작 흐름 |
| P1 | 모바일 읽기 붕괴, 상세 CSS 누락, 모달 접근성 편차 | E08,E09 | 반응형·접근성 회귀 기준 |
| P1 | 인증 E2E skip, SQL/실제 MV3 검증 공백 | E12,E16 | 생략되면 실패하는 release gate |
| P2 | 일부 통계·PWA push·운영 관측 보완 | E13,E17 | 검증된 부가 기능과 운영 가능성 |

P0는 수정 전 재현 범위를 확정한다. 정적 위험 경로를 실제 데이터 유출·금전 피해 발생으로 단정하지 않는다.

## 2. 출시 전략과 일정 가정

권장 기본값은 **학생 집중 안정화 → 보호자 기능 → 결제 신뢰성 → 운영 출시**다. 사용자가 전체 계획에 따른 개발 시작을 승인했다. 단계 출시 순서를 실행 기준으로 사용하며 계약·상품의 미확정 사항은 별도 유지한다.

| 단계 | 포함 작업 | 완료 시 사용할 수 있는 것 | 다음 단계 조건 |
|---|---|---|---|
| A. 기준 고정 | W00 | 명세·테스트 계정·실패 재현 기준 | 정책 차이 기록, 재현 환경 준비 |
| B. 신뢰 경계 복구 | W01~W03 | 신뢰 가능한 상태·공유·해제 | P0 회귀 통과 |
| C. 학생 흐름 완성 | W04~W07,W09 | 실제 계획·집중·기록·잔액의 제한 베타 | 실 Extension 전체 흐름 통과 |
| D. 보호자·결제 | W08,W10 | 동의 기반 지원·테스트 승인/취소 | 동시성·provider 대조 통과 |
| E. UI·분석·PWA | W11~W14 | 전 화면 사용성·기록·알림·설치 경험 | 인증 포함 화면 평가 통과 |
| F. 출시 준비 | W15 | staged 배포 가능한 release candidate | 운영 gate·rollback·관측 확인 |

W11의 공개 모바일 수정 설계는 B와 함께 진행할 수 있다. 실제 데이터가 연결된 인증 화면 평가는 C/D 이후 다시 한다. W12/W13은 W03의 공유 권한과 W05의 집계를 소비한다. W15의 관측 설계는 초기에 시작하되 최종 gate는 마지막이다.

**노력 추정:** 기존 구조에 익숙한 개발자 1명 기준 전체 약 40~65 작업일(8~13주), 첫 신뢰 가능한 학생 베타 약 15~25 작업일. 신규 디자인 전면 교체 없이 구현·회귀 검증을 포함한 계획 추정이며 약속 일정이 아니다. 계약/심사/법률 검토 대기는 제외한다. W00 재현 결과로 재산정한다.

## 3. 작업 패키지

모든 작업은 현재 실패/누락을 확인 → 최소 변경 → 관련 unit/SQL/E2E → 사용 흐름 확인 → 근거 문서 갱신 순으로 닫는다. 작은 CSS 변경에 구현을 그대로 복제하는 unit test를 추가하지 않는다. 금융·권한·복구는 통합/회귀 테스트가 필수다.

### W00. 기준·정책·검증 환경 고정 — P0 / 선행 없음

**대상:** `AGENTS.md`, `docs/release-checklist.md`, `apps/web/e2e/helpers/auth-state.ts`, `apps/web/e2e/authenticated-flow.spec.ts`, `apps/web/playwright.config.ts`, `supabase/tests/database/`.

- [ ] 저장소 명세와 구현 차이를 결정표로 확정한다: deposit all-or-none/단계별 비율, guardian 승인 시점, 학생 수·좌석 상품, Widget 요구.
- [ ] 무료/유료 학생, 보호자, 무관한 사용자 테스트 계정을 분리한다. 인증 state는 Git 제외 위치에 보관한다.
- [ ] 문서의 `MIRUJIMA_E2E_AUTH_STATE`를 실제 코드의 `MIRUJIMA_E2E_STORAGE_STATE`와 맞춘다. release 모드에서는 인증 state 누락·만료를 skip 대신 실패로 처리한다.
- [ ] 별도 테스트 DB에 migration을 적용하고 기존 17 SQL 테스트를 실행해 기준 결과를 남긴다. 운영 migration 상태 확인은 read-only 비교로 분리한다.
- [ ] 과거 배포 체크리스트의 결과와 이번 결과를 분리하고 release SHA를 고정한다.

**완료:** 테스트 계정별 역할·entitlement·잔액 fixture, 실행 결과, 정책 결정 근거가 남고 인증 누락을 성공으로 보고할 수 없다. 생산 데이터 변경 없음.

### W01. 범용 동기화와 canonical 데이터 권한 분리 — P0 / W00

**대상:** `supabase/functions/cloud-sync/index.ts`, `src/features/cloud-sync/service.ts`, `packages/contracts/src/index.ts`. 기존 migration을 수정하지 않고 신규 `supabase/migrations/` 파일로 RPC를 교체한다. 기존 `gate_b_cloud_sync.test.sql` 확장 및 신규 `canonical_sync_boundary.test.sql`을 추가한다.

- [x] premium/cloud-sync 권한을 가진 사용자로 자신의 canonical session 상태·endsAt·금융 참조를 범용 RPC에 전달하는 테스트를 작성한다. 인증 없는 사용자만 검사해서 통과시키지 않는다.
- [x] canonical row 신규 위조·갱신·삭제 및 진행 중 schedule의 금융/정산 관련 필드 변경도 검사한다.
- [x] legacy local-only sync payload의 허용 필드를 정의하고 서버 lifecycle 관리 필드는 거부한다. 판단에 클라이언트의 `isCanonical` 선언만 사용하지 않는다.
- [x] 서버에서 row 성격·소유자·현재 상태를 재확인한다. 직접 RPC 호출에도 같은 경계가 적용되게 한다.
- [x] 기존 Extension sync 충돌/version/idempotency, 일반 schedule/settings/report 동작을 회귀 확인한다.

**입출력:** 기존 sync envelope는 유지하되, 허용 mutation 또는 명확한 권한/상태 오류를 반환한다. Web·Extension client 검사는 보조이며 최종 차단은 DB 경계다.

**완료:** 시간·상태·reserved/정산 참조가 범용 sync로 바뀌지 않고 기존 local sync는 유지된다. SQL fixture 결과와 실제 최종 함수/grant를 함께 확인한다.

### W02. 집중 시작·Extension 적용 확인·복구 — P0 / W01

**대상:** `apps/web/features/extension/bridge.ts`, `bridge.test.ts`, `apps/web/features/focus/focus-planner.tsx`, `canonical-focus-service.ts`, `src/features/web-bridge/external-handler.ts`, `canonical-focus.ts`, `packages/contracts/src/index.ts`, 신규 migration, `canonical_focus_lifecycle.test.sql`.

- [x] `{ok:false}`, 잘못된 schema/version/requestId, 응답 timeout, Web/Extension 계정 불일치, DNR 설정 실패를 회귀 입력으로 만든다.
- [x] bridge 응답 schema와 제한 시간을 정의하고 모든 요청에서 명시적 실패를 처리한다. ping 성공을 차단 적용 성공으로 사용하지 않는다.
- [x] 차단 필요 세션은 starting 생성·reserve → canonical fetch/DNR 적용 → session-bound 적용 확인 → active로 전이한다. 차단 off의 조건은 별도로 명시한다.
- [x] starting 기한 초과 시 같은 세션 상태를 재조회하고 멱등 취소/예약 반환한다. 성공했지만 응답만 유실된 경우 active를 중복 생성하지 않는다.
- [ ] Web 새로고침/뒤로가기/재로그인에서 pending/active를 복원한다. 시작 재시도마다 무조건 UUID를 새로 만들지 않는다.
- [x] direct message와 주기 resync가 같은 상태를 처리하도록 단일 canonical reconcile 규칙을 사용한다.

**완료:** 실제 차단 실패인데 Web가 집중 성공 시작을 표시하는 경로가 없다. 한 번의 시작 요청이 세션·reserve를 중복 생성하지 않는다. Extension 확인은 악성 브라우저에 대한 완전한 부정행위 방지 수단으로 설명하지 않는다.

### W03. 공유 설정·연결 해제의 실제 서버 동작 — P0 / W00

**대상:** `apps/web/app/my/page.tsx`, `apps/web/features/family/linked-students-list.tsx`, `student-link-data.ts`, `linked-students-data.ts`, 신규 `sharing-preferences.ts`, 신규 migration, `profile_family_wallet_ui.test.sql`, 신규 E2E `family-privacy.spec.ts`.

- [x] UI key를 `shareCompletion/shareTotalFocusMinutes/shareRewardStatus/shareAiSummary` 계약으로 맞추고 서버 값을 초기 상태로 사용한다.
- [x] 저장은 본인 권한으로 서버 반영 후 재조회한다. 실패 시 모달/입력값을 유지하고 성공 문구를 표시하지 않는다.
- [ ] 학생 OFF 변경 후 guardian aggregate 및 AI 입력에서 해당 값이 제거되는지 확인한다. 기존 true 데이터를 계속 cache해 보여주지 않는다.
- [x] 연결 해제 RPC에서 참여자 auth, 활성 관계, 진행 중 guardian-funded session, reserved point, pending reward를 하나의 transaction 경계로 검사한다.
- [x] 안전한 정산이 끝난 경우만 disconnected로 변경하고 중복 알림을 방지한다. 다중 해제는 관계별 성공/실패를 숨기지 않는다.
- [x] 개인정보 문구를 자동 수집, 로컬 기능 처리, 사용자가 요청한 OCR/AI 전송, 보호자 공유로 구분한다.

**완료:** 새로고침해도 설정 유지, 보호자 재조회에서도 철회 적용, 해제 후 접근 불가, 실패 시 관계·잔액 보존, 중복 클릭에도 정산/알림 중복 없음. 기본 공유 true/true/true/false 보존.

### W04. 로그인·역할·설치 온보딩과 오류 복귀 — P1 / W00

**대상:** `apps/web/features/auth/actions.ts`, `require-role.ts`, `apps/web/app/auth/callback/route.ts`, `apps/web/app/login/page.tsx`, `apps/web/e2e/auth-boundaries.spec.ts`, `authenticated-flow.spec.ts`.

- [x] OAuth 취소/만료/교환 실패에 이해 가능한 안내와 재시도를 제공한다. query error를 무시하지 않는다.
- [x] 로그인 전 내부 목적지를 안전한 상대 경로로만 보존한다. 외부 URL redirect를 허용하지 않고 역할 권한을 다시 검사한다.
- [x] 미설치, 미로그인, 다른 계정, 지원하지 않는 브라우저를 구분한다. 모바일은 가능한 Web 과업과 desktop 차단 요구를 설명한다.
- [ ] 최초 profile 생성·역할 미선택·세션 만료·로그아웃 후 보호 화면 재접근을 검사한다.

**완료:** 첫 방문자가 오류나 빈 화면에 멈추지 않고 다음 행동을 알 수 있다. 다른 역할 화면과 외부 redirect가 허용되지 않는다.

### W05. 홈·마이페이지·보호자 홈 실제 데이터 연결 — P1 / W03,W04

**대상:** `apps/web/app/home/page.tsx`, `apps/web/app/my/page.tsx`, `apps/web/app/guardian/page.tsx`, `apps/web/features/profile/guardian-my-page.tsx`, `apps/web/features/history/history-data.ts`, `apps/web/features/family/linked-students-data.ts`, 신규 집계 loader/RPC.

- [x] 오늘 날짜·timezone·계획 개수·완료 개수·총 집중시간·진행 세션·최근 활동을 같은 집계 기준으로 조회한다.
- [ ] guardian 홈과 my의 학생·요청·활동을 실제 관계/보상 데이터로 채운다. 무관한 학생·비동의 항목은 반환하지 않는다.
- [ ] 고정 0%/0건/미연결 문구를 없애고 loading/empty/error/ready를 구분한다. 조회 실패는 데이터 없음으로 표시하지 않는다.
- [ ] 홈·기록·마이페이지가 동일 fixture에 동일 합계를 표시하는지 비교한다.

**완료:** 계획 생성·집중 종료·보상 승인·연결 해제 후 관련 화면이 서버 값으로 갱신된다. 불필요한 매초 polling은 추가하지 않는다.

### W06. 계획 저장·편집·준비·휴식의 완결성 — P1 / W00,W02

**대상:** `apps/web/features/focus/focus-planner.tsx`, `focus-form.ts`, `focus-form.test.ts`, `canonical-focus-service.ts`, `packages/contracts/src/index.ts`, 신규 plan 목록/편집 컴포넌트, 신규 migration, `focus_goal_completion.test.sql`.

- [x] 선택 날짜를 dateKey에 반영하고 사용자의 timezone을 사용한다. UTC 자정 근처 테스트로 오늘 날짜가 어긋나지 않게 한다.
- [ ] 초안 저장, 계획 목록, 편집, 취소, 준비, 시작을 구분한다. 기존 plan id를 유지하며 변경한 필드만 저장한다.
- [x] guardian 요청 금액을 정수·범위 검증된 입력으로 받고 고정 2,000P를 제거한다. 승인된 reserve와 변경할 수 없는 조건을 명시한다.
- [x] activity mode·priority·허용/차단 hostname·목표 시간·break를 저장값과 일치시킨다. chrome:// 등 차단 불가 대상은 유효 사이트처럼 표시하지 않는다.
- [x] pause와 정해진 시간의 break를 구분하고 종료시각·자동 복귀·휴식 중 차단 정책을 Web/Extension에서 일치시킨다.
- [x] W00에서 확정한 deposit 정책을 신규 세션에 적용한다. 기존 세션은 당시 정책 snapshot/version으로 처리하며 과거 posted 거래를 수정하지 않는다.

**현재 경계:** 체크된 항목은 코드와 로컬 자동 검증 범위다. 실계정 UI 및 0003·0006 동시 배포는 미완료이며, 미완성 입력을 보관하는 초안 저장도 남아 있다.

**완료:** 내일 계획을 저장하면 내일로 남고, 편집해도 중복 생성되지 않으며, 새로고침·휴식·재개 후 남은 시간이 같은 canonical 상태를 따른다. 목표 시간 전 성공 처리 금지 유지.

### W07. 실제 Extension 차단·재시작·오프라인 검증 — P1 / W02,W06

**대상:** `src/background/bootstrap.ts`, `alarms.ts`, `blocking.ts`, `message-handler.ts`, `src/features/web-bridge/canonical-focus.ts` 및 관련 기존 테스트. 신규 Extension 통합 시나리오와 수동 smoke 문서.

- [ ] 실제 개발 manifest와 persistent Chrome profile로 allowlist/blocklist/off를 확인한다. production exact origin 규칙은 완화하지 않는다.
- [ ] Web 닫기, SW 중지, Chrome 재시작, 기기 sleep/wake 후 deadline·DNR·현재 session 복구를 검증한다.
- [ ] offline 종료 결과를 보관하고 reconnect 후 한 번만 정산하는지 확인한다. 이전 사용자 결과가 새 사용자 계정으로 전송되지 않게 한다.
- [ ] 휴식/종료/포기 시 DNR 제거 실패와 재시도를 검증한다. local 기능은 서버 장애에도 보존한다.
- [ ] 구버전 local storage fixture migration, 기존 탭 그룹화/OCR/요약 동작을 변경 범위에 맞게 회귀 확인한다.

**완료:** 실제 브라우저 trace 또는 수동 재현 기록과 서버 결과가 일치한다. API mock unit 통과만으로 이 작업을 완료 처리하지 않는다.

### W08. 연결 코드·보호자 보상·동시성 — P1 / W03,W05,W06

**대상:** `apps/web/features/family/family-link-panel.tsx`, `family-code-redeemer.tsx`, `guardian-reward-requests.tsx`, `guardian-reward-data.ts`, `supabase/functions/family-link-issue/index.ts`, `family-link-redeem/index.ts`, 신규 migration, `guardian_reward_workflow.test.sql`, `role_family_membership.test.sql`.

- [ ] 코드 발급/입력 CTA를 실제 도착 화면과 일치시키고 만료 countdown을 server expiresAt으로 계산한다.
- [ ] 5분 경계·재발급 무효화·한 번 사용·역할 오류·5회 실패·발급 rate limit·같은 학생 동시 연결을 검증한다.
- [ ] W00 정책에 맞춰 요청→승인/거절→reserve→시작→지급/반환을 연결한다. 승인 금액과 학생 표시 금액이 같아야 한다.
- [ ] 요청 승인과 집중 종료/연결 해제/환불을 동시 실행한다. session/reward/wallet lock 순서를 통일하고 deadlock·중복 reserve를 확인한다.
- [ ] 보호자 학생 selector와 배지를 실제 공유·요청 상태로 갱신한다.

**완료:** 잔액 초과 지원 불가, 같은 요청 중복 승인 단일 반영, 동시 완료에도 음수 잔액·중복 지급·고아 reserve 없음. 학생 1명 활성 guardian 1명 제약 유지.

**5차 진행:** [시작 전 보상 승인 구현·검증 기록](2026-10-02-project-completion-phase-5.md). 요청/승인/예약/시작/취소 반환을 로컬 DB와 실제 React 컴포넌트에서 검증했다. 코드 경계·연결 해제/환불 경합·실계정 여정은 남아 W08 전체를 완료 처리하지 않는다. 신규 0007은 0003·0006과 동시 rollout 전까지 원격 미적용이다.

**6차 진행:** [연결 코드·동시 처리 검증 기록](2026-10-02-project-completion-phase-6.md). 만료/재발급/잠금/단일 사용과 연결·금융 경합 10개를 로컬에서 검증했다. 독립 연결 코드 0008은 원격 적용 및 DB lint·익명 RPC 차단 확인을 완료했다. Web UI 배포와 실계정 여정은 남아 있다.

### W09. 지갑 조회·실패·거래 설명 — P1 / W00

**대상:** `apps/web/features/wallet/wallet-data.ts`, `topup-panel.tsx`, `topup-history-modal.tsx`, 지갑을 소비하는 home/my 컴포넌트, 신규 `wallet-data.test.ts`.

- [x] 조회 결과를 성공 잔액과 오류 상태로 구분한다. 유효한 0P와 네트워크/서버/응답 형식 오류를 구분하는 회귀를 작성한다.
- [x] 오류에는 확인 시점·재시도를 표시하고 확정되지 않은 거래는 ‘처리 중’으로 표시한다.
- [x] topup/reserved/earned, 충전 환불/획득 지급을 각각 설명한다. test/sandbox 배지를 관련 화면에서 일관되게 표시한다.
- [x] 거래 목록에서 주문·세션·보상과 상태/실패 이유를 연결하되 provider secret은 노출하지 않는다.

**완료:** 서버 장애가 0P라는 잘못된 정보로 보이지 않고 모든 잔액·거래가 ledger와 대조된다.

**7차 진행:** [지갑 오류·거래 표시 구현 기록](2026-10-02-project-completion-phase-7.md). 조회 실패/0P 구분, 재조회·시점, 환불/현금화 조회 gate, 충전 미확정 거래와 안전한 결과 표시를 로컬에서 검증했다. `wallet-summary` 단일 함수는 원격 배포했다. 전체 원장 연결·실패 상세·실계정 대조는 남아 W09 전체를 완료 처리하지 않는다.

**8차 진행:** [전체 원장 조회·거래 연결 기록](2026-10-02-project-completion-phase-8.md). 조회 RPC와 전체 거래·필터·cursor·안전한 사유·연결 거래 표시를 구현하고 로컬 ledger 대조를 검증했다. 0009는 단독 원격 적용했다. 위 체크는 로컬 구현 기준이며 실제 계정 대조와 Web 배포 검증은 남아 있다.

### W10. Toss 승인·취소·대조·멤버십 운영 경계 — P0 live gate / W01,W08,W09

**대상:** `supabase/functions/wallet-refund-topup/index.ts`, `wallet-confirm-topup/index.ts`, `wallet-create-topup-order/index.ts`, `membership-confirm-payment/index.ts`, `_shared/toss.ts`, `apps/web/features/membership/payment.ts`, `apps/web/features/wallet/topup-panel.tsx`, `toss_reliability.test.sql`, 신규 migration.

- [ ] 테스트 모드에서 sandbox 환불 경로와 provider 취소 경로를 명확히 분리한다. 실제 취소 응답 확인 없이 topup_refunded를 확정하지 않는다.
- [ ] 원 결제 잔여 취소액·현재 topup 가용액을 함께 검사한다. 환불 요청/진행 중 지원 reserve와의 경쟁을 검증한다.
- [ ] 승인/취소 성공 뒤 DB 실패, callback 중복, 네트워크 timeout의 결과 불명 상태를 대조하는 복구 작업을 만든다. 확인 전 새 승인·취소를 무조건 발행하지 않는다.
- [ ] 금액 변경·결제창 취소·다시 결제에서 주문/idempotency key의 재사용·교체 조건을 검증한다.
- [ ] 필요하면 공식 Widget으로 전환하되 자체 결제수단 UI를 흉내 내지 않는다. 서버 amount/owner/order 검증은 유지한다.
- [ ] 멤버십 활성화·만료·취소와 entitlement를 서버 상품 설정으로 통합 검증한다. Billing key/자동 지급은 계약 확인 전 비활성화한다.
- [ ] live gate: merchant 계약, 환불정책, 미성년자, 지급 계약, 법률/회계 검토와 운영 담당자 대조 절차를 기록한다.

**완료:** provider 테스트 승인·부분취소·중복·오류복구 증거와 원장 대조표가 있다. live 전환은 별도 승인 작업이다. 자동 현금화 미구현은 의도적 제한으로 사용자에게 정확히 표시한다.

**9차 진행:** [승인 복구·충전 주문 생명주기](2026-10-02-project-completion-phase-9.md)를 로컬 구현했다. provider 조회 후 승인 복구, 응답 유실 시 동일 주문 키 유지, 승인 전 주문의 서버 확인 취소를 검증했다. 실제 provider 취소/부분 환불·멤버십 전체 생명주기·실계정 여정은 남아 W10 전체를 완료 처리하지 않는다. 0010·승인 handler·Web은 동시 rollout 전까지 원격 미적용이다.

**10차 진행:** [부분 취소·환불 복구](2026-10-02-project-completion-phase-10.md)를 로컬 구현했다. sandbox/provider 카드 테스트 분리, 단일 dispatch, 취소 조회 복구·불명 결과 예약 보존, 환불/보호자 예약 경합을 검증했다. 실제 provider 거래·운영 복구 도구·멤버십 생명주기 gate는 남으며 W10 전체 완료가 아니다. 0011·환불 handler·Web은 원격 미적용이다.

**11차 진행:** [멤버십 주문·기간·상속 권한](2026-10-02-project-completion-phase-11.md)을 로컬 구현했다. 동일 주문 복구·서버 확인 취소·현재 이용 상태와 승인 영수증 분리, 가족 entitlement 철회·기간 만료·Extension 기능 판정을 검증했다. 실제 결제·승인된 이용권의 provider 취소/환불·운영 복구 도구는 남으며 W10 전체 완료가 아니다. 0012와 새 승인 handler·Web·Extension은 원격 미적용이다.

### W11. 반응형·공통 상태·접근성 정리 — P1 / 공개 UI 선행 없음, 인증 UI W03~W09

**대상:** `apps/web/app/globals.css`, `app/page.tsx`, `app/login/page.tsx`, `app/how/page.tsx`, `app/privacy/page.tsx`, `components/dashboard-shell.tsx`, `payment-overlay.tsx`, `notification-center.tsx`, 모달이 있는 my/focus/family/history 컴포넌트, `e2e/accessibility-responsive.spec.ts`.

- [x] public-detail 계열 container/header/grid 스타일을 연결한다. 1120~1200px 최대 폭, 모바일 여백, 카드 간격을 보장한다.
- [x] 320/390에서 header 단어 분절과 step-grid 3열을 해소한다. 한국어 word-break를 적용하되 긴 URL·식별자가 overflow하지 않게 별도 처리한다.
- [x] login 메시지를 압축하고 주요 CTA를 찾기 쉽게 배치한다. ‘집중 화면 보기’는 로그인 이후 이동임을 알린다.
- [x] 기존 PaymentOverlay 패턴을 기준으로 dialog 이름, 초기 focus, Tab 제한, Escape, 닫힌 뒤 focus 복귀를 적용한다. navigation aria-current와 toggle 상태도 제공한다.
- [ ] 모든 주요 폼에 label, 오류 연결, focus 이동, 중복 제출 중 상태를 정의한다. 토스트만으로 저장 실패를 설명하지 않는다.
- [ ] harness에 anchor 두 상태와 인증 화면/오류/모달 시나리오를 등록해 동일 6 viewport로 재평가한다. 키보드와 실제 대비도 별도 검사한다.

**완료:** 주요 과업을 320px 및 키보드로 수행 가능, 각 평가 항목 8/10 이상, modal 외부로 focus 누출 없음. 평균 점수만 올리고 특정 화면 결함을 남기지 않는다.

### W12. 기록·통계의 요구 정합성 — P2 / W05,W06,W08

**대상:** `apps/web/features/history/history-query.ts`, `history-data.ts`, `student-history-dashboard.tsx`, `guardian-history-dashboard.tsx`, 관련 unit tests, `supabase/tests/database/focus_history.test.sql`, 신규 집계 RPC 변경.

- [x] 일/주/월 경계와 timezone을 통일하고 성공/실패/취소·휴식 제외 기준을 문서화한다.
- [x] 목표별 집중 시간, 연속일, earned, deposit 성공전환율, 차단 시도, 시간대 분포의 가용 source와 집계 정의를 확정한다. 원본 데이터가 없으면 숫자를 만들지 않는다.
- [x] 우선 요약·일별 추이·목표별 막대를 구현하고 실제 질문이 있는 경우 시간대 heatmap을 추가한다. 차트 아래 표를 같은 dataset으로 렌더링한다.
- [x] guardian selector와 공유 OFF에서 통계/표/AI에 같은 제한을 적용한다.

**완료:** 홈·기록·표·원장이 같은 기간에 같은 합계를 반환하고 민감 raw 활동은 guardian 응답에 없다. 차트 도입 시 설치 버전/번들 증가를 측정한다.

### W13. AI 코칭의 제품 완성도 — P2 / W03,W06,W12

**대상:** `supabase/functions/ai-writing/index.ts`, `_shared/ai-coaching.ts`, `_shared/membership.ts`, `apps/web/features/history/student-ai-insights.tsx`, focus의 AI 적용 UI, `ai_coaching.test.sql` 및 관련 unit tests.

- [x] 미가입·만료·권한 없음·rate limit·timeout·출력 schema 실패에 서로 맞는 안내와 재시도를 제공한다.
- [x] 추천 계획은 사용자 확인 전 저장/시작/포인트 이동을 하지 않는다. 수정 제안과 적용 후 값을 구분한다.
- [x] guardian summary는 요청 시 최신 공유 동의를 재검사한다. 과거 cache가 철회된 정보를 다시 노출하지 않게 한다.
- [ ] provider 모델과 입력 크기·비용·timeout을 운영 설정으로 확인한다. raw URL/검색/본문을 가족 요약 입력으로 보내지 않는다.

**완료:** entitlement·동의·한도 회귀 통과, 실패해도 계획과 포인트가 바뀌지 않음, 테스트 계정의 실제 provider 호출 결과 검증.

### W14. 알림·PWA·offline·업데이트 — P2 / W03,W07,W08

**대상:** `apps/web/public/sw.js`, `components/pwa-register.tsx`, `lib/pwa.ts`, `components/notification-center.tsx`, `features/notifications/`, `src/background/notifications.ts`, 기존 devices/notifications 확장 migration, 신규 push 구독·전송 서버 코드.

- [ ] 설치 가능 조건·manifest icon·standalone·HTTPS·SW 업데이트를 production build로 검증한다. dev의 offline 페이지 방문과 구분한다.
- [x] 사용자가 알림 필요성을 이해한 뒤 권한을 요청한다. 허용/거부/나중에/철회와 만료 subscription 제거를 처리한다.
- [x] 서버 notifications 이벤트를 in-app/PWA/Extension 채널에 매핑하고 dedupe_key로 같은 이벤트 중복을 제어한다.
- [x] 알림 클릭은 role·auth·공유 권한 재확인 후 목적지로 이동한다. 잠금화면 내용은 민감 정보를 최소화한다.
- [x] offline shell과 허용한 요약만 cache하고 금융·연결·AI 요청을 background queue로 재전송하지 않는다. 로그아웃 시 사용자별 cache가 남지 않게 한다.

**완료:** 실제 지원 기기에서 설치/업데이트/오프라인 재진입·알림 거부/철회가 동작하고 금융 재전송·다른 사용자 cache 노출이 없다.

### W15. CI·관측·배포·운영 회귀 — P1 / W00부터 설계, 출시 전 전체

**대상:** `package.json`, `apps/web/playwright.config.ts`, 신규 `.github/workflows/verify.yml` 또는 확인된 기존 CI, `docs/release-checklist.md`, `docs/operations.md`, 관련 서버 에러 경계.

- [x] lockfile 기반 설치, root/Web unit·typecheck·lint·build, public/auth E2E, DB/RLS, public secret scan을 gate로 묶는다.
- [x] 실제 Extension 통합과 provider 테스트를 자동/수동 gate로 구분하고 담당·증거를 명시한다. 환경 미구성을 pass로 처리하지 않는다.
- [ ] request/session/order correlation ID로 시작 실패·정산 대기·provider 불명 상태·권한 거절을 관측한다. URL 원본·검색어·secret을 로그에 남기지 않는다.
- [x] pending settlement/refund 정체 탐지, 실패 재처리, reserve 대조, DB 백업·복구, 사용자 문의 처리 절차를 작성한다.
- [ ] staging→제한 베타→일반 출시로 진행한다. additive migration과 구버전 Extension 호환을 확인하고 기능 flag·서버 rollback·client 업데이트 정책을 기록한다.
- [x] 과거 cloud session 보존/삭제와 ledger 참조·분쟁 증거 보존을 검토한다. 금융 연결 데이터를 일반 cleanup으로 잃지 않는다.

**완료:** 신규 환경에서 동일 release 검증을 재현할 수 있고 장애를 탐지·대조·복구할 수 있다. 이 계획 작성 자체로 배포를 실행하지 않는다.

## 4. 첫 2주 실행안

큰 기능을 추가하기 전에 아래 검토 가능한 결과를 만든다. 기간보다 완료 조건을 우선한다.

| 순서 | 작업 | 검토할 결과 |
|---|---|---|
| 1 | W00 테스트/정책 기준 | 인증 skip 차단, 기존 SQL 실제 결과, 정책 차이 결정표 |
| 2 | W01 권한 경계 | payload 변조 재현→차단 증거, legacy sync 회귀 |
| 3 | W03 공유/해제 | 저장·새로고침·동의 철회·미정산 해제 차단 E2E |
| 4 | W02 시작 프로토콜 | 부정 응답/timeout/중복 요청/다른 계정 실패 복구 |
| 5 | W11 공개 UI 일부 | 동일 viewport 전후 이미지, anchor 포함 harness 재실행 |

첫 2주에 위 작업이 모두 끝난다고 가정하지 않는다. 재현 난도가 높으면 P0를 완료한 뒤 W04 이후로 넘어간다. 디자인 다듬기를 이유로 권한 수정 검증을 생략하지 않는다.

## 5. 통합 회귀 행렬

| 축 | 필수 조합 | 핵심 단언 |
|---|---|---|
| 역할 | 학생/보호자/무관한 사용자, 무료/유료/만료 | 소유권·entitlement·공유 범위 |
| 계획 | 오늘/내일/자정, 생성/편집/중복 클릭 | 선택 날짜·id·금액 보존 |
| 집중 | 설치 없음/다른 계정/차단 실패/active/paused/종료 | 허위 active 없음, 단일 reserve/정산 |
| 복구 | Web 닫기/SW 중지/Chrome 재시작/offline/sleep | 지속 차단·deadline·pending queue |
| 가족 | 코드 만료/5회 실패/재발급/동시 redeem/해제 | 일회성·단일 guardian·정산 보존 |
| 금융 | 금액 변조/잔액 부족/동시 승인·환불/중복 callback | 원장 불변·금액 제한·멱등성 |
| provider | timeout/성공 후 DB 실패/부분 취소 | 확인 중 상태·대조 복구 |
| privacy | 공유 항목별 OFF/AI OFF/해제 후 조회 | raw 및 철회 정보 미반환 |
| UX | 6 viewport, keyboard, loading/empty/error/dialog | 읽기·행동 명확성·focus·복구 안내 |
| PWA | 설치/업데이트/offline/알림 거부·철회 | cache 분리·금융 재전송 금지 |

## 6. 검증 명령과 실행 경계

아래 일반 검증 명령은 현재 저장소에 존재한다. 필요한 테스트 DB·계정·브라우저가 준비된 환경에서 실행한다.

```bash
cd /Users/ldy/Desktop/Code/React/Mirujima
npm test
npm run typecheck
npm run typecheck --workspace @mirujima/web
npm run lint
npm run lint --workspace @mirujima/web
npm run build
npm run build --workspace @mirujima/web
npm run test:e2e:web
npm run security:scan-public
```

로컬 Supabase 테스트 환경이 준비되고 대상이 운영이 아님을 확인한 뒤:

```bash
cd /Users/ldy/Desktop/Code/React/Mirujima
npx supabase test db
```

초기 조사에서는 SQL을 실행하지 않았다. 1차 개발에서 별도 PostgreSQL 17.11/pgTAP 환경으로 20개 파일·339개 단언을 검증했다. 전체 Supabase stack의 `npx supabase test db` 실행과 운영 migration 대조는 미완료다. 원격 DB reset 명령을 검증 편의상 사용하지 않는다.

인증 E2E의 현재 변수명은 `MIRUJIMA_E2E_STORAGE_STATE`다. 학생·보호자 state를 각각 주입해 실행하고 W00 이후 release에서는 skip 0을 요구한다. 위 명령 통과만으로 OAuth/provider/MV3 실기 검증을 대체하지 않는다.

## 7. 명세 커버리지와 완료 판단

| AGENTS v3 영역 | 담당 작업 |
|---|---|
| 구조·기존 기능·공유 계약·DB 원칙 | W00,W01,W07,W15 |
| 디자인·역할·로그인·학생/보호자 화면 | W04,W05,W11 |
| 가족 연결·개인정보·RLS | W01,W03,W08 |
| Web↔Extension·집중·사이트 차단·완료 | W02,W06,W07 |
| 지갑·보상·Toss·멤버십·현금화 제한 | W08,W09,W10 |
| AI·알림·기록·PWA | W12,W13,W14 |
| secret·오류·보안·운영 | W00,W01,W10,W15 |

현재 계획에서 의도적으로 보류하는 것은 계약 없는 live 자동 지급·정기 Billing, 전면 모노레포 이동, 새 상태 관리 도입, 근거 없는 감시 지표다. 기능 명세를 삭제하는 것이 아니라 승인·데이터·운영 전제조건 뒤에 배치한다.

최종 완료는 **기능 코드가 존재하는 상태가 아니라 실제 역할별 여정, 금융/권한 경계, 장애 복구, 화면 접근성, 운영 증거가 모두 충족된 상태**다. 검증하지 않은 항목은 완료 체크를 하지 않는다.
