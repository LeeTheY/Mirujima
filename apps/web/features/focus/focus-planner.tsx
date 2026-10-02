"use client";
import { aiCoachingErrorCopy } from "@/features/membership/ai-coaching-ui";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  canonicalFocusSessionSchema,
  completionPercentForGoals,
  focusCoachRequestSchema,
  focusCoachResultSchema,
  type CanonicalFocusSession,
  type FocusCoachResult,
  type FocusPlan,
  type PlannedGuardianReward,
} from "@mirujima/contracts";
import { createClient } from "@/lib/supabase/client";
import { cancelFocusPlan, loadFocusPlans, saveFocusPlan } from "./focus-plan-service";
import { focusDraftFromPlan, focusPlanMatchesDraft, parseFocusDraft, parseFocusGoals } from "./focus-form";
import { checkExtensionConnection, chromeExternalSender, requestFocusReconcile, requestFocusSync, requiresExtension } from "@/features/extension/bridge";
import {
  cancelCanonicalFocusStart,
  finishCanonicalFocusSession,
  getCanonicalFocusSession,
  getCurrentCanonicalFocusSession,
  pauseCanonicalFocusSession,
  resumeCanonicalFocusSession,
  startCanonicalFocusBreak,
  type FocusRpcClient,
} from "./canonical-focus-service";
import { canonicalSessionIdFromRealtimePayload } from "./canonical-focus-realtime";
import { ExtensionConnectionPanel } from "@/features/extension/connection-panel";
import { Plus, Trash2, ArrowUp, ArrowDown, Sparkles, Shield, Flame, CheckCircle2, HelpCircle, X, RefreshCw, CalendarDays, ChevronRight } from "lucide-react";
import { dateKeyInTimeZone } from "@/features/history/history-query";
import { requireOnlineAction } from "@/lib/online";

import { getPlannedGuardianReward, requestPlannedGuardianReward, withdrawPlannedGuardianReward } from "../family/planned-reward-data";

interface GoalItem {
  id: string;
  name: string;
  detail: string;
  minutes: number | "";
  priority: "low" | "medium" | "high";
}

type ActiveFocusSession = CanonicalFocusSession;

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

