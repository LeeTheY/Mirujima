"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { checkExtensionConnection, chromeExternalSender, type ExtensionConnection } from "./bridge";

export function ExtensionConnectionPanel({ onConnectionChange }: { onConnectionChange?: (connected: boolean) => void }) {
  const [connection, setConnection] = useState<ExtensionConnection | null>(null);
  const [checking, setChecking] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const notify = useRef(onConnectionChange);
  useEffect(() => { notify.current = onConnectionChange; }, [onConnectionChange]);
  const check = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    let result: ExtensionConnection;
    try {
      const { data, error } = await createClient().auth.getUser();
      result = error || !data.user
        ? { status: "signed-out", message: "웹 로그인이 만료되었습니다. 다시 로그인한 뒤 연결을 확인해 주세요." }
        : await checkExtensionConnection(process.env.NEXT_PUBLIC_MIRUJIMA_EXTENSION_ID ?? "", chromeExternalSender, data.user.id);
    } catch { result = { status: "unavailable", message: "계정과 연결 상태를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요." }; }
    inFlight.current = false;
    if (!mounted.current) return;
    setConnection(result);
    setChecking(false);
    notify.current?.(result.status === "connected");
  }, []);
  useEffect(() => {
    mounted.current = true;
    void check();
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(onVisible, 30_000);
    return () => { mounted.current = false; window.clearInterval(interval); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", onVisible); };
  }, [check]);

  const labels: Record<ExtensionConnection["status"], string> = { connected: "연결됨 · 같은 계정", unconfigured: "확장 프로그램을 찾지 못했어요", unsupported: "Chrome에서 연결해 주세요", unavailable: "연결되지 않음", "signed-out": "로그인 필요", "account-mismatch": "웹과 확장 계정이 다릅니다", outdated: "확장 업데이트 필요", timeout: "확장 응답 없음" };
  return <section className={`notice extension-connection ${connection?.status === "connected" ? "connected" : "disconnected"}`} aria-label="확장 프로그램 연결">
    <div role="status" aria-live="polite">
      <span className="connection-heading">확장 프로그램 <strong className="connection-indicator">{checking ? "확인 중…" : connection ? labels[connection.status] : "확인 대기"}</strong></span>
      <p>{connection?.message ?? "웹과 확장 프로그램의 계정을 확인합니다."}</p>
    </div>
    <button className="text-button" type="button" disabled={checking} onClick={() => void check()}>연결 다시 확인</button>
    {connection?.status !== "connected" && <details className="mt-3"><summary>설치·로그인 안내</summary>
      <ol>
        <li>컴퓨터의 Chrome에서 미루지마 확장 프로그램을 설치하고 활성화합니다.</li>
        <li>확장 프로그램을 열어 웹과 같은 Google 계정으로 로그인합니다.</li>
        <li>이 화면으로 돌아와 연결을 확인한 뒤 집중을 시작합니다.</li>
      </ol>
      <p>모바일에서는 계획·기록·지갑을 이용할 수 있습니다. 사이트 차단은 지원되는 컴퓨터 브라우저가 필요합니다.</p>
    </details>}
  </section>;
}
