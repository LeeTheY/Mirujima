"use client";

import { useEffect, useState } from "react";
import { Clock, KeyRound, RefreshCw, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { familyLinkErrorCopy, safeFunctionErrorCode } from "./family-link";

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

export function FamilyCodeIssuer() {
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
    if (error) return setMessage(familyLinkErrorCopy(await safeFunctionErrorCode(error)));
    setCode(readString(data, "code"));
    setExpiresAt(readString(data, "expiresAt") ?? readString(data, "codeExpiresAt"));
    setNow(Date.now());
    setMessage("학생에게 이 코드만 전달하세요. 재발급하면 이전 코드는 즉시 무효화됩니다.");
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

  return <div className="code-card"><div className="flex items-center justify-between mb-2"><span className="card-label">학생 연결 코드</span><KeyRound className="w-4 h-4 text-blue-600" /></div>{code ? <><div className="issued-code" aria-label={`연결 코드 ${code}`}>{code.split("").map((digit,index)=><span key={`${digit}-${index}`}>{digit}</span>)}</div><strong className="countdown flex items-center gap-1.5"><Clock className="w-4 h-4" /><span>남은 시간 {countdown(expiresAt,now)}</span></strong><p className="mt-2 text-xs text-muted">{message}</p><div className="inline-actions mt-4 flex items-center gap-3"><button className="button secondary small" type="button" onClick={issue} disabled={busy}><RefreshCw className="w-3.5 h-3.5" /> 코드 재발급</button><button className="text-button danger text-xs font-bold" type="button" onClick={cancel} disabled={busy}><XCircle className="w-3.5 h-3.5" /> 발급 취소</button></div></> : <><h2>새 코드를 발급하세요</h2><p>{message}</p><button className="button full mt-3" type="button" onClick={issue} disabled={busy}>{busy ? "발급 중..." : "연결 코드 발급"}</button></>}</div>;
}