export function FocusPlanner({ timeZone = "Asia/Seoul" }: { timeZone?: string }) {
  const submitInFlight = useRef(false);
  const pendingPlan = useRef<FocusPlan | null>(null);
  const selectedPlan = useRef<FocusPlan | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<"recovering" | "idle" | "saving" | "starting" | "active" | "paused" | "awaiting-result" | "completed" | "error">("recovering");
  const [message, setMessage] = useState("사이트 차단 계획은 확장 프로그램 설치와 로그인 상태를 확인한 뒤 시작할 수 있습니다.");
  const [breakSeconds, setBreakSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(50 * 60);
  const [activeSession, setActiveSession] = useState<ActiveFocusSession | null>(null);
  const [guardianRewardRequested, setGuardianRewardRequested] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<FocusCoachResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [membershipModalOpen, setMembershipModalOpen] = useState(false);
  const [completedGoalIds, setCompletedGoalIds] = useState<string[]>([]);

  const [savedPlan, setSavedPlan] = useState<FocusPlan | null>(null);
  const [reward, setReward] = useState<PlannedGuardianReward | null>(null);
  const [rewardBusy, setRewardBusy] = useState(false);
  const [rewardMessage, setRewardMessage] = useState<string | null>(null);
  const rewardMutation = useRef(false);
  const rewardRevision = useRef(0);
  const [savedPlans, setSavedPlans] = useState<FocusPlan[] | null>(null);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [activityMode, setActivityMode] = useState<FocusPlan["activityMode"]>("interactive");
  const [priority, setPriority] = useState<FocusPlan["priority"]>("medium");
  const [guardianPoints, setGuardianPoints] = useState<number | "">(2000);
  const [title, setTitle] = useState("");
  const [todayDate, setTodayDate] = useState(() => dateKeyInTimeZone(new Date(), timeZone));
  const [targetFocusMinutes, setTargetFocusMinutes] = useState<number | "">(50);
  const [breakMinutes, setBreakMinutes] = useState<number | "">(10);
  const [selfDepositPoints, setSelfDepositPoints] = useState<number | "">(0);
  const [extensionConnected, setExtensionConnected] = useState<boolean | null>(null);

  const [blockingMode, setBlockingMode] = useState<"blocklist" | "allowlist" | "off">("blocklist");
  const [domainsText, setDomainsText] = useState("youtube.com\ninstagram.com");

  const [goals, setGoals] = useState<GoalItem[]>([
    { id: "goal-1", name: "", detail: "", minutes: 50, priority: "medium" },
  ]);

  const onTimedBreak = status === "paused" && activeSession?.pauseKind === "break" && Boolean(activeSession.breakEndsAt);
  const displaySeconds = onTimedBreak ? breakSeconds : remainingSeconds;
  const hasCurrentSession = status === "starting" || status === "active" || status === "paused" || status === "awaiting-result";

  const currentReward = reward?.scheduleId === savedPlan?.id ? reward : null;
  const rewardLocked = currentReward?.status === "pending" || currentReward?.status === "approved";
  const approvalRequired = guardianRewardRequested && Number(guardianPoints) > 0;
  const approvedReward = currentReward?.status === "approved" && currentReward.points === savedPlan?.guardianRewardRequestPoints;

  useEffect(() => {
    let live = true;
    const plan = savedPlan;
    const refresh = async () => {
      if (!plan || plan.guardianRewardRequestPoints <= 0 || rewardMutation.current) return;
      const revision = ++rewardRevision.current;
      setRewardBusy(true);
      try {
        const next = await getPlannedGuardianReward(plan.id, plan.ownerUserId, createClient() as unknown as FocusRpcClient);
        if (live && revision === rewardRevision.current) {
          setReward(next); setRewardMessage(null);
          if (next?.status === "pending" || next?.status === "approved") restorePlanFields(plan);
        }
      } catch (cause) {
        if (live && revision === rewardRevision.current) setRewardMessage(cause instanceof Error ? cause.message : "보상 상태를 확인하지 못했습니다.");
      } finally { if (live && revision === rewardRevision.current) setRewardBusy(false); }
    };
    const timer = window.setTimeout(() => { setReward(null); setRewardMessage(null); void refresh(); }, 0);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => { live = false; window.clearTimeout(timer); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); };
  }, [savedPlan]);

  async function manageReward(action: "request" | "refresh" | "withdraw") {
    const plan = savedPlan;
    if (!plan || hasCurrentSession || rewardMutation.current || submitInFlight.current) return;
    rewardMutation.current = true; ++rewardRevision.current; setRewardBusy(true); setRewardMessage(null);
    try {
      requireOnlineAction("보호자 보상 요청 처리");
      const client = createClient() as unknown as FocusRpcClient;
      let next: PlannedGuardianReward | null;
      if (action === "request") {
        if (!formRef.current) return;
        const draft = parseFocusDraft({ ...Object.fromEntries(new FormData(formRef.current)), guardianRewardRequestPoints: guardianRewardRequested ? guardianPoints : 0 });
        if (!focusPlanMatchesDraft(plan, draft, parseFocusGoals(goals))) throw new Error("수정한 계획을 먼저 저장한 뒤 보상을 요청해 주세요.");
        next = await requestPlannedGuardianReward(plan.id, plan.ownerUserId, client);
      } else if (action === "withdraw" && currentReward) {
        next = await withdrawPlannedGuardianReward(currentReward, client);
      } else {
        next = await getPlannedGuardianReward(plan.id, plan.ownerUserId, client);
      }
      if (selectedPlan.current?.id === plan.id) {
        setReward(next);
        if (action === "withdraw") setRewardMessage("보상 요청을 취소했습니다. 예약된 보호자 포인트는 반환되었습니다.");
      }
    } catch (cause) {
      if (selectedPlan.current?.id === plan.id) setRewardMessage(cause instanceof Error ? cause.message : "보상 요청을 처리하지 못했습니다.");
    } finally { rewardMutation.current = false; setRewardBusy(false); }
  }

  async function refreshPlans() {
    try { setSavedPlans(await loadFocusPlans()); setPlansError(null); }
    catch (error) { setPlansError(error instanceof Error ? error.message : "계획을 불러오지 못했습니다."); }
  }

  async function cancelSavedPlan(plan: FocusPlan) {
    if (hasCurrentSession || submitInFlight.current) return;
    submitInFlight.current = true; setStatus("saving");
    try {
      requireOnlineAction("계획 취소");
      const cancelled = await cancelFocusPlan(plan, createClient() as unknown as FocusRpcClient);
      setSavedPlans((plans) => (plans ?? []).map((item) => item.id === plan.id ? cancelled : item));
      if (savedPlan?.id === plan.id) { selectedPlan.current = null; setSavedPlan(null); }
      setStatus("idle"); setMessage("계획을 취소했습니다. 기록은 보존됩니다.");
    } catch (error) { setStatus("error"); setMessage(error instanceof Error ? error.message : "계획을 취소하지 못했습니다."); }
    finally { submitInFlight.current = false; }
  }

  function restorePlanFields(plan: FocusPlan) {
    setTitle(plan.title); setTodayDate(plan.dateKey);
    setDescription(plan.description); setActivityMode(plan.activityMode); setPriority(plan.priority);
    setTargetFocusMinutes(plan.targetFocusMinutes); setBreakMinutes(plan.breakMinutes);
    setSelfDepositPoints(plan.selfDepositPoints); setBlockingMode(plan.blockingMode);
    setDomainsText((plan.blockingMode === "allowlist" ? plan.allowedDomains : plan.blockedDomains).map((rule) => rule.hostname).join("\n"));
    setGuardianRewardRequested(plan.guardianRewardRequestPoints > 0);
    setGuardianPoints(plan.guardianRewardRequestPoints || 2000);
    setGoals(plan.goals.map((goal) => ({ ...goal })));
  }

  function openPlan(plan: FocusPlan) {
    if (hasCurrentSession || status === "saving" || rewardMutation.current) return;
    pendingPlan.current = null;
    selectedPlan.current = plan;
    setReward(null); setRewardMessage(null); setRewardBusy(plan.guardianRewardRequestPoints > 0);
    setSavedPlan(plan); restorePlanFields(plan);
    setRemainingSeconds(plan.targetFocusMinutes * 60); setCompletedGoalIds([]); setActiveSession(null);
    setStatus("idle"); setMessage("저장한 계획을 열었습니다. 수정 후 저장하거나 집중을 시작하세요.");
  }


  function applyCanonicalSession(session: CanonicalFocusSession) {
    setActiveSession(session);
    setTargetFocusMinutes(session.targetFocusMinutes);
    setSelfDepositPoints(session.selfDepositPoints);
    setBlockingMode(session.blockingMode);
    setGoals(session.goals.map((goal) => ({ ...goal })));
    setCompletedGoalIds(session.result?.completedGoalIds ?? []);
    if (selectedPlan.current?.id === session.scheduleId) setTitle(selectedPlan.current.title);
    else if (!title.trim()) setTitle("진행 중인 집중 계획");
    if (session.status === "success" || session.status === "failed" || session.status === "cancelled") {
      setRemainingSeconds(0);
      setStatus("completed");
      setMessage(session.result
        ? `집중 결과 ${session.result.completionPercent}% · ${session.result.earnedPoints.toLocaleString()}P 획득 · ${session.result.returnedPoints.toLocaleString()}P 반환`
        : "집중 세션이 종료되었습니다.");
    } else if (session.status === "starting") {
      setRemainingSeconds(session.targetFocusMinutes * 60);
      setStatus("starting");
      setMessage("확장 프로그램의 차단 적용을 확인하고 있습니다. 준비가 끝나면 집중 시간이 시작됩니다.");
    } else if (session.status === "paused") {
      setRemainingSeconds(session.remainingFocusSeconds);
      setStatus("paused");
      setBreakSeconds(session.breakEndsAt ? Math.max(0, Math.ceil((Date.parse(session.breakEndsAt) - Date.now()) / 1000)) : 0);
      setMessage(session.pauseKind === "break" ? "휴식 중에는 차단을 해제합니다. 남은 휴식 시간이 끝나면 자동으로 집중에 복귀합니다." : "일시정지된 집중 세션을 서버에서 복구했습니다.");
    } else if (session.status === "awaiting-result") {
      setRemainingSeconds(0);
      setStatus("awaiting-result");
      setMessage("목표 시간이 끝났습니다. 완료한 목표를 선택해 결과를 제출해 주세요.");
    } else {
      setRemainingSeconds(Math.max(0, Math.ceil((Date.parse(session.endsAt) - Date.now()) / 1000)));
      setStatus("active");
      setMessage("진행 중인 집중 세션을 서버에서 복구했습니다.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getCurrentCanonicalFocusSession(),
      loadFocusPlans().catch((error: unknown) => {
        if (!cancelled) setPlansError(error instanceof Error ? error.message : "계획을 불러오지 못했습니다.");
        return null;
      }),
    ])
      .then(([session, plans]) => {
        if (cancelled) return;
        setSavedPlans(plans);
        const currentPlan = session ? plans?.find((plan) => plan.id === session.scheduleId) : null;
        if (currentPlan) openPlan(currentPlan);
        if (session) applyCanonicalSession(session);
        else setStatus("idle");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
        setMessage("진행 중인 집중 세션을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
      });
    return () => { cancelled = true; };
    // Initial canonical recovery must run only once for this mounted planner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let refreshInFlight = false;
    let queuedSessionId: string | null = null;

    const refresh = async (sessionId: string) => {
      queuedSessionId = sessionId;
      if (refreshInFlight) return;
      refreshInFlight = true;
      try {
        while (!disposed && queuedSessionId) {
          const nextSessionId = queuedSessionId;
          queuedSessionId = null;
          const session = await getCanonicalFocusSession(
            supabase as unknown as FocusRpcClient,
            nextSessionId,
          );
          if (!disposed && session) applyCanonicalSession(session);
        }
      } catch {
        if (!disposed) setMessage("서버 집중 상태가 변경됐지만 최신 상태를 불러오지 못했습니다. 잠시 후 다시 시도합니다.");
      } finally {
        refreshInFlight = false;
      }
    };

    void supabase.auth.getUser().then(({ data, error }) => {
      if (disposed || error || !data.user) return;
      channel = supabase
        .channel(`focus-session:${data.user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "cloud_focus_sessions",
            filter: `user_id=eq.${data.user.id}`,
          },
          (payload) => {
            const sessionId = canonicalSessionIdFromRealtimePayload(payload);
            if (sessionId) void refresh(sessionId);
          },
        )
        .subscribe();
    });

    return () => {
      disposed = true;
      if (channel) void supabase.removeChannel(channel);
    };
    // Realtime events are invalidations only; the RPC applies validated canonical state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    let disposed = false;
    let busy = false;
    const refresh = () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      void getCurrentCanonicalFocusSession().then((session) => { if (!disposed && session) applyCanonicalSession(session); })
        .catch(() => { if (!disposed) setMessage("서버 집중 상태를 다시 확인하지 못했습니다. 연결 복구 후 다시 확인합니다."); })
        .finally(() => { busy = false; });
    };
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true; window.removeEventListener("online", refresh); window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
    // Focus/reconnection events re-fetch canonical state after missed realtime messages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const next = Math.max(0, Math.ceil((Date.parse(activeSession.endsAt) - Date.now()) / 1000));
      setRemainingSeconds(next);
      if (next === 0) setStatus("awaiting-result");
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [activeSession, status]);

  useEffect(() => {
    if (!onTimedBreak || !activeSession?.breakEndsAt) return;
    let disposed = false;
    let busy = false;
    let lastAttempt = 0;
    const update = () => {
      const seconds = Math.max(0, Math.ceil((Date.parse(activeSession.breakEndsAt!) - Date.now()) / 1000));
      setBreakSeconds(seconds);
      if (seconds > 0 || busy || Date.now() - lastAttempt < 5000) return;
      busy = true; lastAttempt = Date.now();
      void getCanonicalFocusSession(createClient() as unknown as FocusRpcClient, activeSession.id).then((session) => {
        if (!disposed && session) applyCanonicalSession(session);
      }).catch(() => { if (!disposed) setMessage("휴식 시간이 끝났습니다. 연결이 복구되면 서버 상태를 다시 확인합니다. 확장 프로그램은 저장된 종료 시각에 따라 차단을 복구합니다."); })
        .finally(() => { busy = false; });
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => { disposed = true; window.clearInterval(timer); };
    // Server state, rather than a local UI timer, confirms automatic resumption.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onTimedBreak, activeSession?.id, activeSession?.breakEndsAt]);

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

  async function submit(formData: FormData, start = true) {
    if (activeSession && hasCurrentSession) {
      setMessage("진행 중인 집중 세션을 먼저 완료해 주세요.");
      return;
    }
    if (submitInFlight.current || rewardMutation.current) return;
    submitInFlight.current = true;
    setStatus("saving");
    let requestedSession: CanonicalFocusSession | null = null;
    try {
      requireOnlineAction("집중 계획 저장과 시작");
      if (start && approvalRequired && (!approvedReward || !savedPlan)) throw new Error("계획을 저장하고 보호자 보상 승인을 받은 뒤 집중을 시작해 주세요.");
      const approvedPlan = start && approvedReward ? savedPlan : null;
      const draft = approvedPlan ? focusDraftFromPlan(approvedPlan) : parseFocusDraft({ ...Object.fromEntries(formData), guardianRewardRequestPoints: guardianRewardRequested ? guardianPoints : 0 });
      if (guardianRewardRequested && draft.guardianRewardRequestPoints < 1) throw new Error("보호자 보상 요청 금액은 1P 이상이어야 합니다.");
      const validatedGoals = approvedPlan ? approvedPlan.goals : parseFocusGoals(goals);
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Google 로그인 후 집중을 시작해 주세요.");

      const extensionId = process.env.NEXT_PUBLIC_MIRUJIMA_EXTENSION_ID ?? "";
      if (start && requiresExtension(draft.blockingMode)) {
        const connection = await checkExtensionConnection(extensionId, chromeExternalSender, authData.user.id);
        setExtensionConnected(connection.status === "connected");
        if (connection.status !== "connected") throw new Error(connection.message);
      }

      const existing = await getCurrentCanonicalFocusSession(supabase as unknown as FocusRpcClient);
      if (existing && ["starting", "active", "paused", "awaiting-result"].includes(existing.status)) {
        applyCanonicalSession(existing);
        return;
      }
      const now = new Date();
      const scheduleId = savedPlan?.id ?? pendingPlan.current?.id ?? crypto.randomUUID();
      const existingRules = draft.blockingMode === "allowlist" ? savedPlan?.allowedDomains : savedPlan?.blockedDomains;
      const rules = [...new Set(draft.domains)].map((hostname) => ({ hostname, includeSubdomains: existingRules?.find((rule) => rule.hostname === hostname)?.includeSubdomains ?? true }));
      const plan: FocusPlan = {
        id: scheduleId,
        ownerUserId: authData.user.id,
        title: draft.title || goals[0]?.name || "오늘의 집중 계획",
        description: draft.description,
        dateKey: draft.dateKey,
        plannedStartAt: savedPlan?.plannedStartAt ?? null,
        targetFocusMinutes: draft.targetFocusMinutes,
        activityMode: draft.activityMode,
        blockingMode: draft.blockingMode,
        allowedDomains: draft.blockingMode === "allowlist" ? rules : savedPlan?.allowedDomains ?? [],
        blockedDomains: draft.blockingMode === "blocklist" ? rules : savedPlan?.blockedDomains ?? [],
        breakMinutes: draft.breakMinutes,
        priority: draft.priority,
        selfDepositPoints: draft.selfDepositPoints,
        guardianRewardRequestPoints: draft.guardianRewardRequestPoints,
        goals: validatedGoals,
        status: start ? "ready" : "planned",
        createdAt: savedPlan?.createdAt ?? pendingPlan.current?.createdAt ?? now.toISOString(),
        updatedAt: savedPlan?.updatedAt ?? pendingPlan.current?.updatedAt ?? now.toISOString(),
      };
      const deviceId = getDeviceId();
      pendingPlan.current = plan;
      const saved = approvedPlan ?? await saveFocusPlan(plan, deviceId, supabase as unknown as FocusRpcClient);
      pendingPlan.current = null;
      selectedPlan.current = saved;
      setSavedPlan(saved);
      setPlansError(null);
      setSavedPlans((plans) => [saved, ...(plans ?? []).filter((item) => item.id !== saved.id)]);
      if (!start) {
        setStatus("idle"); setMessage("계획을 저장했습니다. 포인트 예약과 사이트 차단은 집중을 시작할 때 적용됩니다.");
        return;
      }

      const { data, error: startError } = await supabase.rpc("start_focus_session", {
        p_schedule_id: scheduleId,
        p_device_id: deviceId,
      });
      if (startError) {
        if (startError.message.includes("guardian approval required")) throw new Error("보호자 승인 상태가 변경됐습니다. 보상 상태를 다시 확인해 주세요.");
        if (startError.message.includes("insufficient topup points")) {
          throw new Error("걸 포인트보다 사용 가능한 충전 포인트가 부족합니다.");
        }
        if (startError.message.includes("active guardian link required")) {
          throw new Error("보호자 보상을 요청하려면 먼저 보호자 계정을 연결해 주세요.");
        }
        throw new Error("집중 세션을 시작하지 못했습니다. 진행 중인 세션이 있는지 확인해 주세요.");
      }
      const session = canonicalFocusSessionSchema.parse(data);
      requestedSession = session;
      if (requiresExtension(draft.blockingMode)) {
        await requestFocusSync(extensionId, chromeExternalSender, scheduleId, session.id);
      }
      const confirmed = await getCanonicalFocusSession(supabase as unknown as FocusRpcClient, session.id);
      if (!confirmed || confirmed.status !== "active") throw new Error("차단 적용 후 서버 시작 상태를 확인하지 못했습니다.");
      applyCanonicalSession(confirmed);
      setMessage(draft.selfDepositPoints > 0
        ? `${draft.selfDepositPoints.toLocaleString()}P가 예약되었고 집중 세션이 시작되었습니다.`
        : "집중 세션이 시작되었습니다. 타이머 기준 시각은 서버에 저장되었습니다.");
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : "집중 준비 중 문제가 발생했습니다.";
      try {
        const client = createClient() as unknown as FocusRpcClient;
        let latest = requestedSession ? await getCanonicalFocusSession(client, requestedSession.id) : await getCurrentCanonicalFocusSession(client);
        if (requestedSession && latest?.status === "starting") latest = await cancelCanonicalFocusStart(client, latest.id, getDeviceId());
        if (latest) {
          applyCanonicalSession(latest);
          setMessage(latest.status === "cancelled"
            ? `${failureMessage} 시작 준비를 취소했고 예약 포인트를 반환했습니다.`
            : `${failureMessage} 서버에 저장된 세션 상태를 복구했습니다.`);
          const extensionId = process.env.NEXT_PUBLIC_MIRUJIMA_EXTENSION_ID ?? "";
          if (latest.status === "cancelled" && extensionId) void requestFocusReconcile(extensionId, chromeExternalSender, latest.scheduleId, latest.id).catch(() => undefined);
          return;
        }
      } catch {
        if (requestedSession) {
          applyCanonicalSession(requestedSession);
          setMessage(`${failureMessage} 서버 확인이 지연되고 있습니다. 세션 상태를 다시 확인해 주세요. 포인트 반환은 아직 확정되지 않았습니다.`);
          return;
        }
      }
      setStatus("error");
      setMessage(failureMessage);
    } finally {
      submitInFlight.current = false;
    }
  }

  async function retryStartingFocus(cancel = false) {
    if (!activeSession || activeSession.status !== "starting") return;
    const session = activeSession;
    setStatus("saving");
    try {
      requireOnlineAction("집중 시작 상태 확인");
      const client = createClient() as unknown as FocusRpcClient;
      if (cancel) {
        applyCanonicalSession(await cancelCanonicalFocusStart(client, session.id, getDeviceId()));
        const extensionId = process.env.NEXT_PUBLIC_MIRUJIMA_EXTENSION_ID ?? "";
        if (extensionId) void requestFocusReconcile(extensionId, chromeExternalSender, session.scheduleId, session.id).catch(() => undefined);
      } else {
        await requestFocusSync(process.env.NEXT_PUBLIC_MIRUJIMA_EXTENSION_ID ?? "", chromeExternalSender, session.scheduleId, session.id);
        const latest = await getCanonicalFocusSession(client, session.id);
        if (!latest) throw new Error("세션 상태를 확인하지 못했습니다.");
        applyCanonicalSession(latest);
      }
    } catch (error) {
      setStatus("starting");
      setMessage(error instanceof Error ? error.message : "시작 상태를 확인하지 못했습니다. 다시 시도해 주세요.");
    }
  }

  async function finish(goalIds: string[]) {
    if (!activeSession) return;
    const fallbackStatus = remainingSeconds > 0 ? "active" : "awaiting-result";
    setStatus("saving");
    try {
      requireOnlineAction("집중 결과 정산");
      const settled = await finishCanonicalFocusSession(
        createClient() as unknown as FocusRpcClient,
        activeSession.id,
        goalIds,
        getDeviceId(),
      );
      const result = settled.result;
      setActiveSession(settled);
      setRemainingSeconds(0);
      setStatus("completed");
      setMessage(result
        ? `${result.totalGoalCount}개 중 ${result.completedGoalCount}개 완료 · ${result.completionPercent}%: ${result.earnedPoints.toLocaleString()}P 획득, ${result.returnedPoints.toLocaleString()}P 충전 포인트 반환`
        : "집중 결과 정산이 완료되었습니다.");
      const extensionId = process.env.NEXT_PUBLIC_MIRUJIMA_EXTENSION_ID ?? "";
      if (extensionId) {
        void requestFocusReconcile(extensionId, chromeExternalSender, settled.scheduleId, settled.id).catch(() => undefined);
      }
    } catch (error) {
      setStatus(fallbackStatus);
      setMessage(error instanceof Error ? error.message : "집중 결과 정산 중 문제가 발생했습니다.");
    }
  }

  async function pauseFocus() {
    if (!activeSession || status !== "active") return;
    setStatus("saving");
    try {
      requireOnlineAction("집중 일시정지");
      const session = await pauseCanonicalFocusSession(
        createClient() as unknown as FocusRpcClient,
        activeSession.id,
        getDeviceId(),
      );
      applyCanonicalSession(session);
    } catch (error) {
      setStatus("active");
      setMessage(error instanceof Error ? error.message : "집중 세션을 일시정지하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
    }
  }

  async function startBreak() {
    if (!activeSession || status !== "active") return;
    setStatus("saving");
    try {
      requireOnlineAction("휴식 시작");
      applyCanonicalSession(await startCanonicalFocusBreak(createClient() as unknown as FocusRpcClient, activeSession.id, getDeviceId(), crypto.randomUUID()));
    } catch {
      try {
        const latest = await getCanonicalFocusSession(createClient() as unknown as FocusRpcClient, activeSession.id);
        if (latest) { applyCanonicalSession(latest); setMessage(latest.pauseKind === "break" ? "서버에서 휴식 시작을 확인했습니다." : "휴식이 시작되지 않았습니다. 남은 휴식 시간과 연결을 확인해 주세요."); return; }
      } catch { /* Leave state uncertainty visible until reconnection fetches the canonical session. */ }
      setStatus("active"); setMessage("휴식 시작 여부를 확인하지 못했습니다. 연결이 복구되면 서버 상태를 다시 확인합니다.");
    }
  }

  async function resumeFocus() {
    if (!activeSession || status !== "paused") return;
    setStatus("saving");
    try {
      requireOnlineAction("집중 재개");
      const session = await resumeCanonicalFocusSession(
        createClient() as unknown as FocusRpcClient,
        activeSession.id,
        getDeviceId(),
      );
      applyCanonicalSession(session);
    } catch (error) {
      setStatus("paused");
      setMessage(error instanceof Error ? error.message : "집중 세션을 재개하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
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
    setAiError(null);
    try {
      requireOnlineAction("AI 집중 계획 추천");
      const form = formRef.current ? new FormData(formRef.current) : new FormData();
      const requestBody = focusCoachRequestSchema.parse({
        action: "focus-coach",
        title: String(form.get("title") ?? goals[0]?.name ?? "오늘의 집중 계획"),
        targetFocusMinutes: Number(form.get("targetFocusMinutes") ?? 50),
        goals: goals.map(({ name, detail, minutes }) => ({ name: name || "집중 목표", detail, minutes: Number(minutes) })),
      });
      const { data, error } = await createClient().functions.invoke("ai-writing", {
        body: requestBody,
      });
      if (error) {
        const context = error.context;
        const body = await context?.json?.().catch(() => null) as { error?: string } | null;
        if (body?.error === "membership_entitlement_required") {
          setMembershipModalOpen(true);
          return;
        }
        if (["ai_timeout", "authentication_required", "ai_role_required", "ai_entitlement_required"].includes(body?.error ?? "")) throw new Error(aiCoachingErrorCopy(body!.error!));
        if (body?.error === "rate_limited") throw new Error("AI 추천 요청 한도를 넘었습니다. 1분 뒤 다시 시도해 주세요.");
        if (body?.error === "invalid_ai_result") throw new Error("AI 추천 결과 형식을 확인하지 못했습니다. 입력은 그대로 유지되며 다시 시도할 수 있습니다.");
        throw new Error("AI 추천을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
      const parsed = focusCoachResultSchema.safeParse(data);
      if (!parsed.success) throw new Error("AI 추천 결과 형식을 확인하지 못했습니다. 입력은 그대로 유지되며 다시 시도할 수 있습니다.");
      setAiRecommendation(parsed.data);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI 추천을 불러오지 못했습니다.");
    } finally {
      setAiBusy(false);
    }
  }

  function applyAiRecommendation() {
    if (!aiRecommendation) return;
    setTitle(aiRecommendation.recommendedTitle);
    setTargetFocusMinutes(aiRecommendation.recommendedFocusMinutes);
    setBreakMinutes(Math.max(1, aiRecommendation.recommendedBreakMinutes));
    setAiError(null);
    setMessage("AI 추천의 계획명과 시간만 적용했습니다. 목표와 포인트를 확인한 뒤 직접 계획을 확정해 주세요.");
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

      <section className="card focus-saved-plans" aria-label="저장한 계획">
        <header className="saved-plans-header">
          <div><h2>저장한 계획</h2><p>계획을 선택하면 아래에서 이어서 작성할 수 있어요.</p></div>
          <div className="saved-plans-actions">
        <button type="button" className="button secondary small" onClick={() => void refreshPlans()}><RefreshCw size={14} aria-hidden="true" />새로고침</button>
        <button type="button" className="button secondary small saved-plan-create" disabled={hasCurrentSession || status === "saving"} onClick={() => {
          pendingPlan.current = null;
          selectedPlan.current = null;
          setSavedPlan(null); setTitle(""); setDescription(""); setTodayDate(dateKeyInTimeZone(new Date(), timeZone));
          setActivityMode("interactive"); setPriority("medium"); setTargetFocusMinutes(50); setBreakMinutes(10);
          setSelfDepositPoints(0); setGuardianRewardRequested(false); setGuardianPoints(2000);
          setBlockingMode("blocklist"); setDomainsText("youtube.com\ninstagram.com");
          setActiveSession(null); setCompletedGoalIds([]); setRemainingSeconds(50 * 60);
          setGoals([{ id: crypto.randomUUID(), name: "", detail: "", minutes: 50, priority: "medium" }]);
          setStatus("idle"); setMessage("새 계획을 작성하고 있습니다.");
        }}><Plus size={15} aria-hidden="true" />새 계획 작성</button>
          </div>
        </header>
        {plansError ? <p role="alert">{plansError}</p> : savedPlans === null ? <p role="status">저장한 계획을 불러오는 중입니다.</p> : savedPlans.length === 0 ? <div className="saved-plans-empty"><CalendarDays size={20} aria-hidden="true" /><p>첫 집중 계획을 작성해 보세요.<span>저장한 계획은 여기에 모아볼 수 있어요.</span></p></div> : (
          <ul className="focus-saved-plan-list">{savedPlans.map((plan) => <li key={plan.id} className={savedPlan?.id === plan.id ? "selected" : undefined}>
            <button className="saved-plan-open" type="button" aria-pressed={savedPlan?.id === plan.id} disabled={hasCurrentSession || status === "saving" || !["draft", "planned", "ready"].includes(plan.status)} onClick={() => openPlan(plan)}>
              <span className="saved-plan-copy"><strong>{plan.title}</strong><span>{plan.dateKey.replaceAll("-", ".")}<span aria-hidden="true"> · </span>{plan.targetFocusMinutes}분</span></span>
              <span className={`saved-plan-status ${plan.status}`}>{plan.status === "planned" || plan.status === "draft" || plan.status === "ready" ? "준비" : plan.status === "completed" ? "완료" : plan.status === "active" ? "진행 중" : "종료"}</span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            {["draft", "planned", "ready"].includes(plan.status) ? <button className="saved-plan-cancel" type="button" disabled={hasCurrentSession || status === "saving"} onClick={() => void cancelSavedPlan(plan)}>계획 취소</button> : null}
          </li>)}</ul>
        )}
        {savedPlan ? <p className="saved-plan-editing" role="status">선택한 계획을 편집하고 있습니다.</p> : null}
      </section>
      <section className="focus-layout">
        <form ref={formRef} className="card focus-form" action={(data) => submit(data)}>
          <fieldset className="focus-plan-fields" disabled={hasCurrentSession || status === "saving" || status === "recovering" || rewardLocked || rewardBusy}>
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
                name="dateKey"
                required
                value={todayDate}
                onChange={(e) => setTodayDate(e.target.value)}
              />
            </label>
          </div>

          <label>계획 설명<textarea name="description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} /></label>
          <div className="field-row">
            <label>활동 방식<select name="activityMode" value={activityMode} onChange={(event) => setActivityMode(event.target.value as FocusPlan["activityMode"])}>
              <option value="interactive">문제 풀이·작업</option><option value="reading">읽기</option><option value="watching">강의 시청</option><option value="offline">오프라인 학습</option>
            </select></label>
            <label>계획 우선순위<select name="priority" value={priority} onChange={(event) => setPriority(event.target.value as FocusPlan["priority"])}>
              <option value="low">낮음</option><option value="medium">보통</option><option value="high">높음</option>
            </select></label>
          </div>
          <div className="field-row">
            <label>
              기본 휴식 시간 (분)
              <input
                name="breakMinutes"
                type="number"
                value={breakMinutes}
                onChange={(event) => {
                  const value = event.target.value;
                  setBreakMinutes(value === "" ? "" : Math.max(1, Number(value)));
                }}
                min="1"
                max="120"
                placeholder="예: 10"
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

          {guardianRewardRequested ? <label>보호자 보상 요청 금액 (P)<input type="number" min="1" max="1000000000" step="1" value={guardianPoints} onChange={(event) => setGuardianPoints(event.target.value === "" ? "" : Number(event.target.value))} /></label> : null}

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

          </fieldset>
          {guardianRewardRequested && !hasCurrentSession ? <section className="sub-card" aria-label="보호자 보상 승인">
            <h3>집중 시작 전 보호자 승인</h3>
            <p>계획 저장 → 보상 요청 → 보호자 승인 → 집중 시작 순서로 진행합니다. 요청 중에는 계획을 수정할 수 없습니다.</p>
            <p role="status">{rewardBusy ? "보상 상태 확인 중…" : currentReward ? `${currentReward.points.toLocaleString()}P · ${{ pending: "승인 대기", approved: "승인 완료 · 포인트 예약", started: "집중 시작됨", completed: "지급 완료", returned: "예약 포인트 반환", declined: "거절 또는 요청 취소" }[currentReward.status]}` : "저장한 계획의 보상을 요청해 주세요."}</p>
            {rewardMessage ? <p role="alert">{rewardMessage}</p> : null}
            <div className="focus-actions-row">
              <button className="button secondary small" type="button" disabled={!savedPlan || savedPlan.guardianRewardRequestPoints <= 0 || rewardBusy || rewardLocked || status === "saving"} onClick={() => void manageReward("request")}>보상 요청 보내기</button>
              <button className="button secondary small" type="button" disabled={!savedPlan || rewardBusy || status === "saving"} onClick={() => void manageReward("refresh")}>승인 상태 확인</button>
              {rewardLocked ? <button className="button secondary small" type="button" disabled={rewardBusy || status === "saving"} onClick={() => void manageReward("withdraw")}>보상 요청 취소</button> : null}
            </div>
          </section> : null}
          {blockingMode !== "off" && <ExtensionConnectionPanel onConnectionChange={setExtensionConnected} />}

          <div className={`notice ${status === "error" ? "error" : ""}`} role="status">
            <strong>
              {status === "recovering"
                ? "진행 중인 세션 확인"
                : status === "active"
                ? "집중 시작 완료"
                : status === "paused"
                ? "집중 일시정지"
                : status === "awaiting-result"
                ? "집중 결과 확인"
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
              <button className="button secondary small" type="button" disabled={hasCurrentSession || rewardLocked || rewardBusy} onClick={applyAiRecommendation}>추천 계획명·시간 적용</button>
            </div>
          ) : null}

          {aiError ? <div className="notice error" role="alert"><strong>AI 추천을 표시하지 못했습니다.</strong><p>{aiError}</p></div> : null}

          <div className="focus-actions-row">
            <button className="button secondary full" type="button" disabled={status === "saving" || status === "recovering" || hasCurrentSession || rewardLocked || rewardBusy} onClick={() => {
              if (formRef.current?.reportValidity()) void submit(new FormData(formRef.current), false);
            }}>계획 저장</button>
            <button className="button full" type="submit" disabled={status === "saving" || status === "recovering" || hasCurrentSession || rewardBusy || (approvalRequired && !approvedReward)}>
              {status === "recovering"
                ? "진행 중인 세션 확인 중..."
                : hasCurrentSession
                ? "진행 중인 세션을 먼저 완료해 주세요"
                : status === "saving"
                ? "확인하고 있습니다..."
                : approvedReward ? "승인된 계획으로 집중 시작" : approvalRequired ? "보호자 승인 후 시작 가능" : "저장하고 집중 시작"}
            </button>
            <button className="button secondary full" type="button" disabled={aiBusy || hasCurrentSession || rewardLocked || rewardBusy} onClick={() => void requestAiRecommendation()}>
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span>{aiBusy ? "AI 추천 생성 중…" : "AI 스마트 추천"}</span>
            </button>
          </div>
        </form>

        <aside className="timer-preview">
          <div className="timer-top">
            <span>FOCUS SESSION</span>
            <span className={`status-dot ${hasCurrentSession ? "" : "idle"}`}>
              <Flame className="w-3.5 h-3.5 inline" />
              {status === "starting" ? "차단 적용 확인" : status === "active" ? "집중 중" : status === "paused" ? onTimedBreak ? "휴식 중" : "일시정지" : status === "awaiting-result" ? "결과 확인" : "준비 전"}
            </span>
          </div>

          <strong>
            {hasCurrentSession
              ? `${String(Math.floor(displaySeconds / 60)).padStart(2, "0")}:${String(displaySeconds % 60).padStart(2, "0")}`
              : `${String(Number(targetFocusMinutes) || 0).padStart(2, "0")}:00`}
          </strong>
          <p>
            {status === "starting"
              ? "차단 적용을 확인할 때까지 집중 시간은 차감되지 않습니다."
              : status === "active"
              ? "웹과 확장 프로그램이 같은 서버 세션을 사용합니다."
              : status === "paused"
              ? onTimedBreak ? "남은 휴식 시간이 끝나면 차단과 집중 타이머가 자동으로 복구됩니다." : "남은 시간이 서버에 보존되었습니다. 재개하면 이어서 진행합니다."
              : status === "awaiting-result"
              ? "완료한 세부 목표를 선택해 포인트 정산을 마쳐 주세요."
              : title.trim()
              ? `“${truncateText(title, 10)}” (${Number(targetFocusMinutes) || 0}분) 세션을 시작할 준비가 되었습니다.`
              : `계획을 저장하면 ${Number(targetFocusMinutes) || 0}분 타이머가 준비됩니다.`}
          </p>

          <div className="timer-track">
            <i style={{ width: hasCurrentSession ? `${Math.max(0, Math.min(100, 100 - (remainingSeconds / Math.max(1, Number(targetFocusMinutes) * 60)) * 100))}%` : "0%" }} />
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
                {blockingMode === "off"
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

          {activeSession && hasCurrentSession && (
            <div className="focus-settlement-actions">
              {status === "starting" ? (
                <><p>시작 준비가 끝나지 않았습니다. 같은 세션으로 다시 확인하거나 준비를 취소할 수 있습니다.</p>
                  <button className="button secondary small" type="button" onClick={() => void retryStartingFocus()}>차단 적용 다시 확인</button>
                  <button className="button family-code-cancel small" type="button" onClick={() => void retryStartingFocus(true)}>시작 준비 취소</button></>
              ) : status !== "awaiting-result" && remainingSeconds > 0 ? (
                <>
                  <p>{status === "paused" ? "남은 시간과 차단 상태가 서버에 보존되어 있습니다." : "목표 시간이 끝나면 완료한 목표를 선택해 포인트를 정산할 수 있습니다."}</p>
                  {status === "active" ? (
                    <><button className="button secondary small" type="button" onClick={() => void pauseFocus()}>일시정지</button>
                    <button className="button secondary small" type="button" disabled={(activeSession?.accumulatedBreakSeconds ?? 0) >= Number(breakMinutes) * 60} onClick={() => void startBreak()}>휴식 시작</button></>
                  ) : (
                    <button className="button secondary small" type="button" onClick={() => void resumeFocus()}>{onTimedBreak ? "휴식 끝내고 집중 재개" : "집중 재개"}</button>
                  )}
                  <button className="button family-code-cancel small" type="button" onClick={abandonFocus}>집중 포기</button>
                </>
              ) : (
                <>
                  <div className="focus-completion-policy">
                    <strong>완료한 목표를 선택해 주세요</strong>
                    <p>{activeSession?.depositPolicy?.mode === "all-or-none" ? "목표 시간과 모든 목표 완료 시 예약 포인트 전액을 획득합니다. 일부 목표가 남으면 예약 포인트 전액을 반환합니다." : "기존 세션 정책: 전부 완료 100% · 절반 이상 80% · 1개 이상 절반 미만 60% · 완료 없음 0% 전환"}</p>
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
              <Link className="button full" href="/membership/checkout">학생 Premium 결제하기</Link>
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
