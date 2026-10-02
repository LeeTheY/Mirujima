import { parseWalletSummary } from "./wallet-summary";

export function topupConfirmationCopy(value: unknown, expectedPoints: number): { title: string; description: string } {
  const unconfirmed = { title: "충전 결과 확인이 필요합니다.", description: "현재 결제 결과나 잔액을 확정할 수 없습니다. 충전 내역과 잔액을 다시 확인해 주세요." };
  if (!value || typeof value !== "object" || Array.isArray(value)) return unconfirmed;
  const item = value as Record<string, unknown>;
  if (item.status !== "confirmed" || !Number.isSafeInteger(item.points) || item.points !== expectedPoints || expectedPoints <= 0) return unconfirmed;
  const wallet = parseWalletSummary(item.balances);
  return {
    title: `${expectedPoints.toLocaleString("ko-KR")}P가 충전되었습니다.`,
    description: wallet ? `사용 가능 충전 포인트: ${wallet.topupAvailable.toLocaleString("ko-KR")}P` : "충전은 완료되었으나 현재 잔액을 확인하지 못했습니다. 지갑에서 다시 확인해 주세요.",
  };
}
