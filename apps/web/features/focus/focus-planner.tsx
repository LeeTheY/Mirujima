"use client";

import { useState } from "react";
import type { CanonicalFocusSession, FocusPlan } from "@mirujima/contracts";
import { createClient } from "@/lib/supabase/client";
import { parseFocusDraft } from "./focus-form";
import { chromeExternalSender, pingExtension, requestFocusSync, requiresExtension } from "@/features/extension/bridge";
import { Plus, Trash2, ArrowUp, ArrowDown, Sparkles, Shield, Flame, CheckCircle2, HelpCircle, X } from "lucide-react";

interface GoalItem {
  id: string;
  name: string;
  detail: string;
  minutes: number;
  priority: "low" | "medium" | "high";
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDeviceId(): string {
  const key = "mirujima:web-device-id";
  const stored = localStorage.getItem(key);
  if (stored) return stored;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

export function FocusPlanner() {
  const [status, setStatus] = useState<"idle" | "saving" | "active" | "error">("idle");
  const [message, setMessage] = useState("사이트 차단 계획은 확장 프로그램 설치와 로그인 상태를 확인한 뒤 시작할 수 있습니다.");
  const [remainingMinutes, setRemainingMinutes] = useState(50);
  const [guardianRewardRequested, setGuardianRewardRequested] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const [goals, setGoals] = useState<GoalItem[]>([
    { id: "goal-1", name: "", detail: "", minutes: 50, priority: "medium" },
  ]);

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
        selfDepositPoints: 0,
        guardianRewardRequestPoints: guardianRewardRequested ? 2000 : 0,
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
      if (startError) throw new Error("집중 세션을 시작하지 못했습니다. 진행 중인 세션이 있는지 확인해 주세요.");
      const session = data as CanonicalFocusSession;
      if (requiresExtension(draft.blockingMode)) {
        await requestFocusSync(extensionId, chromeExternalSender, scheduleId, session.id);
      }
      setRemainingMinutes(draft.targetFocusMinutes);
      setStatus("active");
      setMessage("집중 세션이 시작되었습니다. 타이머 기준 시각은 서버에 저장되었습니다.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "집중 준비 중 문제가 발생했습니다. 다시 시도해 주세요.");
    }
  }

  const todayString = new Date().toISOString().split("T")[0];

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
        <form className="card focus-form" action={submit}>
          <div className="border-b border-gray-800 pb-3 mb-2">
            <span className="card-label">일일 계획 수립</span>
            <h2>오늘의 집중 계획 작성</h2>
          </div>

          <div className="field-row">
            <label>
              계획명
              <input name="title" placeholder="계획명을 입력해 주세요" required maxLength={120} />
            </label>
            <label>
              계획 날짜
              <input type="date" defaultValue={todayString} />
            </label>
          </div>

          <div className="field-row">
            <label>
              오늘 사용 가능 집중 시간 (분)
              <input name="targetFocusMinutes" type="number" defaultValue="50" min="1" max="720" />
            </label>
            <label>
              이번 계획 획득 목표 포인트 (P)
              <input type="text" placeholder="목표 포인트 입력" />
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

          <div className="notice">
            <strong>현실성 검사: 입력 대기 중</strong>
            <p className="mt-1">목표 일정과 시간을 입력하면 현실성 검사가 자동으로 진행됩니다.</p>
            <div className="progress-bar-track mt-2">
              <div className="progress-bar-fill" style={{ width: "0%" }} />
            </div>
          </div>

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

                <div className="field-row">
                  <label>
                    목표 일정명
                    <input
                      placeholder="목표 일정명 입력"
                      value={goal.name}
                      onChange={(e) => updateGoal(goal.id, "name", e.target.value)}
                    />
                  </label>
                  <label>
                    구체적인 목표 내용
                    <input
                      placeholder="달성하려는 세부 내용"
                      value={goal.detail}
                      onChange={(e) => updateGoal(goal.id, "detail", e.target.value)}
                    />
                  </label>
                </div>

                <div className="field-row">
                  <label>
                    목표 집중 시간 (분)
                    <input
                      type="number"
                      value={goal.minutes}
                      onChange={(e) => updateGoal(goal.id, "minutes", Number(e.target.value))}
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
                <input type="radio" name="blockingMode" value="blocklist" defaultChecked />
                <span>방해 사이트 차단</span>
              </label>
              <label>
                <input type="radio" name="blockingMode" value="allowlist" />
                <span>허용 사이트만</span>
              </label>
              <label>
                <input type="radio" name="blockingMode" value="off" />
                <span>사용 안 함</span>
              </label>
            </div>
          </fieldset>

          <label>
            차단 대상 사이트 목록 (줄바꿈 구분)
            <textarea
              name="domains"
              rows={3}
              placeholder={"youtube.com\ninstagram.com"}
            />
          </label>

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

          <div className="focus-actions-row">
            <button className="button full" type="submit" disabled={status === "saving"}>
              {status === "saving" ? "확인하고 있습니다..." : "계획 확정 및 집중 준비"}
            </button>
            <button className="button secondary full" type="button">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span>AI 스마트 추천</span>
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

          <strong>{String(remainingMinutes).padStart(2, "0")}:00</strong>
          <p>
            {status === "active"
              ? "확장 프로그램에서도 같은 세션을 확인할 수 있습니다."
              : "계획을 저장하면 타이머가 준비됩니다."}
          </p>

          <div className="timer-track">
            <i style={{ width: status === "active" ? "100%" : "0%" }} />
          </div>

          <div className="timer-meta">
            <span>
              차단 모드
              <strong>{status === "active" ? "방해 사이트 차단" : "설정 전"}</strong>
            </span>
            <span>
              확장 상태
              <strong>{status === "active" ? "동기화됨" : "확인 필요"}</strong>
            </span>
          </div>
        </aside>
      </section>

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
