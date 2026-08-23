import { describe, expect, it, vi } from "vitest";
import { loadGuardianFocusHistory, loadStudentFocusHistory } from "./history-data";

const studentHistory = {
  period: "daily",
  range: { startDate: "2026-08-24", endDate: "2026-08-24" },
  summary: {
    completionRate: 100,
    totalFocusMinutes: 25,
    successfulSessionCount: 1,
    failedSessionCount: 0,
    completedGoalCount: 1,
    totalGoalCount: 1,
    focusStreakDays: 1,
    earnedPoints: 1000,
    returnedPoints: 0,
    blockedAttemptCount: 2,
  },
  trend: [{ dateKey: "2026-08-24", focusMinutes: 25, successfulSessionCount: 1, failedSessionCount: 0, completionRate: 100 }],
  sessionCount: 0,
  sessionsTruncated: false,
  sessions: [],
};

describe("history data", () => {
  it("loads and validates student history", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: studentHistory, error: null }) };
    await expect(loadStudentFocusHistory("daily", "2026-08-24", client)).resolves.toEqual({ data: studentHistory, error: null });
    expect(client.rpc).toHaveBeenCalledWith("get_student_focus_history", { p_period: "daily", p_anchor_date: "2026-08-24" });
  });

  it("returns a safe error for malformed student history", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: { period: "daily" }, error: null }) };
    const result = await loadStudentFocusHistory("daily", "2026-08-24", client);
    expect(result.data).toBeNull();
    expect(result.error).toContain("서버 기록 형식");
  });

  it("loads guardian history without raw sessions", async () => {
    const guardianHistory = {
      student: { userId: "11111111-1111-4111-8111-111111111111", displayName: "학생" },
      period: "weekly",
      range: { startDate: "2026-08-24", endDate: "2026-08-30" },
      sharing: { completion: true, totalFocusMinutes: false, rewardStatus: true },
      summary: { completionRate: 80, totalFocusMinutes: null, completedGoalCount: 2, rewardCount: 1 },
      trend: [{ dateKey: "2026-08-24", completionRate: 80, focusMinutes: null }],
    };
    const client = { rpc: vi.fn().mockResolvedValue({ data: guardianHistory, error: null }) };
    const result = await loadGuardianFocusHistory(guardianHistory.student.userId, "weekly", "2026-08-24", client);
    expect(result.data?.summary.totalFocusMinutes).toBeNull();
    expect(client.rpc).toHaveBeenCalledWith("get_guardian_focus_history", {
      p_student_user_id: guardianHistory.student.userId,
      p_period: "weekly",
      p_anchor_date: "2026-08-24",
    });
  });

  it("does not expose raw backend errors", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "private SQL detail" } }) };
    const result = await loadGuardianFocusHistory("11111111-1111-4111-8111-111111111111", "daily", "2026-08-24", client);
    expect(result.error).not.toContain("private SQL detail");
  });
});
