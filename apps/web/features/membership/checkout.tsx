"use client";

import { useRef, useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { createClient } from "@/lib/supabase/client";
import { getTossPublicConfig } from "./payment";
import { CheckCircle2, CreditCard } from "lucide-react";

interface MembershipOrder {
  orderId: string;
  amount: number;
  orderName: string;
  productCode: "student_premium" | "guardian_family";
  orderKind: "membership" | "family_seat";
}

function isMembershipOrder(value: unknown): value is MembershipOrder {
  if (!value || typeof value !== "object") return false;
  const order = value as Record<string, unknown>;
  return typeof order.orderId === "string"
    && Number.isSafeInteger(order.amount) && Number(order.amount) >= 500 && Number(order.amount) <= 24_600
    && typeof order.orderName === "string"
    && ["student_premium", "guardian_family"].includes(String(order.productCode))
    && ["membership", "family_seat"].includes(String(order.orderKind));
}

async function functionErrorCode(error: unknown): Promise<string> {
  if (!error || typeof error !== "object") return "membership_order_failed";
  const context = Reflect.get(error, "context");
  if (context && typeof context === "object" && typeof Reflect.get(context, "json") === "function") {
    try {
      const body = await Reflect.apply(Reflect.get(context, "json"), context, []);
      if (body && typeof body === "object" && typeof Reflect.get(body, "error") === "string") return Reflect.get(body, "error");
    } catch { /* safe fallback */ }
  }
  return "membership_order_failed";
}

function orderErrorCopy(code: string): string {
  if (code === "student_membership_conflict") return "연결된 학생의 단독 멤버십이 아직 이용 중입니다. 학생 멤버십 만료 후 가족 멤버십을 결제해 주세요.";
  if (code === "guardian_membership_conflict") return "보호자 가족 멤버십을 이용 중이므로 학생 단독 멤버십을 함께 가입할 수 없습니다.";
  if (code === "membership_already_active") return "현재 멤버십이 이미 활성화되어 있습니다. 이용 기간이 끝난 뒤 다시 결제할 수 있습니다.";
  if (code === "family_seat_limit_reached") return "보호자 한 명당 학생은 최대 5명까지 연결할 수 있습니다.";
  if (code === "family_membership_inactive") return "가족 멤버십을 먼저 활성화한 뒤 추가 좌석을 결제해 주세요.";
  if (code === "family_seat_already_available") return "현재 사용할 수 있는 학생 좌석이 남아 있습니다.";
  return "결제 주문을 만들지 못했습니다. 멤버십 상태를 다시 확인해 주세요.";
}

export function MembershipCheckout({
  userId,
  email,
  role,
  orderKind = "membership",
}: {
  userId: string;
  email: string | null;
  role: "student" | "guardian";
  orderKind?: "membership" | "family_seat";
}) {
  const idempotencyKey = useRef(`membership-order:${crypto.randomUUID()}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestPayment = async () => {
    setBusy(true);
    setError(null);
    try {
      const config = getTossPublicConfig();
      const { data, error: orderError } = await createClient().functions.invoke("membership-create-order", {
        body: { idempotencyKey: idempotencyKey.current, orderKind }
      });
      if (orderError) throw new Error(orderErrorCopy(await functionErrorCode(orderError)));
      if (!isMembershipOrder(data)) throw new Error("결제 주문 정보를 확인하지 못했습니다.");
      const tossPayments = await loadTossPayments(config.clientKey);
      const payment = tossPayments.payment({ customerKey: userId });
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: data.amount },
        orderId: data.orderId,
        orderName: data.orderName,
        successUrl: `${config.appOrigin}/membership/success`,
        failUrl: `${config.appOrigin}/membership/fail`,
        customerEmail: email ?? undefined,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Toss 테스트 결제창을 열지 못했습니다.");
      setBusy(false);
    }
  };

  return (
    <section className="payment-card">
      <div className="test-mode-banner">
        <strong className="payment-safety-label">
          <CreditCard className="w-4 h-4" /> 멤버십 안전 결제
        </strong>
        <span>Toss 테스트 모드 · 실제 결제 없음</span>
      </div>

      <p className="eyebrow">PREMIUM · 30 DAYS</p>
      <h1>{orderKind === "family_seat" ? "가족 Premium 추가 학생 좌석" : role === "student" ? "학생 Premium 30일 이용권" : "가족 Premium 30일 이용권"}</h1>

      <p className="payment-price">
        <strong>{orderKind === "family_seat" ? "500원부터" : role === "student" ? "9,900 원" : "12,900 원"}</strong>
        <span>{orderKind === "family_seat" ? "활성 가족 멤버십은 일할 계산" : "30일 단건 결제"}</span>
      </p>

      <ul className="payment-benefits list-none p-4 rounded-2xl bg-gray-50 space-y-2">
        <li className="flex items-center gap-2 text-sm text-gray-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{role === "guardian" ? "연결 학생 2명 기본 포함" : "집중 계획 AI 첨삭과 학습 추천"}</span>
        </li>
        <li className="flex items-center gap-2 text-sm text-gray-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{role === "guardian" ? "학생 AI 기능과 보호자 가족 요약" : "화면 OCR · 문법 교정 · 콘텐츠 요약"}</span>
        </li>
        <li className="flex items-center gap-2 text-sm text-gray-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{orderKind === "family_seat" ? "가족 멤버십 만료일까지 좌석 이용" : "승인 시점부터 30일 이용"}</span>
        </li>
      </ul>

      <div className="notice">
        <strong>자동 갱신 없음</strong>
        <p>한 달 뒤 자동으로 결제되지 않습니다. 계속 사용하려면 직접 다시 결제해야 합니다.</p>
        {orderKind === "family_seat" ? <p>가족 멤버십이 아직 없다면 기본 가족형 12,900원과 세 번째 좌석 3,900원을 한 번에 결제합니다.</p> : role === "guardian" ? <p>이미 연결된 학생이 3명 이상이면 필요한 추가 좌석 비용이 Toss 결제창 금액에 합산됩니다.</p> : null}
      </div>

      <button className="button full" type="button" disabled={busy} onClick={() => void requestPayment()}>
        <CreditCard className="w-4 h-4" />
        <span>{busy ? "Toss 결제창 준비 중…" : orderKind === "family_seat" ? "추가 좌석 테스트 결제하기" : "Toss 테스트 결제하기"}</span>
      </button>

      {error && (
        <div className="notice error" role="alert">
          <strong>Toss 테스트 결제창을 열지 못했습니다.</strong>
          <p>{error}</p>
        </div>
      )}
    </section>
  );
}
