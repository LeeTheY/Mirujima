"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { familyCodeDigits, familyLinkErrorCopy, initialRedeemerExpanded, safeFunctionErrorCode } from "./family-link";

export function FamilyCodeRedeemer() {
  const [message, setMessage] = useState("보호자가 발급한 6자리 코드를 5분 안에 입력해 주세요.");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(initialRedeemerExpanded);
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function redeem(formData: FormData) {
    const input = String(formData.get("code") ?? "").trim();
    if (!/^\d{6}$/.test(input)) return setMessage("6자리 숫자 코드를 입력해 주세요.");
    setBusy(true);
    const { data, error } = await createClient().functions.invoke("family-link-redeem", { body: { code: input } });
    setBusy(false);
    if (error) return setMessage(familyLinkErrorCopy(await safeFunctionErrorCode(error)));
    setMessage(data?.status === "active" ? "보호자 계정과 안전하게 연결되었습니다." : "연결 상태를 확인했습니다.");
  }

  if (!expanded) return <button className="button secondary full small" type="button" onClick={() => { setExpanded(true); requestAnimationFrame(() => inputRef.current?.focus()); }}><span>보호자 연결 코드 입력하기</span><ChevronDown className="w-4 h-4" /></button>;

  return (
    <form className="code-card" action={redeem}>
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
      <button className="button full mt-4" type="submit" disabled={busy}>{busy ? "확인 중..." : "보호자 연결하기"}</button>
    </form>
  );
}
