"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CanonicalFocusSession, FocusPlan } from "@mirujima/contracts";
import { createClient } from "@/lib/supabase/client";
import { completionPercentForGoals, parseFocusDraft, parseFocusGoals } from "./focus-form";
import { chromeExternalSender, pingExtension, requestFocusSync, requiresExtension } from "@/features/extension/bridge";
import { Plus, Trash2, ArrowUp, ArrowDown, Sparkles, Shield, Flame, CheckCircle2, HelpCircle, X } from "lucide-react";

interface GoalItem {
  id: string;
  name: string;
  detail: string;
  minutes: number | "";
  priority: "low" | "medium" | "high";
}

interface FocusSettlementResult {
  completionPercent: number;
  earnedPoints: number;
  returnedPoints: number;
  completedGoalIds: string[];
  completedGoalCount: number;
  totalGoalCount: number;
}

interface ActiveFocusSession extends CanonicalFocusSession {
  selfDepositPoints?: number;
  result?: FocusSettlementResult | null;
}

interface FocusCoachResult {
  summary: string;
  recommendedTitle: string;
  recommendedFocusMinutes: number;
  recommendedBreakMinutes: number;
  steps: string[];
  reason: string;
}

interface RealismEvaluation {
  score: number;
  label: string;
  message: string;
  statusClass: "idle" | "good" | "warning";
}

