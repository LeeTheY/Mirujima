import { describe, expect, it } from "vitest";
import { newTopupAttempt, parseTopupAttempt, persistTopupAttempt, restoreTopupAttempt, isPaymentWindowCancelled } from "./topup-attempt";
const owner = "11111111-1111-4111-8111-111111111111";
const store = () => { const values = new Map<string,string>();return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key,value); }, removeItem: (key: string) => { values.delete(key); } }; };
describe("topup attempt lifecycle", () => {
  it("keeps the same key and amount after a lost order response and reload", () => {
    const storage = store();const attempt = newTopupAttempt(owner,30000);persistTopupAttempt(storage,owner,attempt);
    expect(restoreTopupAttempt(storage,owner)).toEqual(attempt);
    expect(JSON.stringify(attempt)).not.toMatch(/paymentKey|secret|token/);
  });
  it("isolates attempts by account and validates their owner", () => {
    const storage=store();const attempt=newTopupAttempt(owner,30000);persistTopupAttempt(storage,owner,attempt);
    expect(restoreTopupAttempt(storage,"22222222-2222-4222-8222-222222222222")).toBeNull();
    expect(()=>parseTopupAttempt(attempt,"22222222-2222-4222-8222-222222222222")).toThrow();
  });
  it("allocates a fresh key after a confirmed cancellation clears the attempt", () => {
    const storage=store();const old=newTopupAttempt(owner,30000);persistTopupAttempt(storage,owner,old);persistTopupAttempt(storage,owner,null);
    expect(restoreTopupAttempt(storage,owner)).toBeNull();expect(newTopupAttempt(owner,10000).idempotencyKey).not.toBe(old.idempotencyKey);
  });
  it.each([{}, { points: 1000 }, { ...newTopupAttempt(owner,30000), paymentKey: "secret" }])("does not silently discard a corrupt attempt", (value) => {
    expect(()=>parseTopupAttempt(value,owner)).toThrow();
  });
  it("requires an explicit SDK cancellation code", () => {
    expect(isPaymentWindowCancelled({code:"PAY_PROCESS_CANCELED"})).toBe(true);
    expect(isPaymentWindowCancelled({message:"PAY_PROCESS_CANCELED"})).toBe(false);
    expect(isPaymentWindowCancelled(new TypeError("timeout"))).toBe(false);
  });
});
