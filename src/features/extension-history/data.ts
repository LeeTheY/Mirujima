import { focusPlanSchema, guardianFocusHistorySchema, studentFocusHistorySchema, type FocusPlan, type GuardianFocusHistory, type HistoryPeriod, type StudentFocusHistory } from "@mirujima/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { membershipSupabaseClient } from "../membership/service";

export interface HistoryOverview {
  userId: string;
  students: Array<{ id: string; name: string }>;
  student: StudentFocusHistory | null;
  guardian: GuardianFocusHistory | null;
}
const failure = "기록을 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.";
async function account(client: SupabaseClient, expectedUserId: string) {
  const { data, error } = await client.auth.getUser();
  if (error || data.user?.id !== expectedUserId) throw new Error("로그인 계정을 다시 확인해 주세요.");
  return data.user;
}
export async function loadHistoryOverview(expectedUserId: string, period: HistoryPeriod, selectedStudentId?: string, client = membershipSupabaseClient()): Promise<HistoryOverview> {
  await account(client, expectedUserId);
  const { data: profile, error: profileError } = await client.from("profiles").select("role").eq("id", expectedUserId).single();
  if (profileError || !["student", "guardian"].includes(profile?.role)) throw new Error("웹에서 계정 설정을 먼저 완료해 주세요.");
  const result: HistoryOverview = { userId: expectedUserId, students: [], student: null, guardian: null };
  let studentId: string | undefined;
  if (profile.role === "guardian") {
    const { data, error } = await client.rpc("get_guardian_linked_students");
    if (error || !Array.isArray(data)) throw new Error(failure);
    result.students = data.map((row: unknown) => {
      if (!row || typeof row !== "object") throw new Error(failure);
      const id = Reflect.get(row, "student_user_id"), name = Reflect.get(row, "display_name");
      if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || typeof name !== "string" || !name.trim() || name.length > 120) throw new Error(failure);
      return { id, name };
    });
    if (result.students.length === 0) return result;
    studentId = selectedStudentId ?? result.students[0].id;
    if (!result.students.some((item) => item.id === studentId)) throw new Error("연결된 학생을 선택해 주세요.");
  }
  // The server supplies today's date in the student's configured timezone.
  const { data: context, error: contextError } = await client.rpc("get_focus_history_context", { p_student_user_id: studentId ?? null });
  if (contextError || !context || !/^\d{4}-\d{2}-\d{2}$/.test(context.today)) throw new Error(failure);
  const args = { p_period: period, p_anchor_date: context.today, ...(studentId ? { p_student_user_id: studentId } : {}) };
  const { data, error } = await client.rpc(studentId ? "get_guardian_focus_history" : "get_student_focus_history", args);
  if (error) throw new Error(failure);
  if (studentId) {
    const parsed = guardianFocusHistorySchema.safeParse(data);
    if (!parsed.success || parsed.data.student.userId !== studentId) throw new Error(failure);
    result.guardian = parsed.data;
  } else {
    const parsed = studentFocusHistorySchema.safeParse(data);
    if (!parsed.success) throw new Error(failure);
    result.student = parsed.data;
  }
  return result;
}

export async function loadLatestFocusPlan(expectedUserId: string, client = membershipSupabaseClient()): Promise<FocusPlan | null> {
  await account(client, expectedUserId);
  const { data, error } = await client.from("cloud_schedules").select("payload").eq("user_id", expectedUserId).is("deleted_at", null).order("updated_at", { ascending: false }).limit(30);
  if (error || !Array.isArray(data)) throw new Error("저장한 계획을 불러오지 못했습니다.");
  for (const row of data) {
    const parsed = focusPlanSchema.safeParse(row.payload);
    if (parsed.success && parsed.data.ownerUserId === expectedUserId && ["planned", "ready", "draft"].includes(parsed.data.status)) return parsed.data;
  }
  return null;
}
