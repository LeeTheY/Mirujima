import { z } from "zod";
import { parseWalletSummary, type WalletSummary } from "./wallet-summary";
const schema = z.object({ ownerId: z.uuid(), points: z.number().int().min(1).max(300000), idempotencyKey: z.string().regex(/^topup-refund:[a-f0-9-]{36}$/) }).strict();
export interface RefundAttempt { ownerId: string; points: number; idempotencyKey: string }
export function newRefundAttempt(ownerId: string, points: number): RefundAttempt { return schema.parse({ ownerId, points, idempotencyKey: `topup-refund:${crypto.randomUUID()}` }); }
export function restoreRefundAttempt(storage: Pick<Storage, "getItem">, ownerId: string): RefundAttempt | null {
  const value = storage.getItem(`mirujima:refund-attempt:${ownerId}`);
  if (value === null) return null;
  const parsed = schema.parse(JSON.parse(value));
  if (parsed.ownerId !== ownerId) throw new Error("refund_owner_mismatch");
  return parsed;
}
export function persistRefundAttempt(storage: Pick<Storage, "setItem" | "removeItem">, ownerId: string, attempt: RefundAttempt | null): void {
  if (attempt) {
    const parsed = schema.parse(attempt); if (parsed.ownerId !== ownerId) throw new Error("refund_owner_mismatch");
    storage.setItem(`mirujima:refund-attempt:${ownerId}`, JSON.stringify(parsed));
  } else storage.removeItem(`mirujima:refund-attempt:${ownerId}`);
}
export interface RefundResult { status: "refunded" | "rejected"; points: number; actualRefund: boolean; balances: WalletSummary | null; maxRefundableTopup: number | null }
export function parseRefundResult(value: unknown, points: number): RefundResult {
  if (!value || typeof value !== "object") throw new Error("refund_unconfirmed");
  const data = value as Record<string, unknown>;
  if (!z.uuid().safeParse(data.refundRequestId).success || !["refunded", "rejected"].includes(String(data.status)) || data.points !== points || (data.status === "refunded" && !((data.sandbox === true && data.actualRefund === false) || (data.sandbox === false && data.actualRefund === true)))) throw new Error("refund_unconfirmed");
  const balances = parseWalletSummary(data.balances);
  const limit = data.maxRefundableTopup;
  return { status: data.status as RefundResult["status"], points, actualRefund: data.actualRefund === true, balances, maxRefundableTopup: balances && Number.isSafeInteger(limit) && Number(limit) >= 0 && Number(limit) <= balances.topupAvailable ? Number(limit) : null };
}
