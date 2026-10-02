# Web·Chrome Extension 함께 개발하기

Web은 계획·계정·기록을 관리하고 Extension은 실제 브라우저 차단을 수행한다. 로그인 토큰을 웹 메시지로 전달하지 않는다. 양쪽에서 선택한 Supabase 사용자 ID를 비교하며 Chrome 프로필 이메일은 로그인 힌트로만 사용한다.

## 현재 개발 설정

- Web: `http://localhost:3000`
- 개발 Extension 폴더: `/Users/ldy/Desktop/Code/React/Mirujima/dist-dev`
- 이 경로를 실제 Chromium에 로드해 확인한 개발 ID: `oclggommkbaipebnaklgocnafmdcmldc`
- `apps/web/.env.local`의 공개 `NEXT_PUBLIC_MIRUJIMA_EXTENSION_ID`에 위 ID를 설정했다. 파일은 Git 제외 상태다.
- 실제 Chrome에서 표시된 ID가 다르면 해당 공개 설정을 맞추고 Web 개발 서버를 다시 시작한다. 개발 ID를 출시된 Extension ID로 간주하지 않는다.

## 빌드·실행

```bash
cd /Users/ldy/Desktop/Code/React/Mirujima
npm run build:dev
npm run dev --workspace @mirujima/web -- --hostname localhost --port 3000
```

Chrome의 `chrome://extensions`에서 개발자 모드를 켜고 **압축해제된 확장 프로그램을 로드합니다**로 위 `dist-dev` 폴더를 선택한다. 이미 로드했다면 수정 후 다시 빌드하고 Extension을 새로고침한다. 팝업 또는 집중/웹 탭의 Google 로그인 버튼으로 웹과 같은 계정을 선택한다. 웹 집중 화면의 **연결 다시 확인**에서 상태를 확인한다.

개발 빌드는 `dist-dev`, production 빌드는 `dist`로 분리했다. production의 runtime origin과 `externally_connectable`은 모두 `https://mirujima.vercel.app`를 사용한다. 로컬 `.env.local`의 localhost 값이 production 통신 origin을 바꾸지 않는다. 다른 배포 주소로 바꿀 때는 manifest·runtime·Web 설정을 함께 검토한다.

## OAuth 설정 확인 항목

