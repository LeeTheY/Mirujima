import { shouldBlockHostname } from "../features/blocking/domain";
import { evaluateFocusHealth } from "../features/focus/focus-health";
import { repository } from "../shared/storage/repository";
import { showNotification } from "./notifications";

export async function checkFocusHealth(): Promise<void> {
  const snapshot = await repository.getSnapshot();
  const session = snapshot.activeSession;
  if (!session || session.status !== "active" || !snapshot.settings.distractionWarningsEnabled) return;
  const schedule = snapshot.schedules.find((item) => item.id === session.scheduleId);
  if (!schedule) return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  let hostname: string | null = null;
  if (tab?.url?.startsWith("http")) {
    try { hostname = new URL(tab.url).hostname; } catch { hostname = null; }
  }
  const activeAllowed = schedule.activityMode === "offline" || hostname === null
    ? true
    : !shouldBlockHostname(hostname, schedule.blockingMode, schedule.allowedDomains, schedule.blockedDomains, snapshot.temporaryAllows);
  const events = await repository.getEvents();
  const sessionEvents = events.filter((item) => item.sessionId === session.id);
  const heartbeat = sessionEvents.filter((item) => item.type === "heartbeat").at(-1);
  const recentCutoff = Date.now() - 5 * 60_000;
  const blockedAttempts = sessionEvents.filter((item) => item.type === "blocked-attempt" && new Date(item.occurredAt).getTime() >= recentCutoff).length;
  const idleState = await chrome.idle.queryState(snapshot.settings.idleThresholdMinutes * 60);
  const health = evaluateFocusHealth({
    idleState,
    activeHostnameAllowed: activeAllowed,
    visible: heartbeat?.metadata?.visible !== false,
    lastHeartbeatAt: heartbeat?.occurredAt ?? null,
    blockedAttemptsInWindow: blockedAttempts,
    activityMode: schedule.activityMode
  });
  if (health === "healthy") return;
  const copy = health === "away"
    ? ["집중이 중단된 것 같습니다", "설정한 시간 동안 PC 입력이 없었어요. 계속 집중 중인지 지금 확인해 주세요."]
    : health === "distracted"
      ? ["방해 행동이 반복되고 있습니다", "차단 사이트 접근 또는 집중 범위 이탈이 감지됐어요. 계획한 작업으로 지금 돌아가세요."]
      : ["집중 상태를 확인해 주세요", "선택한 활동 유형의 허용 시간을 넘도록 Chrome 활동이 확인되지 않았어요."];
  const shown = await showNotification(health === "away" ? "idle-check" : health === "distracted" ? "distraction-detected" : "focus-check", session.id, copy[0], copy[1], ["계속 집중", "집중 화면 열기"]);
  if (shown) {
    const current = await repository.getActiveSession();
    if (current?.id === session.id && current.status === "active") {
      await repository.setActiveSession({ ...current, checkInCount: current.checkInCount + 1 });
    }
  }
}
