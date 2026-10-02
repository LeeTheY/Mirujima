# 미루지마 운영·배포 절차

## 2026-10-02 후속 검증

[최신 실행 기록](superpowers/plans/2026-10-02-release-readiness-result.md): 원격 read-only 정체 조회 0건, 전용 두 계정의 실제 Auth·가족 연결·동의·0P 집중 여정 14개 통과. 기존 Vercel/Git 프로젝트에 Next.js `apps/web` preview 배포와 protected browser 6개 검증을 완료했다. production 도메인은 이전 배포를 유지한다.

로컬 검증용 PostgreSQL이 실행 중이면 아래 명령으로 archive 복원을 재현한다. 명시적 loopback만 허용하며 원본 DB를 삭제하지 않고 새 복원 DB·보호된 archive를 남긴다.

```bash
cd /Users/ldy/Desktop/Code/React/Mirujima
PGHOST=127.0.0.1 PGPORT=55439 PGUSER=postgres PGDATABASE=postgres npm run test:db:restore
npm run release:preflight
```

16개 테이블 데이터 해시·RLS·실효 권한·정규화된 제약과 복원본 SQL 645개를 대조했다. 동일 cluster 역할을 재사용하므로 Supabase Auth/API/Realtime·다른 서버·PITR 복원 증거는 별도다. `release:preflight`는 설정 형식만 검사하며 실제 설치·OAuth·결제·Push 검증을 대신하지 않는다. localhost 개발 origin과 누락된 VAPID는 현재 실패로 처리된다.

테스트 세션·Vercel bypass cookie와 archive는 비공개로 보관한다. 무료 계정·0P 세션 통과로 금융 디파짓이나 유료 entitlement 검사를 완료 처리하지 않는다. 보류 금융 SQL/handler는 여전히 coordinated staging rollout 대상이다.

## 적용 범위

웹/PWA, Chrome MV3, Supabase의 동일 릴리스 조합을 관리한다. 아래 절차는 자동 송금·자동 환불 재전송을 승인하는 절차가 아니다. 읽기 전용 탐지와 이미 검증된 멱등 복구만 사용한다.

## 정체 탐지

서버 보안 환경에서 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`를 주입하고 실행한다. 파일·콘솔·클라이언트 번들에 secret을 저장하지 않는다.

```bash
cd /Users/ldy/Desktop/Code/React/Mirujima
npm run operations:check
```

반환은 `checkedAt`, `issueCount`, `kind`, `entityId`, `since`만 포함한다. 종료 코드는 0=정체 없음, 2=운영 확인 필요, 1=검사 실패다. 결과 0도 실제 provider 대조·예약 잔액 무결성 전체가 검증됐다는 뜻은 아니다. 5분 주기의 서버 스케줄러에 이 명령을 등록하고 비정상 결과만 담당자에게 전달한다. 현재 저장소에 원격 스케줄러를 생성하지 않았다.

| 탐지 종류 | 담당 | 대응 |
|---|---|---|
| topup_confirmation | 결제 담당 | 저장된 주문/금액/소유자 기준 GET 대조. 고객에게 충전 확정을 먼저 표시하지 않음 |
| refund_unconfirmed | 결제 담당 | 기존 요청 ID와 provider snapshot 확인. dispatch 기록 이후 GET만 사용. 확정 증거 없이 reserve 해제·POST 재시도 금지 |
| membership_confirmation | 멤버십 담당 | 기존 주문의 canonical 승인 조회. 승인 이력과 현재 이용 기간을 구분 |
| focus_result_required | 제품 지원 | 목표 결과 입력이 필요한 세션인지 확인. 사용자 대신 성공 판정·포인트 지급 금지 |
| unsettled_reservation | 백엔드 담당 | related_transaction_id의 원 예약과 정산 원장 대조. 계획 단계의 보호자 예약도 확인. 일반 cleanup으로 삭제하지 않음 |
| push_delivery | 알림 담당 | 공급자/VAPID 설정, 만료 endpoint 확인. 전송 재시도는 최대 3회·5분 간격, 같은 event tag 사용 |

확인 전 `wallet_transactions`를 직접 UPDATE/DELETE하지 않는다. 결과 불명 환불은 보류 상태를 유지한다. 복구가 필요하면 요청 소유자·provider 결과·DB 원장을 먼저 대조하고 해당 서비스의 검증된 RPC를 사용한다. 운영자 임의 금액 지급 기능은 제공하지 않는다.

## 요청 추적

충전 승인·환불·멤버십 승인·AI 응답의 `X-Request-Id`로 실패 로그를 연결한다. 로그에는 operation, UUID requestId, status만 남는다. 사용자 문의는 이 번호와 발생 시각을 받고 paymentKey·토큰·전체 URL·검색·화면 본문은 받지 않는다. 주문·세션 대조는 서버 권한으로 수행하며 공개 문의 기록에 금융 식별자를 붙이지 않는다.

## 알림 배포

`202610020015`는 기존 `devices`에 구독/기기 종류/허용 시각을, 기존 `notifications`에 전달 상태를 추가한다. 신규 테이블은 없다. 알림 payload의 기존 2KiB 한도를 늘리지 않는다.

Supabase Secret: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `MIRUJIMA_PUSH_DISPATCH_SECRET`. Web에는 동일 공개키 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`만 설정한다. 개인키는 Supabase 서버 전용이다. 공급자별 endpoint를 정확한 HTTPS host 목록으로 검증한다. 새로운 공급자 지원은 별도 검토 후 목록을 확장한다.

