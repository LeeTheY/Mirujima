"use client";

import { useRef, useState } from "react";
import { ReceiptText, ShieldCheck, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function RefundPanel({ initialTopupAvailable }: { initialTopupAvailable: number }) {
  const [topupAvailable, setTopupAvailable] = useState(initialTopupAvailable);
  const [inputMode, setInputMode] = useState<"direct" | "full">("direct");
  const [points, setPoints] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestKey = useRef(`topup-refund:${crypto.randomUUID()}`);

  async function requestRefund() {
    const refundAmount = Number(points);
    if (!refundAmount || refundAmount <= 0 || refundAmount > topupAvailable) {
      setError("올바른 환불 포인트를 입력해 주세요.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    const { data, error: functionError } = await createClient().functions.invoke("wallet-refund-topup", {
      body: { idempotencyKey: requestKey.current, points: refundAmount },
    });
    setBusy(false);
    if (functionError || data?.status !== "refunded") {
      setError("환불 가능한 원 결제를 찾지 못했거나 환불을 처리하지 못했습니다.");
      return;
    }
    const updatedAvailable = Number.isSafeInteger(data?.balances?.topupAvailable) ? data.balances.topupAvailable : 0;
    setTopupAvailable(updatedAvailable);
    setMessage(`${Number(data.points).toLocaleString()} P 원 결제 환불을 완료했습니다.`);
    setPoints("");
    setInputMode("direct");
    requestKey.current = `topup-refund:${crypto.randomUUID()}`;
  }

  return (
    <section className="payment-card">
      <div className="test-mode-banner">
        <strong>Toss Payments 테스트 환불</strong>
        <span>실제 결제 취소 없음 · DB 원장 반영</span>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">TOPUP REFUND</p>
          <h1>충전 포인트 환불 신청</h1>
        </div>
        <ReceiptText className="w-6 h-6 text-blue-600" />
      </div>

      <div className="sub-card">
        <span className="text-xs text-muted font-bold block">현재 사용 가능한 충전 포인트</span>
        <strong className="text-2xl font-extrabold text-navy block mt-1">{topupAvailable.toLocaleString()} P</strong>
      </div>

      <div className="border-t border-gray-100 pt-4 mt-2">
        <div className="flex gap-2 mb-4" aria-label="환불 금액 선택 방식">
          <button
            type="button"
            className={`button secondary small ${inputMode === "direct" ? "active" : ""}`}
            disabled={busy || topupAvailable === 0}
            onClick={() => {
              setInputMode("direct");
              setPoints("");
            }}
          >
            직접 입력
          </button>
          <button
            type="button"
            className={`button secondary small ${inputMode === "full" ? "active" : ""}`}
            disabled={busy || topupAvailable === 0}
            onClick={() => {
              setInputMode("full");
              setPoints(topupAvailable > 0 ? String(topupAvailable) : "");
            }}
          >
            전액 선택
          </button>
        </div>

        <div className="cashout-request-row">
          <div className="cashout-input-column">
            <label className="text-xs text-navy font-bold block mb-2">신청 포인트</label>
            <input
              type="number"
              className="input cashout-amount-input"
              placeholder="환불할 포인트 수량 입력 (예: 3000)"
              value={points}
              disabled={busy || topupAvailable === 0}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "") {
                  setPoints("");
                  return;
                }
                const num = Number(val);
                if (!isNaN(num) && num >= 0) {
                  setPoints(String(num));
                }
              }}
            />
          </div>

          <button
            className="button primary cashout-submit-button flex items-center justify-center gap-1.5"
            type="button"
            disabled={
              busy ||
              topupAvailable === 0 ||
              !points ||
              Number(points) <= 0 ||
              Number(points) > topupAvailable
            }
            onClick={() => void requestRefund()}
          >
            <span>{busy ? "환불 처리 중…" : "환불 신청하기"}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="notice flex items-start gap-2.5 mt-4">
        <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <strong>원 결제 기준 환불</strong>
          <p>테스트 모드에서는 실제 결제 취소 없이 최근 미사용 충전 건을 DB 환불 원장에 반영합니다. 획득 포인트 환급과는 별도입니다.</p>
        </div>
      </div>

      {message && <div className="notice"><strong>환불 완료</strong><p>{message}</p></div>}
      {error && <div className="notice error" role="alert"><strong>환불 실패</strong><p>{error}</p></div>}
    </section>
  );
}
