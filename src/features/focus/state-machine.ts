import type { FocusState } from "../../shared/types/models";

export type FocusAction =
  | { type: "SCHEDULE"; scheduleId: string }
  | { type: "SNOOZE"; scheduleId: string; until: string }
  | { type: "START"; scheduleId: string; sessionId: string }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "TIME_UP" }
  | { type: "COMPLETE" }
  | { type: "RESET" };

export function transitionFocusState(state: FocusState, action: FocusAction): FocusState {
  switch (action.type) {
    case "SCHEDULE": return { type: "scheduled", scheduleId: action.scheduleId };
    case "SNOOZE": return { type: "snoozed", scheduleId: action.scheduleId, until: action.until };
    case "START": return { type: "focusing", scheduleId: action.scheduleId, sessionId: action.sessionId };
    case "PAUSE":
      if (state.type !== "focusing") throw new Error("집중 중일 때만 일시정지할 수 있습니다.");
      return { type: "paused", scheduleId: state.scheduleId, sessionId: state.sessionId };
    case "RESUME":
      if (state.type !== "paused") throw new Error("일시정지된 세션만 재개할 수 있습니다.");
      return { type: "focusing", scheduleId: state.scheduleId, sessionId: state.sessionId };
    case "TIME_UP":
      if (state.type !== "focusing") throw new Error("집중 중인 세션만 결과 선택 대기로 전환할 수 있습니다.");
      return { type: "awaiting-result", scheduleId: state.scheduleId, sessionId: state.sessionId };
    case "COMPLETE":
      if (state.type !== "focusing" && state.type !== "paused" && state.type !== "awaiting-result") throw new Error("진행 중인 세션이 없습니다.");
      return { type: "completed", scheduleId: state.scheduleId, sessionId: state.sessionId };
    case "RESET": return { type: "idle" };
  }
}
