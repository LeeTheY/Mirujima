# 3차 개발 — 계획 저장·목록·편집·취소

2026-10-02. 전체 로드맵 W06 중 계획 CRUD와 설정 저장을 구현했다. W06 전체 완료를 의미하지 않는다.

## 구현

- 집중 화면에서 계획만 저장하거나 저장 후 시작할 수 있다. 저장만 할 때 Extension 연결과 포인트 예약을 요구하지 않는다.
- 기존 cloud_schedules를 조회해 계획 목록을 표시하고 계획을 다시 열어 편집한다. 같은 ID와 createdAt을 유지한다.
- 저장 재시도도 기존 ID를 유지한다. 서버 응답이 불확실하면 목록을 새로 불러와 저장 여부를 확인해야 한다.
- 선택 날짜가 실제 dateKey로 저장된다. 초기 날짜는 profile timezone을 사용하고 설정이 누락되거나 잘못되면 Asia/Seoul을 사용한다.
- 설명, 활동 방식, 우선순위, 목표, 휴식 길이, 자기 디파짓, 보호자 요청 금액을 입력·저장·복원한다. 기존 도메인 includeSubdomains와 비활성 차단 목록도 보존한다.
- HTTP/HTTPS 외 scheme을 거절하고 존재하지 않는 날짜를 거절한다.
- upsert_focus_plan이 시작 RPC와 같은 사용자 lock을 사용한다. 진행 중 세션이나 미해결 보호자 요청이 있는 계획은 수정·취소하지 못한다.
- updatedAt을 기대 revision으로 비교해 다른 창의 최신 변경을 덮어쓰지 못한다. 취소는 cancelled 상태를 기록하고 반복 호출해도 중복 처리가 없다. 취소된 계획을 upsert로 되살리지 못한다.

## 검증

- 단위 테스트: 65 files / 282 tests 통과.
- 로컬 PostgreSQL + pgTAP: 기존 339개 + 신규 15개 = 354 assertions 통과. 최소 Auth fixture로 검증했으며 전체 Supabase API/Auth/Realtime 통합 검증을 대체하지 않는다.
- Root/Web typecheck·lint, Web production build, 공개 번들 secret scan 통과.
- 공개 웹 Playwright: 22 통과 / 인증 상태가 없어 3개 skipped. 실제 로그인 상태에서 새 CRUD UI를 끝까지 조작하는 검증은 아직 수행하지 못했다.
- 신규 SQL 검증 범위: 선택 날짜, ID·createdAt 보존, 오래된 편집·취소 거절, starting 세션 보호, 보호자 요청 보호, 다른 계정 취소 거절, 취소 멱등성, 취소 후 복구 금지, anon 권한 거절.

## 실제 원격 반영

- 202610020004_focus_plan_edit_boundary.sql을 Supabase linked project에 적용했다.
- 별도 release workdir에서 202610020003을 제외해 dry-run 대상 한 개를 확인한 뒤 배포했다.
- 취소 RPC의 익명 요청은 HTTP 401 / 42501로 거절됐다.
- migration list의 local/remote 일치와 db lint --linked --level error의 No schema errors found를 확인했다.
- Web Vercel 배포는 프로젝트 연결·배포 인증이 없어 수행하지 않았다. 커밋·push·PR은 요청되지 않아 실행하지 않았다.
- 202610020003_focus_enforcement_start.sql은 Web/Extension 동시 배포가 필요해 계속 보류한다. 전체 db push로 이를 실수로 적용하지 않도록 주의해야 한다.

## 다음 작업

- 고정 길이 휴식의 종료 시각·자동 복귀·휴식 중 차단 정책을 canonical 상태와 Extension에 연결.
- 신규 집중 세션의 디파짓 정책 snapshot/version 및 기존 posted 원장 호환성.
- 실제 학생 로그인 상태에서 계획 CRUD와 Extension 연동 전체 흐름 검증.
- Guardian 승인 후 시작 흐름 및 정산 동시성(W08).
