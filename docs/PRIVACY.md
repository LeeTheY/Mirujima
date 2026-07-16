# 미루지마 개인정보 처리 안내

미루지마의 Free 핵심 기능은 외부 서버 없이 사용자의 Chrome 프로필 안에서 동작합니다. Premium을 사용자가 명시적으로 선택한 경우에만 Supabase 인증·멤버십 서버에 연결합니다.

## 저장하는 데이터

- 사용자가 작성한 일정명, 설명, 날짜와 시간, 목표 집중 시간
- 정규화한 hostname과 서브도메인 포함 정책
- 차단 방식, 활동 유형, 휴식 시간과 설정
- 집중 세션의 시작·종료·누적 집중·자리 비움 시간
- heartbeat 발생 시각과 visibility 여부
- 차단 시도 hostname, 시각, 일정/세션 ID
- 임시 허용 hostname, 이유, 허용 시간
- 알림 발송 시각과 처리 여부
- 일일 리포트 집계값
- Premium 로그인 시 Supabase Auth user ID, Google 계정 이메일, 표시 이름·프로필 이미지 URL
- Premium 멤버십 상태, entitlement, 익명 생성 기기 ID, OS 이름, 확장 버전, 마지막 확인 시각

## 저장하지 않는 데이터

- 전체 브라우징 기록
- URL path, query string, hash와 검색어
- 페이지 제목과 본문
- 폼 값과 사용자가 입력한 키 내용
- 클릭한 요소의 텍스트
- Chrome 밖 데스크톱 앱의 이름이나 사용 내용
- API 키, 계정 비밀번호, 결제 정보

## AI 실행 중에만 일시 처리하는 데이터

- 사용자가 직접 선택하고 미리보기에서 동의한 화면 영역 이미지
- 사용자가 검토·수정한 OCR 원문
- 문법 교정문, 윤문문과 변경 목록
- 핵심 요약, 학습 정리, 불확실한 항목과 OCR block 근거 ID

이 항목들은 처리 중 메모리에만 있으며 기본적으로 로컬 storage나 서버 DB에 저장하지 않습니다.

## 저장 위치와 외부 전송

일정·집중·차단 등 기존 데이터는 먼저 `chrome.storage.local`에 저장됩니다. Free 사용 중에는 Supabase 요청을 보내지 않습니다. Premium을 선택하면 Google OAuth를 거쳐 계정·멤버십·기기 정보가 Supabase로 전송되며, Supabase session은 Content Script가 접근하지 못하는 trusted extension storage에 저장됩니다. 사용자가 초기 백업 또는 복원을 선택해 Gate B 동기화를 시작하면 일정, 설정, 완료 집중 세션 요약, 일일 리포트, 일별 학습 집계가 계정별 cloud table에 동기화됩니다. heartbeat 원본, 전체 URL, 탭 그룹 snapshot은 cloud로 보내지 않습니다. 분석 SDK와 광고 SDK는 없고, secret/service role key는 확장 프로그램 번들에 포함하지 않습니다.

Gate C/D는 사용자가 **화면 영역으로 내용 가져오기**를 누른 경우에만 현재 visible viewport를 일시 캡처합니다. 선택 영역만 crop한 뒤 앱에서 미리보기를 보여주고, 사용자가 민감 정보 확인과 전송에 동의해야 Supabase `ai-writing` Function을 거쳐 Groq로 전송합니다. hostname, query, 페이지 전체 본문은 요청에 첨부하지 않습니다. OCR 이미지, 검토 원문, 교정·요약·학습 정리 결과는 서버 DB와 로컬 storage에 기본 저장하지 않으며 처리 중 메모리에만 유지합니다. 서버에는 task별 1분 rate limit을 위한 사용자별 요청 횟수와 시간 창만 저장합니다.

## 보존 기간

활동 이벤트 원본은 기본 30일 후 정리합니다. Free 리포트는 최근 30일을 로컬에 유지합니다. Premium의 완료 세션 요약, 리포트, 일별 학습 집계와 schedule tombstone은 최대 365일 뒤 서버 정리 대상이 됩니다. 일정과 설정의 최신 상태는 동기화와 복원을 위해 계정에 유지될 수 있습니다.

