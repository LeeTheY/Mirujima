"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { guardianSummaryResultSchema, type GuardianSummaryResult } from "@mirujima/contracts";
import { aiCoachingErrorCopy } from "./ai-coaching-ui";
import { requireOnlineAction } from "@/lib/online";

async function safeFunctionCode(error: unknown): Promise<string> {
  if (!error || typeof error !== "object") return "unknown";
  const context = Reflect.get(error, "context");
  if (context && typeof context === "object" && typeof Reflect.get(context, "json") === "function") {
    try {
      const body = await Reflect.apply(Reflect.get(context, "json"), context, []);
      return body && typeof body === "object" && typeof Reflect.get(body, "error") === "string" ? Reflect.get(body, "error") : "unknown";
    } catch { return "unknown"; }
  }
  return "unknown";
}

export function GuardianAiSummary() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GuardianSummaryResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [membershipModalOpen, setMembershipModalOpen] = useState(false);

  useEffect(() => {
    if (!result) return;
    let disposed = false;
    const clear = () => setResult(null);
    const hidden = () => { if (document.hidden) clear(); };
    const verify = async () => {
      try {
        const response = await createClient().rpc("get_guardian_ai_summary_input");
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(response.data)));
        const revision = [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
        if (!disposed && (response.error || revision !== result.consentRevision)) clear();
      } catch { if (!disposed) clear(); }
    };
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", hidden);
    void verify();
    const check = window.setInterval(() => void verify(), 5000);
    const expiry = window.setTimeout(clear, 30_000);
    return () => { disposed = true; window.removeEventListener("blur", clear); document.removeEventListener("visibilitychange", hidden); window.clearInterval(check); window.clearTimeout(expiry); };
  }, [result]);

  async function summarize() {
    setBusy(true); setMessage(null); setResult(null);
    try {
      requireOnlineAction("가족 AI 요약");
      const client = createClient();
      const response = await client.functions.invoke("ai-writing", { body: { action: "guardian-summary" } });
      if (response.error) {
        const code = await safeFunctionCode(response.error);
        if (code === "membership_entitlement_required") {
          setMembershipModalOpen(true); return;
        }
        if (["guardian_consent_changed", "ai_timeout", "authentication_required", "ai_role_required", "ai_entitlement_required"].includes(code)) throw new Error(aiCoachingErrorCopy(code));
        if (code === "guardian_summary_data_required") throw new Error("AI 요약 공유에 동의한 연결 학생이 없습니다.");
        if (code === "rate_limited") throw new Error("AI 요약 요청 한도를 넘었습니다. 1분 뒤 다시 시도해 주세요.");
        if (code === "invalid_ai_result") throw new Error("AI 요약 결과 형식을 확인하지 못했습니다. 이전 결과는 유지됩니다.");
        throw new Error("가족 AI 요약을 만들지 못했습니다.");
      }
      const parsed = guardianSummaryResultSchema.safeParse(response.data);
      if (!parsed.success || !parsed.data.consentRevision) throw new Error("AI 요약 결과 형식을 확인하지 못했습니다. 이전 결과는 유지됩니다.");
      setResult(parsed.data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "가족 AI 요약을 만들지 못했습니다.");
    } finally { setBusy(false); }
  }

  return <>
    <div className="sub-card">
      <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-blue-600" /><strong className="text-sm text-navy">가족 AI 요약</strong></div>
      <p className="text-xs text-muted">학생이 동의한 최근 7일 집계 정보만 사용합니다.</p>
      <button className="button secondary full small mt-2" type="button" disabled={busy} onClick={() => void summarize()}>{busy ? "요약 생성 중…" : "가족 AI 요약 생성"}</button>
      {result ? <div className="notice mt-3"><strong>{result.title}</strong><p className="text-xs">공유 동의 확인 후 생성한 결과입니다. 30초 뒤 또는 화면을 벗어나면 닫힙니다.</p><p>{result.summary}</p><ul>{result.suggestions.map((suggestion)=><li key={suggestion}>{suggestion}</li>)}</ul></div> : null}
      {message ? <p className="text-xs text-red-500 mt-2" role="alert">{message}</p> : null}
    </div>
    {membershipModalOpen ? <div className="modal-overlay payment-modal-overlay" role="presentation" onClick={() => setMembershipModalOpen(false)}><section className="modal-content payment-modal-content" role="dialog" aria-modal="true" aria-label="가족 Premium 안내" onClick={(event)=>event.stopPropagation()}><header className="payment-modal-header"><h1>가족 AI 요약은 Premium 기능입니다</h1><button className="icon-close-button" type="button" aria-label="닫기" onClick={()=>setMembershipModalOpen(false)}><X className="w-4 h-4" /></button></header><div className="payment-modal-body"><div className="notice"><strong>가족 Premium 12,900원/30일</strong><p>학생 2명의 AI 기능과 보호자 가족 요약을 함께 제공합니다.</p></div><Link className="button full" href="/membership/checkout">가족 Premium 결제하기</Link></div></section></div> : null}
  </>;
}
