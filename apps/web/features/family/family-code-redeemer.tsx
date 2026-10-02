"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { familyCodeDigits, familyLinkErrorCopy, initialRedeemerExpanded } from "./family-link";
import { requireOnlineAction } from "@/lib/online";

import { estimatedFamilyServerTime, FamilyCodeError, familyCountdownLabel, familyCountdownSeconds, redeemFamilyCode } from "./family-code-data";
import { Dialog } from "@/components/dialog";

export function FamilyCodeRedeemer() {
  const router = useRouter();
  const [message, setMessage] = useState("보호자가 발급한 6자리 코드를 5분 안에 입력해 주세요.");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(initialRedeemerExpanded);
  const [code, setCode] = useState("");
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const inFlight = useRef(false);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const serverClock = useRef({serverAtMs: 0, observedAtMs: 0});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!lockedUntil) return;
    const tick = () => setNow(estimatedFamilyServerTime(serverClock.current.serverAtMs, serverClock.current.observedAtMs, performance.now()));
    const timer = window.setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, [lockedUntil]);
  const lockSeconds = familyCountdownSeconds(lockedUntil, now);

  async function redeem(formData: FormData) {
    if (inFlight.current || lockSeconds > 0) return;
    const input = String(formData.get("code") ?? "").trim();
    if (!/^\d{6}$/.test(input)) return setMessage("6자리 숫자 코드를 입력해 주세요.");
    inFlight.current = true; setBusy(true); setLockedUntil(null);
    try {
      requireOnlineAction("가족 연결");
      const client = createClient();
      const {data, error} = await client.auth.getUser();
      if (error || !data.user) throw new FamilyCodeError("authentication_required");
      await redeemFamilyCode(input, data.user.id, client);
      setCode(""); setMessage("보호자 계정과 안전하게 연결되었습니다.");
      router.refresh();
    } catch (cause) {
      const errorCode = cause instanceof FamilyCodeError ? cause.code : "function_fetch_failed";
      let copy = familyLinkErrorCopy(errorCode);
      if (cause instanceof FamilyCodeError) {
        const details = cause.details;
        if (details?.error === "redeem_locked" && details.lockedUntil) {
          const serverAtMs = details.serverNow ? Date.parse(details.serverNow) : Date.now();
          serverClock.current = {serverAtMs, observedAtMs: performance.now()};
          setLockedUntil(details.lockedUntil); setNow(serverAtMs);
        } else if (details?.attemptsRemaining !== undefined) {
          copy += ` 남은 입력 횟수는 ${details.attemptsRemaining}회입니다.`;
        }
      }
      setMessage(copy);
      if (errorCode.split(":", 1)[0] === "student_membership_conflict") setConflictModalOpen(true);
    } finally { inFlight.current = false; setBusy(false); }
  }

  if (!expanded) return <button className="button secondary small" type="button" onClick={() => { setExpanded(true); requestAnimationFrame(() => inputRef.current?.focus()); }}><span>보호자 연결 코드 입력하기</span><ChevronDown className="w-4 h-4" /></button>;

  return (
    <><form className="code-card" action={redeem}>
      <div className="flex items-center justify-between mb-2">
        <span className="card-label">보호자 연결 코드 입력</span>
        <button type="button" className="text-button text-xs" onClick={() => setExpanded(false)}>닫기</button>
      </div>
      <label className="sr-only" htmlFor="family-code">연결 코드</label>
      <div className="family-code-input-shell" onClick={() => inputRef.current?.focus()}>
        <input
          ref={inputRef}
          id="family-code"
          name="code"
          className="family-code-native-input"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          disabled={busy || lockSeconds > 0}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          autoComplete="one-time-code"
        />
        <div className="family-code-digits" aria-hidden="true">
          {familyCodeDigits(code).map((digit, index) => (
            <span className={index < code.length ? "filled" : ""} key={index}>{digit}</span>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted" role="status">{lockSeconds > 0 ? `입력 횟수를 초과했습니다. ${familyCountdownLabel(lockSeconds)} 뒤 다시 입력할 수 있습니다.` : lockedUntil ? "입력 잠금 시간이 지났습니다. 새 연결 코드로 다시 시도해 주세요." : message}</p>
      <button className="button small mt-4" type="submit" disabled={busy || lockSeconds > 0}>{busy ? "확인 중..." : "보호자 연결하기"}</button>
    </form>{conflictModalOpen ? <Dialog title="멤버십을 함께 사용할 수 없습니다" onClose={() => setConflictModalOpen(false)}>
      <div className="notice error"><strong>학생 Premium 이용 기간을 먼저 확인해 주세요</strong><p>연결하려는 보호자가 가족 Premium을 이용 중입니다. 현재 학생 Premium은 즉시 없애지 않으며, 남은 이용 기간이 끝난 뒤 다시 연결하면 가족 멤버십으로 전환됩니다.</p></div>
      <button className="button" type="button" onClick={() => setConflictModalOpen(false)}>확인</button>
    </Dialog> : null}</>
  );
}