`notification-push-dispatch`는 서비스 JWT와 별도 dispatch secret이 모두 있는 서버 POST만 사용한다. 배포 후 서버 스케줄러에서 1분 간격으로 실행한다. 배치 최대 50건을 10건씩 병렬로 처리한다. 일부 완료 기록 실패가 나머지 claimed 항목 처리를 중단하지 않는다. 금융 큐를 만들지 않는다. 현재 VAPID 키·실제 구독·원격 scheduler가 없어 전달은 미검증이다. 공급자 성공 응답은 기기 표시나 사용자의 읽음 확정이 아니다. 전송 직후 장애로 재시도가 생길 수 있지만 동일 알림 ID/tag가 중복 표시를 제한한다.

잠금 화면에는 이름·목표·금액·요약을 표시하지 않는다. 알림 클릭은 `/login`을 거쳐 현재 역할과 인증을 재확인한다. 대상 학생 기록은 목적지에서 active link와 최신 공유 동의를 다시 검증한다. Chrome Extension은 자신의 계정으로 최신 unread 이벤트를 조회하며 기기별 owner/ID 기록으로 중복을 제한한다.

## PWA·공유 철회

공개 shell와 정적 asset만 cache한다. 계정 화면/AI/결제/연결은 cache하거나 background sync queue에 넣지 않는다. SW 업데이트는 작성·결제 확인 후 사용자가 명시적으로 선택한다. SW 활성화 시 다른 제품 cache는 지우지 않는다.

로그아웃은 먼저 해당 계정의 모든 서버 push 구독을 해제한 후 global auth 종료한다. 브라우저 구독 자체는 설정에서 해제할 수 있으며 서버 해제 상태에서는 알림을 전달하지 않는다. 다른 계정은 동일 endpoint 등록 충돌을 피하려면 기존 브라우저 구독을 끈 뒤 새로 켠다.

가족 AI는 shareAiSummary를 명시적으로 켠 학생만 처리한다. 생성 종료 시 동의와 membership을 재확인한다. 표시 중에는 5초 간격으로 consent revision을 확인하고 실패/철회 시 닫는다. 화면 비활성·blur 시 즉시 닫고 30초 display lease를 넘기지 않는다. 이미 읽은 내용을 회수하는 기능은 없다. AI 호출에 전송된 동의 데이터는 철회 시 provider 측에서 회수할 수 없으므로 provider retention 설정과 약관을 출시 전에 확인한다.

## 단계별 배포와 rollback

1. 유료 검증 환경을 만들지 않는다. 기존 원격 환경의 승인된 백업 범위와 migration 목록·서버 함수 버전·웹 artifact·Extension manifest를 기록하고 로컬에서 회귀 검증한다. 사용자 데이터 복제는 별도 허용 범위에서만 수행한다.
2. migration을 개별 검토하고 linked dry-run의 정확한 대상 목록을 대조한다. `0003/0006/0007/0010/0011/0012/0017/0018/202610030001`은 2026-10-03 기존 원격에 적용했다. 최신 결과는 [원격 반영 기록](superpowers/plans/2026-10-03-remote-rollout-result.md)을 따른다.
3. 호환성을 확인한 additive SQL → 대응 Edge Functions → Web/Extension 순서로 같은 릴리스에 적용한다. `0013~0016`은 이미 적용되어 있으며 이후 변경도 분리된 로컬 환경에서 회귀 검증한다. 로그아웃은 `revoke_all_push_subscriptions` RPC가 먼저 배포되어야 한다.
4. 실계정 학생/보호자, 테스트 provider 승인·환불·AI 철회, 기기 설치/업데이트/푸시, 구버전 Extension을 검증한다. 누락 환경은 gate 실패/미검증이다.
5. 제한 베타에서 error와 pending age를 관측한 뒤 일반 공개한다. 자동 현금화·실결제는 계약/정책 gate까지 비활성화한다.
6. 사고 시 신규 금융/AI/푸시 진입을 서버 설정으로 닫고 기존 집중·예약·정산을 보존한다. additive DB는 삭제 migration으로 되돌리지 않는다. 이전 compatible Edge/Web artifact만 복구한다. 클라이언트는 버전별 manifest와 exact origin을 유지한다.

## 백업·복구·보존

DB 운영 담당자가 provider가 제공하는 백업/PITR 가용성을 실제 프로젝트에서 확인한다. 승인된 무료 로컬 복원 연습으로 RLS, 금융 원장, 예약 참조, family links, 클라우드 집중 상태를 대조한다. 복원한 DB는 결제·Push·AI 외부 발송을 먼저 차단하고 provider 이력과 대조한 후 운영 전환한다.

현재 원격 백업 생성·복원 연습은 수행하지 않았다. 금융 참조 session/order/원장은 일반 TTL cleanup에서 제외한다. URL·본문 등의 원본을 분쟁 증거라고 새로 저장하지 않는다. 보존 기간·계정 삭제와 원장 보관의 처리 정책은 출시 gate에서 확정한다.

## 2026-10-02 적용 기록

로컬 SQL 회귀 후 선택한 0013–0016을 연결 Supabase에 반영했고 원격 DB lint 오류 없음을 확인했다. ai-writing v16과 notification-push-dispatch v2를 배포했다. 보류 금융 SQL/handler·Web·Extension의 전체 staging rollout, 실제 공급자·기기·백업 복원은 완료되지 않았다. 원격 스케줄러와 VAPID를 설정한 것은 아니다.
