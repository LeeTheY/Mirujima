"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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

export function FamilyLinkPanel() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [message, setMessage] = useState("코드는 정확히 5분 동안 한 번만 사용할 수 있습니다.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  async function issue() {
    setBusy(true);
    const { data, error } = await createClient().functions.invoke("family-link-issue", { body: { action: "issue" } });
    setBusy(false);
    if (error) return setMessage("연결 코드를 발급하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    setCode(readString(data, "code"));
    setExpiresAt(readString(data, "expiresAt") ?? readString(data, "codeExpiresAt"));
    setNow(Date.now());
    setMessage("상대방에게 이 코드만 전달하세요. 재발급하면 이전 코드는 즉시 무효화됩니다.");
  }

  async function cancel() {
    setBusy(true);
    const { error } = await createClient().functions.invoke("family-link-issue", { body: { action: "cancel" } });
    setBusy(false);
    if (error) return setMessage("코드를 취소하지 못했습니다. 다시 시도해 주세요.");
    setCode(null);
    setExpiresAt(null);
    setMessage("발급한 연결 코드를 취소했습니다.");
  }

  async function redeem(formData: FormData) {
    const input = String(formData.get("code") ?? "").trim();
    if (!/^\d{6}$/.test(input)) return setMessage("6자리 숫자 코드를 입력해 주세요.");
    setBusy(true);
    const { data, error } = await createClient().functions.invoke("family-link-redeem", { body: { code: input } });
    setBusy(false);
    if (error) return setMessage("코드를 확인하지 못했습니다. 만료 여부와 남은 입력 횟수를 확인해 주세요.");
    setMessage(readString(data, "status") === "active" ? "학생 계정과 안전하게 연결되었습니다." : "연결 상태를 확인했습니다.");
  }

  return <section className="link-layout"><article className="card code-card"><span className="card-label">내 연결 코드</span>{code ? <><div className="issued-code" aria-label={`연결 코드 ${code}`}>{code.split("").map((digit, index) => <span key={`${digit}-${index}`}>{digit}</span>)}</div><strong className="countdown">남은 시간 {countdown(expiresAt, now)}</strong><p>{message}</p><div className="inline-actions"><button className="button secondary" type="button" onClick={issue} disabled={busy}>코드 재발급</button><button className="text-button danger" type="button" onClick={cancel} disabled={busy}>발급 취소</button></div></> : <><h2>새 코드를 발급하세요.</h2><p>{message}</p><button className="button full" type="button" onClick={issue} disabled={busy}>{busy ? "발급 중" : "연결 코드 발급"}</button></>}</article><form className="card code-card" action={redeem}><span className="card-label">받은 코드 입력</span><label className="sr-only" htmlFor="family-code">연결 코드</label><input id="family-code" name="code" className="code-input" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="000000" autoComplete="one-time-code" /><p>입력 실패 5회 후에는 잠시 새 코드를 입력할 수 없습니다.</p><button className="button full" type="submit" disabled={busy}>계정 연결하기</button></form></section>;
}
