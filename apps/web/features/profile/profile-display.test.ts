import { describe, expect, it } from "vitest";
import { profileDisplayName } from "./profile-display";

describe("profile display name", () => {
  it("normalizes a valid stored display name", () => {
    expect(profileDisplayName(" 이도연 ")).toBe("이도연");
  });

  it("uses a safe fallback for missing or malformed names", () => {
    expect(profileDisplayName(null)).toBe("이름 미설정");
    expect(profileDisplayName("   ")).toBe("이름 미설정");
    expect(profileDisplayName("가".repeat(101))).toBe("이름 미설정");
  });
});
