import { describe, expect, it } from "vitest";
import { notificationCategory, relativeNotificationTime } from "./notification-format";

describe("notification presentation", () => {
  it("groups server events without exposing raw payloads", () => {
    expect(notificationCategory("family_linked")).toBe("family");
    expect(notificationCategory("focus_completed")).toBe("focus");
    expect(notificationCategory("wallet_topup_completed")).toBe("reward");
  });

  it("formats stable Korean relative time", () => {
    const now = Date.parse("2026-08-24T12:00:00.000Z");
    expect(relativeNotificationTime("2026-08-24T11:55:00.000Z", now)).toBe("5분 전");
    expect(relativeNotificationTime("2026-08-23T12:00:00.000Z", now)).toBe("1일 전");
  });
});
