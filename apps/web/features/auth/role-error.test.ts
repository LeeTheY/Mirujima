import { describe, expect, it, vi } from "vitest";
import { reportRoleSelectionError } from "./role-error";

describe("role selection error reporting", () => {
  it("logs database diagnostics without returning them to the user", () => {
    const logger = vi.fn();

    const message = reportRoleSelectionError({
      code: "42501",
      message: "permission denied for function set_profile_role",
      details: "private database detail",
      hint: "private database hint",
    }, logger);

    expect(message).toBe("역할을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    expect(logger).toHaveBeenCalledWith("[auth.selectRole] Supabase RPC failed", {
      code: "42501",
      message: "permission denied for function set_profile_role",
      details: "private database detail",
      hint: "private database hint",
    });
  });
});
