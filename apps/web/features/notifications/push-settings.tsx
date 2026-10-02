"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { requireOnlineAction } from "@/lib/online";

const DEVICE_KEY = "mirujima:push-device";
export function PushSettings() {
  const [enabled, setEnabled] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSupported(window.isSecureContext && "PushManager" in window && "serviceWorker" in navigator && Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)), 0);
    const inspect = async () => {
      try {
        const id = localStorage.getItem(DEVICE_KEY);
        if (!id || !('serviceWorker' in navigator)) return;
        const client = createClient();
        const record = await client.from("devices").select("push_subscription").eq("client_generated_device_id", id).maybeSingle();
        const permission = "Notification" in window ? Notification.permission : "denied";
        if (record.data?.push_subscription && permission !== "granted") {
          await client.rpc("set_push_subscription", { p_device_id: id, p_subscription: null, p_kind: "web" });
          const registration = await navigator.serviceWorker.getRegistration("/");
          await (await registration?.pushManager.getSubscription())?.unsubscribe();
        }
        if (!record.error) setEnabled(permission === "granted" && Boolean(record.data?.push_subscription));
      } catch { /* Settings remain available for explicit retry. */ }
    };
    void inspect();
    return () => clearTimeout(timer);
  }, []);
  const save = async (subscription: PushSubscription | null) => {
    let deviceId = localStorage.getItem(DEVICE_KEY);
    if (!deviceId) { deviceId = `web-push:${crypto.randomUUID()}`; localStorage.setItem(DEVICE_KEY, deviceId); }
    const { error } = await createClient().rpc("set_push_subscription", { p_device_id: deviceId, p_subscription: subscription?.toJSON() ?? null, p_kind: window.matchMedia("(display-mode: standalone)").matches ? "pwa" : "web" });
    if (error) throw new Error("알림 설정 저장 실패");
  };
  const change = async (enable: boolean) => {
    setBusy(true); setMessage("");
    try {
      requireOnlineAction("시스템 알림 설정");
      // Never request permission on mount. The user's button click provides context and intent.
      if (enable && await Notification.requestPermission() !== "granted") { setMessage("알림을 허용하지 않았습니다. 앱 안의 알림 센터는 계속 사용할 수 있습니다."); return; }
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration?.active) throw new Error("worker unavailable");
      let subscription = await registration.pushManager.getSubscription();
      if (enable) {
        const encoded = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
        const binary = atob(encoded.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - encoded.length % 4) % 4));
        subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(binary, (value) => value.charCodeAt(0)) });
        try { await save(subscription); } catch (error) { await subscription.unsubscribe(); throw error; }
      } else {
        // Revoke server delivery first, then remove the browser subscription.
        await save(null); await subscription?.unsubscribe();
      }
      setEnabled(enable); setMessage(enable ? "시스템 알림을 켰습니다. 잠금 화면에는 기록이나 포인트를 표시하지 않습니다." : "시스템 알림을 껐습니다.");
    } catch { setMessage("알림 설정을 저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요."); }
    finally { setBusy(false); }
  };
  return <section className="sub-card"><strong>기기 알림</strong><p>집중 결과와 새 알림을 앱 밖에서도 확인합니다. 권한은 버튼을 누를 때만 요청합니다.</p>{supported ? <div className="flex gap-3 flex-wrap"><button className="button secondary small" disabled={busy} aria-pressed={enabled} onClick={() => void change(true)}>알림 켜기</button><button className="text-button" disabled={busy} onClick={() => void change(false)}>알림 끄기</button></div> : <p>앱 설치·HTTPS·서버 알림 설정이 준비되면 사용할 수 있습니다.</p>}{message ? <p role="status">{message}</p> : null}</section>;
}
