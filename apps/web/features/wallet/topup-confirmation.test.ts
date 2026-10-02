import { describe, expect, it } from "vitest";
import { topupConfirmationCopy } from "./topup-confirmation";
describe("topup confirmation display", () => {
  it("never manufactures a zero balance from missing balance data", () => {
    expect(topupConfirmationCopy({ status: "confirmed", points: 10000 }, 10000)).toMatchObject({ title: "10,000P가 충전되었습니다.", description: expect.stringContaining("잔액을 확인하지 못했습니다") });
  });
  it.each([null, { status: "confirming", points: 10000 }, { status: "confirmed", points: "10000" }, { status: "confirmed", points: 20000 }])("does not confirm a malformed or mismatched result", (reply) => {
    expect(topupConfirmationCopy(reply, 10000).title).toBe("충전 결과 확인이 필요합니다.");
  });
});
