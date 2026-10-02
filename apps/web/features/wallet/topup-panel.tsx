"use client";

import { useEffect, useRef, useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { createClient } from "@/lib/supabase/client";
import { getTossPublicConfig } from "@/features/membership/payment";
import { parseTopupOrder, selectTopupPreset, TOPUP_PRESETS, type TopupPreset } from "./topup";
import { CreditCard, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isPaymentWindowCancelled, newTopupAttempt, persistTopupAttempt, restoreTopupAttempt, type TopupAttempt } from "./topup-attempt";
import { requireOnlineAction } from "@/lib/online";

export function TopupPanel({ userId, email }: { userId: string; email: string | null }) {
  const [selected, setSelected] = useState<TopupPreset>(30_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<TopupAttempt | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [storageFailed, setStorageFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    void Promise.resolve().then(() => {
      const saved = restoreTopupAttempt(sessionStorage, userId);
      if (mounted) { setAttempt(saved); if (saved) setSelected(saved.points); }
    }).catch(() => {
      if (mounted) { setStorageFailed(true); setError("저장된 주문을 확인하지 못했습니다. 거래 내역을 먼저 확인해 주세요."); }
    }).finally(() => { if (mounted) setRestoring(false); });
    return () => { mounted = false; };
  }, [userId]);

  function save(next: TopupAttempt | null) {
    persistTopupAttempt(sessionStorage, userId, next);
    setAttempt(next);
  }

  async function requestPayment() {
    if (inFlight.current || restoring || storageFailed) return;
    inFlight.current = true;
    setBusy(true); setError(null); setMessage(null);
    let pendingOrderId: string | null = null;
    try {
      requireOnlineAction("포인트 충전");
      const config = getTossPublicConfig();
      const current = attempt ?? newTopupAttempt(userId, selected);
      save(current); // Persist before requesting an order; lost replies reuse this key.
      const client = createClient();
      const { data, error: orderError } = await client.functions.invoke("wallet-create-topup-order", {
        body: { points: current.points, idempotencyKey: current.idempotencyKey },
      });
      if (orderError) throw new Error("order_unavailable");
      const order = parseTopupOrder(data);
      if (order.amount !== current.points || (current.orderId && current.orderId !== order.orderId)) throw new Error("order_mismatch");
      save({ ...current, orderId: order.orderId });
      if (order.status === "confirmed" || order.status === "failed") {
        save(null);
        setMessage(order.status === "confirmed" ? "기존 충전이 완료되었습니다. 새 충전은 금액을 선택해 진행해 주세요." : "기존 주문이 종료되었습니다. 금액을 선택해 새 주문을 만들 수 있습니다.");
        router.refresh(); return;
      }
      if (order.status === "confirming" || order.status === "needs_review") {
        const { data: result, error: resultError } = await client.functions.invoke("wallet-confirm-topup", { body: { action: "reconcile", orderId: order.orderId } });
        if (resultError || result?.status !== "confirmed" || result.points !== current.points) throw new Error("confirmation_unavailable");
        save(null); setMessage("기존 결제 승인을 확인했습니다. 지갑에서 잔액을 확인해 주세요."); router.refresh(); return;
      }
      pendingOrderId = order.orderId;
      const payment = (await loadTossPayments(config.clientKey)).payment({ customerKey: userId });
      await payment.requestPayment({ method: "CARD", amount: { currency: "KRW", value: order.amount }, orderId: order.orderId, orderName: order.orderName,
        successUrl: `${config.appOrigin}/wallet/charge/success`, failUrl: `${config.appOrigin}/wallet/charge/fail`, customerEmail: email ?? undefined });
      setError("결제 결과를 확인하고 있습니다. 거래 내역에서 상태를 확인해 주세요.");
    } catch (cause) {
      if (pendingOrderId && isPaymentWindowCancelled(cause)) {
        try {
          const { data, error: cancelError } = await createClient().rpc("cancel_pending_topup_order", { p_order_id: pendingOrderId });
          if (cancelError || data?.status !== "cancelled" || data.orderId !== pendingOrderId) throw new Error("cancel_unavailable");
          save(null); setMessage("결제 취소를 확인했습니다. 다른 금액으로 새 주문을 만들 수 있습니다.");
        } catch { setError("주문 취소 결과를 확인하지 못했습니다. 기존 주문을 다시 확인해 주세요."); }
      } else setError("결제창 또는 주문 결과를 확인하지 못했습니다. 기존 주문을 다시 확인하거나 거래 내역을 조회해 주세요.");
    } finally { inFlight.current = false; setBusy(false); }
  }

  return (
    <section className="payment-card">
      <div className="test-mode-banner">
        <strong className="payment-safety-label">
          <CreditCard className="w-4 h-4 text-blue-600" /> Toss Payments 포인트 충전
        </strong>
        <span>승인 결과 확인 후 포인트 반영</span>
      </div>

      <div>
        <p className="eyebrow">POINT TOPUP</p>
        <h1>충전할 포인트를 선택하세요</h1>
        <p className="text-sm text-muted">
          서버에서 결제 승인과 원장 반영을 확인한 뒤 충전 포인트를 사용할 수 있습니다.
        </p>
      </div>

      <div className="topup-presets grid grid-cols-3 gap-3 my-4">
        {TOPUP_PRESETS.map((points) => {
          const isSelected = selected === points;
          return (
            <button
              type="button"
              className={`topup-preset ${isSelected ? "selected" : ""}`}
              disabled={busy || restoring || !!attempt || storageFailed}
              aria-pressed={isSelected}
              key={points}
              onClick={() => setSelected(selectTopupPreset(points))}
            >
              <span className="preset-amount">{points.toLocaleString()} P</span>
              <span className="preset-price">{(points).toLocaleString()}원</span>
            </button>
          );
        })}
      </div>

      <div className="notice flex items-start gap-2.5 mb-2">
        <ShieldCheck className="w-4.5 h-4.5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <strong>안전 결제 및 유의 사항</strong>
          <p className="text-xs text-muted mt-0.5">
            미사용 충전 포인트는 원 결제의 남은 금액과 현재 가용 잔액 범위에서 환불할 수 있습니다.
          </p>
        </div>
      </div>

      <button
        className="button full"
        type="button"
        disabled={busy || restoring || storageFailed}
        onClick={() => void requestPayment()}
      >
        <CreditCard className="w-4 h-4" />
        <span>{restoring ? "기존 주문 확인 중…" : busy ? "주문·결제 상태 확인 중…" : attempt ? "기존 주문 다시 확인" : `${selected.toLocaleString()} P 충전하기`}</span>
      </button>

      {attempt && <p className="text-sm text-muted" role="status">{attempt.points.toLocaleString()} P 기존 주문을 확인하기 전에는 금액을 변경할 수 없습니다.</p>}
      <Link className="button secondary small" href="/wallet/history">전체 거래 내역 확인</Link>
      {message && <div className="notice" role="status"><p>{message}</p></div>}
      {error && (
        <div className="notice error mt-3" role="alert">
          <strong>결제 결과 확인이 필요합니다.</strong>
          <p>{error}</p>
        </div>
      )}
    </section>
  );
}
