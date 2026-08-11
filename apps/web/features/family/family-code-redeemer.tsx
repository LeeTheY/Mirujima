"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { familyCodeDigits, familyLinkErrorCopy, initialRedeemerExpanded, safeFunctionErrorCode } from "./family-link";

export function FamilyCodeRedeemer() {
  const router = useRouter();
  const [message, setMessage] = useState("보호자가 발급한 6자리 코드를 5분 안에 입력해 주세요.");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(initialRedeemerExpanded);
  const [code, setCode] = useState("");
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function redeem(formData: FormData) {
    const input = String(formData.get("code") ?? "").trim();
    if (!/^\d{6}$/.test(input)) return setMessage("6자리 숫자 코드를 입력해 주세요.");
    setBusy(true);
    const { data, error } = await createClient().functions.invoke("family-link-redeem", { body: { code: input } });
    setBusy(false);
    if (error) {
      const errorCode = await safeFunctionErrorCode(error);
      setMessage(familyLinkErrorCopy(errorCode));
      if (errorCode.split(":", 1)[0] === "student_membership_conflict") setConflictModalOpen(true);
      return;
    }
    setMessage(data?.status === "active" ? "보호자 계정과 안전하게 연결되었습니다." : "연결 상태를 확인했습니다.");
    router.refresh();
  }

  if (!expanded) return <button className="button secondary full small" type="button" onClick={() => { setExpanded(true); requestAnimationFrame(() => inputRef.current?.focus()); }}><span>보호자 연결 코드 입력하기</span><ChevronDown className="w-4 h-4" /></button>;

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
      <p className="text-xs text-muted">{message}</p>
      <button className="button full small mt-4" type="submit" disabled={busy}>{busy ? "확인 중..." : "보호자 연결하기"}</button>
    </form>{conflictModalOpen ? <div className="modal-overlay payment-modal-overlay" role="presentation" onClick={() => setConflictModalOpen(false)}><section className="modal-content payment-modal-content" role="dialog" aria-modal="true" aria-label="멤버십 충돌 안내" onClick={(event) => event.stopPropagation()}><header className="payment-modal-header"><h1>멤버십을 함께 사용할 수 없습니다</h1><button className="icon-close-button" type="button" onClick={() => setConflictModalOpen(false)} aria-label="닫기">×</button></header><div className="payment-modal-body"><div className="notice error"><strong>학생 Premium 이용 기간을 먼저 확인해 주세요</strong><p>연결하려는 보호자가 가족 Premium을 이용 중입니다. 현재 학생 Premium은 즉시 없애지 않으며, 남은 이용 기간이 끝난 뒤 다시 연결하면 손해 없이 가족 멤버십으로 전환됩니다.</p></div><button className="button full" type="button" onClick={() => setConflictModalOpen(false)}>확인</button></div></section></div> : null}</>
  );
}
