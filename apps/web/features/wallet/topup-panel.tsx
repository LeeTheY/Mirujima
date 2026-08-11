"use client";

import { useRef, useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { createClient } from "@/lib/supabase/client";
import { getTossPublicConfig } from "@/features/membership/payment";
import { parseTopupOrder, selectTopupPreset, TOPUP_PRESETS, type TopupPreset } from "./topup";
import { CreditCard, ShieldCheck } from "lucide-react";

export function TopupPanel({ userId, email }: { userId: string; email: string | null }) {
  const [selected, setSelected] = useState<TopupPreset>(30_000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestKey = useRef(`topup-order:${crypto.randomUUID()}`);

  async function requestPayment() {
    setBusy(true);
    setError(null);
    try {
      const config = getTossPublicConfig();
      const { data, error: orderError } = await createClient().functions.invoke("wallet-create-topup-order", {
        body: { points: selected, idempotencyKey: requestKey.current },
      });
      if (orderError) throw new Error("충전 주문을 만들지 못했습니다.");
      const order = parseTopupOrder(data);
      const payment = (await loadTossPayments(config.clientKey)).payment({ customerKey: userId });
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: order.amount },
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: `${config.appOrigin}/wallet/charge/success`,
        failUrl: `${config.appOrigin}/wallet/charge/fail`,
        customerEmail: email ?? undefined,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Toss 테스트 결제창을 열지 못했습니다.");
      setBusy(false);
    }
  }

  return (
    <section className="payment-card">
      <div className="test-mode-banner">
        <strong className="payment-safety-label">
          <CreditCard className="w-4 h-4 text-blue-600" /> Toss Payments 테스트 충전
        </strong>
        <span>실제 결제 없음 · DB 원장 반영</span>
      </div>

      <div>
        <p className="eyebrow">POINT TOPUP</p>
        <h1>충전할 포인트를 선택하세요</h1>
        <p className="text-sm text-muted">
          선택한 금액만큼 미루지마 포인트가 즉시 충전되어 집중 디파짓 및 챌린지에 사용할 수 있습니다.
        </p>
      </div>

      <div className="topup-presets grid grid-cols-3 gap-3 my-4">
        {TOPUP_PRESETS.map((points) => {
          const isSelected = selected === points;
          return (
            <button
              type="button"
              className={`topup-preset ${isSelected ? "selected" : ""}`}
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
            충전 포인트는 서비스 내 디파짓 용도로 사용되며 환급 대상이 아닙니다.
          </p>
        </div>
      </div>

      <button
        className="button full"
        type="button"
        disabled={busy}
        onClick={() => void requestPayment()}
      >
        <CreditCard className="w-4 h-4" />
        <span>{busy ? "Toss 결제창 준비 중…" : `${selected.toLocaleString()} P 테스트 충전하기`}</span>
      </button>

      {error && (
        <div className="notice error mt-3" role="alert">
          <strong>충전을 시작하지 못했습니다.</strong>
          <p>{error}</p>
        </div>
      )}
    </section>
  );
}
