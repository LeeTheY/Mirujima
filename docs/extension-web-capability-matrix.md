# Web · Chrome Extension 기능 책임표

| 기능 | 현재 Extension 근거 | Web 대체 경로 | 분류 | 결정 |
|---|---|---|---|---|
| 집중 계획 작성·편집 | `src/features/schedules/PlanPage.tsx`, `ScheduleForm.tsx` | `/focus` | web-primary | Extension navigation에서 제거 |
| 오늘 계획·달성률 | `src/features/dashboard/TodayPage.tsx` | `/home` | web-primary | Extension navigation에서 제거 |
| 전체 기록·리포트 | `src/features/reports/ReportsPage.tsx` | `/history` | web-primary | Extension navigation에서 제거 |
| 계정·멤버십·클라우드 설정 | `src/features/settings/SettingsPage.tsx` | `/my`, `/membership/checkout` | web-primary | Extension navigation에서 제거 |
| 가족 연결·지갑·결제 | Extension 화면 없음 | `/my`, `/guardian/my`, `/wallet/charge` | web-primary | Web만 제공 |
| AI 작성 도구 | `src/features/writing-assistant/WritingAssistantPage.tsx` | Web AI 기능군 | web-primary | Extension navigation에서 제거; capture background는 별도 이관 전 유지 |
| 집중 타이머·세션 제어 | `src/features/focus/FocusPage.tsx`, `src/popup/PopupApp.tsx` | `/focus`가 control plane | shared-contract | Extension에 현재 세션 제어만 유지 |
| DNR 사이트 차단 | `src/background/blocking.ts` | Web에서 직접 불가능 | extension-only | 유지 |
| 알람·서비스 워커 복구 | `src/background/alarms.ts`, `service-worker.ts` | Web 종료 후 유지 불가 | extension-only | 유지 |
| idle/activity enforcement | `src/background/idle.ts`, `activity.ts` | Chrome API 필요 | extension-only | 유지 |
| 차단 안내 화면 | `src/blocked/BlockedApp.tsx` | DNR redirect 대상 | extension-only | 유지 |
| Chrome system notification | `src/background/notifications.ts` | PWA 알림과 별도 surface | extension-only | 유지 |
| 탭 그룹화·복원 | `src/background/tab-organizer.ts`, `TabOrganizerCard.tsx` | Chrome tabs/tabGroups 필요 | extension-only | 유지 |
| Web external message와 canonical resync | `src/features/web-bridge/*`, `message-handler.ts` | Web↔Extension 계약 | shared-contract | 유지 |
| 로컬 storage migration·공유 model | `src/shared/storage/*`, `src/shared/types/*` | 기존 사용자 호환성 | shared-contract | 이번 UI 축소에서는 유지 |

## 이번 변경의 삭제 경계

이번 단계는 사용자에게 노출되는 중복 navigation과 React 화면 연결을 제거한다. background handler, message type, storage repository가 참조하는 domain/service 코드는 유지한다. React UI 파일은 production import가 완전히 사라지고 onboarding에서도 사용하지 않을 때만 후속 삭제한다.

## Extension 최종 진입점

- Popup: 현재 세션 제어, 탭 정리, Web 집중 페이지 열기
- Side Panel/App: 현재 집중 상태, 탭 정리, Web 홈/집중/기록/마이페이지 열기
- 신규 사용자: Web에서 로그인·계획을 완료하도록 안내

