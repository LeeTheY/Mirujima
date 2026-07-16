import { describe, expect, it } from "vitest";
import { evaluateFocusHealth } from "./focus-health";
import { transitionFocusState } from "./state-machine";

describe("집중 상태", () => {
  it("idle을 away로 판정한다", () => expect(evaluateFocusHealth({ idleState: "idle", activeHostnameAllowed: true, visible: true, lastHeartbeatAt: null, blockedAttemptsInWindow: 0, activityMode: "reading" })).toBe("away"));
  it("반복 차단을 distracted로 판정한다", () => expect(evaluateFocusHealth({ idleState: "active", activeHostnameAllowed: true, visible: true, lastHeartbeatAt: new Date().toISOString(), blockedAttemptsInWindow: 2, activityMode: "interactive" })).toBe("distracted"));
  it("watching은 긴 무입력을 허용한다", () => expect(evaluateFocusHealth({ idleState: "active", activeHostnameAllowed: true, visible: true, lastHeartbeatAt: "2026-07-14T00:00:00Z", blockedAttemptsInWindow: 0, activityMode: "watching", now: Date.parse("2026-07-14T00:20:00Z") })).toBe("healthy"));
  it("상태 머신 전환을 강제한다", () => {
    const focusing = transitionFocusState({ type: "idle" }, { type: "START", scheduleId: "a", sessionId: "s" });
    const paused = transitionFocusState(focusing, { type: "PAUSE" });
    expect(transitionFocusState(paused, { type: "RESUME" }).type).toBe("focusing");
    expect(() => transitionFocusState({ type: "idle" }, { type: "PAUSE" })).toThrow();
  });
  it("목표 시간이 끝나면 결과 선택 대기로 전환하고 완료할 수 있다", () => {
    const focusing = transitionFocusState({ type: "idle" }, { type: "START", scheduleId: "a", sessionId: "s" });
    const awaiting = transitionFocusState(focusing, { type: "TIME_UP" });
    expect(awaiting.type).toBe("awaiting-result");
    expect(transitionFocusState(awaiting, { type: "COMPLETE" }).type).toBe("completed");
    expect(() => transitionFocusState(awaiting, { type: "RESUME" })).toThrow();
  });
});
