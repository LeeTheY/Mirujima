"use client";

import { useEffect, useRef, useState } from "react";
import { ReceiptText, ShieldCheck, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { requireOnlineAction } from "@/lib/online";
import Link from "next/link";
import { newRefundAttempt, restoreRefundAttempt, persistRefundAttempt, parseRefundResult, type RefundAttempt } from "./refund-attempt";
import { WalletUnavailable } from "./wallet-unavailable";

export function RefundPanel({
  userId,
  initialTopupAvailable,
  initialMaxRefundableTopup,
}: {
  userId: string;
  initialTopupAvailable: number;
  initialMaxRefundableTopup: number;
}) {
  const [topupAvailable, setTopupAvailable] = useState(initialTopupAvailable);
  const [maxRefundableTopup, setMaxRefundableTopup] = useState(initialMaxRefundableTopup);
  const [inputMode, setInputMode] = useState<"direct" | "full">("direct");
  const [points, setPoints] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const inFlight = useRef(false);
  const [attempt, setAttempt] = useState<RefundAttempt | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [storageFailed, setStorageFailed] = useState(false);
  useEffect(() => {
    let current = true;
    void Promise.resolve().then(() => {
      if (!current) return;
      try {
        const saved = restoreRefundAttempt(sessionStorage, userId);
        setAttempt(saved); if (saved) setPoints(String(saved.points));
      } catch { setStorageFailed(true); setError("저장된 환불 요청을 확인하지 못했습니다. 거래 내역을 확인해 주세요."); }
      setRestoring(false);
    });
    return () => { current = false; };
  }, [userId]);

  async function requestRefund() {
    if (inFlight.current || unavailable || restoring || storageFailed) return;
    try {
      requireOnlineAction("충전 포인트 환불");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "인터넷 연결을 확인해 주세요.");
      return;
    }
    const refundAmount = attempt?.points ?? Number(points);
    if (!Number.isSafeInteger(refundAmount) || refundAmount <= 0 || (!attempt && refundAmount > maxRefundableTopup)) {
      setError("올바른 환불 포인트를 입력해 주세요.");
      return;
    }

    inFlight.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const active = attempt ?? newRefundAttempt(userId, refundAmount);
      persistRefundAttempt(sessionStorage, userId, active);
      setAttempt(active);
      const { data, error: functionError } = await createClient().functions.invoke("wallet-refund-topup", {
        body: { idempotencyKey: active.idempotencyKey, points: active.points },
      });
      if (functionError) throw new Error("refund_unconfirmed");
      const result = parseRefundResult(data, active.points);
      persistRefundAttempt(sessionStorage, userId, null);
      setAttempt(null);
      if (result.balances && result.maxRefundableTopup !== null) {
        setTopupAvailable(result.balances.topupAvailable);
        setMaxRefundableTopup(result.maxRefundableTopup);
      } else setUnavailable(true);
      setMessage(result.status === "rejected" ? "환불 요청이 종료되었습니다. 거래 내역과 잔액을 확인해 주세요." : result.actualRefund ? `${result.points.toLocaleString()} P 결제사 취소를 확인했습니다. 실제 계좌 입금 완료를 의미하지 않습니다.` : `${result.points.toLocaleString()} P 내부 환불 기록을 반영했습니다. 결제사 취소는 실행하지 않았습니다.`);
      setPoints(""); setInputMode("direct");
    } catch {
      setError("환불 결과 확인이 필요합니다. 같은 요청으로 다시 확인해 주세요. 결과가 불명확하면 예약 포인트를 유지하며 새 환불을 만들지 않습니다.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (unavailable) return <><div className="notice"><p>{message}</p></div><WalletUnavailable /></>;

  return (
    <section className="payment-card">
      <div className="test-mode-banner">
        <strong>충전 포인트 환불</strong>
        <span>서버 처리 결과 확인 후 확정</span>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">TOPUP REFUND</p>
          <h1 className="refund-heading">충전 포인트 환불 신청</h1>
        </div>
        <ReceiptText className="w-6 h-6 text-blue-600 shrink-0" />
      </div>

      <div className="sub-card">
        <span className="text-xs text-muted font-bold block">{attempt ? "마지막으로 확인한 충전 포인트" : "현재 사용 가능한 충전 포인트"}</span>
        <strong className="text-2xl font-extrabold text-navy block mt-1">{topupAvailable.toLocaleString()} P</strong>
      </div>

      <div className="border-t border-gray-100 pt-4 mt-2">
        <div className="flex gap-2 mb-4" aria-label="환불 금액 선택 방식">
          <button
            type="button"
            className={`button secondary small ${inputMode === "direct" ? "active" : ""}`}
            disabled={busy || restoring || storageFailed || !!attempt || maxRefundableTopup === 0}
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
            disabled={busy || restoring || storageFailed || !!attempt || maxRefundableTopup === 0}
            onClick={() => {
              setInputMode("full");
              setPoints(maxRefundableTopup > 0 ? String(maxRefundableTopup) : "");
            }}
          >
            최대 선택
          </button>
        </div>

        <div className="cashout-request-row">
          <div className="cashout-input-column">
            <label htmlFor="refund-points" className="text-xs text-navy font-bold block mb-2">신청 포인트</label>
            <input
              id="refund-points"
              type="number"
              className="input cashout-amount-input"
              placeholder={`환불할 포인트 입력 (최대 ${maxRefundableTopup.toLocaleString()}P)`}
              value={points}
              disabled={busy || restoring || storageFailed || !!attempt || maxRefundableTopup === 0}
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
              restoring || storageFailed ||
              (!attempt && maxRefundableTopup === 0) ||
              !points ||
              Number(points) <= 0 ||
              (!attempt && Number(points) > maxRefundableTopup)
            }
            onClick={() => void requestRefund()}
          >
            <span>{busy ? "환불 처리 중…" : attempt ? "기존 환불 결과 확인" : "환불 신청하기"}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="notice flex items-start gap-2.5 mt-4">
        <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <strong>원 결제 기준 환불</strong>
          <p>한 번에 한 원 결제의 남은 금액까지 환불할 수 있습니다. 결제사 취소 확인 여부는 처리 결과에서 안내합니다. 내부 기록 반영만으로 계좌 입금을 확정하지 않습니다. 처리 중에는 금액을 변경할 수 없으며, 획득 포인트 환급과는 별도입니다.</p>
        </div>
      </div>

      {attempt && <p className="muted small">{attempt.points.toLocaleString()} P 기존 환불을 확인하기 전에는 새 요청을 만들 수 없습니다. 위 잔액은 마지막 조회값이며, 예약된 포인트로 인해 실제 가용 잔액과 다를 수 있습니다.</p>}
      <Link className="button secondary" href="/wallet/history">전체 거래 내역 확인</Link>
      {message && <div className="notice"><strong>환불 처리 결과</strong><p>{message}</p></div>}
      {error && <div className="notice error" role="alert"><strong>환불 결과 확인 필요</strong><p>{error}</p></div>}
    </section>
  );
}
