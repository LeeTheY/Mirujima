import { formatWalletPoints, type WalletSummary } from "./wallet-summary";
export function WalletBalanceGuide({ summary, checkedAt, compact = false }: { summary: WalletSummary | null; checkedAt?: string; compact?: boolean }) {
  const content = <div className="text-xs text-muted">
    <p>예약 {formatWalletPoints(summary?.reservedAvailable)} · 정산 전 사용 불가</p>
    <p>충전 포인트: 앱 내 사용, 미사용분은 원 결제 환불.</p>
    <p>획득 포인트: 별도 지급 절차, 현재 송금 미지원.</p>
    {checkedAt && <p>확인: <time dateTime={checkedAt}>{new Date(checkedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time></p>}
  </div>;
  return compact ? <details className="wallet-balance-details"><summary>포인트 사용·지급 안내</summary>{content}</details> : content;
}