function truncateText(str: string, maxLength = 10): string {
  if (!str) return "";
  const trimmed = str.trim();
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength)}...` : trimmed;
}

function evaluateRealism(
  title: string,
  targetFocusMinutes: number | "",
  goals: GoalItem[]
): RealismEvaluation {
  const targetMins = Number(targetFocusMinutes) || 0;
  const totalGoalMins = goals.reduce((sum, g) => sum + (Number(g.minutes) || 0), 0);
  const namedGoals = goals.filter((g) => g.name.trim().length > 0);

  if (targetMins === 0 || (namedGoals.length === 0 && !title.trim())) {
    return {
      score: 15,
      label: "현실성 검사: 입력 대기 중",
      message: "계획명과 목표 시간을 입력하면 현실성이 실시간으로 분석됩니다.",
      statusClass: "idle",
    };
  }

  if (totalGoalMins > targetMins) {
    const overflow = totalGoalMins - targetMins;
    return {
      score: 45,
      label: `현실성 주의 (${overflow}분 초과)`,
      message: `목표 합계(${totalGoalMins}분)가 설정한 집중 시간(${targetMins}분)보다 큽니다. 세부 시간을 조절해 보세요.`,
      statusClass: "warning",
    };
  }

  if (totalGoalMins > 0 && totalGoalMins <= targetMins) {
    const ratio = Math.round((totalGoalMins / targetMins) * 100);
    return {
      score: Math.min(100, 70 + Math.round(ratio * 0.3)),
      label: `현실성 우수 (목표 ${ratio}% 배분)`,
      message: `총 세부 목표(${totalGoalMins}분)가 설정 시간(${targetMins}분)에 적절하게 배치되었습니다.`,
      statusClass: "good",
    };
  }

  return {
    score: 85,
    label: "현실성 양호",
    message: `오늘 ${targetMins}분의 집중 계획이 설정되었습니다. 세부 목표를 완성하여 집중을 시작해 보세요.`,
    statusClass: "good",
  };
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const BLOCKLIST_PRESETS = [
  { label: "유튜브", domain: "youtube.com" },
  { label: "인스타그램", domain: "instagram.com" },
  { label: "넷플릭스", domain: "netflix.com" },
  { label: "네이버 웹툰", domain: "toon.naver.com" },
  { label: "치지직", domain: "chzzk.naver.com" },
  { label: "틱톡", domain: "tiktok.com" },
];

const ALLOWLIST_PRESETS = [
  { label: "노션", domain: "notion.so" },
  { label: "ChatGPT", domain: "chatgpt.com" },
  { label: "EBS", domain: "ebsi.co.kr" },
  { label: "위키백과", domain: "wikipedia.org" },
  { label: "GitHub", domain: "github.com" },
  { label: "Claude", domain: "claude.ai" },
];

function getDeviceId(): string {
  const key = "mirujima:web-device-id";
  const stored = localStorage.getItem(key);
  if (stored) return stored;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

export function FocusPlanner() {
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "active" | "completed" | "error">("idle");
  const [message, setMessage] = useState("사이트 차단 계획은 확장 프로그램 설치와 로그인 상태를 확인한 뒤 시작할 수 있습니다.");
  const [remainingSeconds, setRemainingSeconds] = useState(50 * 60);
  const [activeSession, setActiveSession] = useState<ActiveFocusSession | null>(null);
  const [guardianRewardRequested, setGuardianRewardRequested] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<FocusCoachResult | null>(null);
  const [membershipModalOpen, setMembershipModalOpen] = useState(false);
  const [completedGoalIds, setCompletedGoalIds] = useState<string[]>([]);

  const [title, setTitle] = useState("");
  const [todayDate, setTodayDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [targetFocusMinutes, setTargetFocusMinutes] = useState<number | "">(50);
  const [selfDepositPoints, setSelfDepositPoints] = useState<number | "">(0);
  const [extensionConnected, setExtensionConnected] = useState<boolean | null>(null);

  const [blockingMode, setBlockingMode] = useState<"blocklist" | "allowlist" | "off">("blocklist");
  const [domainsText, setDomainsText] = useState("youtube.com\ninstagram.com");

  const [goals, setGoals] = useState<GoalItem[]>([
    { id: "goal-1", name: "", detail: "", minutes: 50, priority: "medium" },
  ]);

  useEffect(() => {
    if (blockingMode === "off") {
      return;
    }
    const extensionId = process.env.NEXT_PUBLIC_MIRUJIMA_EXTENSION_ID ?? "";
    pingExtension(extensionId, chromeExternalSender)
      .then((connected) => setExtensionConnected(connected))
      .catch(() => setExtensionConnected(false));
  }, [blockingMode]);

  const handleBlockingModeChange = (mode: "blocklist" | "allowlist" | "off") => {
    setBlockingMode(mode);
    if (mode === "blocklist" && !domainsText.trim()) {
      setDomainsText("youtube.com\ninstagram.com");
    } else if (mode === "allowlist" && (!domainsText.trim() || domainsText === "youtube.com\ninstagram.com")) {
      setDomainsText("notion.so\nchatgpt.com");
    }
  };

  const isDomainSelected = (domain: string) => {
    const lines = domainsText
      .split(/\r?\n/)
      .map((s) => s.trim().toLowerCase());
    return lines.includes(domain.toLowerCase());
  };

  const togglePresetDomain = (domain: string) => {
    const lines = domainsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const index = lines.findIndex((l) => l.toLowerCase() === domain.toLowerCase());
    if (index >= 0) {
      lines.splice(index, 1);
    } else {
      lines.push(domain);
    }
    setDomainsText(lines.join("\n"));
  };

  useEffect(() => {
    if (status !== "active" || !activeSession) return;
    const updateRemaining = () => {
      setRemainingSeconds(Math.max(0, Math.ceil((Date.parse(activeSession.endsAt) - Date.now()) / 1000)));
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [activeSession, status]);

  const addGoal = () => {
    setGoals((prev) => [
      ...prev,
      { id: `goal-${Date.now()}`, name: "", detail: "", minutes: 25, priority: "medium" },
    ]);
  };

  const removeGoal = (id: string) => {
    if (goals.length <= 1) return;
    setGoals((prev) => prev.filter((g) => g.id !== id));
  };

  const moveGoal = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= goals.length) return;
    const next = [...goals];
    const temp = next[index];
    next[index] = next[targetIndex];
    next[targetIndex] = temp;
    setGoals(next);
  };

  const updateGoal = (id: string, field: keyof GoalItem, value: unknown) => {
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, [field]: value } : g))
    );
  };

  async function submit(formData: FormData) {
    setStatus("saving");
    try {
      const draft = parseFocusDraft(Object.fromEntries(formData));
      const validatedGoals = parseFocusGoals(goals);
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Google 로그인 후 집중을 시작해 주세요.");

      const extensionId = process.env.NEXT_PUBLIC_MIRUJIMA_EXTENSION_ID ?? "";
      if (requiresExtension(draft.blockingMode)) {
        const connected = await pingExtension(extensionId, chromeExternalSender);
        if (!connected) throw new Error("미루지마 확장 프로그램과 연결되지 않았습니다. 확장 프로그램을 실행한 뒤 다시 시도해 주세요.");
      }

      const now = new Date();
      const scheduleId = crypto.randomUUID();
      const rules = draft.domains.map((hostname) => ({ hostname, includeSubdomains: true }));
      const plan: FocusPlan = {
        id: scheduleId,
        ownerUserId: authData.user.id,
        title: draft.title || goals[0]?.name || "오늘의 집중 계획",
        description: "",
        dateKey: localDateKey(now),
        plannedStartAt: null,
        targetFocusMinutes: draft.targetFocusMinutes,
        activityMode: "interactive",
        blockingMode: draft.blockingMode,
        allowedDomains: draft.blockingMode === "allowlist" ? rules : [],
        blockedDomains: draft.blockingMode === "blocklist" ? rules : [],
        breakMinutes: draft.breakMinutes,
        priority: "medium",
        selfDepositPoints: draft.selfDepositPoints,
        guardianRewardRequestPoints: guardianRewardRequested ? 2000 : 0,
        goals: validatedGoals,
        status: "ready",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      const deviceId = getDeviceId();
      const { error: saveError } = await supabase.rpc("upsert_focus_plan", {
        p_schedule_id: scheduleId,
        p_payload: plan,
        p_device_id: deviceId,
      });
      if (saveError) throw new Error("계획을 저장하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.");

      const { data, error: startError } = await supabase.rpc("start_focus_session", {
        p_schedule_id: scheduleId,
        p_device_id: deviceId,
      });
      if (startError) {
        if (startError.message.includes("insufficient topup points")) {
          throw new Error("걸 포인트보다 사용 가능한 충전 포인트가 부족합니다.");
        }
        throw new Error("집중 세션을 시작하지 못했습니다. 진행 중인 세션이 있는지 확인해 주세요.");
      }
      const session = data as CanonicalFocusSession;
      if (requiresExtension(draft.blockingMode)) {
        await requestFocusSync(extensionId, chromeExternalSender, scheduleId, session.id);
      }
      setActiveSession(session);
      setCompletedGoalIds([]);
      setRemainingSeconds(Math.max(0, Math.ceil((Date.parse(session.endsAt) - Date.now()) / 1000)));
      setStatus("active");
      setMessage(draft.selfDepositPoints > 0
        ? `${draft.selfDepositPoints.toLocaleString()}P가 충전 포인트에서 안전하게 예약되었습니다.`
        : "집중 세션이 시작되었습니다. 타이머 기준 시각은 서버에 저장되었습니다.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "집중 준비 중 문제가 발생했습니다. 다시 시도해 주세요.");
    }
  }

  async function finish(goalIds: string[]) {
    if (!activeSession) return;
    setStatus("saving");
    try {
      const { data, error } = await createClient().rpc("finish_focus_session", {
        p_session_id: activeSession.id,
        p_completed_goal_ids: goalIds,
        p_device_id: getDeviceId(),
      });
      if (error) {
        if (error.message.includes("has not reached target time")) {
          throw new Error("목표 시간이 끝난 뒤 완료한 목표를 제출할 수 있습니다.");
        }
        if (error.message.includes("invalid completed goal")) {
          throw new Error("목표 정보가 변경되었습니다. 세션을 새로 불러온 뒤 다시 시도해 주세요.");
        }
        throw new Error("집중 결과와 포인트를 정산하지 못했습니다. 다시 시도해 주세요.");
      }
      const settled = data as ActiveFocusSession;
      const result = settled.result;
      setActiveSession(settled);
      setRemainingSeconds(0);
      setStatus("completed");
      setMessage(result
        ? `${result.totalGoalCount}개 중 ${result.completedGoalCount}개 완료 · ${result.completionPercent}%: ${result.earnedPoints.toLocaleString()}P 획득, ${result.returnedPoints.toLocaleString()}P 충전 포인트 반환`
        : "집중 결과 정산이 완료되었습니다.");
    } catch (error) {
      setStatus("active");
      setMessage(error instanceof Error ? error.message : "집중 결과 정산 중 문제가 발생했습니다.");
    }
  }

  function toggleCompletedGoal(goalId: string) {
    setCompletedGoalIds((current) => current.includes(goalId)
      ? current.filter((id) => id !== goalId)
      : [...current, goalId]);
  }

  function abandonFocus() {
    if (!window.confirm("집중을 포기하면 완료한 목표 없음(0%)으로 처리되고 예약 포인트가 반환됩니다. 포기할까요?")) return;
    void finish([]);
  }

  async function requestAiRecommendation() {
    setAiBusy(true);
    try {
      const form = formRef.current ? new FormData(formRef.current) : new FormData();
      const { data, error } = await createClient().functions.invoke("ai-writing", {
        body: {
          action: "focus-coach",
          title: String(form.get("title") ?? goals[0]?.name ?? "오늘의 집중 계획"),
          targetFocusMinutes: Number(form.get("targetFocusMinutes") ?? 50),
          goals: goals.map(({ name, detail, minutes }) => ({ name: name || "집중 목표", detail, minutes })),
        },
      });
      if (error) {
        const context = error.context;
        const body = await context?.json?.().catch(() => null) as { error?: string } | null;
        if (body?.error === "membership_entitlement_required" || context?.status === 403) {
          setMembershipModalOpen(true);
          return;
        }
        throw new Error("AI 추천을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
      if (!data || typeof data !== "object" || !Array.isArray(data.steps)) throw new Error("AI 추천 결과를 확인하지 못했습니다.");
      setAiRecommendation(data as FocusCoachResult);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI 추천을 불러오지 못했습니다.");
    } finally {
      setAiBusy(false);
    }
  }

  const settlementGoals = activeSession?.goals ?? [];
  const completedGoalIdSet = new Set(completedGoalIds);
  const predictedCompletionPercent = settlementGoals.length > 0
    ? completionPercentForGoals(settlementGoals.length, completedGoalIds.length)
    : 0;
  const predictedEarnedPoints = Math.floor((activeSession?.selfDepositPoints ?? 0) * predictedCompletionPercent / 100);
  const predictedReturnedPoints = (activeSession?.selfDepositPoints ?? 0) - predictedEarnedPoints;

  return (
    <>
      <div className="flex justify-end mb-4">
        <button
          className="button secondary small"
          type="button"
          onClick={() => setIsGuideOpen(true)}
        >
          <HelpCircle className="w-4 h-4" />
          <span>사용법 가이드</span>
        </button>
      </div>

      <section className="focus-layout">
        <form ref={formRef} className="card focus-form" action={submit}>
          <div className="border-b border-gray-800 pb-3 mb-2">
            <span className="card-label">일일 계획 수립</span>
            <h2>오늘의 집중 계획 작성</h2>
          </div>

          <div className="field-row">
            <label>
              계획명
              <input
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="계획명을 입력해 주세요"
                required
                maxLength={120}
              />
            </label>
            <label>
              계획 날짜
              <input
                type="date"
                value={todayDate}
                onChange={(e) => setTodayDate(e.target.value)}
              />
            </label>
          </div>

          <div className="field-row">
            <label>
              오늘 사용 가능 집중 시간 (분)
              <input
                name="targetFocusMinutes"
                type="number"
                value={targetFocusMinutes}
                onChange={(e) => {
                  const val = e.target.value;
                  setTargetFocusMinutes(val === "" ? "" : Math.max(0, Number(val)));
                }}
                min="1"
                max="720"
                placeholder="집중 시간 입력 (분) 예: 50"
              />
            </label>
            <label>
              이번 계획에 걸어둘 포인트 (P)
              <input
                name="selfDepositPoints"
                type="number"
                value={selfDepositPoints}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelfDepositPoints(val === "" ? "" : Math.max(0, Number(val)));
                }}
                min="0"
                step="1"
                placeholder="충전 포인트에서 예약할 금액 (예: 1000)"
              />
            </label>
          </div>

          <div className="reward-toggle-bar">
            <div className="reward-toggle-info">
              <strong>보호자 보상 요청</strong>
              <p>보호자에게 완료 보상을 요청하려면 버튼을 눌러 켜주세요.</p>
            </div>
            <button
              type="button"
              className={`toggle-switch-btn ${guardianRewardRequested ? "active" : ""}`}
              onClick={() => setGuardianRewardRequested(!guardianRewardRequested)}
            >
              {guardianRewardRequested ? "보상 요청 켜짐" : "보상 요청 꺼짐"}
            </button>
          </div>

          {(() => {
            const realism = evaluateRealism(title, targetFocusMinutes, goals);
            return (
              <div className={`notice realism-notice ${realism.statusClass}`}>
                <div className="flex items-center justify-between">
                  <strong>{realism.label}</strong>
                  <span className="text-xs font-bold opacity-80">{realism.score}%</span>
                </div>
                <p className="mt-1 text-xs">{realism.message}</p>
                <div className="progress-bar-track mt-2">
                  <div
                    className={`progress-bar-fill ${realism.statusClass}`}
                    style={{ width: `${realism.score}%` }}
                  />
                </div>
              </div>
            );
          })()}

          <div className="goal-list-section">
            <div className="flex items-center justify-between">
              <strong className="text-sm text-navy">목표 목록 ({goals.length}개)</strong>
            </div>

            {goals.map((goal, index) => (
              <div key={goal.id} className="goal-item-card">
                <div className="goal-item-header">
                  <strong>목표 {index + 1}</strong>
                  <div className="goal-item-actions">
                    <button
                      type="button"
                      className="goal-action-icon-btn"
                      onClick={() => moveGoal(index, "up")}
                      disabled={index === 0}
                      title="위로 이동"
                      aria-label="위로 이동"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="goal-action-icon-btn"
                      onClick={() => moveGoal(index, "down")}
                      disabled={index === goals.length - 1}
                      title="아래로 이동"
                      aria-label="아래로 이동"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="goal-action-icon-btn danger"
                      onClick={() => removeGoal(goal.id)}
                      title="목표 삭제"
                      aria-label="목표 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="goal-row-3col">
                  <label>
                    목표 일정명
                    <input
                      placeholder="목표 일정명 입력"
                      value={goal.name}
                      onChange={(e) => updateGoal(goal.id, "name", e.target.value)}
                    />
                  </label>
                  <label>
                    목표 시간 (분)
                    <input
                      type="number"
                      value={goal.minutes}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateGoal(goal.id, "minutes", val === "" ? "" : Math.max(0, Number(val)));
                      }}
                      placeholder="예: 25"
                    />
                  </label>
                  <label>
                    우선순위
                    <select
                      value={goal.priority}
                      onChange={(e) => updateGoal(goal.id, "priority", e.target.value as GoalItem["priority"])}
                    >
                      <option value="high">높음</option>
                      <option value="medium">중간</option>
                      <option value="low">낮음</option>
                    </select>
                  </label>
                </div>

                <label className="goal-detail-label">
                  구체적인 목표 내용
                  <textarea
                    rows={2}
                    placeholder="달성하려는 세부 내용을 입력해 주세요"
                    value={goal.detail}
                    onChange={(e) => updateGoal(goal.id, "detail", e.target.value)}
                  />
                </label>
              </div>
            ))}

            <button type="button" className="add-goal-button" onClick={addGoal}>
              <Plus className="w-4 h-4" />
              <span>목표 추가</span>
            </button>
          </div>

          <fieldset>
            <legend className="mb-1">사이트 차단 방식</legend>
            <div className="segmented">
              <label>
                <input
                  type="radio"
                  name="blockingMode"
                  value="blocklist"
                  checked={blockingMode === "blocklist"}
                  onChange={() => handleBlockingModeChange("blocklist")}
                />
                <span>방해 사이트 차단</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="blockingMode"
                  value="allowlist"
                  checked={blockingMode === "allowlist"}
                  onChange={() => handleBlockingModeChange("allowlist")}
                />
                <span>허용 사이트만</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="blockingMode"
                  value="off"
                  checked={blockingMode === "off"}
                  onChange={() => handleBlockingModeChange("off")}
                />
                <span>사용 안 함</span>
              </label>
            </div>
          </fieldset>

          {blockingMode === "off" ? (
            <input type="hidden" name="domains" value="" />
          ) : (
            <div className="site-list-box">
              <div className="site-list-header">
                <span className="site-list-label">
                  {blockingMode === "blocklist"
                    ? "차단 대상 사이트 목록 (줄바꿈 구분)"
                    : "허용 대상 사이트 목록 (줄바꿈 구분)"}
                </span>
                <div className="preset-buttons">
                  <span className="preset-label">기본 추천:</span>
                  {(blockingMode === "blocklist" ? BLOCKLIST_PRESETS : ALLOWLIST_PRESETS).map((preset) => {
                    const selected = isDomainSelected(preset.domain);
                    return (
                      <button
                        key={preset.domain}
                        type="button"
                        className={`preset-btn ${selected ? "active" : ""}`}
                        onClick={() => togglePresetDomain(preset.domain)}
                      >
                        {selected ? "✓ " : "+ "}
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <textarea
                id="domains-textarea"
                name="domains"
                rows={3}
                value={domainsText}
                onChange={(e) => setDomainsText(e.target.value)}
                placeholder={
                  blockingMode === "blocklist"
                    ? "youtube.com\ninstagram.com"
                    : "notion.so\nchatgpt.com"
                }
              />
            </div>
          )}

          <div className={`notice ${status === "error" ? "error" : ""}`} role="status">
            <strong>
              {status === "active"
                ? "집중 시작 완료"
                : status === "saving"
                ? "집중 준비 중"
                : "확장 프로그램 연결"}
            </strong>
            <p>{message}</p>
          </div>

          {aiRecommendation ? (
            <div className="notice ai-focus-recommendation" role="status">
              <strong>{aiRecommendation.recommendedTitle}</strong>
              <p>{aiRecommendation.summary}</p>
              <p><b>권장 시간:</b> 집중 {aiRecommendation.recommendedFocusMinutes}분 · 휴식 {aiRecommendation.recommendedBreakMinutes}분</p>
              <ol>{aiRecommendation.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              <p>{aiRecommendation.reason}</p>
            </div>
          ) : null}

          <div className="focus-actions-row">
            <button className="button full" type="submit" disabled={status === "saving"}>
              {status === "saving" ? "확인하고 있습니다..." : "계획 확정 및 집중 준비"}
            </button>
            <button className="button secondary full" type="button" disabled={aiBusy} onClick={() => void requestAiRecommendation()}>
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span>{aiBusy ? "AI 추천 생성 중…" : "AI 스마트 추천"}</span>
            </button>
          </div>
        </form>

        <aside className="timer-preview">
          <div className="timer-top">
            <span>FOCUS SESSION</span>
            <span className={`status-dot ${status === "active" ? "" : "idle"}`}>
              <Flame className="w-3.5 h-3.5 inline" />
              {status === "active" ? "집중 중" : "준비 전"}
            </span>
          </div>

          <strong>
            {status === "active"
              ? `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`
              : `${String(Number(targetFocusMinutes) || 0).padStart(2, "0")}:00`}
          </strong>
          <p>
            {status === "active"
              ? "확장 프로그램에서도 같은 세션을 확인할 수 있습니다."
              : title.trim()
              ? `“${truncateText(title, 10)}” (${Number(targetFocusMinutes) || 0}분) 세션을 시작할 준비가 되었습니다.`
              : `계획을 저장하면 ${Number(targetFocusMinutes) || 0}분 타이머가 준비됩니다.`}
          </p>

          <div className="timer-track">
            <i style={{ width: status === "active" ? "100%" : "0%" }} />
          </div>

          <div className="timer-meta">
            <span>
              차단 모드
              <strong>
                {blockingMode === "blocklist"
                  ? "방해 사이트 차단"
                  : blockingMode === "allowlist"
                  ? "허용 사이트만"
                  : "사용 안 함"}
              </strong>
            </span>
            <span>
              확장 상태
              <strong>
                {status === "active"
                  ? "동기화됨"
                  : blockingMode === "off"
                  ? "필요 없음"
                  : extensionConnected === true
                  ? "연결됨"
                  : extensionConnected === false
                  ? "확인 필요"
                  : "확인 중..."}
              </strong>
            </span>
          </div>

          <div className="preview-goals-section">
            <div className="preview-goals-header">
              <span>세부 목표 세션 ({goals.length})</span>
              <span>총 {goals.reduce((sum, g) => sum + (Number(g.minutes) || 0), 0)}분</span>
            </div>

            <div className="preview-goals-list">
              {goals.map((goal, index) => {
                const titleName = goal.name.trim() ? truncateText(goal.name, 10) : `목표 ${index + 1}`;
                const detailText = goal.detail.trim() ? truncateText(goal.detail, 12) : "세부 내용 없음";
                const minutesText = Number(goal.minutes) ? `${goal.minutes}분` : "시간 미설정";
                const priorityLabel = goal.priority === "high" ? "높음" : goal.priority === "medium" ? "중간" : "낮음";

                return (
                  <div key={goal.id} className="mini-goal-card">
                    <div className="mini-goal-main">
                      <span className="mini-goal-title">
                        {index + 1}. {titleName}
                      </span>
                      <span className="mini-goal-badge">{minutesText}</span>
                    </div>
                    <div className="mini-goal-sub">
                      <span className="mini-goal-detail">
                        {detailText}
                      </span>
                      <span className={`mini-priority-tag ${goal.priority}`}>
                        우선순위: {priorityLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {activeSession && status === "active" && (
            <div className="focus-settlement-actions">
              {remainingSeconds > 0 ? (
                <>
                  <p>목표 시간이 끝나면 완료한 목표를 선택해 포인트를 정산할 수 있습니다.</p>
                  <button className="button family-code-cancel small" type="button" onClick={abandonFocus}>집중 포기</button>
                </>
              ) : (
                <>
                  <div className="focus-completion-policy">
                    <strong>완료한 목표를 선택해 주세요</strong>
                    <p>전부 완료 100% · 절반 이상 80% · 1개 이상 절반 미만 60% · 완료 없음 0%</p>
                  </div>
                  <div className="focus-goal-checklist">
                    {settlementGoals.map((goal) => {
                      const checked = completedGoalIdSet.has(goal.id);
                      return (
                        <label className={checked ? "selected" : ""} key={goal.id}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCompletedGoal(goal.id)}
                          />
                          <span>
                            <strong>{goal.name}</strong>
                            <small>{goal.minutes}분 · {goal.detail || "세부 설명 없음"}</small>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div className={`focus-completion-summary ${predictedCompletionPercent === 0 ? "failed" : ""}`} aria-live="polite">
                    <strong>{settlementGoals.length}개 중 {completedGoalIds.length}개 완료 → {predictedCompletionPercent}%</strong>
                    <span>예상 획득 {predictedEarnedPoints.toLocaleString()}P · 반환 {predictedReturnedPoints.toLocaleString()}P</span>
                  </div>
                  <button
                    className={`button small full ${predictedCompletionPercent === 0 ? "family-code-cancel" : ""}`}
                    type="button"
                    disabled={settlementGoals.length === 0}
                    onClick={() => void finish(completedGoalIds)}
                  >
                    {predictedCompletionPercent === 0 ? "완료 목표 없이 실패 처리" : "선택한 목표로 완료 처리"}
                  </button>
                </>
              )}
            </div>
          )}
        </aside>
      </section>

      {membershipModalOpen ? (
        <div className="modal-overlay payment-modal-overlay" role="presentation" onClick={() => setMembershipModalOpen(false)}>
          <section className="modal-content payment-modal-content" role="dialog" aria-modal="true" aria-label="학생 Premium 안내" onClick={(event) => event.stopPropagation()}>
            <header className="payment-modal-header">
              <h1>AI 스마트 추천은 Premium 기능입니다</h1>
              <button className="icon-close-button" type="button" onClick={() => setMembershipModalOpen(false)} aria-label="닫기"><X className="w-4 h-4" /></button>
            </header>
            <div className="payment-modal-body">
              <div className="notice">
                <strong>학생 Premium 9,900원/30일</strong>
                <p>집중 계획 AI 첨삭, 목표 분할, 학습 추천과 기존 AI 기능을 이용할 수 있습니다. 보호자 가족 Premium에 연결된 학생은 별도 결제 없이 사용할 수 있습니다.</p>
              </div>
              <Link className="button full" href="/membership/checkout">학생 Premium 테스트 결제하기</Link>
            </div>
          </section>
        </div>
      ) : null}

      {/* Guide Modal */}
      {isGuideOpen && (
        <div className="modal-overlay" onClick={() => setIsGuideOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h2 className="text-xl font-extrabold text-navy m-0">집중 계획 작성 사용법</h2>
              <button
                className="icon-close-button"
                onClick={() => setIsGuideOpen(false)}
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4 text-sm text-gray-300">
              <div className="flex gap-3">
                <Shield className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-navy font-bold">1. 목표 및 차단 사이트 입력</strong>
                  <p className="m-0 text-xs text-gray-400">
                    공부할 수 있는 총 시간과 차단할 방해 URL을 작성하세요.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-navy font-bold">2. 확장 프로그램 자동 연동</strong>
                  <p className="m-0 text-xs text-gray-400">
                    계획 확정 시 Chrome 확장 프로그램이 차단을 즉시 시작합니다.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Flame className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-navy font-bold">3. 목표 완료 개수로 포인트 정산</strong>
                  <p className="m-0 text-xs text-gray-400">
                    시간이 끝나면 완료한 목표를 선택합니다. 전부 완료는 100%, 정확히 절반을 포함한 절반 이상은 80%, 1개 이상이지만 절반 미만은 60%, 완료 목표가 없으면 실패(0%)입니다.
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
    </>
  );
}
