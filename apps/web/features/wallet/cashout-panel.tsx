"use client";

import Link from "next/link";

interface WalletBalances {
  earnedAvailable: number;
  cashoutReserved: number;
  cashoutCompleted: number;
}

// Ledger-only completion must never be presented as a bank transfer.
export function CashoutPanel({ initialBalances }: { initialBalances: WalletBalances | null }) {
  return <section className="cashout-layout space-y-6">
    <div className="notice" role="status">
      <strong>포인트 현금화 서비스 준비 중</strong>
      <p>현재 현금화 신청과 계좌 송금은 제공하지 않습니다. 획득 포인트는 지갑에 보관됩니다.</p>
    </div>
    {initialBalances && <div className="wallet-metrics grid grid-cols-3 gap-6">
      <article className="card"><span className="card-label">보유 획득 포인트</span><strong className="text-3xl font-extrabold text-blue-600 block mt-2">{initialBalances.earnedAvailable.toLocaleString()} P</strong></article>
      <article className="card"><span className="card-label">기존 요청 예약 포인트</span><strong className="text-3xl font-extrabold text-navy block mt-2">{initialBalances.cashoutReserved.toLocaleString()} P</strong></article>
      <article className="card"><span className="card-label">기존 정산 기록</span><strong className="text-3xl font-extrabold text-navy block mt-2">{initialBalances.cashoutCompleted.toLocaleString()} P</strong><p className="text-xs text-muted">이 기록만으로 계좌 송금 완료를 의미하지 않습니다.</p></article>
    </div>}
    <button className="button full" type="button" disabled>현금화 신청 준비 중</button>
    <Link className="button secondary" href="/wallet/history">거래 내역 확인</Link>
  </section>;
}
