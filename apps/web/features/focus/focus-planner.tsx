"use client";

import { useState } from "react";
import type { CanonicalFocusSession, FocusPlan } from "@mirujima/contracts";
import { createClient } from "@/lib/supabase/client";
import { parseFocusDraft } from "./focus-form";
import { chromeExternalSender, pingExtension, requestFocusSync, requiresExtension } from "@/features/extension/bridge";

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
        title: draft.title,
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
        guardianRewardRequestPoints: 0,
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

  return <section className="focus-layout"><form className="card focus-form" action={submit}><label>계획명<input name="title" placeholder="예: 수학 문제집 4단원" required maxLength={120} /></label><div className="field-row"><label>목표 집중 시간<input name="targetFocusMinutes" type="number" defaultValue="50" min="1" max="720" /></label><label>휴식 시간<input name="breakMinutes" type="number" defaultValue="10" min="1" max="120" /></label></div><fieldset><legend>사이트 차단 방식</legend><div className="segmented"><label><input type="radio" name="blockingMode" value="blocklist" defaultChecked />방해 사이트 차단</label><label><input type="radio" name="blockingMode" value="allowlist" />허용 사이트만</label><label><input type="radio" name="blockingMode" value="off" />사용 안 함</label></div></fieldset><label>사이트 목록<textarea name="domains" rows={4} placeholder={'youtube.com\ninstagram.com'} /></label><div className={`notice ${status === "error" ? "error" : ""}`} role="status"><strong>{status === "active" ? "집중 시작 완료" : status === "saving" ? "집중 준비 중" : "확장 프로그램 연결"}</strong><p>{message}</p></div><button className="button full" type="submit" disabled={status === "saving"}>{status === "saving" ? "확인하고 있습니다" : "계획 확정 및 집중 준비"}</button></form><aside className="timer-preview compact"><div className="timer-top"><span>FOCUS SESSION</span><span className={`status-dot ${status === "active" ? "" : "idle"}`}>{status === "active" ? "집중 중" : "준비 전"}</span></div><strong>{String(remainingMinutes).padStart(2, "0")}:00</strong><p>{status === "active" ? "확장 프로그램에서도 같은 세션을 확인할 수 있습니다." : "계획을 저장하면 타이머가 준비됩니다."}</p><div className="timer-track"><i style={{width: status === "active" ? "1%" : "0%"}} /></div><div className="timer-meta"><span>차단 모드<strong>{status === "active" ? "적용 요청됨" : "설정 전"}</strong></span><span>확장 상태<strong>{status === "active" ? "동기화됨" : "확인 필요"}</strong></span></div></aside></section>;
}
