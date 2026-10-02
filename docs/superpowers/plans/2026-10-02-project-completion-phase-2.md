# Mirujima 2차 개발·원격 반영 기록

2026-10-02. 전체 계획의 W04 로그인·온보딩, W05 실제 데이터 연결, W07 Extension 통합 일부를 구현했다. 기존 1차 변경을 포함한 미커밋 작업 트리이며 커밋·push·PR은 수행하지 않았다.

## Web 변경

- 미로그인 접근의 내부 목적지를 보존하고 OAuth·역할 선택 후 역할 권한을 다시 확인한다. 허용한 기능 경로만 복귀 대상으로 사용하며 외부 주소·역할 불일치·재귀 login 경로를 차단한다.
- OAuth 취소·코드 누락·교환 실패·profile 조회 실패를 안전한 안내와 재시도로 연결한다. provider fragment 오류도 알려진 코드로 변환하고 원문을 제거한다.
- 확장 상태를 설정 없음, 미지원 브라우저, 연결 불가, 확장 미로그인, 다른 계정, 구버전 응답, 응답 지연, 같은 계정 연결로 나눈다. 화면 복귀와 수동 확인에서 다시 검사한다. ping은 차단 완료 증명이 아니다.
- 학생 홈의 오늘 계획, 현재 세션, 집중 결과, 최근 주간 기록을 서버 데이터로 표시한다. 마이페이지의 성과는 실제 월간 집계로 표시하고 기간을 명시한다.
- 보호자 홈의 학생 선택·집중 지표는 기존 동의 기반 RPC를 사용한다. 마이페이지의 대기 요청은 실제 pending 목록에서 조회한다. 가족 기록은 학생별 조회로 연결하며 공유되지 않는 값을 0으로 합산하지 않는다.
- 지갑 데이터가 실패하거나 형식이 잘못되면 `null/확인 불가`를 표시한다. 실제 0P와 오류를 분리한다. 학생 연결 상태도 실패를 미연결로 표시하지 않는다.

## Extension 변경

- 팝업·집중 빈 화면·Web 관리 화면에 Google 로그인, 계정 확인, 재연결, 로그아웃을 추가했다. Chrome 프로필 로그인을 필수로 요구하지 않는다. 서버 사용자 ID가 실제 웹 연결의 기준이다.
- OAuth 응답의 정확한 Extension callback origin/path를 검사하고 원문 오류를 사용자 화면에 전달하지 않는다. 계정 전환 시 이전 cloud cache와 canonical runtime을 분리한다.
- free/premium과 관계없이 canonical resync를 유지한다. direct message·alarm reconcile·계정 runtime 교체·로그아웃을 직렬화해 이전 비동기 작업이 로그아웃 뒤 차단을 다시 적용하지 않게 했다.
- `starting`은 실행 중 타이머나 결과 선택 화면으로 표시하지 않는다. 서버 확인 응답의 사용자·계획·세션 일치도 다시 검사한다.
- 차단 규칙에서 정확한 control plane origin은 접근을 허용한다. allowlist 모드에서도 웹 집중·종료 화면을 사용할 수 있다. 비슷한 도메인과 다른 origin은 예외가 아니다.
- development는 `dist-dev`, production은 `dist`로 분리했다. production 통신 origin은 production manifest와 일치시킨다. 실제 개발 ID를 Web의 Git 제외 환경설정에 반영했다.

설치·실행·OAuth 확인 항목은 [Web·Extension 개발 안내](../../development-web-extension.md)를 따른다.

## 검증 범위

| 검사 | 결과 |
|---|---|
| unit | 64개 파일, 277개 테스트 통과 |
| root/Web typecheck·lint | 통과 |
| Web·Extension production build, Extension development build | 통과 |
| 공개 번들 검사 | 61개 공개 파일, 비밀 패턴 검사 통과 |
| Web E2E | 22개 통과, 인증 state 없는 3개 skip. 릴리스 통과가 아님 |
| 실제 Chromium Extension | 8개 smoke 통과. 로컬 fixture이며 실제 OAuth·금융 없음 |
| SQL 회귀 | 1차의 격리 PostgreSQL/pgTAP 339개 통과 근거 유지. 2차에서 SQL 본문 추가 변경 없음 |
| 원격 DB lint | `No schema errors found`, 결과 0건 |
| 원격 RPC 익명 접근 | sharing/disconnect 모두 HTTP 401, PostgreSQL permission code `42501` |

OAuth code 실패·취소·fragment·외부 목적지, Extension 로그인 부재·다른 계정·잘못된 응답·timeout, canonical 확인 세션 불일치·로그아웃 경합, tenant별 계획·잘못된 잔액을 회귀 입력으로 사용했다.

## 원격 반영

사용자가 필요한 원격 배포를 승인했다. 연결된 Supabase의 migration 목록을 먼저 읽고 별도 배포 디렉터리에서 dry-run 대상이 아래 두 개뿐임을 확인한 뒤 적용했다.

1. `202610020001_canonical_sync_boundary.sql` — canonical sync 보호
2. `202610020002_family_privacy_mutations.sql` — 공유 설정·연결 해제 RPC

실제 `db push --linked --yes` 성공, 원격 migration 목록 대조, DB lint, 익명 RPC 거부까지 확인했다. 사용자 관계·포인트 원장을 검증 fixture로 변경하지 않았다.

`202610020003_focus_enforcement_start.sql`은 미적용이다. 구버전 웹/Extension은 준비 확인을 보내지 못할 수 있어 새 클라이언트의 배포·업데이트와 묶어 적용해야 한다. Vercel 프로젝트 연결과 배포 인증이 확인되지 않아 Web 배포는 실행하지 않았다. deployment 권한을 커밋·push·스토어 제출 권한으로 확대하지 않았다.

## 남은 개발

- 실제 로그인 계정의 새로고침·역할·공유/해제·데이터 일치 E2E와 Extension OAuth 콜백 등록 확인.
- W06 계획 날짜·초안/목록/편집·보상 금액·휴식·정책 snapshot.
- W07 canonical 집중의 실제 계정 통합, offline 정산, sleep/wake·SW 강제 종료와 구버전 업데이트.
- 보호자 기록의 서로 다른 timezone 경계와 최신 공유 철회의 열린 화면/cache 반영. 현재 오류를 0으로 감추지는 않는다.
- W08 이후 보상 승인 시점, provider 승인/취소, 전체 반응형·기록·AI·PWA·운영 gate.

전체 완성 또는 production 출시 완료로 표시하지 않는다. [전체 로드맵](2026-10-02-project-completion-roadmap.md)의 개별 완료 조건을 계속 따른다.
