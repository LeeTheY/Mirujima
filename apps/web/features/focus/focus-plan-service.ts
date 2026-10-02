import { focusPlanSchema, type FocusPlan } from "@mirujima/contracts";
import { createClient } from "../../lib/supabase/client";
import { parseHomePlans } from "../profile/home-plans";
import type { FocusRpcClient } from "./canonical-focus-service";

export async function loadFocusPlans(): Promise<FocusPlan[]> {
  const client = createClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) throw new Error("계획을 보려면 로그인해 주세요.");
  const { data, error } = await client.from("cloud_schedules").select("payload")
    .eq("user_id", auth.user.id).is("deleted_at", null).order("updated_at", { ascending: false });
  const plans = parseHomePlans(data, auth.user.id);
  if (error || !plans) throw new Error("저장한 계획을 불러오지 못했습니다. 다시 시도해 주세요.");
  return plans;
}

export async function saveFocusPlan(plan: FocusPlan, deviceId: string, client: FocusRpcClient): Promise<FocusPlan> {
  const { data, error } = await client.rpc("upsert_focus_plan", {
    p_schedule_id: plan.id, p_payload: focusPlanSchema.parse(plan), p_device_id: deviceId,
  });
  if (error) {
    if (error.message?.includes("reload required")) throw new Error("다른 창에서 이 계획을 수정했습니다. 저장한 계획을 다시 불러온 뒤 수정해 주세요.");
    if (error.message?.includes("cannot be edited") || error.message?.includes("unfinished session") || error.message?.includes("guardian request")) {
      throw new Error("진행 중이거나 보상 요청이 남은 계획은 수정할 수 없습니다. 세션과 보상 처리를 먼저 완료해 주세요.");
    }
    throw new Error("계획을 저장하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요.");
  }
  const result = focusPlanSchema.safeParse(data);
  if (!result.success || result.data.id !== plan.id || result.data.ownerUserId !== plan.ownerUserId) {
    throw new Error("계획 저장 응답을 확인하지 못했습니다. 목록을 새로 불러와 저장 여부를 확인해 주세요.");
  }
  return result.data;
}

export async function cancelFocusPlan(plan: FocusPlan, client: FocusRpcClient): Promise<FocusPlan> {
  const { data, error } = await client.rpc("cancel_focus_plan", { p_schedule_id: plan.id, p_expected_updated_at: plan.updatedAt });
  if (error) throw new Error(error.message?.includes("reload required")
    ? "다른 창에서 계획이 변경됐습니다. 목록을 새로 불러와 주세요."
    : "계획을 취소하지 못했습니다. 진행 중인 세션이나 보호자 보상 처리를 확인한 뒤 다시 시도해 주세요.");
  const parsed = focusPlanSchema.safeParse(data);
  if (!parsed.success || parsed.data.id !== plan.id || parsed.data.ownerUserId !== plan.ownerUserId || parsed.data.status !== "cancelled") {
    throw new Error("계획 취소 응답을 확인하지 못했습니다. 목록을 새로 불러와 주세요.");
  }
  return parsed.data;
}
