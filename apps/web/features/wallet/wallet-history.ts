import { z } from "zod";

export const WALLET_CATEGORIES = ["all", "topup", "focus", "reward", "cashout"] as const;
export type WalletCategory = typeof WALLET_CATEGORIES[number];
export const WALLET_CATEGORY_LABELS: Record<WalletCategory, string> = { all: "전체", topup: "충전·환불", focus: "집중 디파짓", reward: "보호자 보상", cashout: "획득 포인트 지급" };
const kinds = ["topup_requested", "topup_confirmed", "topup_refund_requested", "topup_refunded", "topup_refund_rejected", "self_deposit_reserved", "self_deposit_earned", "self_deposit_returned", "guardian_reward_requested", "guardian_reward_declined", "guardian_deposit_reserved", "guardian_reward_released", "guardian_deposit_returned", "cashout_requested", "cashout_completed", "cashout_rejected"] as const;
const bucket = z.enum(["topup", "reserved", "earned", "cashout_reserved", "refund_reserved", "external"]);
const timestamp = z.iso.datetime({ offset: true });
export const walletCursorSchema = z.object({ createdAt: timestamp, id: z.uuid() }).strict();
export type WalletCursor = z.infer<typeof walletCursorSchema>;
const itemSchema = z.object({
  id: z.uuid(), kind: z.enum(kinds), status: z.enum(["pending", "confirming", "posted", "failed"]),
  points: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), krwAmount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  createdAt: timestamp, scheduleId: z.string().nullable(), sessionId: z.string().nullable(),
  relatedTransactionId: z.uuid().nullable(), orderId: z.string().nullable(),
  fromBucket: bucket.nullable(), toBucket: bucket.nullable(), provider: z.enum(["toss", "sandbox"]).nullable(),
  resolutionKind: z.enum(kinds).nullable(), resolutionTransactionId: z.uuid().nullable(),
  reasonCode: z.enum(["student-withdrawn", "enforcement-start-cancelled", "REJECT_CARD_COMPANY", "PAY_PROCESS_CANCELED", "PAY_PROCESS_ABORTED", "unconfirmed"]).nullable(),
}).strict();
const pageSchema = z.object({ ownerUserId: z.uuid(), items: z.array(itemSchema).max(50), hasMore: z.boolean(), nextCursor: walletCursorSchema.nullable(), checkedAt: timestamp }).strict();
export type WalletHistoryItem = z.infer<typeof itemSchema>;
export type WalletHistoryPage = z.infer<typeof pageSchema>;

export function walletTimestampMicros(value: string): bigint {
  const fraction = value.match(/\.(\d+)/)?.[1] ?? "";
  return BigInt(Date.parse(value)) * BigInt(1000) + BigInt(fraction.padEnd(6, "0").slice(3, 6));
}
export function walletRowBefore(row: { createdAt: string; id: string }, boundary: { createdAt: string; id: string }): boolean {
  const time = walletTimestampMicros(row.createdAt), before = walletTimestampMicros(boundary.createdAt);
  return time < before || (time === before && row.id.toLowerCase() < boundary.id.toLowerCase());
}

export function parseWalletHistory(value: unknown, ownerId: string): WalletHistoryPage | null {
  const result = pageSchema.safeParse(value);
  if (!result.success || result.data.ownerUserId !== ownerId) return null;
  const page = result.data;
  if (page.items.some((item) => item.fromBucket === null && item.toBucket === null)) return null;
  if (page.items.some((item, index) => index > 0 && !walletRowBefore(item, page.items[index - 1]))) return null;
  if (page.hasMore !== (page.nextCursor !== null) || new Set(page.items.map((item) => item.id)).size !== page.items.length) return null;
  if (page.nextCursor && (page.items.at(-1)?.id !== page.nextCursor.id || walletTimestampMicros(page.items.at(-1)!.createdAt) !== walletTimestampMicros(page.nextCursor.createdAt))) return null;
  return page;
}

const kindLabels: Record<WalletHistoryItem["kind"], string> = {
  topup_requested: "충전 주문", topup_confirmed: "충전 완료", topup_refund_requested: "충전 환불 예약", topup_refunded: "충전 환불 완료", topup_refund_rejected: "충전 환불 반려",
  self_deposit_reserved: "집중 디파짓 예약", self_deposit_earned: "집중 성공 포인트 전환", self_deposit_returned: "집중 디파짓 반환",
  guardian_reward_requested: "보호자 보상 요청", guardian_reward_declined: "보호자 보상 거절·취소", guardian_deposit_reserved: "보호자 보상 예약", guardian_reward_released: "보호자 보상 지급", guardian_deposit_returned: "보호자 보상 반환",
  cashout_requested: "획득 포인트 지급 예약", cashout_completed: "획득 포인트 정산 기록", cashout_rejected: "획득 포인트 지급 반려",
};
export function walletHistoryTitle(item: WalletHistoryItem): string { return kindLabels[item.kind]; }
export function walletHistoryStatus(item: WalletHistoryItem): string {
  if (item.resolutionKind) return `연결 결과: ${kindLabels[item.resolutionKind]}`;
  if (item.status === "failed") return "처리 실패 · 결과 확인 필요";
  if (item.status !== "posted") return "처리 중 · 결과 미확정";
  if (["topup_requested", "topup_refund_requested", "guardian_reward_requested", "cashout_requested"].includes(item.kind)) return "처리 중 · 결과 미확정";
  if (item.kind.endsWith("_reserved")) return "예약 중 · 정산 대기";
  return "원장 반영 완료";
}
const bucketLabels: Record<z.infer<typeof bucket>, string> = { topup: "충전 포인트", reserved: "집중·보상 예약", earned: "획득 포인트", cashout_reserved: "지급 예약", refund_reserved: "환불 예약", external: "외부" };
export function walletHistoryMovement(item: WalletHistoryItem): string {
  if (item.status !== "posted") return "확정 잔액에 반영되지 않은 거래입니다.";
  if ((item.fromBucket === "external" || item.toBucket === "external") && [item.fromBucket, item.toBucket].every((value) => value === null || value === "external")) return "요청·거절 기록이며 잔액 이동은 없습니다.";
  if (item.fromBucket && item.toBucket) return `${bucketLabels[item.fromBucket]} → ${bucketLabels[item.toBucket]}`;
  if (item.toBucket) return `${bucketLabels[item.toBucket]}로 들어온 포인트`;
  if (item.fromBucket) return `${bucketLabels[item.fromBucket]}에서 나간 포인트`;
  return "잔액 이동 확인이 필요합니다.";
}
export function walletHistoryReason(item: WalletHistoryItem): string | null {
  const reasons: Record<NonNullable<WalletHistoryItem["reasonCode"]>, string> = {
    "student-withdrawn": "학생이 집중 시작 전 보상 요청을 취소했습니다.", "enforcement-start-cancelled": "확장 프로그램의 집중 시작을 확인하지 못해 취소되었습니다.",
    REJECT_CARD_COMPANY: "카드사에서 결제를 거절했습니다.", PAY_PROCESS_CANCELED: "결제창에서 결제를 취소했습니다.", PAY_PROCESS_ABORTED: "결제 인증이 중단되었습니다.", unconfirmed: "처리 결과를 확인하지 못했습니다. 잔액과 연결 거래를 다시 조회해 주세요.",
  };
  if (item.reasonCode) return reasons[item.reasonCode];
  if (["guardian_reward_declined", "cashout_rejected", "topup_refund_rejected"].includes(item.kind)) return "거절·반려 기록입니다. 구체적인 사유가 제공되지 않았습니다.";
  return null;
}
