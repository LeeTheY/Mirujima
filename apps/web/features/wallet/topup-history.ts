import { z } from "zod";

export const TOPUP_HISTORY_KINDS = ["topup_requested", "topup_confirmed", "topup_refund_requested", "topup_refunded", "topup_refund_rejected"] as const;
// Deliberately excludes payment keys, provider payloads, and raw failure text.
export const TOPUP_HISTORY_COLUMNS = "id, points, krw_amount, created_at, provider, kind, status, provider_order_id, related_transaction_id, from_user_id, to_user_id";
const row = z.object({
  id: z.uuid(), points: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  krw_amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  created_at: z.iso.datetime({ offset: true }), provider: z.string().nullable(),
  kind: z.enum(TOPUP_HISTORY_KINDS), status: z.enum(["pending", "confirming", "posted", "failed"]),
  provider_order_id: z.string().max(64).nullable(), related_transaction_id: z.uuid().nullable(),
  from_user_id: z.uuid().nullable(), to_user_id: z.uuid().nullable(),
});
export type TopupHistoryRecord = z.infer<typeof row>;

export function parseTopupHistory(value: unknown, userId: string): TopupHistoryRecord[] | null {
  const parsed = z.array(row).safeParse(value);
  if (!parsed.success || parsed.data.some((item) => item.from_user_id !== userId && item.to_user_id !== userId)) return null;
  const settled = new Set(parsed.data.filter((item) => item.status === "posted" && ["topup_confirmed", "topup_refunded", "topup_refund_rejected"].includes(item.kind)).map((item) => item.related_transaction_id));
  return parsed.data.filter((item) => !settled.has(item.id));
}

export function topupHistoryLabel(item: TopupHistoryRecord): string {
  if (item.status === "failed" || item.kind === "topup_refund_rejected") return "처리 실패 · 잔액 재확인 필요";
  if (item.status !== "posted" || item.kind.endsWith("_requested")) return "처리 중 · 결과 미확정";
  return item.kind === "topup_refunded" ? "환불 완료" : "충전 완료";
}