Supabase Auth는 `redirectTo`를 허용된 URL과 대조하므로 정확한 웹 및 Extension 콜백 설정이 필요하다. [Supabase 공식 Redirect URLs 문서](https://supabase.com/docs/guides/auth/redirect-urls)를 따른다.

- 개발 Web 콜백: `http://localhost:3000/auth/callback`
- production Web 콜백: `https://mirujima.vercel.app/auth/callback`
- 현재 개발 Extension 콜백: `https://oclggommkbaipebnaklgocnafmdcmldc.chromiumapp.org/supabase-auth`
- 출시 Extension은 실제 출시 ID의 콜백을 별도로 사용한다.

이번 단계에서 원격 Auth redirect 목록과 실제 Google 로그인을 검증하거나 변경하지 않았다. 새 개발 ID의 콜백 등록 여부는 실제 계정 연결 검증에 포함한다. 주소 전체를 광범위하게 허용해 문제를 우회하지 않는다.

## 실제 브라우저 smoke 검증

3000 포트가 비어 있는 상태에서 실행한다. 테스트는 임시 서버·별도 Chromium 프로필을 생성하고 완료 후 종료/삭제한다.

```bash
cd /Users/ldy/Desktop/Code/React/Mirujima
npm run build:dev
npm run test:extension:smoke
```

[Playwright 공식 Extension 검증 방식](https://playwright.dev/docs/chrome-extensions)에 따라 bundled Chromium의 persistent context에 unpacked MV3를 로드한다. 로그인 UI, 실제 external messaging의 미로그인 응답·origin 거부, blocklist/allowlist/OFF, 웹 접근 유지, pause/finish 해제, 브라우저 재시작 복구를 검증한다.

이 smoke는 **로컬 집중 fixture**다. 실제 Google 로그인, Web canonical 시작·금융 정산, 서버 장애·sleep/wake·서비스 워커 강제 종료 전체를 검증한 결과가 아니다. production 통합에서는 학생·보호자·무관한 사용자 계정과 실제 Extension을 추가로 확인한다.

## 원격 배포 상태

2026-10-02, Supabase `qhueocvatlgaoupokgmc`에 `202610020001`·`202610020002`·`202610020004`·`202610020005`·`202610020008`을 적용했다. `202610020003` 시작 확인 프로토콜과 `202610020006` 신규 전액 정산 정책은 새 Web·Extension과 함께 배포하기 전까지 미적용이다. Vercel 프로젝트 연결·배포 인증은 이 workspace에서 확인되지 않아 Web 원격 배포는 수행하지 않았다. 기존 시작 프로토콜을 사용하는 원격 서버가 새 `starting` 동작까지 지원한다고 표시하지 않는다.

4차 smoke는 만료된 canonical 휴식 fixture의 오프라인 브라우저 재시작 시 차단과 절대 타이머 복구도 검사한다. 서버 포인트 정산은 수행하지 않는다.

## 시작 전 보호자 보상 승인 (5차 로컬 구현)

보상을 사용할 계획은 **계획 저장 → 보상 요청 보내기 → 보호자 승인 → 승인 상태 확인 → 집중 시작** 순서로 실행한다. 대기/승인 중 계획 수정은 잠기며 시작 전 요청 취소 시 예약된 보호자 포인트가 반환된다. 차단 적용 실패 시 학생·보호자 예약을 모두 반환한다. 서버 금액과 원장 상태를 사용한다.

신규 `202610020007`은 원격 미적용이다. 0003·0006·0007과 Web/Extension을 함께 전환해야 하며, 현재 로컬 컴포넌트 RPC fixture·PostgreSQL 검증을 실제 로그인/원격 정산 성공으로 간주하지 않는다. [5차 결과](superpowers/plans/2026-10-02-project-completion-phase-5.md)를 참고한다.

## 연결 코드 시간·동시 처리 보강 (6차)

0008 연결 코드 서버 수정은 원격 적용했다. 잠금을 기다린 뒤 실제 현재 시각으로 만료를 판정하며, 발급 대기 후 정확히 5분을 부여한다. 신규 UI는 만료 코드 숨김, 남은 입력 횟수·잠금 해제 countdown, 발급 응답 유실 시 자동 재시도 방지를 제공한다. UI는 로컬 구현/검증이며 Web 원격 배포는 수행하지 않았다. [6차 결과](superpowers/plans/2026-10-02-project-completion-phase-6.md)의 로컬 금융 경합을 실제 Toss/Auth 통합 성공으로 간주하지 않는다.

## 지갑 조회·거래 표시 (7차)

2026-10-02 `wallet-summary` 단일 Edge Function을 원격 배포했다. 환불 한도 조회 오류를 0P로 반환하지 않으며 익명 POST HTTP 401을 확인했다. Web의 오류/미확정 거래 UI는 로컬 구현·검증이며 Web 배포와 실제 인증 계정의 ledger 대조는 남아 있다. 0003·0006·0007 migration은 이번 배포에 포함하지 않았다. [7차 검증 기록](superpowers/plans/2026-10-02-project-completion-phase-7.md).

## 전체 원장 조회 (8차)

`/wallet/history`에서 충전·집중·보상·지급 거래를 본인 범위로 조회한다. 2026-10-02 Supabase에 조회 전용 0009를 단독 적용하고 DB lint 오류 없음을 확인했다. 실제 계정의 원격 조회·ledger 대조와 Web 배포는 남아 있다. 0003·0006·0007 집중 정산 변경은 포함하지 않았다. [8차 검증 기록](superpowers/plans/2026-10-02-project-completion-phase-8.md).
