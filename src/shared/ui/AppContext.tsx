import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { sendMessage } from "../chrome/messaging";
import { DEFAULT_SETTINGS, DEFAULT_TAB_ORGANIZER_SETTINGS, EMPTY_TAB_ORGANIZER_SUMMARY } from "../constants";
import type { ExtensionMessage } from "../types/messages";
import type { AppSnapshot } from "../types/models";
import { FREE_MEMBERSHIP } from "../../features/membership/types";
import { EMPTY_CLOUD_SYNC_STATE } from "../../features/cloud-sync/types";

const EMPTY_SNAPSHOT: AppSnapshot = {
  schedules: [], activeSession: null, reports: [], settings: DEFAULT_SETTINGS,
  notificationState: {}, temporaryAllows: [],
  tabOrganizerSettings: DEFAULT_TAB_ORGANIZER_SETTINGS, tabOrganizerSummary: EMPTY_TAB_ORGANIZER_SUMMARY,
  membership: FREE_MEMBERSHIP,
  cloudSync: { state: EMPTY_CLOUD_SYNC_STATE, learningDays: [] }
};

interface AppContextValue {
  snapshot: AppSnapshot;
  loading: boolean;
  error: string | null;
  actionError: string | null;
  run: (message: ExtensionMessage) => Promise<AppSnapshot>;
  refresh: () => Promise<void>;
  dismissError: () => void;
  dismissActionError: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await sendMessage({ type: "APP_BOOTSTRAP" });
      setSnapshot(next);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const run = useCallback(async (message: ExtensionMessage) => {
    try {
      const next = await sendMessage(message);
      setSnapshot(next);
      setActionError(null);
      return next;
    } catch (cause) {
      const messageText = cause instanceof Error ? cause.message : "요청을 처리하지 못했습니다.";
      setActionError(messageText);
      throw cause;
    }
  }, []);

  const dismissError = useCallback(() => setError(null), []);
  const dismissActionError = useCallback(() => setActionError(null), []);

  useEffect(() => {
    const initial = window.setTimeout(() => { void refresh(); }, 0);
    const listener = () => { void refresh(); };
    chrome.storage.onChanged.addListener(listener);
    return () => { window.clearTimeout(initial); chrome.storage.onChanged.removeListener(listener); };
  }, [refresh]);

  const value = useMemo(
    () => ({ snapshot, loading, error, actionError, run, refresh, dismissError, dismissActionError }),
    [snapshot, loading, error, actionError, run, refresh, dismissError, dismissActionError]
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("AppProvider 안에서 사용해 주세요.");
  return value;
}
