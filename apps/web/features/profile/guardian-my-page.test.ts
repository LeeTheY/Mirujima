import { describe, expect, it } from "vitest";
import { GUARDIAN_MY_CARDS } from "./guardian-my-cards";

describe("guardian my page", () => {
  it("contains guardian-specific management cards only", () => {
    expect(GUARDIAN_MY_CARDS.map((card) => card.label)).toEqual([
      "로그인 계정 정보",
      "보호자 지갑",
      "멤버십",
      "연결 학생",
      "가족 활동 요약",
      "보상 요청 관리",
    ]);
    expect(GUARDIAN_MY_CARDS).toHaveLength(6);
    expect(GUARDIAN_MY_CARDS.every((card) => card.gridSpan === 1)).toBe(true);
    expect(GUARDIAN_MY_CARDS.find((card) => card.label === "연결 학생")?.showHeading).toBe(false);

    const serialized = JSON.stringify(GUARDIAN_MY_CARDS);
    expect(serialized).not.toContain("현금 환급");
    expect(serialized).not.toContain("공유 범위");
    expect(serialized).not.toContain("연결 해제");
    expect(serialized).not.toContain("/wallet/cashout");
    expect(GUARDIAN_MY_CARDS.find((card) => card.label === "연결 학생")?.href).toBeUndefined();
  });
});
