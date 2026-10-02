import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadHistoryOverview, loadLatestFocusPlan } from "./data";
const userId = "11111111-1111-4111-8111-111111111111";
const studentId = "22222222-2222-4222-8222-222222222222";
const summary = { completionRate: 80, totalFocusMinutes: 25, successfulSessionCount: 1, failedSessionCount: 0, completedGoalCount: 1, totalGoalCount: 2, focusStreakDays: 2, earnedPoints: 800, returnedPoints: 200, blockedAttemptCount: 3 };
const range = { startDate: "2026-10-01", endDate: "2026-10-07" };
function fixture(role = "student", history: unknown = { period: "weekly", range, summary, trend: [], sessionCount: 0, sessionsTruncated: false, sessions: [] }) {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { role }, error: null }), limit: vi.fn().mockResolvedValue({ data: [] as unknown[], error: null }) };
  const rpc = vi.fn(async (name: string) => ({ data: name === "get_focus_history_context" ? { today: "2026-10-03" } : name === "get_guardian_linked_students" ? [{ student_user_id: studentId, display_name: "학생" }] : history, error: null }));
  const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }) };
  return { query, rpc, auth, client: { auth, from: vi.fn(() => query), rpc } as unknown as SupabaseClient };
}
describe("extension shared database overview", () => {
  it("uses the web history RPC and server date for the authenticated student", async () => {
    const f = fixture(); const result = await loadHistoryOverview(userId, "weekly", undefined, f.client);
    expect(result.student?.summary.earnedPoints).toBe(800);
    expect(f.query.eq).toHaveBeenCalledWith("id", userId);
    expect(f.rpc).toHaveBeenCalledWith("get_student_focus_history", { p_period: "weekly", p_anchor_date: "2026-10-03" });
  });
  it("does not request records when the authenticated account differs", async () => {
    const f = fixture(); await expect(loadHistoryOverview(studentId, "weekly", undefined, f.client)).rejects.toThrow("계정");
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it("preserves guardian privacy nulls and never requests student raw history", async () => {
    const f = fixture("guardian", { student: { userId: studentId, displayName: "학생" }, period: "weekly", range, sharing: { completion: false, totalFocusMinutes: true, rewardStatus: false }, summary: { completionRate: null, totalFocusMinutes: 25, completedGoalCount: null, rewardCount: null }, trend: [] });
    const result = await loadHistoryOverview(userId, "weekly", studentId, f.client);
    expect(result.guardian?.summary.completionRate).toBeNull();
    expect(f.rpc).toHaveBeenCalledWith("get_guardian_focus_history", { p_period: "weekly", p_anchor_date: "2026-10-03", p_student_user_id: studentId });
    expect(f.rpc.mock.calls.some(([name]) => name === "get_student_focus_history")).toBe(false);
  });
  it("rejects unlinked student selection before fetching aggregates", async () => {
    const f = fixture("guardian"); await expect(loadHistoryOverview(userId, "weekly", userId, f.client)).rejects.toThrow("연결된 학생");
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed records and hides raw server errors", async () => {
    const f = fixture("student", { summary: { earnedPoints: -1 } }); await expect(loadHistoryOverview(userId, "weekly", undefined, f.client)).rejects.toThrow("기록을 불러오지");
    f.rpc.mockResolvedValueOnce({ data: null, error: null }); await expect(loadHistoryOverview(userId, "weekly", undefined, f.client)).rejects.toThrow("기록을 불러오지");
  });
  it("ignores malformed and foreign plans and returns the saved canonical plan", async () => {
    const f = fixture();
    const plan = { id: "plan-1", ownerUserId: userId, title: "수학 복습", description: "", dateKey: "2026-10-03", plannedStartAt: null, targetFocusMinutes: 50, activityMode: "interactive", blockingMode: "blocklist", allowedDomains: [], blockedDomains: [], breakMinutes: 5, priority: "medium", selfDepositPoints: 0, guardianRewardRequestPoints: 0, goals: [{ id: "goal-1", name: "수학 복습", detail: "", minutes: 50, priority: "medium" }], status: "planned", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" };
    f.query.limit.mockResolvedValue({ data: [{ payload: { title: "invalid" } }, { payload: { ...plan, ownerUserId: studentId } }, { payload: plan }], error: null });
    expect((await loadLatestFocusPlan(userId, f.client))?.title).toBe("수학 복습");
  });
  it("reads only the authenticated user's nondeleted saved plans", async () => {
    const f = fixture(); expect(await loadLatestFocusPlan(userId, f.client)).toBeNull();
    expect(f.query.eq).toHaveBeenCalledWith("user_id", userId);
    expect(f.query.is).toHaveBeenCalledWith("deleted_at", null);
  });
});
