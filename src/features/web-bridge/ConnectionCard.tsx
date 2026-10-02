import { useState } from "react";
import { useApp } from "../../shared/ui/AppContext";
import { openWebApp } from "../../shared/ui/extension-navigation";
import type { ExtensionMessage } from "../../shared/types/messages";

export function ConnectionCard() {
  const { snapshot, run } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function act(type: "MEMBERSHIP_SIGN_IN" | "MEMBERSHIP_RESTORE" | "MEMBERSHIP_SIGN_OUT") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await run({ type } as ExtensionMessage); }
    catch { setError("계정 연결을 완료하지 못했습니다. 로그인 또는 네트워크를 확인하고 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  const account = snapshot.membership;
  return <article className="card connection-card" aria-label="웹 계정 연결">
    <h2>{account.userId ? "계정 연결됨" : "Google 계정 연결"}</h2>
    <p>{account.userId ? `${account.email ?? "로그인한 계정"}으로 연결되어 있습니다.` : "웹과 같은 계정으로 로그인하고 집중을 이어가세요."}</p>
    <details className="connection-note"><summary>어떤 계정으로 연결하나요?</summary><p>웹과 확장 프로그램에서 같은 Google 계정을 선택하세요. Chrome 자체에 로그인할 필요는 없습니다.</p></details>
    {(error || account.error) && <p role="alert">{error ?? "서버 연결을 확인하지 못했습니다. 네트워크를 확인하고 다시 연결해 주세요."}</p>}
    <div className="row connection-actions">
      {!account.userId && <button type="button" className="button" disabled={busy} onClick={() => void act("MEMBERSHIP_SIGN_IN")}>{busy ? "연결 중…" : "Google로 로그인"}</button>}
      {account.userId && <>
        <button type="button" className="button secondary" disabled={busy} onClick={() => void act("MEMBERSHIP_RESTORE")}>{busy ? "확인 중…" : "연결 다시 확인"}</button>
        <button type="button" className="button ghost" disabled={busy} onClick={() => {
          if (snapshot.activeSession?.canonical && !window.confirm("로그아웃하면 이 브라우저의 집중 차단이 해제됩니다. 서버 세션과 정산은 웹에서 확인해 주세요. 로그아웃할까요?")) return;
          void act("MEMBERSHIP_SIGN_OUT");
        }}>로그아웃</button>
      </>}
      <button type="button" className="button ghost" onClick={() => openWebApp("/focus")}>연결 확인</button>
    </div>
  </article>;
}
