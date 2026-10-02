import { describe, expect, it } from "vitest";
import { readWallet } from "./wallet-read";
const zero = { topupAvailable: 0, earnedAvailable: 0, reservedAvailable: 0, cashoutReserved: 0, cashoutCompleted: 0, guardianRewardCompleted: 0, maxRefundableTopup: 0 };
describe("wallet reads", () => {
  it("accepts actual zero and records the observation time", async () => {
    const result = await readWallet(async () => ({ data: zero, error: null }));
    expect(result.status).toBe("ready");
    expect(Date.parse(result.checkedAt)).not.toBeNaN();
  });
  it("does not accept data returned alongside an error", async () => {
    expect((await readWallet(async () => ({ data: zero, error: new Error("secret") }))).status).toBe("unavailable");
  });
  it("separates a malformed reply from a failed request", async () => {
    expect(await readWallet(async () => ({ data: {}, error: null }))).toMatchObject({ status: "unavailable", reason: "format" });
    expect(await readWallet(async () => { throw new Error("secret"); })).toMatchObject({ status: "unavailable", reason: "request" });
  });
  it.each([undefined, -1, "0", 0.5, 1])("does not manufacture a refund limit from %s", async (limit) => {
    expect(await readWallet(async () => ({ data: { ...zero, maxRefundableTopup: limit }, error: null }))).toMatchObject({ status: "ready", maxRefundableTopup: null });
  });
});
