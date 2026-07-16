import { describe, expect, it } from "vitest";
import { isExtensionContextInvalidatedError } from "./activity-heartbeat";

describe("Content Script 컨텍스트 오류", () => {
  it("확장 컨텍스트 무효화 오류를 식별한다", () => {
    expect(isExtensionContextInvalidatedError(new Error("Extension context invalidated."))).toBe(true);
    expect(isExtensionContextInvalidatedError(new Error("Receiving end does not exist."))).toBe(false);
    expect(isExtensionContextInvalidatedError("Extension context invalidated.")).toBe(false);
  });
});
