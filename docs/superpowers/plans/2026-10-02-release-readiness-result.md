# W15 이후 출시 준비 실행 결과

## 1. 구현·실행한 기능

- 배포 설정 preflight: production HTTPS origin, Web/Extension exact origin, 동일 Supabase 프로젝트·공개키, Extension ID, Toss 테스트 client key, VAPID 공개키를 값 출력 없이 점검한다.
- 로컬 백업·복원 도구: loopback PostgreSQL만 허용하고 서비스 설정·PGHOSTADDR 우회를 거부한다. 새 DB에 복원 후 행 해시, 실제 RLS·권한·정책·함수·제약·인덱스·트리거와 전체 SQL 회귀를 대조한다. 원본 DB와 테스트 rollback 후 상태도 확인한다.
- 실제 인증 검증에서 발견한 결제 모달 초기 포커스를 수정했다. Next.js가 hidden 컨테이너에서 스트리밍하는 dialog는 보이는 시점에 등록하고 hidden 해제도 감지한다.
- 사용자 요청에 따라 원격에 기존 전용 marker 테스트 계정을 조회했다. 없어서 학생·보호자 각 1명을 생성하고 실제 Supabase 세션과 본인 RPC로 역할을 설정했다. 이메일 발송·비밀번호 초기화·기존 사용자 변경은 하지 않았다.
- 기존 Vercel 계정 인증 및 `mirujima` 프로젝트 연결을 완료했다. 내부 브라우저에서 기존 Git 연결과 새 preview READY를 확인했다.

## 2. 변경 파일

- `scripts/deployment-config.mjs`, `scripts/deployment-config.test.ts`, `scripts/check-deployment-config.mjs`: 순수 설정 검사와 remote 복원 방지 경계.
- `scripts/rehearse-db-restore.mjs`: 보호된 archive, 새 로컬 DB 복원·대조·SQL 회귀. PostgreSQL 기본 ACL은 실제 권한으로 펼치고 CHECK 식은 rollback-only 임시 테이블에서 같은 parser로 정규화해 대조한다.
- `apps/web/components/dialog-accessibility.tsx`, `scripts/test-web-dialog-smoke.mjs`: hidden streamed dialog 등록 및 회귀.
- `package.json`: `release:preflight`, `test:db:restore` 명령.
- `.vercelignore`, `.gitignore`: 인증 상태·환경변수·개인 trace 및 불필요한 root Extension 소스의 웹 배포 제외. `apps/web/public`과 `packages/contracts/src`는 포함한다.
- 실행 계획·이 보고서·운영 문서·체크리스트.

## 3. DB·원격 반영

새 migration 또는 원장 변경은 없다. 선택 배포 workdir의 DB push **dry-run**에서 원격과 일치하고 추가 적용 파일이 없음을 확인했다. 전체 root의 보류 금융 migration까지 적용됐다는 뜻은 아니다.

원격 `get_release_operations_snapshot`의 30분 기준 정체 조회는 `2026-10-02T13:48:19Z`에 0건이었다. 시점 조회이며 이후 상태나 운영 전체 무결성을 보증하지 않는다.

전용 테스트 계정끼리 가족 연결·해제, sharing 기본값 복구, 차단 OFF·디파짓 0P 계획 및 완료된 1분 세션을 생성했다. 테스트 계정과 완료 기록은 보존했다. 실제 금융 잔액이나 기존 사용자 데이터는 변경하지 않았다.

Vercel은 기존 프로젝트 ID `prj_l0yA5GYjvR064ilMM5nyhAQmKz1K`를 사용했다. framework `nextjs`, root `apps/web`, build `npm run build`, install `npm ci`, 외부 workspace 소스 포함을 설정했다. 설정은 이후 배포에도 적용된다. 기존 production deployment를 교체하지 않았다.

