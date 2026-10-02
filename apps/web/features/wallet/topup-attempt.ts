import { z } from "zod";
import { isTopupPreset, type TopupPreset } from "./topup";
const attemptSchema = z.object({ ownerId: z.uuid(), points: z.number().refine(isTopupPreset), idempotencyKey: z.string().regex(/^topup-order:[a-z0-9-]{36}$/), orderId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/).nullable() }).strict();
export interface TopupAttempt { ownerId: string; points: TopupPreset; idempotencyKey: string; orderId: string | null }
export function newTopupAttempt(ownerId: string, points: TopupPreset): TopupAttempt {
  return { ownerId, points, idempotencyKey: `topup-order:${crypto.randomUUID()}`, orderId: null };
}
export function parseTopupAttempt(value: unknown, ownerId: string): TopupAttempt {
  const result = attemptSchema.safeParse(value);
  if (!result.success || result.data.ownerId !== ownerId) throw new Error("저장된 주문을 확인하지 못했습니다. 거래 내역을 먼저 확인해 주세요.");
  return result.data as TopupAttempt;
}
export function restoreTopupAttempt(storage: Pick<Storage, "getItem">, ownerId: string): TopupAttempt | null {
  const value = storage.getItem(`mirujima:topup-attempt:${ownerId}`);
  if (value === null) return null;
  return parseTopupAttempt(JSON.parse(value), ownerId);
}
export function persistTopupAttempt(storage: Pick<Storage, "setItem" | "removeItem">, ownerId: string, attempt: TopupAttempt | null): void {
  const key = `mirujima:topup-attempt:${ownerId}`;
  if (attempt) storage.setItem(key, JSON.stringify(parseTopupAttempt(attempt, ownerId)));
  else storage.removeItem(key);
}
export function isPaymentWindowCancelled(error: unknown): boolean {
  return !!error && typeof error === "object" && Reflect.get(error, "code") === "PAY_PROCESS_CANCELED";
}
