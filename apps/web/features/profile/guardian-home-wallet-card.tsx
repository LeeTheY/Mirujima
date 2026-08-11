"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, CreditCard, History } from "lucide-react";
import { TopupHistoryModal } from "@/features/wallet/topup-history-modal";

export function GuardianHomeWalletCard() {
  const [isTopupHistoryModalOpen, setIsTopupHistoryModalOpen] = useState(false);

  return (
    <article className="card">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="card-label">보호자 지갑</span>
          <ShieldCheck className="w-4 h-4 text-blue-600" />
        </div>
        <p className="m-0 text-sm text-muted">
          학생 보상에 사용할 테스트 포인트를 안전하게 관리합니다.
        </p>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <Link
            className="button secondary full small text-center flex items-center justify-center"
            href="/wallet/charge"
          >
            포인트 충전하기
          </Link>
          <button
            type="button"
            onClick={() => setIsTopupHistoryModalOpen(true)}
            className="button secondary full small text-center flex items-center justify-center"
          >
            충전·환불 내역
          </button>
        </div>
      </div>

      <TopupHistoryModal
        isOpen={isTopupHistoryModalOpen}
        onClose={() => setIsTopupHistoryModalOpen(false)}
      />
    </article>
  );
}
