import { describe, expect, it, vi } from "vitest";
import {
  finishCanonicalFocusSession,
  getCurrentCanonicalFocusSession,
  pauseCanonicalFocusSession,
  resumeCanonicalFocusSession,
} from "./canonical-focus-service";

const session = {
  id: "session-1",
  scheduleId: "schedule-1",
  ownerUserId: "11111111-1111-4111-8111-111111111111",
  startedAt: "2026-08-24T10:00:00.000Z",
  endsAt: "2026-08-24T10:25:00.000Z",
  targetFocusMinutes: 25,
  blockingMode: "off",
  goals: [{ id: "goal-1", name: "집중", detail: "", minutes: 25, priority: "high" }],
  status: "active",
};

describe("canonical focus web service", () => {
  it("returns null when there is no current session", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) };
    await expect(getCurrentCanonicalFocusSession(client)).resolves.toBeNull();
    expect(client.rpc).toHaveBeenCalledWith("get_current_focus_session");
  });

  it("normalizes lifecycle RPC responses", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: session, error: null }) };
    const paused = await pauseCanonicalFocusSession(client, "session-1", "device-1");
    expect(paused.remainingFocusSeconds).toBe(25 * 60);
    expect(client.rpc).toHaveBeenCalledWith("pause_focus_session", {
      p_session_id: "session-1",
      p_device_id: "device-1",
    });
  });

  it("uses the same RPC contract for resume and goal settlement", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: session, error: null }) };
    await resumeCanonicalFocusSession(client, "session-1", "device-1");
    await finishCanonicalFocusSession(client, "session-1", ["goal-1"], "device-1");

    expect(client.rpc).toHaveBeenNthCalledWith(1, "resume_focus_session", {
      p_session_id: "session-1",
      p_device_id: "device-1",
    });
    expect(client.rpc).toHaveBeenNthCalledWith(2, "finish_focus_session", {
      p_session_id: "session-1",
      p_completed_goal_ids: ["goal-1"],
      p_device_id: "device-1",
    });
  });

  it("does not accept a malformed server payload", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: { status: "active" }, error: null }) };
    await expect(getCurrentCanonicalFocusSession(client)).rejects.toThrow("세션 응답");
  });
});
