import { formatWalletPoints, type WalletSummary } from "./wallet-summary";
export function WalletBalanceGuide({ summary, checkedAt }: { summary: WalletSummary | null; checkedAt?: string }) {
  return <div className="text-xs text-muted">
    <p>집중·보상 예약: {formatWalletPoints(summary?.reservedAvailable)} · 예약된 포인트는 정산 전까지 사용할 수 없습니다.</p>
    <p>충전 포인트는 앱에서 사용하며 미사용분은 원 결제 환불 대상입니다. 획득 포인트 지급은 별도 절차이며 현재 실제 송금은 비활성화되어 있습니다.</p>
    {checkedAt && <p>조회 시점: <time dateTime={checkedAt}>{new Date(checkedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time></p>}
  </div>;
}
