"use client";
import { useEffect, useState } from "react";
import { shouldRegisterServiceWorker } from "@/lib/pwa";

export function PwaRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [failure, setFailure] = useState(false);
  useEffect(() => {
    if (!shouldRegisterServiceWorker({ supported: "serviceWorker" in navigator, secure: window.isSecureContext, production: process.env.NODE_ENV === "production" })) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    const check = () => { if (!disposed && registration?.waiting) setWaiting(registration.waiting); };
    const state = () => { if (installing?.state === "installed" && navigator.serviceWorker.controller) check(); };
    const found = () => { installing = registration?.installing ?? null; installing?.addEventListener("statechange", state); };
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((value) => {
      registration = value; if (disposed) return;
      check(); value.addEventListener("updatefound", found); found(); return value.update();
    }).catch(() => { if (!disposed) setFailure(true); });
    return () => { disposed = true; registration?.removeEventListener("updatefound", found); installing?.removeEventListener("statechange", state); };
  }, []);
  const update = () => {
    // Only an explicit action reloads: never interrupt payment callbacks automatically.
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    waiting?.postMessage({ type: "mirujima:activate-update" });
  };
  if (!waiting && !failure) return null;
  return <aside className="card pwa-update" role="status"><strong>{waiting ? "새 버전이 준비되었습니다." : "오프라인 기능을 준비하지 못했습니다."}</strong><p>{waiting ? "작성 중인 내용을 저장하고 결제 결과를 확인한 뒤 업데이트해 주세요." : "현재 연결된 화면은 사용할 수 있습니다. 연결 상태를 확인하고 다음 방문에 다시 시도해 주세요."}</p>{waiting ? <div className="flex gap-3"><button className="button small" onClick={update}>업데이트</button><button className="button secondary small" onClick={() => setWaiting(null)}>나중에</button></div> : <button className="text-button" onClick={() => setFailure(false)}>닫기</button>}</aside>;
}
