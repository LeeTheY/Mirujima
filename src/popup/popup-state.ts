export function popupPrimaryAction(hasActiveSession: boolean): { label: string; path: string | null } {
  return hasActiveSession
    ? { label: "집중 세션 제어", path: null }
    : { label: "웹에서 집중 계획 만들기", path: "/focus" };
}
