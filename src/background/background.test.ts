import { describe, expect, it } from "vitest";
import { isNotificationInCooldown, isTestNotificationId, shouldSkipNotification } from "./notifications";
import { isStrongSnoozeWarning } from "./message-handler";

describe("background 정책", () => {
  it("같은 알림의 중복 발송을 막는다", () => {
    const now = Date.parse("2026-07-14T00:05:00Z");
    expect(isNotificationInCooldown("2026-07-14T00:00:00Z", now)).toBe(true);
    expect(isNotificationInCooldown("2026-07-13T23:00:00Z", now)).toBe(false);
  });
  it("테스트 알림은 cooldown 중에도 다시 보낸다", () => {
    const now = Date.parse("2026-07-14T00:05:00Z");
    expect(shouldSkipNotification("2026-07-14T00:00:00Z", true, now)).toBe(false);
  });
  it("고유 테스트 알림 ID를 구분한다", () => {
    expect(isTestNotificationId("focus-check:test:uuid-1")).toBe(true);
    expect(isTestNotificationId("focus-check:session-1")).toBe(false);
  });
  it("3회부터 강한 snooze 경고를 사용한다", () => {
    expect(isStrongSnoozeWarning(2)).toBe(false);
    expect(isStrongSnoozeWarning(3)).toBe(true);
  });
});
