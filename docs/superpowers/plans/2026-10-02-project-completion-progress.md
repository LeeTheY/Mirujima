# Mirujima 1차 개발·검증 기록

기준일: 2026-10-02. 기준 커밋 `c75f606`, 브랜치 `feat/complete-v3-release-flow`의 미커밋 변경이다. 전체 계획에 따른 개발 시작 승인으로 W00 일부와 W01~W03 핵심 코드를 구현했다. 전체 프로젝트 또는 릴리스 완료를 의미하지 않는다.

> 이후 상태: [2차 개발·원격 반영 기록](2026-10-02-project-completion-phase-2.md). 1차 시점에는 원격 미적용이었으며 2차에서 migration 2개를 적용했다.

## 구현 결과

| 작업 | 변경 동작 | 남은 검증 |
|---|---|---|
| W00 검증 기준 | 인증 상태가 없으면 릴리스 E2E 실패. 잘못된 환경변수 문서 수정. 기존 pgTAP의 함수 부재 검사·entitlement 수·타임스탬프 비교 보완 | 역할별 로그인 fixture, 운영 migration 대조, CI 통합 |
| W01 canonical 보호 | 범용 `apply_cloud_mutation`에서 서버 소유 계획·세션의 위조/갱신/삭제 차단. legacy 허용 필드 유지. 동시 INSERT 충돌에서도 canonical 행 보호 | staging 최종 함수·grant 대조 |
| W03 공유·해제 | 실제 profile 공유 설정 조회/저장. 참여자만 연결 해제. 미정산 지원·예약·보상 요청이 있으면 차단. 반복 해제 멱등 처리와 알림 중복 방지. 다중 학생 해제 결과를 관계별 표시 | 인증 UI E2E, 보호자의 이미 열린 화면·AI cache 철회 반영 |
| W02 집중 시작 | 차단 세션은 `starting` 생성 후 DNR 적용·세션 확인을 거쳐 `active`. 확인 시각부터 타이머 시작. 60초 준비 기한과 멱등 취소/학생 예약 반환. 요청 ID·버전·계정·세션 응답 검증과 제한 시간 적용 | 실제 Chrome 차단/재시작/offline, 구버전 Extension 호환 안내 검증 |

공유·해제 모달에는 이름, 초기 포커스, Tab 제한, Escape 닫기, 닫힌 뒤 포커스 복귀를 적용했다. 서버 저장 실패에는 입력을 유지하고 성공을 표시하지 않는다. 공유 설정 조회 실패도 기본값으로 감추지 않는다.

## DB 변경과 호환성

순서대로 적용할 신규 migration은 다음과 같다. **운영·원격 DB에는 적용하지 않았다.** 새 테이블과 클라이언트 잔액 계산 변경은 없다.

1. `supabase/migrations/202610020001_canonical_sync_boundary.sql`
2. `supabase/migrations/202610020002_family_privacy_mutations.sql`
3. `supabase/migrations/202610020003_focus_enforcement_start.sql`

기존 모델과 RPC 서명을 유지하며 계약에 선택적 `enforcementDeadlineAt`만 추가했다. 기존 로컬 기능을 삭제하지 않았다. Web의 새 bridge 검증은 최신 Extension 응답을 요구한다. DB와 Extension 업데이트 순서·구버전 처리는 staging에서 확인해야 한다.

차단 OFF는 기존처럼 즉시 active가 될 수 있다. 시작 확인은 인증된 소유자의 세션에 묶지만 악성 브라우저에 대한 암호학적 증명은 아니다. 기한 만료 취소는 서버 재조회·확인 경로에서 수행하며 무접속 상태의 자동 예약 청소 운영 작업은 별도로 필요하다.

연결 해제는 진행 중 금융 관계를 자동 변경하지 않고 기존 완료/거절 흐름으로 먼저 정산하도록 한다. 취소 중 이미 보호자 예약이 존재하면 자동 이동 대신 정산을 요구한다. 현재 보상 승인 시점·목표 개수별 deposit 정책은 보존했다. v3 정책 적용은 W06/W08에서 당시 세션 정책·posted 원장 호환성을 포함해 진행한다.

## 실제 검증 결과

| 검증 | 결과 |
|---|---|
| `npm test` | 60개 파일, 243개 테스트 통과 |
| root/Web typecheck·lint | 모두 통과 |
| root Extension·Web production build | 모두 통과 |
| `npm run security:scan-public` | 59개 공개 파일 비밀 패턴 검사 통과 |
| `npm run test:e2e:web` | 공개·권한 경계 18개 통과, 인증 3개 skip |
| 인증 필수 모드 | 인증 상태 없는 `playwright test --list`가 의도대로 실패. 전체 릴리스 통과 아님 |
| 로컬 SQL/RLS | 20개 파일, 339개 단언 통과 |
| canonical INSERT 경합 | 실제 PostgreSQL 두 연결에서 canonical 행 유지·legacy 덮어쓰기 거부 확인 |
| `git diff --check` | 통과 |

SQL은 격리된 PostgreSQL 17.11에 최소 `auth.users`, `auth.uid`, 역할·grant를 준비하고 기존 migration과 신규 3개를 적용했다. 공식 pgTAP v1.3.4 SQL을 직접 로드해 테스트의 `create extension pgtap` 한 줄만 선로딩 환경용으로 대체했다. 나머지 저장소 단언은 그대로 실행했다. 전체 Supabase Auth/JWT/API/Realtime stack이나 `npx supabase test db` 실행을 대신한 것으로 보고하지 않는다. pgTAP fixture는 rollback, 별도 경합 fixture는 삭제했다.

추가 회귀는 범용 sync 변조 8개, 공유·해제 12개, 시작 상태·중복·예약 반환 16개 SQL 단언과 bridge/공유 mutation/Extension reconcile 테스트다. Extension 테스트는 DNR→확인→alarm 순서와 DNR 실패 시 확인 금지를 mock 환경에서 검증했다. 실제 브라우저 DNR 성공을 의미하지 않는다.

## 다음 실행 순서

1. W04: OAuth 오류·내부 목적지 복귀·역할·설치 온보딩을 정리한다.
2. W05: 홈·성과·보호자 화면의 고정 데이터를 실제 집계와 오류 상태로 교체한다.
3. W06: 날짜·초안·목록·편집·보상 금액·휴식·정책 snapshot을 연결한다.
4. W07/W08: 실제 Extension 복구와 보호자 승인·예약 경쟁을 검증한다.
5. W09~W15: 지갑/결제, 반응형, 기록, AI, PWA, 운영 gate를 순차 진행한다.

로그인 상태가 필요한 UI, 실제 MV3 통합, provider 테스트, 원격 DB와 운영 배포는 미완료다. 커밋·push·PR·운영 배포는 수행하지 않았다. 상세 범위와 완료 조건은 [전체 로드맵](2026-10-02-project-completion-roadmap.md)을 따른다.
