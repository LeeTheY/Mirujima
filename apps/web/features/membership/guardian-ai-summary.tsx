"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface SummaryResult {
  title: string;
  summary: string;
  suggestions: string[];
}

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
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [membershipModalOpen, setMembershipModalOpen] = useState(false);

  async function summarize() {
    setBusy(true); setMessage(null);
    try {
      const client = createClient();
      const aggregate = await client.rpc("get_guardian_ai_summary_input");
      if (aggregate.error) throw new Error("학생의 공유 정보를 불러오지 못했습니다.");
      if (!Array.isArray(aggregate.data) || aggregate.data.length === 0) throw new Error("요약할 연결 학생 정보가 없습니다.");
      const response = await client.functions.invoke("ai-writing", { body: { action: "guardian-summary", students: aggregate.data } });
      if (response.error) {
        if (await safeFunctionCode(response.error) === "membership_entitlement_required") {
          setMembershipModalOpen(true); return;
        }
        throw new Error("가족 AI 요약을 만들지 못했습니다.");
      }
      if (!response.data || typeof response.data !== "object" || !Array.isArray(response.data.suggestions)) throw new Error("가족 AI 요약 결과를 확인하지 못했습니다.");
      setResult(response.data as SummaryResult);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "가족 AI 요약을 만들지 못했습니다.");
    } finally { setBusy(false); }
  }

  return <>
    <div className="sub-card">
      <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-blue-600" /><strong className="text-sm text-navy">가족 AI 요약</strong></div>
      <p className="text-xs text-muted">학생이 동의한 최근 7일 집계 정보만 사용합니다.</p>
      <button className="button secondary full small mt-2" type="button" disabled={busy} onClick={() => void summarize()}>{busy ? "요약 생성 중…" : "가족 AI 요약 생성"}</button>
      {result ? <div className="notice mt-3"><strong>{result.title}</strong><p>{result.summary}</p><ul>{result.suggestions.map((suggestion)=><li key={suggestion}>{suggestion}</li>)}</ul></div> : null}
      {message ? <p className="text-xs text-red-500 mt-2" role="alert">{message}</p> : null}
    </div>
    {membershipModalOpen ? <div className="modal-overlay payment-modal-overlay" role="presentation" onClick={() => setMembershipModalOpen(false)}><section className="modal-content payment-modal-content" role="dialog" aria-modal="true" aria-label="가족 Premium 안내" onClick={(event)=>event.stopPropagation()}><header className="payment-modal-header"><h1>가족 AI 요약은 Premium 기능입니다</h1><button className="icon-close-button" type="button" aria-label="닫기" onClick={()=>setMembershipModalOpen(false)}><X className="w-4 h-4" /></button></header><div className="payment-modal-body"><div className="notice"><strong>가족 Premium 12,900원/30일</strong><p>학생 2명의 AI 기능과 보호자 가족 요약을 함께 제공합니다.</p></div><Link className="button full" href="/membership/checkout">가족 Premium 테스트 결제하기</Link></div></section></div> : null}
  </>;
}
