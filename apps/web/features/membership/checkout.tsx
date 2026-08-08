"use client";

import { useRef, useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { createClient } from "@/lib/supabase/client";
import { getTossPublicConfig } from "./payment";

interface MembershipOrder { orderId: string; amount: number; orderName: string; }

function isMembershipOrder(value: unknown): value is MembershipOrder {
  if (!value || typeof value !== "object") return false;
  const order = value as Record<string, unknown>;
  return typeof order.orderId === "string" && order.amount === 12_900 && order.orderName === "Mirujima Premium 1개월";
}

export function MembershipCheckout({ userId, email }: { userId: string; email: string | null }) {
  const idempotencyKey = useRef(`membership-order:${crypto.randomUUID()}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestPayment = async () => {
    setBusy(true);
    setError(null);
    try {
      const config = getTossPublicConfig();
      const { data, error: orderError } = await createClient().functions.invoke("membership-create-order", {
        body: { idempotencyKey: idempotencyKey.current }
      });
      if (orderError || !isMembershipOrder(data)) throw new Error("결제 주문을 만들지 못했습니다.");
      const tossPayments = await loadTossPayments(config.clientKey);
      const payment = tossPayments.payment({ customerKey: userId });
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: data.amount },
        orderId: data.orderId,
        orderName: data.orderName,
        successUrl: `${config.appOrigin}/membership/success`,
        failUrl: `${config.appOrigin}/membership/fail`,
        customerEmail: email ?? undefined
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "결제창을 열지 못했습니다.");
      setBusy(false);
    }
  };
  return <section className="payment-card">
    <div className="test-mode-banner"><strong>테스트 결제</strong><span>실제 금액은 청구되지 않습니다.</span></div>
    <p className="eyebrow">PREMIUM · ONE MONTH</p><h1>Premium 1개월 이용권</h1>
    <p className="payment-price"><strong>12,900원</strong><span>1개월 단건 결제</span></p>
    <ul className="payment-benefits"><li>학습 잔디와 클라우드 동기화</li><li>화면 OCR·문법 교정·콘텐츠 요약</li><li>승인 시점부터 1개월 이용</li></ul>
    <div className="notice"><strong>자동 갱신 없음</strong><p>한 달 뒤 자동으로 결제되지 않습니다. 계속 사용하려면 직접 다시 결제해야 합니다.</p></div>
    <button className="button full" type="button" disabled={busy} onClick={() => void requestPayment()}>{busy ? "결제창 준비 중…" : "Toss 테스트 결제하기"}</button>
    {error && <div className="notice error" role="alert"><strong>결제창을 열지 못했습니다.</strong><p>{error}</p></div>}
  </section>;
}
