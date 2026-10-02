# W11–W15 연속 개발 결과

W11–W15의 코드와 재현 가능한 로컬 검증을 구현했다. 제한된 Supabase 변경도 원격 반영했다. 전체 제품의 production 완료나 실제 로그인·공급자·기기 통합 통과를 의미하지 않는다. 기존 미커밋 작업을 보존했으며 커밋·push·PR은 수행하지 않았다.

## 1. 구현한 기능

| 단계 | 결과 | 남은 확인 |
|---|---|---|
| W11 | 320px 헤더/CTA/한국어 줄바꿈, 상세 페이지 카드, loading/error/not-found, 공통 dialog stack·focus 복귀·inert·Tab·Escape, navigation/toggle 접근성, callback canonical origin | 인증 후 전체 폼·모달과 보조기술 전수 검증 |
| W12 | 학생 timezone의 일·주·월 경계, posted 원장 기준 earned/반환, 금액 기준 self deposit 전환율, exact focus seconds, 목표별 계획 시간과 실제 미측정 구분, 시간대별 시작 횟수와 표 | 실제 계정의 홈·기록·원장 대조 |
| W13 | 요청 전체 AI timeout·재시도 한도, 오류별 안내, 공유 ON 학생만 최소 입력, 생성 종료 동의·권한 재검사, 표시 중 5초 재검사·30초 lease·blur 제거 | 실제 provider 호출·비용/보존·동의 철회 여정 |
| W14 | 명시적 SW 업데이트, 공개 cache·민감 URL 제외, 사용자 버튼으로 push opt-in/revoke, server lease·최대 3회 재시도·만료 endpoint 제거, generic 잠금화면 알림, Extension 본인 이벤트 polling/dedupe, global logout 전 server 구독 해제 | VAPID·scheduler와 실제 설치/푸시/권한 철회 |
| W15 | npm ci CI, 공개/실계정 gate 분리, 실제 browser/DB/RLS 검사, 안전한 request UUID, service-only 정체 조회, 운영·복구·단계 배포 문서, artifact에 연결된 출시 증거 검사 | GitHub CI 실행·staging rollout·백업 복원 연습 |

목표별 실제 집중 시간이 기존 데이터에 없으므로 계획 시간을 실제 시간으로 표시하지 않는다. 시간대 시작 횟수는 집중 지속시간 heatmap이 아니다. 차트와 텍스트 표는 같은 서버 dataset을 사용하며 신규 차트 의존성을 추가하지 않았다.

## 2. 변경 파일

- 웹 공통: [dialog-accessibility.tsx](/Users/ldy/Desktop/Code/React/Mirujima/apps/web/components/dialog-accessibility.tsx), [globals.css](/Users/ldy/Desktop/Code/React/Mirujima/apps/web/app/globals.css), loading/error/not-found, Dialog/PaymentOverlay, callback-origin·proxy 및 관련 테스트.
- 기록·AI: [student-history-dashboard.tsx](/Users/ldy/Desktop/Code/React/Mirujima/apps/web/features/history/student-history-dashboard.tsx), history query/data/controls 및 학생·보호자 페이지, 공유 계약, [guardian-ai-summary.tsx](/Users/ldy/Desktop/Code/React/Mirujima/apps/web/features/membership/guardian-ai-summary.tsx), AI UI 오류 분류, [ai-writing/index.ts](/Users/ldy/Desktop/Code/React/Mirujima/supabase/functions/ai-writing/index.ts), shared AI 동의·응답 helper.
- 알림·PWA: [push-settings.tsx](/Users/ldy/Desktop/Code/React/Mirujima/apps/web/features/notifications/push-settings.tsx), notification center, PwaRegister, [sw.js](/Users/ldy/Desktop/Code/React/Mirujima/apps/web/public/sw.js), config/env example, auth signOut, [server-notifications.ts](/Users/ldy/Desktop/Code/React/Mirujima/src/background/server-notifications.ts), background bootstrap/SW, push dispatch와 helper.
- 검증·운영: [verify.yml](/Users/ldy/Desktop/Code/React/Mirujima/.github/workflows/verify.yml), package scripts, public secret scanner, operations/release evidence checker, 실제 Dialog·PWA browser smoke, Web E2E, AI handler mock/SQL 회귀, [operations.md](/Users/ldy/Desktop/Code/React/Mirujima/docs/operations.md), roadmap/release checklist.

## 3. DB migration

