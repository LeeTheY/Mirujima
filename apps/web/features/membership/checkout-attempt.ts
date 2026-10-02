import { z } from "zod";
export type OrderKind = "membership" | "family_seat";
const attemptSchema = z.object({ ownerId: z.uuid(), orderKind: z.enum(["membership", "family_seat"]), idempotencyKey: z.string().regex(/^membership-order:[a-f0-9-]{36}$/), orderId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/).nullable(), amount: z.number().int().min(500).max(24600).nullable() }).strict();
export type MembershipAttempt = z.infer<typeof attemptSchema>;
const orderSchema = z.object({ orderId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/), amount: z.number().int().min(500).max(24600), orderName: z.string().min(1).max(200), productCode: z.enum(["student_premium", "guardian_family"]), orderKind: z.enum(["membership", "family_seat"]), status: z.enum(["pending", "confirming", "confirmed", "failed", "needs_review"]) });
export function newMembershipAttempt(ownerId: string, orderKind: OrderKind): MembershipAttempt { return attemptSchema.parse({ ownerId, orderKind, idempotencyKey: `membership-order:${crypto.randomUUID()}`, orderId: null, amount: null }); }
function parseAttempt(value: unknown, ownerId: string): MembershipAttempt {
  const parsed = attemptSchema.parse(value);
  if (parsed.ownerId !== ownerId || (parsed.orderId === null) !== (parsed.amount === null)) throw new Error("membership_attempt_invalid");
  return parsed;
}
export function restoreMembershipAttempt(storage: Pick<Storage, "getItem">, ownerId: string): MembershipAttempt | null {
  const raw = storage.getItem(`mirujima:membership-attempt:${ownerId}`);
  return raw === null ? null : parseAttempt(JSON.parse(raw), ownerId);
}
export function persistMembershipAttempt(storage: Pick<Storage, "setItem" | "removeItem">, ownerId: string, attempt: MembershipAttempt | null): void {
  if (attempt) storage.setItem(`mirujima:membership-attempt:${ownerId}`, JSON.stringify(parseAttempt(attempt, ownerId)));
  else storage.removeItem(`mirujima:membership-attempt:${ownerId}`);
}
export function parseMembershipOrder(value: unknown, attempt: MembershipAttempt, role: "student" | "guardian") {
  const order = orderSchema.parse(value);
  if (order.orderKind !== attempt.orderKind || order.productCode !== (role === "student" ? "student_premium" : "guardian_family") || (attempt.orderId && order.orderId !== attempt.orderId) || (attempt.amount !== null && order.amount !== attempt.amount) || (role === "student" && (order.orderKind !== "membership" || order.amount !== 9900))) throw new Error("membership_order_mismatch");
  return order;
}
export function confirmedMembershipOrder(value: unknown, order: { orderId: string; amount: number; orderKind: OrderKind }): boolean {
  if (!value || typeof value !== "object") return false;
  const receipt = Reflect.get(value, "paymentOrder");
  return !!receipt && typeof receipt === "object" && receipt.status === "confirmed" && receipt.orderId === order.orderId && receipt.amount === order.amount && receipt.orderKind === order.orderKind;
}
