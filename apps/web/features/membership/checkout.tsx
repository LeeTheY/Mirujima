"use client";

import { useEffect, useRef, useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { createClient } from "@/lib/supabase/client";
import { getTossPublicConfig, readFunctionErrorCode } from "./payment";
import { CheckCircle2, CreditCard } from "lucide-react";
import { requireOnlineAction } from "@/lib/online";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { isPaymentWindowCancelled } from "../wallet/topup-attempt";
import { newMembershipAttempt, restoreMembershipAttempt, persistMembershipAttempt, parseMembershipOrder, confirmedMembershipOrder, type MembershipAttempt } from "./checkout-attempt";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const inFlight = useRef(false);
  const [attempt, setAttempt] = useState<MembershipAttempt | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [storageFailed, setStorageFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void Promise.resolve().then(() => {
      if (!current) return;
      try { setAttempt(restoreMembershipAttempt(sessionStorage, userId)); }
      catch { setStorageFailed(true); setError("저장된 멤버십 주문을 확인하지 못했습니다. 멤버십 상태를 먼저 확인해 주세요."); }
      setRestoring(false);
    });
    return () => { current = false; };
  }, [userId]);
  function save(next: MembershipAttempt | null) { persistMembershipAttempt(sessionStorage, userId, next); setAttempt(next); }

  const requestPayment = async () => {
    if (inFlight.current || restoring || storageFailed || (attempt && attempt.orderKind !== orderKind)) return;
    inFlight.current = true;
    let pendingOrderId: string | null = null;
    let orderFailure: string | null = null;
    setMessage(null);
    setBusy(true);
    setError(null);
    try {
      requireOnlineAction("멤버십 결제");
      const config = getTossPublicConfig();
      const active = attempt ?? newMembershipAttempt(userId, orderKind);
      save(active);
      const client = createClient();
      const { data, error: orderError } = await client.functions.invoke("membership-create-order", {
        body: { idempotencyKey: active.idempotencyKey, orderKind: active.orderKind }
      });
      if (orderError) { orderFailure = orderErrorCopy(await readFunctionErrorCode(orderError)); throw new Error("order_unavailable"); }
      const order = parseMembershipOrder(data, active, role);
      save({ ...active, orderId: order.orderId, amount: order.amount });
      if (order.status === "confirmed" || order.status === "failed") {
        save(null); setMessage(order.status === "confirmed" ? "기존 멤버십 주문 승인을 확인했습니다. 현재 이용 상태는 마이페이지에서 확인해 주세요." : "기존 주문이 종료되었습니다. 새 주문으로 다시 진행할 수 있습니다."); router.refresh(); return;
      }
      if (order.status === "confirming" || order.status === "needs_review") {
        const { data: receipt, error: resultError } = await client.functions.invoke("membership-confirm-payment", { body: { action: "reconcile", orderId: order.orderId } });
        if (resultError || !confirmedMembershipOrder(receipt, order)) throw new Error("기존 주문의 승인 결과를 확인하지 못했습니다. 같은 주문으로 다시 확인해 주세요.");
        save(null); setMessage("기존 주문 승인을 확인했습니다. 현재 멤버십 기간과 권한은 마이페이지에서 확인해 주세요."); router.refresh(); return;
      }
      pendingOrderId = order.orderId;
      const tossPayments = await loadTossPayments(config.clientKey);
      const payment = tossPayments.payment({ customerKey: userId });
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: order.amount },
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: `${config.appOrigin}/membership/success`,
        failUrl: `${config.appOrigin}/membership/fail`,
        customerEmail: email ?? undefined,
      });
      setError("결제 결과를 확인하지 못했습니다. 기존 주문을 다시 확인해 주세요.");
    } catch (cause) {
      if (pendingOrderId && isPaymentWindowCancelled(cause)) {
        try {
          const { data, error: cancelError } = await createClient().rpc("cancel_pending_membership_order", { p_order_id: pendingOrderId });
          if (cancelError || data?.status !== "cancelled" || data.orderId !== pendingOrderId) throw new Error("cancel_unconfirmed");
          save(null); setMessage("승인 전 주문 취소를 확인했습니다. 기존 멤버십 권한은 변경하지 않았습니다.");
        } catch { setError("주문 취소 결과를 확인하지 못했습니다. 기존 주문으로 다시 확인해 주세요."); }
      } else setError(orderFailure ?? (cause instanceof Error && cause.message.startsWith("기존 주문") ? cause.message : "주문 또는 결제 결과를 확인하지 못했습니다. 기존 주문으로 다시 확인하고 멤버십 상태를 조회해 주세요."));
    } finally { inFlight.current = false; setBusy(false); }
  };

  return (
    <section className="payment-card membership-checkout">
      <div className="test-mode-banner">
        <strong className="payment-safety-label">
          <CreditCard className="w-4 h-4" /> 멤버십 안전 결제
        </strong>
        <span>Toss Payments · 승인 결과 확인 후 이용권 활성화</span>
      </div>

      <p className="eyebrow">{orderKind === "family_seat" ? "PREMIUM · FAMILY SEAT" : "PREMIUM · 30 DAYS"}</p>
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

      <button className="button full" type="button" disabled={busy || restoring || storageFailed || !!(attempt && attempt.orderKind !== orderKind)} onClick={() => void requestPayment()}>
        <CreditCard className="w-4 h-4" />
        <span>{busy ? "Toss 결제창 준비 중…" : attempt ? "기존 멤버십 주문 확인" : orderKind === "family_seat" ? "추가 좌석 결제하기" : "Toss 결제하기"}</span>
      </button>

      {attempt && <p>기존 {attempt.orderKind === "family_seat" ? "추가 좌석" : "멤버십"} 주문 결과를 먼저 확인합니다.{attempt.amount !== null ? ` 저장된 주문 금액: ${attempt.amount.toLocaleString()}원.` : ""}</p>}
      {attempt && attempt.orderKind !== orderKind && <Link className="button secondary" href={`/membership/checkout?orderKind=${attempt.orderKind}`}>진행 중인 주문으로 돌아가기</Link>}
      <Link className="button secondary" href={role === "guardian" ? "/guardian/my" : "/my"}>멤버십 상태 확인</Link>
      {message && <div className="notice" role="status"><p>{message}</p></div>}
      {error && (
        <div className="notice error" role="alert">
          <strong>결제 결과 확인이 필요합니다.</strong>
          <p>{error}</p>
        </div>
      )}
    </section>
  );
}
