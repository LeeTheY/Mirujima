"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, RefreshCw } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { familyLinkErrorCopy } from "./family-link";
import { cancelFamilyCode, estimatedFamilyServerTime, FamilyCodeError, familyCountdownLabel, familyCountdownSeconds, issueFamilyCode } from "./family-code-data";
import { Dialog } from "@/components/dialog";
import { requireOnlineAction } from "@/lib/online";

export function FamilyCodeIssuer({ activeStudentCount = 0 }: { activeStudentCount?: number }) {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [message, setMessage] = useState(activeStudentCount >= 5 ? "학생은 최대 5명까지 연결할 수 있습니다." : "코드는 정확히 5분 동안 한 번만 사용할 수 있습니다.");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const serverClock = useRef({serverAtMs: 0, observedAtMs: 0});
  const [seatModalOpen, setSeatModalOpen] = useState(false);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setNow(estimatedFamilyServerTime(serverClock.current.serverAtMs, serverClock.current.observedAtMs, performance.now()));
    const timer = window.setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, [expiresAt]);

  async function issue() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    // A lost reissue response may already have revoked this code on the server.
    setCode(null); setExpiresAt(null);
    try {
      requireOnlineAction("가족 연결 코드 발급");
      const result = await issueFamilyCode(createClient());
      const serverAtMs = result.serverNow ? Date.parse(result.serverNow) : Date.now();
      serverClock.current = {serverAtMs, observedAtMs: performance.now()};
      setCode(result.code); setExpiresAt(result.expiresAt); setNow(serverAtMs);
      setMessage("학생에게 이 코드만 전달하세요. 재발급하면 이전 코드는 즉시 무효화됩니다.");
    } catch (cause) {
      const code = cause instanceof FamilyCodeError ? cause.code : "function_fetch_failed";
      setMessage(familyLinkErrorCopy(code));
      if (code.split(":", 1)[0] === "family_seat_required") setSeatModalOpen(true);
    } finally { inFlight.current = false; setBusy(false); }
  }

  async function cancel() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      requireOnlineAction("가족 연결 코드 취소");
      await cancelFamilyCode(createClient());
      setCode(null); setExpiresAt(null); setMessage("발급한 연결 코드를 취소했습니다.");
    } catch (cause) {
      setCode(null); setExpiresAt(null);
      setMessage(cause instanceof FamilyCodeError ? cause.message : familyLinkErrorCopy("function_fetch_failed"));
    } finally { inFlight.current = false; setBusy(false); }
  }
  const remaining = familyCountdownSeconds(expiresAt, now);
  const expired = Boolean(code) && remaining === 0;

  return <>
    <div className="code-card">
      <div className="flex items-center justify-between mb-2"><span className="card-label">학생 연결 코드</span><KeyRound className="w-4 h-4 text-blue-600" /></div>
      {code ? <>
        {!expired && <div className="issued-code" aria-label={`연결 코드 ${code}`}>{code.split("").map((digit,index)=><span key={`${digit}-${index}`}>{digit}</span>)}</div>}
        <strong className="countdown">남은 시간 {familyCountdownLabel(remaining)}</strong>
        <p className="mt-2 text-xs text-muted" role="status">{expired ? "연결 코드가 만료되었습니다. 새 코드를 발급해 주세요." : message}</p>
        <div className="family-code-actions">
          <button className="button secondary small" type="button" onClick={issue} disabled={busy || activeStudentCount >= 5}><RefreshCw className="w-3.5 h-3.5" /> 코드 재발급</button>
          <button className="button family-code-cancel small" type="button" onClick={cancel} disabled={busy}>발급 취소</button>
        </div>
      </> : <>
        <h2 className="text-lg font-bold mb-1 mt-1">새 코드를 발급하세요</h2>
        <p className="text-xs text-muted mb-0" role="status">{message}</p>
        <button className="button full small mt-2" type="button" onClick={issue} disabled={busy || activeStudentCount >= 5}>{busy ? "발급 중..." : activeStudentCount >= 5 ? "최대 5명 연결 완료" : "연결 코드 발급"}</button>
      </>}
    </div>
    {seatModalOpen ? (
      <Dialog title="추가 학생 좌석이 필요합니다" onClose={() => setSeatModalOpen(false)}>
        <div className="notice"><strong>기본 2명 포함 · 최대 5명</strong><p>세 번째 학생부터 1명당 3,900원/30일이며, 현재 가족 멤버십의 남은 기간만큼 일할 계산됩니다.</p></div>
        <Link className="button full" href="/membership/checkout?orderKind=family_seat">추가 좌석 결제하기</Link>
      </Dialog>
    ) : null}
  </>;
}
