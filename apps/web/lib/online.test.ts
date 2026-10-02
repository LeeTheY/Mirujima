import { describe, expect, it } from "vitest";
import { isOnline, OfflineActionError, requireOnlineAction } from "./online";

describe("online mutation boundary", () => {
  it("allows mutations only while online", () => {
    expect(isOnline({ onLine: true })).toBe(true);
    expect(isOnline({ onLine: false })).toBe(false);
    expect(() => requireOnlineAction("포인트 충전", { onLine: false })).toThrow(OfflineActionError);
    expect(() => requireOnlineAction("포인트 충전", { onLine: true })).not.toThrow();
  });
});
