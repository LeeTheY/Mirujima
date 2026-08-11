"use client";

import { useEffect, useState } from "react";
import { KeyRound, RefreshCw } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { familyLinkErrorCopy, safeFunctionErrorCode, shouldRetryFamilyLinkRequest } from "./family-link";

function readString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const result = Reflect.get(value, key);
  return typeof result === "string" ? result : null;
}

function countdown(expiresAt: string | null, now: number): string {
  if (!expiresAt) return "05:00";
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function FamilyCodeIssuer({ activeStudentCount = 0 }: { activeStudentCount?: number }) {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [message, setMessage] = useState(activeStudentCount >= 5 ? "학생은 최대 5명까지 연결할 수 있습니다." : "코드는 정확히 5분 동안 한 번만 사용할 수 있습니다.");
  const [busy, setBusy] = useState(false);
  const [seatModalOpen, setSeatModalOpen] = useState(false);

  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  async function issue() {
    setBusy(true);
    try {
      const client = createClient();
      let result = await client.functions.invoke("family-link-issue", { body: { action: "issue" } });
      let errorCode = result.error ? await safeFunctionErrorCode(result.error) : null;

      if (result.error && errorCode && shouldRetryFamilyLinkRequest(errorCode)) {
        result = await client.functions.invoke("family-link-issue", { body: { action: "issue" } });
        errorCode = result.error ? await safeFunctionErrorCode(result.error) : null;
      }

      if (result.error) {
        setMessage(familyLinkErrorCopy(errorCode ?? "unknown"));
        if (errorCode?.split(":", 1)[0] === "family_seat_required") setSeatModalOpen(true);
        return;
      }
      setCode(readString(result.data, "code"));
      setExpiresAt(readString(result.data, "expiresAt") ?? readString(result.data, "codeExpiresAt"));
      setNow(Date.now());
      setMessage("학생에게 이 코드만 전달하세요. 재발급하면 이전 코드는 즉시 무효화됩니다.");
    } catch {
      setMessage(familyLinkErrorCopy("function_fetch_failed"));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    const { error } = await createClient().functions.invoke("family-link-issue", { body: { action: "cancel" } });
    setBusy(false);
    if (error) return setMessage(familyLinkErrorCopy(await safeFunctionErrorCode(error)));
    setCode(null);
    setExpiresAt(null);
    setMessage("발급한 연결 코드를 취소했습니다.");
  }

  return <>
    <div className="code-card">
      <div className="flex items-center justify-between mb-2"><span className="card-label">학생 연결 코드</span><KeyRound className="w-4 h-4 text-blue-600" /></div>
      {code ? <>
        <div className="issued-code" aria-label={`연결 코드 ${code}`}>{code.split("").map((digit,index)=><span key={`${digit}-${index}`}>{digit}</span>)}</div>
        <strong className="countdown">남은 시간 {countdown(expiresAt,now)}</strong>
        <p className="mt-2 text-xs text-muted">{message}</p>
        <div className="family-code-actions">
          <button className="button secondary small" type="button" onClick={issue} disabled={busy || activeStudentCount >= 5}><RefreshCw className="w-3.5 h-3.5" /> 코드 재발급</button>
          <button className="button family-code-cancel small" type="button" onClick={cancel} disabled={busy}>발급 취소</button>
        </div>
      </> : <>
        <h2 className="text-lg font-bold mb-1 mt-1">새 코드를 발급하세요</h2>
        <p className="text-xs text-muted mb-0">{message}</p>
        <button className="button full small mt-2" type="button" onClick={issue} disabled={busy || activeStudentCount >= 5}>{busy ? "발급 중..." : activeStudentCount >= 5 ? "최대 5명 연결 완료" : "연결 코드 발급"}</button>
      </>}
    </div>
    {seatModalOpen ? (
      <div className="modal-overlay payment-modal-overlay" role="presentation" onClick={() => setSeatModalOpen(false)}>
        <section className="modal-content payment-modal-content" role="dialog" aria-modal="true" aria-label="추가 학생 좌석 안내" onClick={(event) => event.stopPropagation()}>
          <header className="payment-modal-header"><h1>추가 학생 좌석이 필요합니다</h1><button className="icon-close-button" type="button" onClick={() => setSeatModalOpen(false)} aria-label="닫기">×</button></header>
          <div className="payment-modal-body">
            <div className="notice"><strong>기본 2명 포함 · 최대 5명</strong><p>세 번째 학생부터 1명당 3,900원/30일이며, 현재 가족 멤버십의 남은 기간만큼 일할 계산됩니다.</p></div>
            <Link className="button full" href="/membership/checkout?orderKind=family_seat">추가 좌석 테스트 결제하기</Link>
          </div>
        </section>
      </div>
    ) : null}
  </>;
}