계정 profile, membership, entitlement와 device 정보는 사용자가 로그아웃해도 서버 계정에 남아 다른 PC에서 멤버십을 복구하는 데 사용됩니다. 로그아웃 시 해당 Chrome 프로필의 계정 전용 동기화 캐시와 대기열은 제거합니다. 클라우드 데이터 삭제와 계정 삭제 UI는 후속 Gate에서 제공하며, 현재는 Supabase 관리 화면을 통한 삭제가 필요합니다.

## 사용자의 통제

Settings에서 JSON 파일로 데이터를 내보낼 수 있습니다. **전체 기록 초기화**를 누르고 확인하면 모든 미루지마 로컬 데이터를 지운 뒤 기본 설정만 다시 생성합니다. Chrome에서 확장 프로그램을 제거할 때도 해당 확장 프로그램의 로컬 저장소가 삭제될 수 있습니다.

## 권한 사용 이유

- `storage`: 로컬 설정과 기록
- `alarms`: Service Worker가 중지되어도 일정, 세션, 임시 허용, 리포트 예약 복구
- `notifications`: 일정·상태 확인 알림
- `idle`: 선택한 기준을 넘긴 시스템 유휴 상태 확인
- `tabs`: 활성 탭의 hostname 허용 여부 확인과 사용자 요청에 따른 페이지 열기
- `<all_urls>`: Side Panel·Popup에서 사용자가 직접 실행한 화면 선택의 visible viewport 캡처와 집중 중 사이트 차단·최소 활동 확인. AI 도구는 선택 영역만 처리하며 전체 페이지를 자동 수집하지 않음
- `tabGroups`: 현재 활성 창에서 탭 그룹을 만들고 상태를 복원
- `identity`, `identity.email`: Premium 선택 후 Chrome 기본 Google 계정 확인과 OAuth callback 처리
- `sidePanel`: 기본 화면 제공
- `declarativeNetRequest`: 집중 중 대상 사이트 실제 차단
- http/https host permission: 사용자가 임의로 정한 도메인 차단과 최소 heartbeat

넓은 http/https 권한은 일정마다 달라지는 사이트를 DNR로 차단하기 위해 필요합니다. 이 권한으로 페이지 본문이나 입력 내용을 저장하지 않습니다.

## Premium 계정 보안

Chrome 계정 이메일은 로그인 계정 일치 확인에만 사용하고 단독 인증 수단으로 사용하지 않습니다. 데이터 소유권은 Supabase Auth user ID와 RLS로 판정합니다. 멤버십과 entitlement는 클라이언트가 직접 수정할 수 없으며, 인증된 Edge Function과 제한된 activation RPC가 활성화합니다.

클라우드 동기화는 서버에서도 `cloud-sync` entitlement를 확인합니다. 변경에는 기기 ID와 버전을 함께 기록하고, 동일 mutation은 중복 적용하지 않으며, 충돌은 사용자가 이 기기 또는 클라우드 버전을 선택해 해결합니다.

AI Function은 `screen-ocr`, `grammar-correction`, `content-summary` entitlement와 OCR·교정·요약·학습 정리별 요청 한도를 서버에서 다시 확인합니다. 요약 결과의 근거 ID는 요청에 포함된 OCR block ID인지 서버에서 검증합니다. `GROQ_API_KEY`는 Supabase Secret에만 있으며 확장 프로그램 bundle, storage, 로그에 포함하지 않습니다.

## 플랫폼 제약

Chrome은 `chrome://` 페이지, Chrome Web Store 등 일부 영역의 접근을 허용하지 않습니다. 미루지마는 다른 브라우저나 Chrome 밖 앱을 감시하지 않습니다. 운영체제가 알림을 차단하면 시스템 알림을 보장할 수 없습니다.

## 스마트 탭 그룹화 데이터

분류 중에는 현재 열린 탭의 URL과 제목을 Chrome에서 읽지만 페이지 본문, 검색어, 폼 입력값, 쿠키는 읽지 않습니다. 기본 분류 규칙과 사용자가 기억한 규칙에는 정규화한 hostname만 저장합니다. 전체 URL은 사용자가 **현재 작업 세트로 저장**을 직접 선택했을 때만 로컬 작업 세트에 저장됩니다.

정리 전 snapshot에는 현재 세션의 tab ID, 순서, 고정 상태, group ID와 복원에 필요한 URL·제목이 로컬로 저장될 수 있습니다. 완료된 snapshot은 기본 7일 뒤 정리하며 외부 서버로 전송하지 않습니다. Settings의 전체 기록 초기화는 이 데이터도 함께 삭제합니다.
