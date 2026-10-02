"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import {
  studyRecommendationResultSchema,
  weeklyReportResultSchema,
  type StudyRecommendationResult,
  type WeeklyReportResult,
} from "@mirujima/contracts";
import { createClient } from "@/lib/supabase/client";
import { aiCoachingErrorCopy, aiFunctionErrorCode } from "@/features/membership/ai-coaching-ui";
import { requireOnlineAction } from "@/lib/online";

type InsightResult = StudyRecommendationResult | WeeklyReportResult;

export function StudentAiInsights() {
  const [busyAction, setBusyAction] = useState<"study-recommendation" | "weekly-report" | null>(null);
  const [result, setResult] = useState<InsightResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [membershipOpen, setMembershipOpen] = useState(false);

  async function requestInsight(action: "study-recommendation" | "weekly-report") {
    setBusyAction(action);
    setError(null);
    try {
      requireOnlineAction("AI 학습 코칭");
      const response = await createClient().functions.invoke("ai-writing", { body: { action } });
      if (response.error) {
        const code = await aiFunctionErrorCode(response.error);
        if (code === "membership_entitlement_required") {
          setMembershipOpen(true);
          return;
        }
        throw new Error(aiCoachingErrorCopy(code));
      }
      const parsed = action === "study-recommendation"
        ? studyRecommendationResultSchema.safeParse(response.data)
        : weeklyReportResultSchema.safeParse(response.data);
      if (!parsed.success) throw new Error(aiCoachingErrorCopy("invalid_ai_result"));
      setResult(parsed.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : aiCoachingErrorCopy("unknown"));
    } finally {
      setBusyAction(null);
    }
  }

  return <>
    <section className="card chart-card history-chart-card">
      <div className="history-section-heading">
        <div><span className="card-label">PREMIUM AI</span><h2>내 기록 기반 학습 코칭</h2></div>
        <Sparkles className="w-5 h-5 text-blue-600" />
      </div>
      <p className="text-sm text-muted">서버가 최근 7일의 집계와 목표 이름만 사용합니다. 방문 사이트 원본과 검색 내용은 AI에 전달하지 않습니다.</p>
      <div className="flex gap-3 flex-wrap mt-3">
        <button className="button secondary small" type="button" disabled={busyAction !== null} onClick={() => void requestInsight("study-recommendation")}>
          {busyAction === "study-recommendation" ? "추천 생성 중…" : "학습 순서 추천"}
        </button>
        <button className="button secondary small" type="button" disabled={busyAction !== null} onClick={() => void requestInsight("weekly-report")}>
          {busyAction === "weekly-report" ? "리포트 생성 중…" : "주간 AI 리포트"}
        </button>
      </div>
      {result?.task === "study-recommendation" ? <div className="notice mt-4" role="status">
        <strong>{result.title}</strong><p>{result.summary}</p>
        <ol>{result.recommendedOrder.map((item) => <li key={`${item.subject}-${item.focusMinutes}`}><b>{item.subject} · {item.focusMinutes}분</b> — {item.reason}</li>)}</ol>
        <p>{result.nextAction}</p><small>제안은 자동으로 계획에 저장되지 않습니다. 집중 탭에서 확인 후 직접 작성해 주세요.</small>
      </div> : null}
      {result?.task === "weekly-report" ? <div className="notice mt-4" role="status">
        <strong>{result.title}</strong><p>{result.achievementSummary}</p>
        <b>잘한 점</b><ul>{result.wins.map((item) => <li key={item}>{item}</li>)}</ul>
        <b>보완할 점</b><ul>{result.improvements.map((item) => <li key={item}>{item}</li>)}</ul>
        <b>다음 주 제안</b><ul>{result.nextWeekPlan.map((item) => <li key={item}>{item}</li>)}</ul>
      </div> : null}
      {error ? <div className="notice error mt-4" role="alert"><strong>AI 코칭을 표시하지 못했습니다.</strong><p>{error}</p></div> : null}
    </section>

    {membershipOpen ? <div className="modal-overlay payment-modal-overlay" role="presentation" onClick={() => setMembershipOpen(false)}>
      <section className="modal-content payment-modal-content premium-info-modal" role="dialog" aria-modal="true" aria-label="학생 Premium 안내" onClick={(event) => event.stopPropagation()}>
        <header className="payment-modal-header"><h1>기록 기반 AI 코칭은 Premium 기능입니다</h1><button className="icon-close-button" type="button" aria-label="닫기" onClick={() => setMembershipOpen(false)}><X className="w-4 h-4" /></button></header>
        <div className="payment-modal-body"><div className="notice"><strong>학생 Premium 9,900원/30일</strong><p>학습 순서 추천, 주간 리포트와 집중 계획 첨삭을 제공합니다.</p></div><Link className="button full" href="/membership/checkout">학생 Premium 결제하기</Link></div>
      </section>
    </div> : null}
  </>;
}