| SQL | 목적 | 적용 |
|---|---|---|
| [0013](/Users/ldy/Desktop/Code/React/Mirujima/supabase/migrations/202610020013_focus_history_ledger_metrics.sql) | canonical 기록/원장 집계·timezone context | 로컬 + 원격 |
| [0014](/Users/ldy/Desktop/Code/React/Mirujima/supabase/migrations/202610020014_guardian_ai_consent_boundary.sql) | AI 명시 동의·필드별 최소 집계 | 로컬 + 원격 |
| [0015](/Users/ldy/Desktop/Code/React/Mirujima/supabase/migrations/202610020015_notification_push_delivery.sql) | 기존 devices/notifications additive 구독·전달 상태, owner/service RPC | 로컬 + 원격 |
| [0016](/Users/ldy/Desktop/Code/React/Mirujima/supabase/migrations/202610020016_operations_snapshot.sql) | service-only read-only 정체 조회 | 로컬 + 원격 |

신규 테이블은 없다. 0015의 전달 상태는 notifications의 별도 jsonb column으로 저장해 기존 data 2KiB 계약을 유지한다. 전송 lease를 HTTP 전에 기록하고 완료 token을 검증한다. 최대 10개 병렬 요청으로 claimed batch 전체를 처리하며 일부 완료 기록 실패가 남은 항목 처리를 중단하지 않는다. 단위 회귀 2개로 동시 요청 제한과 50개 전체 처리·완료 실패 후 나머지 처리를 확인했다.

연결 프로젝트 `qhueocvatlgaoupokgmc`에서 별도 release workdir dry-run으로 정확히 위 네 파일만 확인한 뒤 적용했다. migration 대조 일치, 원격 DB lint 오류 없음. `ai-writing` v16과 `notification-push-dispatch` v2 ACTIVE·JWT 검증 ON을 확인했고 익명 POST는 각각 HTTP 401이었다. 함수 배포 성공은 실제 provider 호출 성공이 아니다.

보류된 `0003/0006/0007/0010/0011/0012`와 관련 금융 handler는 이번 원격 반영에 포함하지 않았다. 로컬 root에서 전체 db push를 실행하지 않았다.

## 4. 기존 기능 영향

기존 MV3 DNR·로컬 집중·storage·alarm·사이트 모드를 유지한다. 기록 계약은 additive optional field로 확장했다. 기존 가족 AI fixture는 명시적 AI 공유 동의를 설정해 기존 허용 범위 검사를 유지했고, 기본 OFF 차단은 별도 검사했다.

로그아웃은 server push 구독 해제가 실패하면 종료하지 않고 재시도를 안내한다. 새 RPC 0015가 먼저 필요하며 원격 반영했다. 모든 기기의 구독을 해제하는 것은 global logout과 같은 범위다. 웹 배포 전에는 새 UI의 동의 revision/lease·오류 안내가 운영 웹에 적용됐다고 볼 수 없다.

## 5. 보안·권한 변화

보호자 AI 입력에 원본 URL·검색·본문·목표 제목·세션 ID를 보내지 않는다. 공유하지 않은 시간·달성 항목은 0으로 위장하지 않고 null이다. 서버가 응답 직전 동의·entitlement를 재조회하고 불일치면 결과를 폐기한다. 구버전 client가 이미 받은 내용을 회수하는 것은 불가능하다.

Push 구독은 본인 기기만 설정하며 exact HTTPS 공급자 host·키 형식을 검증한다. 전달/운영 RPC는 service-only다. 잠금 화면에는 generic title/body와 알림 UUID만 사용하고 payload URL로 이동하지 않는다. 클릭은 로그인·역할 확인 경로를 사용한다. 금융 원장 권한이나 자동 지급을 확장하지 않는다.

요청 추적은 X-Request-Id와 operation/status만 로그에 남긴다. 금융 handler의 새 추적 응답은 로컬 코드이며 해당 coordinated rollout 전까지 원격 적용을 주장하지 않는다. secret scanner는 새 VAPID 개인키·dispatch secret도 검사한다.

## 6. 실행한 테스트

| 검사 | 실제 결과·범위 |
|---|---|
| root Vitest | 84 파일 / 453개 통과. Web·Extension·shared handler 포함 |
| PostgreSQL 17.11 + pgTAP | 33 파일 / 645개 단언 통과. migration 최종 상태의 실제 SQL/RLS/권한 검사. Docker Supabase 전체 stack 실행을 의미하지 않음 |
| 신규 SQL | 기록 16, AI 동의 8, push/운영 경계 18 통과 |
| AI handler | 실제 handler + mock provider 6개: 완료 재검사, OFF 무호출, 처리 중 철회, 만료, 안전한 role 오류, 전체 timeout abort |
| 공개 Playwright | 51개 통과: 6개 폭×5개 route, 인증 복귀/키보드/PWA 리소스 및 계산된 텍스트 대비. 로그인 세션을 주입한 테스트 아님 |
| 실제 Dialog + 실제 CSS fixture | 320px 초기 focus·Tab trap·inert·중첩 Escape·focus 복귀 통과. 인증 후 제품 모달 전수 검사 아님 |
| 실제 production SW | 설치/controller·공개 offline·민감 결제 URL 대체 안내/미cache·waiting update·명시 활성화·자기 cache 정리 통과. 실제 기기 설치/푸시는 미검증 |
| 실제 Chromium MV3 | 9개 통과: 외부 메시지·origin 거부·blocklist/allowlist/off·재시작·pause/finish·offline break 복귀. 실계정 canonical 정산 통합은 미검증 |
| frontend-harness | 공개 54 PNG를 모두 직접 확인, 300 기능/overflow 검사 통과, 324 rubric 행 최소 8/10, 6 viewport 평균 8.69. 인증 화면 제외 |
| 출시 gate | 실제 인증 state 누락과 출시 evidence 누락은 실패. synthetic 모든 passed evidence도 현재 미커밋 artifact에서 실패함을 확인 |

