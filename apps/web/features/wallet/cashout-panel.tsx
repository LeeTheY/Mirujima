"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cashoutErrorCopy, parseCashoutPoints } from "./cashout";

interface WalletBalances { earnedAvailable: number; cashoutReserved: number; cashoutCompleted: number; }
interface CashoutResult { requestId: string; status: "requested" | "completed" | "rejected"; points: number; balances: WalletBalances; }

function balances(value: unknown): WalletBalances | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (![item.earnedAvailable, item.cashoutReserved, item.cashoutCompleted].every((number) => Number.isSafeInteger(number) && (number as number) >= 0)) return null;
  return { earnedAvailable: item.earnedAvailable as number, cashoutReserved: item.cashoutReserved as number, cashoutCompleted: item.cashoutCompleted as number };
}

function result(value: unknown): CashoutResult | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const nextBalances = balances(item.balances);
  if (typeof item.requestId !== "string" || !["requested", "completed", "rejected"].includes(String(item.status)) || !Number.isSafeInteger(item.points) || !nextBalances) return null;
  return { requestId: item.requestId, status: item.status as CashoutResult["status"], points: item.points as number, balances: nextBalances };
}

export function CashoutPanel({ initialBalances }: { initialBalances: WalletBalances }) {
  const [wallet, setWallet] = useState(initialBalances);
  const [amount, setAmount] = useState("");
  const [current, setCurrent] = useState<CashoutResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestKey = useRef(`cashout-request:${crypto.randomUUID()}`);
  const settlementKeys = useRef<Record<string, string>>({});

  const invoke = async (name: string, body: Record<string, unknown>) => {
    const { data, error: functionError } = await createClient().functions.invoke(name, { body });
    if (functionError) {
      const context = await functionError.context?.json?.().catch(() => null) as { error?: string } | null;
      throw new Error(context?.error ?? "cashout_failed");
    }
    const parsed = result(data);
    if (!parsed) throw new Error("cashout_failed");
    return parsed;
  };

  const requestCashout = async () => {
    setBusy(true); setError(null);
    try {
      const points = parseCashoutPoints(amount, wallet.earnedAvailable);
      const response = await invoke("cashout-request", { points, idempotencyKey: requestKey.current });
      setCurrent(response); setWallet(response.balances);
    } catch (cause) { setError(cashoutErrorCopy(cause instanceof Error ? cause.message : "cashout_failed")); }
    finally { setBusy(false); }
  };

  const settle = async (outcome: "completed" | "rejected") => {
    if (!current) return;
    setBusy(true); setError(null);
    try {
      const keyName = `${current.requestId}:${outcome}`;
      settlementKeys.current[keyName] ??= `cashout-${outcome}:${crypto.randomUUID()}`;
      const response = await invoke("cashout-complete-test", {
        requestId: current.requestId, outcome, idempotencyKey: settlementKeys.current[keyName]
      });
      setCurrent(response); setWallet(response.balances);
    } catch (cause) { setError(cashoutErrorCopy(cause instanceof Error ? cause.message : "cashout_failed")); }
    finally { setBusy(false); }
  };

  return <section className="cashout-layout">
    <div className="test-mode-banner"><strong>현금화 샌드박스</strong><span>실제 계좌 입금은 발생하지 않습니다.</span></div>
    <div className="wallet-metrics"><article><span>현금화 가능</span><strong>{wallet.earnedAvailable.toLocaleString()}P</strong></article><article><span>처리 대기</span><strong>{wallet.cashoutReserved.toLocaleString()}P</strong></article><article><span>테스트 완료</span><strong>{wallet.cashoutCompleted.toLocaleString()}P</strong></article></div>
    <div className="card cashout-form"><label><span>신청할 earned 포인트</span><input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="예: 3000" disabled={busy || current?.status === "requested"} /></label><button className="button" type="button" disabled={busy || current?.status === "requested"} onClick={() => void requestCashout()}>테스트 현금화 신청</button></div>
    {current && <div className="card cashout-status"><span className="card-label">현재 요청</span><h2>{current.points.toLocaleString()}P · {current.status === "requested" ? "처리 대기" : current.status === "completed" ? "테스트 완료" : "테스트 실패"}</h2><p>{current.status === "requested" ? "아래 버튼으로 성공 또는 실패 상태를 재현할 수 있습니다." : current.status === "completed" ? "실제 송금 없이 완료 상태만 기록했습니다." : "예약 포인트가 earned 잔액으로 반환되었습니다."}</p>{current.status === "requested" && <div className="row"><button className="button" type="button" disabled={busy} onClick={() => void settle("completed")}>완료 상태 재현</button><button className="button secondary" type="button" disabled={busy} onClick={() => void settle("rejected")}>실패 상태 재현</button></div>}</div>}
    {error && <div className="notice error" role="alert"><strong>현금화 요청을 처리하지 못했습니다.</strong><p>{error}</p></div>}
    <div className="notice"><strong>현금화 가능 범위</strong><p>집중 성공 등 검증된 원장에서 적립된 earned 포인트만 신청할 수 있습니다. 충전·예약 포인트는 사용할 수 없습니다.</p></div>
  </section>;
}