공개 Supabase·Toss 테스트 key·Extension ID·canonical APP_ORIGIN은 preview 환경에 설정했다. 최종 preview: [미루지마 preview](https://mirujima-9y9s1aac3-leethey.vercel.app). READY 확인. 배포 보호를 유지했다. preview의 canonical origin은 `https://mirujima.vercel.app`이므로 OAuth·결제 복귀와 production origin 전용 Extension 연결은 이 preview의 전체 통과 항목이 아니다.

모노레포 설정은 [Vercel 공식 문서](https://vercel.com/docs/monorepos)에 맞춰 Root Directory와 외부 workspace 포함을 적용했다.

## 4. 기존 동작 영향

Dialog는 숨겨진 서버 스트리밍 노드를 즉시 modal stack에 넣지 않는다. 기존 중첩 Escape·Tab trap·배경 inert·닫은 뒤 focus 복귀는 유지한다. 루트 Extension 구조·Manifest·DNR·금융 정책·기존 원장을 바꾸지 않았다.

복원 도구는 기존 서버를 자동으로 시작하거나 DB를 삭제하지 않는다. archive 폴더 mode 0700, dump·보고서 mode 0600으로 남긴다. 동일 cluster 역할 재사용이며 다른 서버의 role/PITR 복원 연습을 대체하지 않는다.

## 5. 보안·권한

서버 키는 mode 0600 임시 파일로만 받고 사용 후 삭제했다. 테스트 세션과 Vercel preview 보호 쿠키는 저장소 밖 보호된 임시 경로에 보관하며 공개 artifact나 보고서로 복사하지 않는다. preview는 인증된 CLI와 해당 호스트 쿠키로 검사하고 배포 보호를 끄지 않았다.

학생·보호자는 canonical profile role로 확인했다. 보호자가 학생 원본 profile·session을 조회할 수 없고 AI 기본 OFF·필드별 최소 입력·동의 철회가 실제 원격에서도 적용됨을 확인했다. 명시 동의가 없는 실제 사용자 데이터·AI 호출·결제·현금화는 실행하지 않았다.

## 6. 테스트

| 검사 | 실제 결과 |
|---|---|
| 전체 Vitest | 85 파일 / 470개 통과 |
| 새 설정·remote restore 방지 단위 | 17개 통과 |
| 로컬 archive 복원 | 16개 테이블 행 해시·권한·정책·정규화된 제약 일치, 원본 보존 |
| 복원본 pgTAP | 33 파일 / 645개 단언, fixture rollback 후 원본·복원본 불변 |
| 실제 학생 세션 Web E2E | 3개 통과: 대시보드·기록 표·결제 dialog focus/Escape |
| 실제 보호자 세션 Web E2E | 2개 통과, 학생 전용 기록 검사 1개 의도적 skip |
| 실제 Dialog/CSS fixture | 320px focus·Tab·inert·중첩 Escape·복귀 및 hidden 해제 회귀 통과 |
| 실제 원격 전용 계정 여정 | 14개 검사 통과: Auth·RLS·Edge 가족 코드·AI 공유 OFF/ON/철회·0P 계획/세션·조기 성공 거부·종료 후 성공·중복 완료·가족 해제 |
| 배포된 protected preview 브라우저 | 6개 통과: 학생·보호자 각각 대시보드·기록·결제 dialog focus/Escape. 배포 보호 유지 |
| 배포 설정 preflight | 기존 개발 env의 localhost origin 및 없는 VAPID 때문에 실패함을 확인. 설정 형식 검사이지 실제 설치/공급자 검증이 아님 |

실제 세션은 관리자 생성 magic link를 메일 발송 없이 검증해 준비했다. Supabase Auth를 mock하지 않았지만 Google OAuth 로그인 여정의 통과를 의미하지 않는다. 집중 여정은 차단 OFF·0P이며 금융 디파짓·실제 Extension enforcement 성공을 대신하지 않는다.

## 7. 빌드·배포 산출물

모달 수정 이후 `verify:local`의 root/Web lint·typecheck·production build와 공개 bundle 비밀 패턴 검사 63파일이 통과했다. Vercel 최종 preview 원격 빌드 READY. production Extension ZIP을 [산출물 경로](/Users/ldy/.codex/visualizations/2026/10/02/01a0fb93-cf0c-7ca3-bd07-7700d1ce9f00/release-readiness/mirujima-extension.zip)에 생성했다. 커밋·push·PR·Chrome Web Store 제출은 수행하지 않았다.

## 8. 남은 출시 gate

1. Google OAuth 실제 로그인·재로그인·웹/확장의 동일 계정 확인. 이번 관리자 발급 전용 테스트 세션과 구분한다.
2. 별도 Supabase staging에서 보류 `0003/0006/0007/0010/0011/0012`, 대응 금융 handler, 새 Web/Extension을 함께 검증하고 배포한다. 현재 프로젝트 branch 목록은 비어 있다. 기존 production DB에 독립적으로 적용하지 않았다.
3. 실제 Toss 테스트 인증/승인/부분 취소와 원장 대조, 유료·만료 entitlement 및 AI provider 성공·중간 철회 검증.
4. VAPID·dispatch secret·scheduler와 실제 기기 PWA/Push 검증. 원격 Secret 목록에는 이들 값이 없다. 이번에 임의 생성·활성화하지 않았다.
5. 지원 Chrome 설치본·구버전 호환·재시작/오프라인 정산 재전송, 다른 서버에서의 Supabase 백업/PITR 복원·Auth/API/Realtime 검증.
6. 실제 증거에 맞는 artifact revision 확정, GitHub CI 실행 및 production 전환. Toss 계약·현금화·미성년자 관련 기존 gate도 유지한다.

무료 계정 Auth/DB/API/preview가 준비되어 이전의 “실계정이 없음” 제약은 일부 해소됐다. 결제·유료 AI·기기·금융 coordinated rollout과 Google OAuth까지 모두 통과한 출시 승인 상태는 아니다.