하네스의 최종 공개 범위 보고서는 [보존한 증거](/Users/ldy/.codex/visualizations/2026/10/02/01a0fb93-cf0c-7ca3-bd07-7700d1ce9f00/development-w11-w15/frontend-harness/summary.md)에 있다. 이전 수집의 stale loading PNG와 앵커/쿼리 순서 inventory 불일치는 통과로 사용하지 않았다. 최종 설정은 initial `/`, `/#how`, `/#privacy`, 실제 callback query를 각각 선언하고 `/focus`를 인증 후 미검증으로 제외했다. 기준 점수를 낮추지 않았다.

하네스 촬영 이후 별도 대비 측정에서 기본 CTA가 4.49로 확인돼 배경만 기존 primary-strong 토큰으로 변경하고 수치 E2E를 추가했다. 본문 5.91·microcopy 5.12와 CTA의 4.5 이상을 검증한다. 하네스 점수는 색상 수정 전 시각 평가이며 전체 WCAG 적합성 보증이 아니다. 모든 인증 badge·상태 색의 전수 대비 검사는 남아 있다.

## 7. build 결과

root lint/typecheck·Extension production build, Web typecheck/lint/production build 통과. 공개 bundle 비밀 패턴 검사 63개 파일 통과. `git diff --check` 통과. 이후 변경한 browser 검증 scripts는 별도 lint와 실제 실행으로 검사했다. 기존 framework·Manifest 버전과 저장소 구조를 바꾸지 않았다.

```bash
cd /Users/ldy/Desktop/Code/React/Mirujima
npm run verify:local
npm run test:e2e:public:web
npm run test:web:dialog
npm run test:web:pwa
```

DB stack과 계정 상태가 준비된 출시 환경은 `npm run verify:release`를 사용한다. 원격 운영 DB reset을 검증 방법으로 사용하지 않는다. `verify:release` 전체 통과를 보고한 것은 아니다.

## 8. 남은 production gate

1. 분리된 학생·보호자·무료/유료/만료 계정으로 로그인→집중→Extension 확인→결과→원장, 보호자 연결·철회·보상을 대조한다. 인증 화면의 harness/모달/폼·실제 보조기술 검사도 포함한다.
2. 보류 SQL/금융 handler·새 Web/Extension을 staging에서 coordinated rollout하고 Toss 실제 테스트 승인·부분 취소·응답 유실과 원장을 대조한다. `0012`의 가족 entitlement 변경도 원격 통합 완료가 아니다.
3. Vercel 연결·인증, 공개 환경변수 및 실제 exact origin/Extension ID를 확인하고 웹 preview부터 배포한다. 현재 저장소에는 Vercel project 연결이 없어 Web 원격 배포를 수행하지 않았다.
4. 서버 VAPID/dispatch secret·scheduler를 설정하고 지원 기기에서 설치·업데이트·알림 허용/거부/철회·실제 전달을 확인한다. 원격 push 함수는 배포했으나 실제 전달은 활성화/검증하지 않았다.
5. 실제 AI provider·모델·비용/보존 설정과 철회/권한 만료 여정을 확인한다. 로컬 mock 성공을 provider 성공으로 대체하지 않는다.
6. GitHub workflow 실행, 실제 정체 관측·예약 대조·staging DB 백업 복원·구버전 Extension 호환 및 금융 참조 보존 정책을 확인한다.
7. Toss 계약·현금화 provider·미성년자/법률/회계 gate와 artifact SHA를 확정한다. 자동 현금화·실결제·Billing을 임의 활성화하지 않는다.

운영 대응과 rollback은 [운영 문서](/Users/ldy/Desktop/Code/React/Mirujima/docs/operations.md)를 따른다. 인증/공급자/실기기 증거가 없는 현재 상태는 일반 출시 승인 상태가 아니다.
