"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { HelpCircle, Calendar, Flame, X, BarChart3 } from "lucide-react";

export default function HistoryPage() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  return (
    <DashboardShell role="student" activeHref="/history">
      <div className="page-heading flex items-end justify-between gap-4 mb-6">
        <div>
          <p className="eyebrow">학습 분석 및 기록 리포트</p>
          <h1>집중 기록 및 리포트</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="button secondary small"
            type="button"
            onClick={() => setIsGuideOpen(true)}
          >
            <HelpCircle className="w-4 h-4" />
            <span>기록 사용법 가이드</span>
          </button>

          <div className="segmented static">
            <span
              className={period === "daily" ? "selected" : ""}
              onClick={() => setPeriod("daily")}
            >
              일별
            </span>
            <span
              className={period === "weekly" ? "selected" : ""}
              onClick={() => setPeriod("weekly")}
            >
              주별
            </span>
            <span
              className={period === "monthly" ? "selected" : ""}
              onClick={() => setPeriod("monthly")}
            >
              월별
            </span>
          </div>
        </div>
      </div>

      <section className="metric-grid">
        <article className="card metric">
          <div>
            <span className="card-label">계획 달성률</span>
            <strong>0%</strong>
          </div>
          <p className="text-xs text-emerald-600 font-bold m-0 mt-2">완료 0개 / 총 0개</p>
        </article>

        <article className="card metric">
          <div>
            <span className="card-label">총 집중 시간</span>
            <strong>0분</strong>
          </div>
          <p className="text-xs text-blue-600 font-bold m-0 mt-2">약 0시간</p>
        </article>

        <article className="card metric">
          <div>
            <span className="card-label">완료 세션</span>
            <strong>0개</strong>
          </div>
          <p className="text-xs text-muted font-semibold m-0 mt-2">성공 달성 챌린지</p>
        </article>

        <article className="card metric">
          <div>
            <span className="card-label">연속 집중</span>
            <strong>0일</strong>
          </div>
          <p className="text-xs text-muted font-semibold m-0 mt-2">최대 연속 달성</p>
        </article>
      </section>

      <section className="card chart-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="card-label">목표 실행 및 결과 표</span>
            <h2>집중 성과 상세 기록</h2>
          </div>
          <BarChart3 className="w-5 h-5 text-muted" />
        </div>

        <div className="chart-placeholder">
          <p className="m-0 text-muted font-medium">이 기간에 등록된 목표가 없습니다.</p>
        </div>
      </section>

      {/* Guide Modal */}
      {isGuideOpen && (
        <div className="modal-overlay" onClick={() => setIsGuideOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-xl font-extrabold text-navy m-0">기록 및 리포트 사용법</h2>
              <button
                className="icon-close-button"
                onClick={() => setIsGuideOpen(false)}
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <div className="flex gap-3">
                <Calendar className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-navy font-bold">1. 기간별 집중 추이 확인</strong>
                  <p className="m-0 text-xs text-gray-500">
                    일별, 주별, 월별 탭을 전환하여 누적 집중 시간과 달성률을 비교할 수 있습니다.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Flame className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-navy font-bold">2. 연속 집중 스트릭</strong>
                  <p className="m-0 text-xs text-gray-500">
                    매일 집중 세션을 완료하면 스트릭이 이어집니다.
                  </p>
                </div>
              </div>
            </div>
            <div className="pt-2">
              <button
                className="button full"
                type="button"
                onClick={() => setIsGuideOpen(false)}
              >
                확인했습니다
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
