import { useEffect, useState } from "react";
import { useApp } from "../../shared/ui/AppContext";
import { useNow } from "../../shared/time/useNow";
import { WEB_CONNECTION_KEY, parseWebConnectionState, webConnectionLabel, type WebConnectionState } from "./connection-state";
export function WebConnectionStatus() {
  const { snapshot } = useApp();
  const [state, setState] = useState<WebConnectionState | null>(null);
  const now = useNow();
  useEffect(() => {
    let disposed = false;
    const read = () => { void chrome.storage.local.get(WEB_CONNECTION_KEY).then((data) => { if (!disposed) setState(parseWebConnectionState(data[WEB_CONNECTION_KEY])); }); };
    const changed = (changes: Record<string, chrome.storage.StorageChange>) => { if (WEB_CONNECTION_KEY in changes) read(); };
    read(); chrome.storage.onChanged.addListener(changed);
    return () => { disposed = true; chrome.storage.onChanged.removeListener(changed); };
  }, []);
  const status = webConnectionLabel(state, snapshot.membership.userId, now);
  return <span className={`web-connection-badge ${status.connected ? "connected" : ""}`} role="status" title={status.connected ? "최근 90초 안에 웹과 같은 계정으로 통신했습니다." : "웹 홈이나 집중 화면에서 연결을 확인하세요."}>{status.label}</span>;
}
