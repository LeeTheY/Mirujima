import { describe, expect, it, vi } from "vitest";
import { disconnectFamilyLink, saveGuardianSharingPreferences } from "./privacy-mutations";
const preferences = { shareCompletion: false, shareTotalFocusMinutes: true, shareRewardStatus: true, shareAiSummary: false };
const studentId = "f2111111-1111-4111-8111-111111111111";
describe("family privacy mutations", () => {
  it("saves validated canonical sharing keys without a client-supplied owner", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: preferences, error: null });
    await expect(saveGuardianSharingPreferences(preferences, { rpc })).resolves.toEqual(preferences);
    expect(rpc).toHaveBeenCalledWith("set_guardian_sharing_preferences", { p_preferences: preferences });
  });
  it("does not report success for server or malformed response errors", async () => {
    await expect(saveGuardianSharingPreferences(preferences, { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "secret database detail" } }) })).rejects.toThrow("현재 설정은 유지");
    await expect(saveGuardianSharingPreferences(preferences, { rpc: vi.fn().mockResolvedValue({ data: {}, error: null }) })).rejects.toThrow("결과를 확인");
  });
  it("validates the exact student in a disconnect response", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { studentUserId: studentId, status: "disconnected" }, error: null });
    await expect(disconnectFamilyLink(studentId, { rpc })).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("disconnect_family_link", { p_student_user_id: studentId });
    await expect(disconnectFamilyLink("f2333333-3333-4333-8333-333333333333", { rpc })).rejects.toThrow("결과를 확인");
  });
  it("explains unresolved money without leaking raw server errors", async () => {
    await expect(disconnectFamilyLink(null, { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "reserved guardian points must be settled" } }) })).rejects.toThrow("정산이 남아");
    await expect(disconnectFamilyLink(null, { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "secret stack trace" } }) })).rejects.toThrow("연결은 유지");
  });
});
