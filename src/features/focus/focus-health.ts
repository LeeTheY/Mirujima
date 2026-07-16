import type { ActivityMode, FocusHealth } from "../../shared/types/models";

export interface FocusSignals {
  idleState: "active" | "idle" | "locked";
  activeHostnameAllowed: boolean;
  visible: boolean;
  lastHeartbeatAt: string | null;
  blockedAttemptsInWindow: number;
  activityMode: ActivityMode;
  now?: number;
}

const INACTIVITY_THRESHOLDS: Record<ActivityMode, number> = {
  interactive: 5,
  reading: 15,
  watching: 45,
  offline: 60
};

export function evaluateFocusHealth(signals: FocusSignals): FocusHealth {
  if (signals.idleState === "locked" || signals.idleState === "idle") return "away";
  if (signals.blockedAttemptsInWindow >= 2 || !signals.activeHostnameAllowed) return "distracted";
  if (signals.activityMode === "offline") return "healthy";
  const now = signals.now ?? Date.now();
  const minutesSinceHeartbeat = signals.lastHeartbeatAt
    ? (now - new Date(signals.lastHeartbeatAt).getTime()) / 60_000
    : Number.POSITIVE_INFINITY;
  if (!signals.visible || minutesSinceHeartbeat >= INACTIVITY_THRESHOLDS[signals.activityMode]) return "needs-check";
  return "healthy";
}
