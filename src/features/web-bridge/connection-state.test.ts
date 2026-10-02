import { describe, expect, it } from "vitest";
import { parseWebConnectionState, webConnectionLabel } from "./connection-state";

describe("web connection identity and freshness", () => {
  const now = Date.parse("2026-10-03T00:00:00Z");
  const state = { userId: "owner", status: "connected" as const, checkedAt: new Date(now).toISOString() };
  it("shows connected only for the current account and a recent handshake", () => {
    expect(webConnectionLabel(state, "owner", now).connected).toBe(true);
    expect(webConnectionLabel(state, "other", now).connected).toBe(false);
    expect(webConnectionLabel(state, null, now).connected).toBe(false);
    expect(webConnectionLabel(state, "owner", now + 90_001).connected).toBe(false);
    expect(webConnectionLabel(state, "owner", now - 5_001).connected).toBe(false);
  });
  it("distinguishes a mismatched account and rejects invalid stored data", () => {
    expect(webConnectionLabel({ ...state, status: "account-mismatch" }, "owner", now).label).toBe("웹 계정 다름");
    expect(parseWebConnectionState({ ...state, status: "unexpected" })).toBeNull();
    expect(parseWebConnectionState({})).toBeNull();
    expect(webConnectionLabel({ ...state, checkedAt: "invalid" }, "owner", now).connected).toBe(false);
  });
});
