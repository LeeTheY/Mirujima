# 출시 준비 후속 실행 계획

**Goal:** 승인된 W11–W15 다음 단계에서 실행 가능한 운영 점검과 로컬 백업 복원을 완료하고, 실제 배포의 선행 조건을 확인한다.

**Architecture:** 운영 프로젝트에는 읽기 전용 상태 조회만 수행한다. 금융 변경은 staging·Web·Extension의 동시 검증이 준비된 뒤 반영한다. 복원 도구는 명시적인 loopback PostgreSQL만 허용하며 새 DB를 생성하고 원본을 삭제하지 않는다.

**Tech Stack:** Node.js, PostgreSQL 17, pgTAP, Supabase CLI, Vitest.

**Spec:** `2026-10-02-project-completion-w11-w15.md`의 남은 production gate와 `docs/operations.md`.

## 순서와 검증

- [x] Vercel 연결·인증 파일, 역할별 E2E 상태, staging 브랜치, 원격 Secret 이름을 값 노출 없이 확인한다.
- [x] `get_release_operations_snapshot`을 service 권한으로 조회하고 집계 건수만 보존한다. 임시 API key 파일은 즉시 삭제한다.
- [x] `scripts/deployment-config.mjs`와 테스트에서 HTTPS origin, exact external messaging, 동일 Supabase, 테스트 Toss key, Extension ID, VAPID 공개키를 검사한다. 정상 형식은 실제 provider·설치 성공을 의미하지 않는다.
- [x] `scripts/rehearse-db-restore.mjs`로 새 DB에 archive 복원 후 행 해시·RLS·정책·함수 권한·제약·인덱스·트리거와 SQL 전체 단언을 대조한다. SQL fixture rollback 후 원본·복원본 불변을 다시 확인한다.
- [x] 후속 단위 테스트·lint·타입 검사와 배포 설정 실패 동작을 확인하고 결과를 운영 문서에 반영한다.
- [x] 후속 사용자 답변에 따라 전용 테스트 계정 생성, 기존 Vercel/Git 연결 확인, Next.js preview 배포와 protected preview 브라우저 6개 검증을 완료한다.
- [ ] Vercel 인증·staging·실계정 상태가 준비되면 preview와 계정 검증, 금융 coordinated rollout, provider·기기 검증을 실행한다. 미준비 항목은 통과나 완료로 기록하지 않는다.

```bash
cd /Users/ldy/Desktop/Code/React/Mirujima
npx vitest run scripts/deployment-config.test.ts
npm run release:preflight
PGHOST=127.0.0.1 PGPORT=55439 PGUSER=postgres PGDATABASE=postgres npm run test:db:restore
```

복원 도구는 실행 중인 검증용 PostgreSQL과 `psql`, `pg_dump`, `pg_restore`, `createdb`를 필요로 한다. 새 복원 DB와 mode 0700 archive 폴더를 보존한다. 운영 DB/PITR 복원과 Supabase Auth·API·Realtime 복원 증거는 별도로 필요하다. 커밋·push·PR, 유료 staging 생성, 실제 결제·현금화 활성화는 이 작업에 포함하지 않는다.
