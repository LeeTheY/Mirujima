"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cashoutErrorCopy, cashoutFullAmount, parseCashoutPoints } from "./cashout";
import { Wallet, ChevronRight, CheckCircle2, Clock, ShieldCheck, AlertCircle } from "lucide-react";

interface WalletBalances {
  earnedAvailable: number;
  cashoutReserved: number;
  cashoutCompleted: number;
}

interface CashoutResult {
  requestId: string;
  status: "requested" | "completed" | "rejected";
  points: number;
  balances: WalletBalances;
}

function balances(value: unknown): WalletBalances | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    ![item.earnedAvailable, item.cashoutReserved, item.cashoutCompleted].every(
      (number) => Number.isSafeInteger(number) && (number as number) >= 0
    )
  )
    return null;
  return {
    earnedAvailable: item.earnedAvailable as number,
    cashoutReserved: item.cashoutReserved as number,
    cashoutCompleted: item.cashoutCompleted as number,
  };
}

function result(value: unknown): CashoutResult | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const nextBalances = balances(item.balances);
  if (
    typeof item.requestId !== "string" ||
    !["requested", "completed", "rejected"].includes(String(item.status)) ||
    !Number.isSafeInteger(item.points) ||
    !nextBalances
  )
    return null;
  return {
    requestId: item.requestId,
    status: item.status as CashoutResult["status"],
    points: item.points as number,
    balances: nextBalances,
  };
}

export function CashoutPanel({ initialBalances }: { initialBalances: WalletBalances }) {
  const [wallet, setWallet] = useState(initialBalances);
  const [amount, setAmount] = useState("");
  const [current, setCurrent] = useState<CashoutResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestKey = useRef(`cashout-request:${crypto.randomUUID()}`);
  const amountInput = useRef<HTMLInputElement>(null);

  const invoke = async (name: string, body: Record<string, unknown>) => {
    const { data, error: functionError } = await createClient().functions.invoke(name, { body });
    if (functionError) {
      const context = (await functionError.context?.json?.().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(context?.error ?? "cashout_failed");
    }
    const parsed = result(data);
    if (!parsed) throw new Error("cashout_failed");
    return parsed;
  };

  const requestCashout = async () => {
    setBusy(true);
    setError(null);
    try {
      const points = parseCashoutPoints(amount, wallet.earnedAvailable);
      const response = await invoke("cashout-request", {
        points,
        idempotencyKey: requestKey.current,
      });
      setCurrent(response);
      setWallet(response.balances);
      setAmount("");
      requestKey.current = `cashout-request:${crypto.randomUUID()}`;
    } catch (cause) {
      setError(cashoutErrorCopy(cause instanceof Error ? cause.message : "cashout_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cashout-layout space-y-6">
      <div className="test-mode-banner">
        <strong>Toss Payments 테스트 현금화</strong>
        <span>실제 계좌 송금 없음 · DB 원장 반영</span>
      </div>
      {/* 3 Metric Summary Cards */}
      <div className="wallet-metrics grid grid-cols-3 gap-6">
        <article className="card challenge-card">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="card-label">환급 가능 포인트</span>
              <Wallet className="w-4 h-4 text-blue-600" />
            </div>
            <strong className="text-3xl font-extrabold text-blue-600 block mt-2">
              {wallet.earnedAvailable.toLocaleString()} P
            </strong>
          </div>
          <span className="text-xs text-blue-600 font-bold block mt-3">신청 즉시 환급 처리 가능</span>
        </article>

        <article className="card">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="card-label">처리 대기 포인트</span>
              <Clock className="w-4 h-4 text-muted" />
            </div>
            <strong className="text-3xl font-extrabold text-navy block mt-2">
              {wallet.cashoutReserved.toLocaleString()} P
            </strong>
          </div>
          <span className="text-xs text-muted block mt-3">원장 심사 승인 대기 중</span>
        </article>

        <article className="card">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="card-label">누적 환급 완료</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <strong className="text-3xl font-extrabold text-emerald-600 block mt-2">
              {wallet.cashoutCompleted.toLocaleString()} P
            </strong>
          </div>
          <span className="text-xs text-emerald-600 font-bold block mt-3">성공적으로 환급된 자산</span>
        </article>
      </div>

      {/* Cashout Request Form */}
      <div className="card cashout-form p-8">
        <div className="border-b border-gray-100 pb-4 mb-6">
          <span className="card-label">포인트 환급 신청</span>
          <h2 className="m-0 text-xl font-extrabold text-navy">환급받으실 포인트를 입력해 주세요</h2>
          <p className="m-0 text-xs text-muted mt-1">
            테스트 모드에서는 실제 계좌 송금 없이 원장 상태만 재현합니다.
          </p>
        </div>

        <div className="flex gap-2 mb-4" aria-label="환급 금액 선택 방식">
          <button
            className="button secondary small"
            type="button"
            disabled={busy || current?.status === "requested"}
            onClick={() => {
              setAmount("");
              requestAnimationFrame(() => amountInput.current?.focus());
            }}
          >
            직접 입력
          </button>
          <button
            className="button secondary small"
            type="button"
            disabled={busy || current?.status === "requested" || wallet.earnedAvailable === 0}
            onClick={() => setAmount(cashoutFullAmount(wallet.earnedAvailable))}
          >
            전액 선택
          </button>
        </div>

        <div className="cashout-request-row">
          <div className="cashout-input-column">
            <label className="text-xs text-navy font-bold block mb-2">신청 포인트</label>
            <input
              ref={amountInput}
              className="cashout-amount-input w-full text-base font-bold"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="환급할 포인트 수량 입력 (예: 3000)"
              disabled={busy || current?.status === "requested"}
            />
          </div>
          <button
            className="button cashout-submit-button shrink-0"
            type="button"
            disabled={busy || current?.status === "requested" || wallet.earnedAvailable === 0}
            onClick={() => void requestCashout()}
          >
            <span>환급 신청하기</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active Cashout Status Card */}
      {current && (
        <div className="card cashout-status p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="card-label">신청 상태</span>
            <span className="badge-pill active">
              {current.status === "requested"
                ? "처리 대기"
                : current.status === "completed"
                ? "정산 완료"
                : "신청 반려"}
            </span>
          </div>

          <h2 className="mt-1 mb-2 text-xl font-extrabold text-navy">
            {current.points.toLocaleString()} P 환급 요청
          </h2>
          <p className="text-sm text-muted mb-4">
            {current.status === "requested"
              ? "원장 확인 및 출금 승인을 대기 중입니다."
              : current.status === "completed"
              ? "포인트 환급 처리가 성공적으로 완료되었습니다."
              : "예약 포인트가 사용 가능 잔액으로 반환되었습니다."}
          </p>

        </div>
      )}

      {error && (
        <div className="notice error" role="alert">
          <strong className="flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" /> 환급 요청을 처리하지 못했습니다.
          </strong>
          <p>{error}</p>
        </div>
      )}

      {/* Security & Rule Notice */}
      <div className="notice flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <strong>환급 가능 자산 기준 안내</strong>
          <p className="mt-0.5">
            집중 챌린지 성공 등 검증된 원장에서 적립된 포인트만 신청할 수 있습니다. 결제 충전 및 예약
            포인트는 현금 환급 대상이 아닙니다.
          </p>
        </div>
      </div>
    </section>
  );
}
