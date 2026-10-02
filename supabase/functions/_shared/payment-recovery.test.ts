import { describe, expect, it, vi } from "vitest";
import { recoverableTossConfirmation, isObservedTerminalPayment } from "./payment-recovery";
const config = { secretKey: "test_sk_fixture" };
const input = { paymentKey: "payment_fixture", orderId: "order_fixture", amount: 10000, idempotencyKey: "topup-confirm:fixture" };
const done = { ...input, totalAmount: input.amount, status: "DONE", currency: "KRW", balanceAmount: 10000, lastTransactionKey: "last_transaction" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe("approval recovery", () => {
  it("confirms a fresh claim once using its original key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(done));
    expect(await recoverableTossConfirmation(config, input, { reconcileFirst: false }, fetcher)).toMatchObject({ status: "DONE", transactionKey: "last_transaction" });
    expect(fetcher.mock.calls).toHaveLength(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "POST", headers: { "Idempotency-Key": input.idempotencyKey } });
  });
  it("reconciles an already approved retry without another POST", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(done));
    await recoverableTossConfirmation(config, input, { reconcileFirst: true }, fetcher);
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["GET"]);
  });
  it("queries after a lost response and accepts a matching DONE result", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("timeout")).mockResolvedValueOnce(response(done));
    await expect(recoverableTossConfirmation(config, input, { reconcileFirst: false }, fetcher)).resolves.toMatchObject({ status: "DONE" });
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["POST", "GET"]);
  });
  it("does not classify already processed as rejected", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ code: "ALREADY_PROCESSED_PAYMENT" }, 400)).mockResolvedValueOnce(response(done));
    await expect(recoverableTossConfirmation(config, input, { reconcileFirst: false }, fetcher)).resolves.toMatchObject({ status: "DONE" });
  });
  it("retries an observed IN_PROGRESS with the same key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ ...done, status: "IN_PROGRESS" })).mockResolvedValueOnce(response(done));
    await recoverableTossConfirmation(config, input, { reconcileFirst: true }, fetcher);
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["GET", "POST"]);
    expect(fetcher.mock.calls[1][1]).toMatchObject({ headers: { "Idempotency-Key": input.idempotencyKey } });
  });
  it("does not issue an approval when the pre-retry query fails", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("timeout"));
    await expect(recoverableTossConfirmation(config, input, { reconcileFirst: true }, fetcher)).rejects.toMatchObject({ retryable: true });
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["GET"]);
  });
  it.each(["CANCELED", "PARTIAL_CANCELED", "READY", "WAITING_FOR_DEPOSIT"])("does not confirm or credit a %s payment", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ ...done, status }));
    await expect(recoverableTossConfirmation(config, input, { reconcileFirst: true }, fetcher)).rejects.toMatchObject({ code: "TOSS_PAYMENT_REQUIRES_REVIEW", retryable: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([{ ...done, orderId: "foreign" }, { ...done, paymentKey: "foreign" }, { ...done, totalAmount: 30000 }, { ...done, currency: "USD" }, { ...done, balanceAmount: 5000 }])("does not reconcile a mismatched provider record", async (record) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(record));
    await expect(recoverableTossConfirmation(config, input, { reconcileFirst: true }, fetcher)).rejects.toMatchObject({ retryable: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(["ABORTED", "EXPIRED"])("marks only observed terminal %s as failed", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ code: "REJECT_CARD_COMPANY" }, 400)).mockResolvedValueOnce(response({ ...done, status }));
    try { await recoverableTossConfirmation(config, input, { reconcileFirst: false }, fetcher); throw new Error("Expected failure"); }
    catch (error) { expect(isObservedTerminalPayment(error)).toBe(true); }
  });
  it("preserves uncertainty when both approval and query fail", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ code: "INVALID_API_KEY" }, 400)).mockRejectedValueOnce(new TypeError("timeout"));
    await expect(recoverableTossConfirmation(config, input, { reconcileFirst: false }, fetcher)).rejects.toMatchObject({ code: "TOSS_CONFIRMATION_UNCERTAIN", retryable: true });
  });
  it("recovers a legacy failed order only by reading DONE", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ ...done, status: "IN_PROGRESS" }));
    await expect(recoverableTossConfirmation(config, input, { reconcileFirst: true, reconciliationOnly: true }, fetcher)).rejects.toMatchObject({ retryable: true });
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(["GET"]);
  });
});
