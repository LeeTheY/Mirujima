import { describe, expect, it } from "vitest";
import { formatWalletPoints, parseWalletSummary } from "./wallet-summary";
const zero = { topupAvailable: 0, earnedAvailable: 0, reservedAvailable: 0, cashoutReserved: 0, cashoutCompleted: 0, guardianRewardCompleted: 0 };
describe("wallet summary availability", () => {
  it("keeps a genuine zero balance distinct from unavailable data", () => {
    expect(parseWalletSummary(zero)).toEqual(zero);
    expect(parseWalletSummary(null)).toBeNull();
    expect(formatWalletPoints(0)).toBe("0 P");
    expect(formatWalletPoints(undefined)).toBe("확인 불가");
  });
  it.each([{ ...zero, topupAvailable: -1 }, { ...zero, earnedAvailable: "3000" }, { ...zero, cashoutCompleted: 0.1 }, { topupAvailable: 0 }])("rejects malformed balances rather than manufacturing zero", (value) => {
    expect(parseWalletSummary(value)).toBeNull();
  });
});
