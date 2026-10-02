# 4차 개발 — 휴식 자동 복귀·정산 정책 snapshot

2026-10-02. 로드맵 W06의 휴식·정산 정책 구현과 W07의 실제 Chrome 오프라인 복구 검증을 진행했다. 전체 프로젝트·실계정 릴리스 검증 완료를 의미하지 않는다.

## 동작

- 수동 일시정지는 종료 시각 없이 유지한다. 휴식은 별도 start_focus_break RPC가 서버 종료 시각을 정한다.
- 계획의 breakMinutes를 세션의 총 휴식 예산으로 사용한다. 일찍 복귀하면 실제 휴식한 시간만 차감하고, 다음 휴식은 남은 예산을 사용한다.
- 휴식 중 DNR과 집중 alarm을 해제하고 break alarm을 설정한다. 서버와 Extension 모두 같은 breakEndsAt에서 자동 복귀하며 집중 endsAt은 breakEndsAt + remainingFocusSeconds다.
- break request UUID를 기록해 반복 요청이 휴식을 연장하지 못한다. 서버 소유권·활성 상태·잔여 예산을 검사한다.
- 네트워크 단절이나 브라우저 재시작 시 Extension은 저장된 서버 휴식 시각으로 로컬 DNR과 타이머를 복구한다. 이 경로에서 포인트를 확정하지 않는다.
- Web은 서버 조회로 자동 복귀를 확인하며 online/focus/visibility 이벤트에서 놓친 Realtime 상태를 다시 조회한다. 휴식 시작 응답 유실 시에도 canonical 상태를 다시 확인한다.
- 실제 UI 확인에서 발견한 복구 계획명 덮어쓰기 문제를 수정했다. 진행 중 계획 입력과 AI 적용을 잠가 실행 설정과 표시 설정이 어긋나지 않도록 했다.

## 신규 세션 정책

AGENTS v3의 성공 시 전액 획득 / 실패 시 전액 반환 원칙을 따른다.

- 새 세션은 서버가 depositPolicy `{version:2, mode:"all-or-none"}`를 저장한다. client가 plan에 다른 정책을 넣어도 시작 snapshot은 서버가 정한다.
- 목표 시간과 모든 목표 완료 조건을 만족하면 self deposit 전액을 earned로 전환한다. 일부 목표만 완료하면 failed로 처리하고 전액 topup 반환한다.
- 보호자 reserved 보상도 일부 목표 완료 시 전액 보호자 topup으로 반환한다. 계획 상태도 session 성공/실패와 일치시킨다.
- 정책 없는 기존 세션은 legacy tiered(0/60/80/100%)를 유지한다. 기존 posted 거래나 과거 session을 재작성하지 않는다.
- Web/Extension의 정산 안내와 예상 획득 표시가 해당 세션 snapshot을 따른다.

## 검증

- Vitest: 65 files / 288 tests 통과.
- 로컬 PostgreSQL + pgTAP: 24 SQL files / 402 assertions 통과. 최소 Auth fixture이며 전체 Supabase Auth/API/Realtime 실통합의 대체 검증은 아니다.
- 실제 Chromium MV3 smoke: 9개 통과. 새 항목은 만료된 canonical 휴식의 오프라인 브라우저 재시작 → DNR·절대 타이머 복구다. 로컬 storage fixture이며 Google 로그인·원격 재무 거래는 실행하지 않는다.
- 실제 FocusPlanner 컴포넌트 + 로컬 RPC fixture Playwright: 휴식 카운트다운·자동 복귀·수동 pause 유지·재개·복구 계획명 유지·진행 중 입력 잠금·모바일 가로 넘침 없음·런타임 오류 없음 확인. 전체 Next authenticated route나 실 Supabase 계정 검증은 아니다.
- Root/Web typecheck·lint, Extension production/dev build, Web production build, 공개 번들 비밀 검사 통과.
- 공개 웹 Playwright: 22 통과 / 인증 상태가 없어 3 skipped. 사용자가 학생·보호자 테스트 계정이 아직 없다고 확인했고 로컬 검증부터 진행하도록 선택했다. 신규 실계정 집중·정산·OAuth 검증은 남아 있다.

증거: `/Users/ldy/.codex/visualizations/2026/10/02/01a0fb93-cf0c-7ca3-bd07-7700d1ce9f00/development-phase-4/`에 SQL 로그, 로컬 UI harness 및 desktop/mobile 화면을 저장했다.

## 원격 상태

- 202610020005_canonical_timed_break.sql 실제 Supabase 반영 완료. 대상 한 개만 dry-run한 뒤 적용했다.
- remote migration list와 DB lint의 No schema errors found를 확인했다. 익명 start_focus_break 호출은 HTTP 401 / 42501로 거절됐다.
- 0001·0002·0004·0005는 원격 적용됨. 0003 집중 시작 확인과 0006 정산 정책은 새 Web/Extension 동시 배포·실계정 검증 전까지 원격 미적용이다. 원격은 아직 신규 전액 정책으로 전환되지 않았다.
- 0006은 0003 다음 순서로 적용해야 한다. 현재 순서가 건너뛰어진 상태에서 일반 db push를 무심코 실행하지 않는다.
- Vercel 프로젝트 연결·배포 인증은 없어 Web 원격 배포를 실행하지 않았다. 커밋·push·PR도 실행하지 않았다.

## 남은 순서

1. 실제 학생·보호자 테스트 계정으로 Web ↔ Extension 시작·휴식·완료·정산 검증.
2. 보호자 요청 → 승인/예약 → 집중 시작의 선행 승인 흐름과 동시성(W08). 현재 기존 구현은 시작 후 요청 생성 방식이다.
3. 지갑·Toss·기록·AI·PWA 및 운영 배포의 남은 로드맵 항목.
